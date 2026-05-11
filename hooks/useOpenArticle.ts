import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { NewsArticle } from '../services/newsApi';
import { analyticsService } from '../services/analyticsService';
import { getCachedArticleHtml, prefetchArticleHtml } from '../services/articleCache';

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
    async (article: NewsArticle) => {
      const params = buildParams(article);
      if (!params.url) return;
      analyticsService.track('open_article', {
        source: article.source,
        urlHost: (() => {
          try { return new URL(params.url).hostname; } catch { return ''; }
        })(),
      });
      // Start warming HTML, but navigate immediately so taps feel instant.
      if (!getCachedArticleHtml(params.url)) void prefetchArticleHtml(params.url);
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
    void prefetchArticleHtml(params.url);
  }, []);

  return { openArticle, prefetchArticle, lastPrefetchedUrl };
};
