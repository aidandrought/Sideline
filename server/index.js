const express = require('express');
const cors = require('cors');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const createDOMPurify = require('dompurify');

const app = express();
const PORT = process.env.PORT || 4000;

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const cache = new Map();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const getCached = (url) => {
  const entry = cache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(url);
    return null;
  }
  return entry.data;
};

const setCached = (url, data) => {
  cache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
};

const getMetaContent = (document, selectors) => {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute('content');
    if (value) return value;
  }
  return '';
};

const sanitizeHtml = (html) => {
  const window = new JSDOM('').window;
  const DOMPurify = createDOMPurify(window);
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
};

const extractArticle = (html, url) => {
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;
  const reader = new Readability(document);
  const article = reader.parse();

  if (!article || !article.content) {
    throw new Error('Unable to parse article');
  }

  const contentHtml = sanitizeHtml(article.content);
  const contentText = (article.textContent || '').trim();

  const title = article.title || document.title || '';
  const author = article.byline || getMetaContent(document, [
    'meta[name="author"]',
    'meta[property="article:author"]'
  ]);
  const publishedAt = getMetaContent(document, [
    'meta[property="article:published_time"]',
    'meta[name="pubdate"]',
    'meta[name="publish-date"]',
    'meta[name="date"]'
  ]);
  const leadImageUrl = getMetaContent(document, [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]'
  ]);
  const source = article.siteName || getMetaContent(document, [
    'meta[property="og:site_name"]'
  ]) || new URL(url).hostname;

  return {
    title,
    author: author || undefined,
    publishedAt: publishedAt || undefined,
    source,
    leadImageUrl: leadImageUrl || undefined,
    contentHtml,
    contentText,
    url
  };
};

app.post('/api/article/extract', async (req, res) => {
  const url = req.body?.url;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url' });
  }

  const cached = getCached(url);
  if (cached) {
    return res.json(cached);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Sideline/1.0'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to fetch article' });
    }

    const html = await response.text();
    const extracted = extractArticle(html, url);

    if (!extracted.contentHtml && !extracted.contentText) {
      return res.status(422).json({ error: 'No content found' });
    }

    setCached(url, extracted);
    return res.json(extracted);
  } catch (error) {
    return res.status(502).json({ error: 'Extraction failed' });
  } finally {
    clearTimeout(timeout);
  }
});

app.listen(PORT, () => {
  console.log(`Article extractor running on http://localhost:${PORT}`);
});
