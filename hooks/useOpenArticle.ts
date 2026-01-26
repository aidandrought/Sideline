import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { NewsArticle } from '../services/newsApi';

const normalizeUrl = (url?: string) => {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
};

const buildParams = (article: NewsArticle) => ({
  url: normalizeUrl(article.url),
  title: article.title,
  source: article.source,
  author: article.author || '',
  publishedAt: article.publishedAt,
  imageUrl: article.imageUrl || ''
});

let lastPrefetchedUrl = '';

export const useOpenArticle = () => {
  const router = useRouter();

  const openArticle = useCallback(
    (article: NewsArticle) => {
      const params = buildParams(article);
      if (!params.url) return;
      router.push({
        pathname: '/news/reader',
        params
      });
    },
    [router]
  );

  const prefetchArticle = useCallback((article: NewsArticle) => {
    const params = buildParams(article);
    if (!params.url) return;
    lastPrefetchedUrl = params.url;
  }, []);

  return { openArticle, prefetchArticle, lastPrefetchedUrl };
};
