import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { NewsArticle } from '../services/newsApi';

export const useOpenArticle = () => {
  const router = useRouter();

  return useCallback(
    (article: NewsArticle) => {
      if (!article?.url) return;
      router.push({
        pathname: '/news/reader',
        params: {
          url: article.url,
          title: article.title,
          source: article.source,
          author: article.author || '',
          publishedAt: article.publishedAt,
          imageUrl: article.imageUrl || ''
        }
      });
    },
    [router]
  );
};
