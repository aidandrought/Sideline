import { API_CONFIG } from '../constants/config';

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_BYTES = 1_500_000;

type CacheEntry = {
  html: string;
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<void>>();

const normalizeUrl = (url: string) => url.trim();
const normalizeBaseUrl = (url: string) => url.replace(/\/$/, '');

const buildExtractorUrl = () => `${normalizeBaseUrl(API_CONFIG.EXTRACTOR_BASE_URL)}/api/article/extract`;

const buildHtmlDocument = ({
  title,
  source,
  publishedAt,
  leadImageUrl,
  contentHtml,
}: {
  title?: string;
  source?: string;
  publishedAt?: string;
  leadImageUrl?: string;
  contentHtml: string;
}) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title || 'Article'}</title>
    <style>
      :root {
        color-scheme: light dark;
        --article-bg: #ffffff;
        --article-text: #111827;
        --article-heading: #0f172a;
        --article-muted: #6b7280;
        --article-link: #0b66c3;
        --article-quote: #374151;
        --article-quote-border: #d1d5db;
      }
      html[data-theme="dark"] {
        --article-bg: #050b14;
        --article-text: #e5eefb;
        --article-heading: #f8fbff;
        --article-muted: #94a3b8;
        --article-link: #7cc4ff;
        --article-quote: #cbd5e1;
        --article-quote-border: #334155;
      }
      @media (prefers-color-scheme: dark) {
        html:not([data-theme="light"]) {
          --article-bg: #050b14;
          --article-text: #e5eefb;
          --article-heading: #f8fbff;
          --article-muted: #94a3b8;
          --article-link: #7cc4ff;
          --article-quote: #cbd5e1;
          --article-quote-border: #334155;
        }
      }
      body {
        margin: 0;
        padding: 20px 18px 32px;
        background: var(--article-bg);
        color: var(--article-text);
        font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        transition: background-color 0.18s ease, color 0.18s ease;
      }
      img { max-width: 100%; height: auto; border-radius: 12px; }
      figure { margin: 0 0 16px; }
      a { color: var(--article-link); }
      h1, h2, h3 { line-height: 1.2; color: var(--article-heading); }
      p, ul, ol, blockquote { margin: 0 0 14px; }
      blockquote {
        border-left: 3px solid var(--article-quote-border);
        padding-left: 12px;
        color: var(--article-quote);
      }
      .meta { margin-bottom: 18px; color: var(--article-muted); font-size: 13px; }
      .lead { margin-bottom: 18px; }
    </style>
  </head>
  <body>
    ${title ? `<h1>${title}</h1>` : ''}
    ${(source || publishedAt) ? `<div class="meta">${[source, publishedAt].filter(Boolean).join(' · ')}</div>` : ''}
    ${leadImageUrl ? `<div class="lead"><img src="${leadImageUrl}" alt="" /></div>` : ''}
    ${contentHtml}
  </body>
</html>`;

const pruneCache = () => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.fetchedAt > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
};

export const getCachedArticleHtml = (url: string): string | null => {
  pruneCache();
  const entry = cache.get(normalizeUrl(url));
  if (!entry) return null;
  return entry.html;
};

export const prefetchArticleHtml = async (url: string): Promise<void> => {
  const normalized = normalizeUrl(url);
  if (!normalized) return;
  const existing = cache.get(normalized);
  if (existing && Date.now() - existing.fetchedAt < CACHE_TTL_MS) return;
  if (inFlight.has(normalized)) {
    return inFlight.get(normalized);
  }

  const promise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const extractorUrl = buildExtractorUrl();
      if (API_CONFIG.EXTRACTOR_BASE_URL) {
        const extractedResponse = await fetch(extractorUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: normalized }),
          signal: controller.signal,
        });

        if (extractedResponse.ok) {
          const payload = await extractedResponse.json();
          const html = String(payload?.contentHtml || '').trim();
          if (html) {
            const documentHtml = buildHtmlDocument({
              title: payload?.title,
              source: payload?.source,
              publishedAt: payload?.publishedAt,
              leadImageUrl: payload?.leadImageUrl,
              contentHtml: html,
            });
            const truncated = documentHtml.length > MAX_BYTES ? documentHtml.slice(0, MAX_BYTES) : documentHtml;
            cache.set(normalized, { html: truncated, fetchedAt: Date.now() });
            return;
          }
        }
      } else if (__DEV__) {
        if (__DEV__) console.log('[articleCache] No public extractor configured; falling back to article URL fetch');
      }

      const response = await fetch(normalized, { signal: controller.signal });
      if (!response.ok) return;
      const text = await response.text();
      if (!text) return;
      const truncated = text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
      cache.set(normalized, { html: truncated, fetchedAt: Date.now() });
    } catch {
      // Ignore prefetch failures.
    } finally {
      clearTimeout(timeoutId);
      inFlight.delete(normalized);
    }
  })();

  inFlight.set(normalized, promise);
  return promise;
};
