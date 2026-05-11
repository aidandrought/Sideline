import { collection, doc, getDoc, getDocs, increment, limit, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getCachedValue, getCachedValueAsync, setCachedValue } from './cacheService';
import { NewsArticle } from './newsApi';

export type NewsReactionValue = 'up' | 'down' | null;

type ArticleStats = {
  upCount?: number;
  downCount?: number;
  updatedAt?: unknown;
};

type UserFeedbackDoc = {
  articleKey: string;
  reaction: NewsReactionValue;
  source?: string;
  category?: string;
  tags?: string[];
  tokens?: string[];
  updatedAt?: unknown;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const ARTICLE_STATS_TTL_MS = 15 * 60 * 1000;
const USER_FEEDBACK_TTL_MS = 15 * 60 * 1000;
const USER_FEEDBACK_PROFILE_TTL_MS = 10 * 60 * 1000;

const tokenize = (article: NewsArticle) => {
  const bag = `${article.title || ''} ${article.description || ''} ${(article.tags || []).join(' ')}`.toLowerCase();
  return bag
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
    .slice(0, 28);
};

const hashString = (input: string) => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const toEpochMs = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toMillis' in (value as { toMillis?: () => number })) {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  return 0;
};

class NewsPersonalizationService {
  private statsCacheKey(articleKey: string) {
    return `newsStats:${articleKey}`;
  }

  private feedbackCacheKey(userId: string, articleKey: string) {
    return `newsFeedback:${userId}:${articleKey}`;
  }

  private feedbackProfileCacheKey(userId: string) {
    return `newsFeedbackProfile:${userId}`;
  }

  getArticleKey(article: NewsArticle) {
    const base = `${(article.url || '').trim().toLowerCase()}|${(article.title || '').trim().toLowerCase()}`;
    return hashString(base || article.id);
  }

  async getUserFeedbackForArticles(userId: string, articles: NewsArticle[]) {
    if (!userId || articles.length === 0) return {} as Record<string, NewsReactionValue>;
    try {
      const pairs = await Promise.all(articles.map(async (article) => {
        const articleKey = this.getArticleKey(article);
        const cacheKey = this.feedbackCacheKey(userId, articleKey);
        const cachedReaction = await getCachedValueAsync<NewsReactionValue>(cacheKey, USER_FEEDBACK_TTL_MS);
        if (cachedReaction !== null) {
          return [article.id, cachedReaction] as const;
        }
        const snap = await getDoc(doc(db, 'users', userId, 'newsFeedback', articleKey));
        const reaction = (snap.data() as UserFeedbackDoc | undefined)?.reaction ?? null;
        await setCachedValue(cacheKey, reaction);
        return [article.id, reaction] as const;
      }));
      return Object.fromEntries(pairs);
    } catch {
      return {};
    }
  }

  async recordReaction(userId: string, article: NewsArticle, reaction: NewsReactionValue) {
    if (!userId) return;
    const articleKey = this.getArticleKey(article);
    const feedbackRef = doc(db, 'users', userId, 'newsFeedback', articleKey);
    const statsRef = doc(db, 'newsArticleStats', articleKey);

    let previousReaction: NewsReactionValue = null;
    try {
      const feedbackCacheKey = this.feedbackCacheKey(userId, articleKey);
      const cachedPrevious = getCachedValue<NewsReactionValue>(feedbackCacheKey, USER_FEEDBACK_TTL_MS);
      if (cachedPrevious !== null) {
        previousReaction = cachedPrevious;
      } else {
        const previousSnap = await getDoc(feedbackRef);
        previousReaction = ((previousSnap.data() as UserFeedbackDoc | undefined)?.reaction ?? null) as NewsReactionValue;
        await setCachedValue(feedbackCacheKey, previousReaction);
      }
      if (previousReaction === reaction) return;
    } catch {
      // continue with blind write
    }

    try {
      await setDoc(
        feedbackRef,
        {
          articleKey,
          reaction,
          source: article.source || '',
          category: article.category || '',
          tags: article.tags || [],
          tokens: tokenize(article),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await setCachedValue(this.feedbackCacheKey(userId, articleKey), reaction);
      const feedbackProfileCacheKey = this.feedbackProfileCacheKey(userId);
      const cachedRows = await getCachedValueAsync<UserFeedbackDoc[]>(feedbackProfileCacheKey, USER_FEEDBACK_PROFILE_TTL_MS);
      if (cachedRows) {
        const nextRow: UserFeedbackDoc = {
          articleKey,
          reaction,
          source: article.source || '',
          category: article.category || '',
          tags: article.tags || [],
          tokens: tokenize(article),
          updatedAt: Date.now(),
        };
        const nextRows = [nextRow, ...cachedRows.filter((row) => row.articleKey !== articleKey)].slice(0, 220);
        await setCachedValue(feedbackProfileCacheKey, nextRows);
      }
    } catch {
      return;
    }

    let upDelta = 0;
    let downDelta = 0;
    if (previousReaction === 'up') upDelta -= 1;
    if (previousReaction === 'down') downDelta -= 1;
    if (reaction === 'up') upDelta += 1;
    if (reaction === 'down') downDelta += 1;

    if (upDelta !== 0 || downDelta !== 0) {
      try {
        await setDoc(
          statsRef,
          {
            upCount: increment(upDelta),
            downCount: increment(downDelta),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        const cachedStats = getCachedValue<ArticleStats>(this.statsCacheKey(articleKey), ARTICLE_STATS_TTL_MS) || {};
        await setCachedValue(this.statsCacheKey(articleKey), {
          ...cachedStats,
          upCount: Math.max(0, Number(cachedStats.upCount || 0) + upDelta),
          downCount: Math.max(0, Number(cachedStats.downCount || 0) + downDelta),
          updatedAt: Date.now(),
        });
      } catch {
        // ignore stats write failures
      }
    }
  }

  async rankArticles(articles: NewsArticle[], userId?: string) {
    if (articles.length <= 1) return articles;

    try {
      const articleKeys = articles.map((article) => this.getArticleKey(article));
      const statsMap = new Map<string, ArticleStats>();
      try {
        await Promise.all(articleKeys.map(async (key) => {
          const cacheKey = this.statsCacheKey(key);
          const cachedStats = await getCachedValueAsync<ArticleStats>(cacheKey, ARTICLE_STATS_TTL_MS);
          if (cachedStats) {
            statsMap.set(key, cachedStats);
            return;
          }
          const snap = await getDoc(doc(db, 'newsArticleStats', key));
          const stats = (snap.data() as ArticleStats | undefined) || {};
          statsMap.set(key, stats);
          await setCachedValue(cacheKey, stats);
        }));
      } catch {
        articleKeys.forEach((key) => statsMap.set(key, {}));
      }

      let sourceWeights = new Map<string, number>();
      let categoryWeights = new Map<string, number>();
      let tokenWeights = new Map<string, number>();
      const userReactionsByKey = new Map<string, NewsReactionValue>();

      if (userId) {
        try {
          const feedbackProfileCacheKey = this.feedbackProfileCacheKey(userId);
          const cachedRows = await getCachedValueAsync<UserFeedbackDoc[]>(feedbackProfileCacheKey, USER_FEEDBACK_PROFILE_TTL_MS);
          const rows = cachedRows ?? await (async () => {
            const feedbackSnap = await getDocs(
              query(collection(db, 'users', userId, 'newsFeedback'), orderBy('updatedAt', 'desc'), limit(220))
            );
            const nextRows = feedbackSnap.docs.map((docSnap) => ({ ...(docSnap.data() as UserFeedbackDoc), articleKey: docSnap.id }));
            await setCachedValue(feedbackProfileCacheKey, nextRows);
            return nextRows;
          })();
          const sourceScore = new Map<string, number>();
          const categoryScore = new Map<string, number>();
          const tokenScore = new Map<string, number>();
          rows.forEach((row) => {
            const key = row.articleKey;
            const reaction = row.reaction;
            userReactionsByKey.set(key, reaction);
            const delta = reaction === 'up' ? 1 : reaction === 'down' ? -1 : 0;
            if (!delta) return;
            if (row.source) sourceScore.set(row.source, (sourceScore.get(row.source) || 0) + delta);
            if (row.category) categoryScore.set(row.category, (categoryScore.get(row.category) || 0) + delta);
            (row.tokens || []).forEach((token) => tokenScore.set(token, (tokenScore.get(token) || 0) + delta));
          });
          sourceWeights = sourceScore;
          categoryWeights = categoryScore;
          tokenWeights = tokenScore;
        } catch {
          // personalization disabled when feedback store is unavailable
        }
      }

      const now = Date.now();
      const scored = articles.map((article) => {
        const key = this.getArticleKey(article);
        const stats = statsMap.get(key) || {};
        const up = Math.max(0, Number(stats.upCount || 0));
        const down = Math.max(0, Number(stats.downCount || 0));
        const interactions = up + down;
        const hotScore = Math.log1p(up) - 0.75 * Math.log1p(down) + Math.log1p(interactions) * 0.15;

        const publishedMs = Date.parse(article.publishedAt || '') || now;
        const ageHours = Math.max(0, (now - publishedMs) / 3600000);
        const recencyScore = clamp(1 - ageHours / 96, 0, 1);

        const tokenScore = tokenize(article).reduce((sum, token) => sum + (tokenWeights.get(token) || 0), 0);
        const sourceScore = sourceWeights.get(article.source || '') || 0;
        const categoryScore = categoryWeights.get(article.category || '') || 0;
        const personalizationScore = tokenScore * 0.08 + sourceScore * 0.35 + categoryScore * 0.3;

        const userReaction = userReactionsByKey.get(key) || null;
        const explicitBoost = userReaction === 'up' ? 2 : userReaction === 'down' ? -2 : 0;

        const freshnessBonus = Math.max(0, 18 - ageHours) * 0.03;
        const finalScore = hotScore + recencyScore * 1.2 + personalizationScore + explicitBoost + freshnessBonus;
        return { article, finalScore };
      });

      scored.sort((a, b) => b.finalScore - a.finalScore);
      return scored.map((entry) => entry.article);
    } catch {
      return [...articles].sort((a, b) => {
        const aTs = Date.parse(a.publishedAt || '') || 0;
        const bTs = Date.parse(b.publishedAt || '') || 0;
        return bTs - aTs;
      });
    }
  }
}

export const newsPersonalizationService = new NewsPersonalizationService();
