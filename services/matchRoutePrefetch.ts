import { Image } from 'react-native';
import { footballAPI, Match } from './footballApi';

const prefetched = new Map<string, number>();
const TTL_MS = 60 * 1000;

const shouldPrefetch = (key: string) => {
  const at = prefetched.get(key) ?? 0;
  const now = Date.now();
  if (now - at < TTL_MS) return false;
  prefetched.set(key, now);
  return true;
};

export const prefetchMatchOpenData = async (match: { id: number | string; status?: string; date?: string } | Match) => {
  const id = Number(match.id);
  if (!Number.isFinite(id)) return;
  const key = String(id);
  if (!shouldPrefetch(key)) return;

  const prefetchLogo = (uri?: string) => {
    if (!uri) return Promise.resolve(false);
    return Image.prefetch(uri).catch(() => false);
  };

  const baseFixtureTask = footballAPI.getFixtureById(id);
  const tasks: Promise<unknown>[] = [
    baseFixtureTask,
    prefetchLogo((match as Match).homeLogo),
    prefetchLogo((match as Match).awayLogo),
  ];
  await Promise.allSettled(tasks);

  const baseFixture = await baseFixtureTask.catch(() => null);
  await Promise.allSettled([
    prefetchLogo(baseFixture?.teams?.home?.logo),
    prefetchLogo(baseFixture?.teams?.away?.logo),
  ]);
};
