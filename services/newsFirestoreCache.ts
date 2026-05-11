/**
 * services/newsFirestoreCache.ts
 *
 * Shared Firestore cache for news articles.
 * When user A fetches news for a match/team, the result is written here.
 * When user B opens the same match/team, they get the result instantly from
 * Firestore instead of waiting for the external news API.
 *
 * Collection: newsCache/{cacheKey}
 *   { articles: NewsArticle[], cachedAt: Timestamp }
 *
 * TTL: 24 hours — shared news can stay stable across users while we avoid
 * wasting provider calls before ML/personalization is introduced.
 */

import { getDoc, setDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { NewsArticle } from './newsApi';

const NEWS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function safeCacheKey(raw: string): string {
  // Firestore doc IDs cannot contain / — replace with _
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 200);
}

/** Read articles from Firestore shared cache. Returns null if missing or stale. */
export async function readNewsCache(key: string): Promise<NewsArticle[] | null> {
  try {
    const snap = await getDoc(doc(db, 'newsCache', safeCacheKey(key)));
    if (!snap.exists()) return null;
    const data = snap.data();
    const cachedAt: number = data?.cachedAt?.toMillis?.() ?? 0;
    if (Date.now() - cachedAt > NEWS_CACHE_TTL_MS) return null;
    const articles: NewsArticle[] = data?.articles ?? [];
    return articles.length > 0 ? articles : null;
  } catch {
    return null;
  }
}

/** Write articles to Firestore shared cache (fire-and-forget — never blocks the caller). */
export function writeNewsCache(key: string, articles: NewsArticle[]): void {
  if (articles.length === 0) return;
  const safeKey = safeCacheKey(key);
  // Trim articles to avoid hitting Firestore 1MB doc limit
  const trimmed = articles.slice(0, 30).map((a) => ({
    id:          a.id,
    title:       a.title,
    description: a.description ?? '',
    content:     (a.content ?? '').slice(0, 500), // cap content to keep doc small
    imageUrl:    a.imageUrl ?? '',
    source:      a.source,
    author:      a.author ?? '',
    publishedAt: a.publishedAt,
    url:         a.url,
  }));
  // Fire and forget — we don't await so it never blocks UI
  setDoc(doc(db, 'newsCache', safeKey), {
    articles: trimmed,
    cachedAt: new Date(),
    count:    trimmed.length,
  }).catch(() => { /* ignore write errors */ });
}
