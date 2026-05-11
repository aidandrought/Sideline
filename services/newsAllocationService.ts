import { getCachedValueAsync, setCachedValue } from './cacheService';
import { buildNewsPreferenceQueries, FeedSelections, selectNewsForFeed, sortNewsForFeed } from './feedPreferences';
import { newsAPI, NewsArticle } from './newsApi';
import { readNewsCache, writeNewsCache } from './newsFirestoreCache';
import { newsPersonalizationService } from './newsPersonalizationService';

const HOME_NEWS_COUNT = 10;
const EXPLORE_NEWS_COUNT = 20;
const TOTAL_NEWS_COUNT = HOME_NEWS_COUNT + EXPLORE_NEWS_COUNT;
const NEWS_ALLOCATION_TTL_MS = 24 * 60 * 60 * 1000;
const NEWS_ALLOCATION_CACHE_KEY = 'news:allocation:v16';

type NewsAllocation = {
  all: NewsArticle[];
  home: NewsArticle[];
  explore: NewsArticle[];
};

export type { NewsAllocation };

const isCollegeSportsArticle = (article: NewsArticle): boolean => {
  const text = `${article.title} ${article.description || ''}`.toLowerCase();
  return (
    text.includes('college football') ||
    text.includes('hoosiers') ||
    text.includes('ncaa') ||
    text.includes('college basketball') ||
    text.includes('indiana hoosiers') ||
    text.includes('college sports') ||
    text.includes('college playoff') ||
    text.includes('bowl game')
  );
};

const dedupeByUrl = (articles: NewsArticle[]): NewsArticle[] => {
  const seen = new Set<string>();
  return articles.filter((article) => {
    if (!article?.title || !article?.url) return false;
    const key = (article.url || `${article.title}-${article.source || ''}`).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const mergeUniqueArticles = (...articleLists: NewsArticle[][]) => {
  return dedupeByUrl(articleLists.flat().filter(Boolean));
};

const splitAllocation = (articles: NewsArticle[]): NewsAllocation => {
  const base = dedupeByUrl(articles).filter((article) => article?.title && article?.url);
  if (base.length === 0) {
    return { all: [], home: [], explore: [] };
  }

  const withImages = base.filter((article) => !!article.imageUrl);
  const withoutImages = base.filter((article) => !article.imageUrl);

  const fillFromFallback = (primary: NewsArticle[], fallback: NewsArticle[], count: number): NewsArticle[] => {
    const result = [...primary];
    const used = new Set(result.map((item) => item.url.toLowerCase()));

    for (const item of fallback) {
      if (result.length >= count) break;
      if (!used.has(item.url.toLowerCase())) {
        used.add(item.url.toLowerCase());
        result.push(item);
      }
    }

    return result.slice(0, count);
  };

  const home = fillFromFallback(withImages, withoutImages, HOME_NEWS_COUNT);

  const homeUrls = new Set(home.map((item) => item.url.toLowerCase()));
  const remaining = base.filter((item) => !homeUrls.has(item.url.toLowerCase()));
  const remainingWithImages = remaining.filter((item) => !!item.imageUrl);
  const remainingWithoutImages = remaining.filter((item) => !item.imageUrl);

  const explore = fillFromFallback(remainingWithImages, remainingWithoutImages, EXPLORE_NEWS_COUNT);
  const all = dedupeByUrl([...home, ...explore]);

  return {
    all,
    home,
    explore,
  };
};

const fetchQuickNewsPool = async (userId?: string, feedSelections?: FeedSelections): Promise<NewsArticle[]> => {
  const preferenceQueries = buildNewsPreferenceQueries(feedSelections || { teams: [], leagues: [] }).slice(0, 6);
  const quickSearches = await Promise.allSettled([
    newsAPI.getSoccerNewsPage(1, 30),
    ...preferenceQueries.map((query) => newsAPI.searchNewsQuery({ q: query, page: 1, pageSize: 15 })),
  ]);

  const merged = quickSearches.flatMap((result) => {
    if (result.status !== 'fulfilled') return [];
    return newsAPI.sanitizeArticles(result.value.articles || []);
  });

  const candidatePool = dedupeByUrl(merged).filter((article) => !isCollegeSportsArticle(article));
  if (candidatePool.length === 0) return [];

  try {
    const personalized = await newsPersonalizationService.rankArticles(candidatePool, userId);
    return dedupeByUrl(sortNewsForFeed([...personalized, ...candidatePool], feedSelections || { teams: [], leagues: [] }));
  } catch {
    return dedupeByUrl(sortNewsForFeed(candidatePool, feedSelections || { teams: [], leagues: [] }));
  }
};

const fetchAndRankNewsPool = async (
  userId?: string,
  feedSelections?: FeedSelections,
  seedArticles: NewsArticle[] = []
): Promise<NewsArticle[]> => {
  const merged: NewsArticle[] = [];
  const seen = new Set<string>();
  const push = (articles: NewsArticle[]) => {
    for (const article of articles) {
      if (!article?.title || !article?.url) continue;
      const key = (article.url || `${article.title}-${article.source || ''}`).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(article);
    }
  };

  const quickPool = seedArticles.length > 0 ? seedArticles : await fetchQuickNewsPool(userId, feedSelections);
  push(quickPool);

  if (merged.length < TOTAL_NEWS_COUNT * 2) {
    try {
      push(newsAPI.sanitizeArticles(await newsAPI.getSoccerNews()));
    } catch {
      // Continue with paged fetching.
    }
  }

  for (const page of [1, 2, 3, 4]) {
    if (merged.length >= TOTAL_NEWS_COUNT * 4) break;
    try {
      const response = await newsAPI.getSoccerNewsPage(page, 30);
      push(newsAPI.sanitizeArticles(response.articles || []));
    } catch {
      // Continue with remaining pages.
    }
  }

  if (merged.length < TOTAL_NEWS_COUNT * 2) {
    const preferredQueries = buildNewsPreferenceQueries(feedSelections || { teams: [], leagues: [] });
    const extraQueries = [
      ...preferredQueries,
      'premier league latest',
      'champions league latest',
      'la liga latest',
      'serie a latest',
      'bundesliga latest',
      'mls latest',
      'liga mx latest',
      'primeira liga latest',
      'transfer news football',
    ];
    for (const q of extraQueries) {
      if (merged.length >= TOTAL_NEWS_COUNT * 3) break;
      try {
        const response = await newsAPI.searchNewsQuery({ q, page: 1, pageSize: 25 });
        push(newsAPI.sanitizeArticles(response.articles || []));
      } catch {
        // Continue through additional query terms.
      }
    }
  }

  const dedupedMerged = dedupeByUrl(merged);
  const filtered = dedupedMerged.filter((article) => !isCollegeSportsArticle(article));
  const candidatePool = filtered.length >= TOTAL_NEWS_COUNT
    ? filtered
    : dedupeByUrl([...filtered, ...dedupedMerged]);

  let ranked = candidatePool;
  try {
    const personalized = await newsPersonalizationService.rankArticles(candidatePool, userId);
    ranked = dedupeByUrl([...personalized, ...candidatePool]);
  } catch {
    ranked = candidatePool;
  }

  const feedRanked = sortNewsForFeed(ranked, feedSelections || { teams: [], leagues: [] });
  const rankedWithImagesFirst = [
    ...feedRanked.filter((article) => !!article.imageUrl),
    ...feedRanked.filter((article) => !article.imageUrl),
  ];
  return dedupeByUrl(rankedWithImagesFirst);
};

export const getHomeExploreNewsAllocation = async (userId?: string, feedSelections?: FeedSelections): Promise<NewsAllocation> => {
  const cached = await getCachedValueAsync<NewsArticle[]>(NEWS_ALLOCATION_CACHE_KEY, NEWS_ALLOCATION_TTL_MS);
  if (cached && cached.length > 0) {
    return splitAllocation(selectNewsForFeed(cached, feedSelections || { teams: [], leagues: [] }, 4));
  }

  const sharedCached = await readNewsCache(NEWS_ALLOCATION_CACHE_KEY);
  if (sharedCached && sharedCached.length > 0) {
    await setCachedValue(NEWS_ALLOCATION_CACHE_KEY, sharedCached);
    return splitAllocation(selectNewsForFeed(sharedCached, feedSelections || { teams: [], leagues: [] }, 4));
  }

  try {
    const quickAll = await fetchQuickNewsPool(userId, feedSelections);
    if (quickAll.length > 0) {
      const quickAllocation = splitAllocation(selectNewsForFeed(quickAll, feedSelections || { teams: [], leagues: [] }, 4));
      if (
        quickAllocation.home.length >= HOME_NEWS_COUNT &&
        quickAllocation.explore.length >= EXPLORE_NEWS_COUNT
      ) {
        await setCachedValue(NEWS_ALLOCATION_CACHE_KEY, quickAll);
        writeNewsCache(NEWS_ALLOCATION_CACHE_KEY, quickAll);
        return quickAllocation;
      }
    }

    const all = mergeUniqueArticles(quickAll, await fetchAndRankNewsPool(userId, feedSelections, quickAll));
    if (all.length > 0) {
      await setCachedValue(NEWS_ALLOCATION_CACHE_KEY, all);
      writeNewsCache(NEWS_ALLOCATION_CACHE_KEY, all);
      const allocation = splitAllocation(selectNewsForFeed(all, feedSelections || { teams: [], leagues: [] }, 4));
      if (allocation.home.length >= HOME_NEWS_COUNT && allocation.explore.length >= EXPLORE_NEWS_COUNT) {
        return allocation;
      }
    }
  } catch {
    // Fall through to stale cache/fallback behavior.
  }

  if (cached && cached.length > 0) {
    const fallback = splitAllocation(selectNewsForFeed(cached, feedSelections || { teams: [], leagues: [] }, 4));
    return fallback;
  }

  return { all: [], home: [], explore: [] };
};

export const getCachedHomeExploreNewsAllocation = async (): Promise<NewsAllocation | null> => {
  const cached = await getCachedValueAsync<NewsArticle[]>(NEWS_ALLOCATION_CACHE_KEY, NEWS_ALLOCATION_TTL_MS);
  if (!cached || cached.length === 0) return null;
  return splitAllocation(cached);
};
