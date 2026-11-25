import test from 'node:test';
import assert from 'node:assert/strict';
import { collectNews, mergeArticles, plainText, safeUrl, translateArticle } from '../scripts/fetch-news.mjs';

const logger = { info() {}, warn() {} };
const feed = { region: 'us', source: 'Test News', url: 'https://feed.example/rss' };
const cached = { url: 'https://news.example/one', region: 'us', source: 'Test News', publishedAt: '2026-11-24T12:00:00.000Z', originalTitle: 'Old title', title: '翻訳済み', summary: '要約', translationStatus: 'translated' };
const item = { link: cached.url, title: 'A title', contentSnippet: 'A summary', isoDate: cached.publishedAt };
const response = value => ({ ok: true, json: async () => value, text: async () => '<rss/>' });

test('cached translated URL is reused without a translation request', async () => {
  const calls = [];
  const result = await collectNews({ feeds: [feed], previous: { articles: [cached] }, fetchImpl: async url => { calls.push(String(url)); return response(); }, parse: async () => ({ items: [item, item] }), logger });
  assert.deepEqual(calls, [feed.url]);
  assert.deepEqual(result.articles, [cached]);
});

test('feed failure preserves existing news while other feeds continue', async () => {
  const result = await collectNews({ feeds: [feed, { ...feed, url: 'https://other.example/rss' }], previous: { articles: [cached] }, fetchImpl: async url => { if (url === feed.url) throw new Error('timeout'); return response(); }, parse: async () => ({ items: [] }), logger });
  assert.equal(result.successfulFeeds, 1);
  assert.deepEqual(result.articles, [cached]);
});

test('all feed failures reject rather than replacing the cache', async () => {
  await assert.rejects(collectNews({ feeds: [feed], previous: { articles: [cached] }, fetchImpl: async () => { throw new Error('offline'); }, logger }), /preserved/);
});

test('title and summary share one translation request', async () => {
  let calls = 0;
  const result = await translateArticle('Title', 'Summary', async url => {
    calls++;
    assert.equal(url.searchParams.get('tl'), 'ja');
    assert.equal(url.searchParams.get('q'), 'Title\n\n【771923】\n\nSummary');
    return response([[['日本語タイトル\n\n【771923】\n\n日本語の要約', null]]]);
  });
  assert.equal(calls, 1);
  assert.equal(result.title, '日本語タイトル');
  assert.equal(result.summary, '日本語の要約');
});

test('malformed translation is rejected and original text is retried next run', async () => {
  await assert.rejects(translateArticle('A', 'B', async () => response([[['区切りなし']]])), /separator/);
  let translations = 0;
  const result = await collectNews({ feeds: [feed], previous: { articles: [{ ...cached, translationStatus: 'original' }] }, fetchImpl: async url => {
    if (String(url).startsWith('https://translate.')) { translations++; throw new Error('rate limited'); }
    return response();
  }, parse: async () => ({ items: [item] }), logger });
  assert.equal(translations, 1);
  assert.equal(result.articles[0].translationStatus, 'original');
  assert.equal(result.articles[0].title, item.title);
});

test('samples are removed on first successful collection, latest five only', async () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ ...item, link: `https://news.example/${i}`, isoDate: `2026-11-${String(i + 10).padStart(2, '0')}T12:00:00Z` }));
  const result = await collectNews({ feeds: [feed], previous: { isSample: true, articles: [cached] }, fetchImpl: async url => String(url).startsWith('https://translate.') ? response([[['題\n\n【771923】\n\n要約']]]) : response(), parse: async () => ({ items }), logger });
  assert.equal(result.articles.length, 5);
  assert.equal(result.articles[0].url, 'https://news.example/7');
  assert.ok(!result.articles.some(article => article.url === cached.url));
});

test('URLs are deduplicated, unsafe URLs rejected, newest 120 retained', () => {
  const articles = Array.from({ length: 130 }, (_, i) => ({ ...cached, url: `https://news.example/${i}`, publishedAt: new Date(Date.UTC(2026, 0, 1, i)).toISOString() }));
  const result = mergeArticles([...articles, articles[129], { ...cached, url: 'javascript:alert(1)' }]);
  assert.equal(result.length, 120);
  assert.equal(result[0].url, 'https://news.example/129');
  assert.equal(safeUrl('data:text/html,test'), null);
  assert.equal(safeUrl('https://user:password@example.com/'), null);
  assert.equal(safeUrl('https://example.com/a#section'), 'https://example.com/a');
  assert.equal(plainText('<script>alert(1)</script><b>A &amp; B</b> &#x1f37f;'), 'A & B 🍿');
});
