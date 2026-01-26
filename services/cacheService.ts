import AsyncStorage from '@react-native-async-storage/async-storage';

type CacheEntry<T> = {
  updatedAt: number;
  data: T;
};

const STORAGE_PREFIX = 'cacheService:v1:';
const memoryCache = new Map<string, CacheEntry<unknown>>();

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
