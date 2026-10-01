const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const IOS_APP_ID = '1144883205';
const ANDROID_APP_ID = 'tw.gov.newTaipeiApp.android';
const OUT = path.join(__dirname, '..', 'data', 'history.json');

function taipeiDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function round2(n) {
  return n == null || Number.isNaN(Number(n)) ? null : Math.round(Number(n) * 100) / 100;
}

function parseDisplayCount(text) {
  if (!text) return null;
  const s = String(text).replace(/\u00a0/g, ' ').trim().replace(/,/g, '');
  const m = s.match(/([\d.]+)\s*([KMB萬千]?)/i);
  if (!m) return null;
  let value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const suffix = (m[2] || '').toUpperCase();
  if (suffix === 'K' || suffix === '千') value *= 1000;
  if (suffix === 'M') value *= 1000000;
  if (suffix === 'B') value *= 1000000000;
  if (suffix === '萬') value *= 10000;
  return Math.round(value);
}

async function fetchIOS() {
  const url = `https://itunes.apple.com/lookup?id=${IOS_APP_ID}&country=tw`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 AppRatingTracker/1.0' } });
  if (!res.ok) throw new Error(`Apple Lookup API HTTP ${res.status}`);
  const json = await res.json();
  const app = json.results && json.results[0];
  if (!app) throw new Error('Apple Lookup API returned no app');
  return {
    rating: round2(app.averageUserRating),
    reviewCount: Number(app.userRatingCount ?? 0),
    version: app.version ?? null,
    source: app.trackViewUrl ?? `https://apps.apple.com/tw/app/id${IOS_APP_ID}`
  };
}

async function fetchAndroidFromVisiblePage() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      locale: 'zh-TW',
      timezoneId: 'Asia/Taipei',
      viewport: { width: 1440, height: 1200 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    const url = `https://play.google.com/store/apps/details?id=${ANDROID_APP_ID}&hl=zh_TW&gl=TW`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);

    const bodyText = await page.locator('body').innerText();

    let rating = null;
    const ratingMatch = bodyText.match(/(?:^|\n)\s*([0-5](?:\.\d{1,2})?)\s*(?:★|星)?\s*(?=\n|$)/);
    if (ratingMatch) rating = round2(ratingMatch[1]);

    const patterns = [
      /([\d,.]+\s*[KMB萬千]?)\s*則評論/i,
      /([\d,.]+\s*[KMB萬千]?)\s*則評分/i,
      /([\d,.]+\s*[KMB萬千]?)\s*篇評論/i,
      /([\d,.]+\s*[KMB萬千]?)\s*reviews/i,
      /([\d,.]+\s*[KMB萬千]?)\s*ratings/i
    ];

    let reviewCountDisplay = null;
    let reviewCount = null;
    for (const pattern of patterns) {
      const m = bodyText.match(pattern);
      if (m) {
        reviewCountDisplay = m[1].trim();
        reviewCount = parseDisplayCount(reviewCountDisplay);
        break;
      }
    }

    if (reviewCount == null) {
      const labels = await page.locator(
        '[aria-label*="評論"], [aria-label*="評分"], [aria-label*="reviews"], [aria-label*="ratings"]'
      ).evaluateAll(els => els.map(el => el.getAttribute('aria-label')).filter(Boolean));

      for (const label of labels) {
        const m = label.match(/([\d,.]+\s*[KMB萬千]?)/i);
        if (!m) continue;
        const parsed = parseDisplayCount(m[1]);
        if (parsed != null) {
          reviewCountDisplay = m[1].trim();
          reviewCount = parsed;
          break;
        }
      }
    }

    if (rating == null || reviewCount == null) {
      throw new Error(`Could not read visible Google Play values. rating=${rating}, reviewCount=${reviewCount}`);
    }

    return {
      rating,
      reviewCount,
      reviewCountDisplay,
      version: null,
      source: url,
      method: 'playwright-visible-page'
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const date = taipeiDate();
  const [ios, android] = await Promise.all([fetchIOS(), fetchAndroidFromVisiblePage()]);
  let history = [];

  if (fs.existsSync(OUT)) {
    try { history = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (_) {}
  }
  if (!Array.isArray(history)) history = [];

  const record = { date, fetchedAt: new Date().toISOString(), ios, android };
  const index = history.findIndex(r => r.date === date);
  if (index >= 0) history[index] = record;
  else history.push(record);

  history.sort((a, b) => a.date.localeCompare(b.date));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(history, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(record, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
