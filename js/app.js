import { REGIONS, WEATHER } from './config.js';

const $ = selector => document.querySelector(selector);
const state = { articles: [], region: 'all', query: '' };
const dateFormatter = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

// All external strings enter the DOM as text nodes, providing HTML escaping by design.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function externalLink(url, className, text) {
  const link = el('a', className, text);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function renderTabs() {
  const fragment = document.createDocumentFragment();
  for (const region of REGIONS) {
    const button = el('button', `region-tab${state.region === region.id ? ' active' : ''}`);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(state.region === region.id));
    button.append(el('span', 'region-icon', region.icon), el('span', '', region.label));
    button.addEventListener('click', () => { state.region = region.id; renderTabs(); renderNews(); });
    fragment.append(button);
  }
  $('#region-tabs').replaceChildren(fragment);
}

function renderNews() {
  const query = state.query.normalize('NFKC').toLocaleLowerCase('ja');
  const filtered = state.articles.filter(article => {
    const region = REGIONS.find(item => item.id === article.region);
    const text = `${article.title} ${article.summary} ${article.originalTitle ?? ''} ${article.source} ${region.label}`.normalize('NFKC').toLocaleLowerCase('ja');
    return (state.region === 'all' || article.region === state.region) && (!query || text.includes(query));
  });
  const selectedRegion = REGIONS.find(region => region.id === state.region);
  $('#news-title').textContent = state.region === 'all' ? '世界の最新ニュース' : `${selectedRegion.label}の最新ニュース`;
  $('#section-eyebrow').textContent = state.region === 'all' ? 'THE LATEST' : selectedRegion.english;
  $('#result-count').textContent = `${filtered.length} 件`;
  const fragment = document.createDocumentFragment();
  for (const [index, article] of filtered.entries()) {
    const region = REGIONS.find(item => item.id === article.region);
    const card = el('article', `news-card${index === 0 ? ' lead-card' : ''}`);
    const body = el('div', 'card-body');
    const meta = el('div', 'card-meta');
    const badge = el('span', `region-badge region-${region.id}`, `${region.icon} ${region.label}`);
    const time = el('time', '', dateFormatter.format(new Date(article.publishedAt)));
    time.dateTime = article.publishedAt;
    time.title = `${new Date(article.publishedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} JST`;
    meta.append(badge, el('span', 'source', article.source), time);
    if (article.translationStatus !== 'translated') meta.append(el('span', 'original-badge', '原文・翻訳待ち'));
    const title = el('h3');
    title.append(externalLink(article.url, '', article.title));
    const translateUrl = new URL('https://translate.google.com/translate');
    translateUrl.search = new URLSearchParams({ sl: 'auto', tl: 'ja', u: article.url });
    body.append(meta, title, el('p', 'article-summary', article.summary), externalLink(translateUrl.href, 'translate-link', '🌐 ページ全体を日本語翻訳して読む ↗'));
    card.append(el('span', 'article-number', String(index + 1).padStart(2, '0')), body);
    fragment.append(card);
  }
  $('#news-list').replaceChildren(fragment);
  $('#empty-state').hidden = filtered.length !== 0;
}

async function loadNews() {
  $('#news-list').setAttribute('aria-busy', 'true');
  $('#retry-news').hidden = true;
  $('#empty-state').hidden = true;
  try {
    const response = await fetch('/data/news.json', { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.articles)) throw new Error('Invalid news data');
    const urls = new Set();
    state.articles = data.articles.filter(article => {
      const url = safeUrl(article?.url);
      if (!url || urls.has(url) || !REGIONS.some(region => region.id !== 'all' && region.id === article.region) ||
        typeof article.title !== 'string' || typeof article.summary !== 'string' || typeof article.source !== 'string' || !Number.isFinite(Date.parse(article.publishedAt))) return false;
      article.url = url;
      urls.add(url);
      return true;
    }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 120);
    const updatedAt = Date.parse(data.updatedAt);
    $('#updated-at').textContent = Number.isFinite(updatedAt) ? `最終更新 ${dateFormatter.format(updatedAt)} JST` : '更新日時不明';
    const notice = $('#data-notice');
    notice.hidden = true;
    if (data.isSample) {
      notice.textContent = 'プレビュー用のサンプル記事です。初回の自動収集後に実際のニュースへ切り替わります。';
      notice.hidden = false;
    } else if (Number.isFinite(updatedAt) && Date.now() - updatedAt > 24 * 60 * 60 * 1000) {
      notice.textContent = 'ニュースの更新が遅れています。表示中の記事の公開日時をご確認ください。';
      notice.hidden = false;
    }
    renderNews();
  } catch {
    $('#news-list').replaceChildren(el('p', 'status-message', 'ニュースを読み込めませんでした。接続を確認して再度お試しください。'));
    $('#updated-at').textContent = '取得できませんでした';
    $('#result-count').textContent = '';
    $('#retry-news').hidden = false;
  } finally { $('#news-list').setAttribute('aria-busy', 'false'); }
}

function weatherDescription(code) {
  if (code === 0) return ['☀', '晴れ'];
  if ([1, 2].includes(code)) return ['⛅', '晴れ時々くもり'];
  if (code === 3) return ['☁', 'くもり'];
  if ([45, 48].includes(code)) return ['🌫', '霧'];
  if ([51, 53, 55, 56, 57].includes(code)) return ['🌧', '霧雨'];
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['☂', '雨'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['❄', '雪'];
  if ([95, 96, 99].includes(code)) return ['⛈', '雷雨'];
  return ['◌', '天気不明'];
}

async function loadWeather() {
  const content = $('#weather-content');
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({ latitude: WEATHER.latitude, longitude: WEATHER.longitude, current: 'temperature_2m,weather_code', daily: 'temperature_2m_max,temperature_2m_min', timezone: WEATHER.timezone, forecast_days: '1' });
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Weather unavailable');
    const data = await response.json();
    const values = [data.current?.temperature_2m, data.daily?.temperature_2m_max?.[0], data.daily?.temperature_2m_min?.[0], data.current?.weather_code];
    if (!values.every(Number.isFinite)) throw new Error('Invalid weather data');
    const [temperature, max, min, code] = values;
    const [icon, description] = weatherDescription(code);
    const current = el('div', 'weather-current');
    const details = el('div');
    const degrees = el('p', 'temperature', String(Math.round(temperature)));
    degrees.append(el('span', '', '°C'));
    details.append(degrees, el('p', 'weather-description', description));
    const range = el('div', 'weather-range');
    range.append(el('span', 'weather-high', `最高 ${Math.round(max)}°`), el('span', 'weather-low', `最低 ${Math.round(min)}°`));
    current.append(el('span', 'weather-symbol', icon), details);
    content.replaceChildren(current, range);
  } catch {
    const retry = el('button', 'weather-retry', '再取得する ↻');
    retry.type = 'button';
    retry.addEventListener('click', () => { content.replaceChildren(el('p', 'weather-loading', '天気を取得しています…')); loadWeather(); });
    content.replaceChildren(el('p', 'weather-loading', '天気を取得できませんでした。'), retry);
  }
}

$('#today').textContent = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
$('#search').addEventListener('input', event => { state.query = event.target.value.trim(); if ($('#retry-news').hidden) renderNews(); });
$('#search-form').addEventListener('submit', event => { if (!$('#search').value.trim() || event.isComposing) event.preventDefault(); });
$('#reset-filters').addEventListener('click', () => { state.region = 'all'; state.query = ''; $('#search').value = ''; renderTabs(); renderNews(); });
$('#retry-news').addEventListener('click', loadNews);
renderTabs();
loadNews();
loadWeather();
