import AsyncStorage from '@react-native-async-storage/async-storage';

type CacheEntry<T> = {
  updatedAt: number;
  data: T;
};

const STORAGE_PREFIX = 'cacheService:v1:';
const memoryCache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const MATCH_ENDED_TTL_MS = 24 * 60 * 60 * 1000;

const isFresh = (entry: CacheEntry<unknown>, ttlMs: number) =>
  Date.now() - entry.updatedAt <= ttlMs;

export const getCachedValue = <T>(key: string, ttlMs: number): T | null => {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (!isFresh(entry, ttlMs)) return null;
  return entry.data as T;
};

export const getCachedValueAsync = async <T>(key: string, ttlMs: number): Promise<T | null> => {
  const memoryHit = getCachedValue<T>(key, ttlMs);
  if (memoryHit) return memoryHit;

  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed.updatedAt !== 'number') return null;
    if (!isFresh(parsed as CacheEntry<unknown>, ttlMs)) return null;
    memoryCache.set(key, parsed as CacheEntry<unknown>);
    return parsed.data;
  } catch {
    return null;
  }
};

export const withTimeout = <T>(promise: Promise<T>, ms: number = 12000): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Request timed out')), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
};

export const getOrFetchCached = async <T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> => {
  const memoryHit = getCachedValue<T>(key, ttlMs);
  if (memoryHit) return memoryHit;

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const request = (async () => {
    try {
      const cached = await getCachedValueAsync<T>(key, ttlMs);
      if (cached) return cached;

      const data = await withTimeout(fetcher(), 12000);
      if (data !== null && data !== undefined) {
        await setCachedValue(key, data);
      }
      return data;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
};

export const setCachedValue = async <T>(key: string, data: T): Promise<void> => {
  const entry: CacheEntry<T> = { updatedAt: Date.now(), data };
  memoryCache.set(key, entry as CacheEntry<unknown>);
  try {
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    // Ignore cache write failures.
  }
};

export const clearCachedValue = async (key: string): Promise<void> => {
  memoryCache.delete(key);
  try {
    await AsyncStorage.removeItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    // Ignore cache clear failures.
  }
};

const matchEndedKey = (fixtureId: number | string) => `matchEndedAt:${fixtureId}`;

export const getMatchEndedAt = async (fixtureId: number | string): Promise<Date | null> => {
  const ts = await getCachedValueAsync<number>(matchEndedKey(fixtureId), MATCH_ENDED_TTL_MS);
  if (!ts) return null;
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const setMatchEndedAt = async (fixtureId: number | string, date: Date): Promise<void> => {
  await setCachedValue(matchEndedKey(fixtureId), date.getTime());
};
