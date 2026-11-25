import Parser from 'rss-parser';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DATA_URL = new URL('../data/news.json', import.meta.url);
const FEEDS_URL = new URL('./feeds.json', import.meta.url);
const SEPARATOR = '\n\n【771923】\n\n';
const REGIONS = new Set(['us', 'eu', 'china', 'sea', 'india', 'mideast', 'latam']);
const parser = new Parser({ timeout: 15000 });

export function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

// RSS content stays plain text; the browser also uses textContent, never innerHTML.
export function plainText(value, limit = 240) {
  return String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi, entity => {
      const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' };
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
      const hex = entity.toLowerCase().startsWith('&#x');
      const code = parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/\s+/g, ' ').trim().slice(0, limit);
}

export async function fetchWithTimeout(url, { fetchImpl = fetch, timeout = 15000 } = {}) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(timeout),
    headers: { 'User-Agent': 'PopcornNews/1.0 (+https://worldnewsportal.aipopcorn.jp/)' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

export async function translateArticle(title, summary, fetchImpl = fetch) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.search = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: 'ja', dt: 't', q: title + SEPARATOR + summary });
  const response = await fetchWithTimeout(url, { fetchImpl, timeout: 8000 });
  const data = await response.json();
  if (!Array.isArray(data?.[0])) throw new Error('Invalid translation response');
  const translated = data[0].map(segment => typeof segment?.[0] === 'string' ? segment[0] : '').join('');
  const parts = translated.split(/\s*【\s*771923\s*】\s*/);
  if (parts.length !== 2 || !parts[0].trim() || (summary && !parts[1].trim())) {
    throw new Error('Translation separator missing');
  }
  return { title: plainText(parts[0], 220), summary: plainText(parts[1], 300), translationStatus: 'translated' };
}

function validCached(article) {
  return article && safeUrl(article.url) && REGIONS.has(article.region) &&
    typeof article.title === 'string' && typeof article.summary === 'string' &&
    typeof article.source === 'string' && Number.isFinite(Date.parse(article.publishedAt));
}

export function mergeArticles(articles, limit = 120) {
  const seen = new Map();
  for (const article of articles) {
    if (!validCached(article)) continue;
    const url = safeUrl(article.url);
    if (!seen.has(url)) seen.set(url, { ...article, url });
  }
  return [...seen.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.url.localeCompare(b.url)).slice(0, limit);
}

export async function collectNews({ feeds, previous, fetchImpl = fetch, parse = xml => parser.parseString(xml), logger = console }) {
  const cached = previous?.isSample ? [] : mergeArticles(previous?.articles ?? []);
  const byUrl = new Map(cached.map(article => [article.url, article]));
  const results = [];
  const seen = new Set();
  let successfulFeeds = 0;
  let translationFailures = 0;

  // Sequential requests keep load on both publishers and the free translator low.
  for (const feed of feeds) {
    try {
      if (!REGIONS.has(feed.region) || !safeUrl(feed.url)) throw new Error('Invalid feed configuration');
      const response = await fetchWithTimeout(feed.url, { fetchImpl });
      const parsed = await parse(await response.text());
      if (!Array.isArray(parsed.items)) throw new Error('Feed has no items array');
      successfulFeeds++;
      const items = parsed.items.slice().sort((a, b) => (Date.parse(b.isoDate || b.pubDate) || 0) - (Date.parse(a.isoDate || a.pubDate) || 0)).slice(0, 5);
      for (const item of items) {
        const url = safeUrl(item.link);
        const originalTitle = plainText(item.title, 220);
        const date = Date.parse(item.isoDate || item.pubDate);
        if (!url || !originalTitle || seen.has(url) || !Number.isFinite(date)) continue;
        seen.add(url);
        const existing = byUrl.get(url);
        if (existing?.translationStatus === 'translated') {
          results.push(existing);
          continue;
        }
        const originalSummary = plainText(item.contentSnippet || item.summary || item.content, 240);
        results.push({ url, region: feed.region, source: feed.source, publishedAt: new Date(date).toISOString(), originalTitle,
          title: originalTitle, summary: originalSummary, translationStatus: 'original' });
      }
      logger.info(`[feed] ${feed.source}: ${items.length} items`);
    } catch (error) {
      logger.warn(`[feed] ${feed.source}: ${error.message}`);
    }
  }
  if (!successfulFeeds || (!results.length && !cached.length)) {
    throw new Error('No usable news fetched; previous data has been preserved.');
  }
  const articles = mergeArticles([...results, ...cached]);
  // Retry retained originals too, including articles no longer in a feed's top five.
  // At most 120 translations with an 8s timeout fit inside the workflow's 25m limit.
  for (const article of articles) {
    if (article.translationStatus === 'translated') continue;
    try {
      Object.assign(article, await translateArticle(article.originalTitle || article.title, article.summary, fetchImpl));
    } catch (error) {
      translationFailures++;
      logger.warn(`[translation] ${article.source}: ${error.message}`);
    }
  }
  return { articles, successfulFeeds, translationFailures };
}

export async function main() {
  const feeds = JSON.parse(await readFile(FEEDS_URL, 'utf8'));
  let previous = { articles: [] };
  try { previous = JSON.parse(await readFile(DATA_URL, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Cannot read existing news cache: ${error.message}`);
  }
  const { articles, successfulFeeds, translationFailures } = await collectNews({ feeds, previous });
  if (!previous.isSample && JSON.stringify(previous.articles) === JSON.stringify(articles)) {
    console.info('No article changes. news.json left unchanged.');
    return;
  }
  const next = { updatedAt: new Date().toISOString(), isSample: false, articles };
  const temporary = new URL('./news.json.tmp', DATA_URL);
  await writeFile(temporary, JSON.stringify(next, null, 2) + '\n');
  await rename(temporary, DATA_URL);
  console.info(`Saved ${articles.length} articles; ${successfulFeeds}/${feeds.length} feeds; ${translationFailures} translation failures.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
