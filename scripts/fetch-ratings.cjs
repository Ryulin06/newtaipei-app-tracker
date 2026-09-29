const fs = require('fs');
const path = require('path');
const gplay = require('google-play-scraper').default;

const IOS_APP_ID = '1144883205';
const ANDROID_APP_ID = 'tw.gov.newTaipeiApp.android';
const OUT = path.join(__dirname, '..', 'data', 'history.json');

function taipeiDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function round2(n) {
  return n == null || Number.isNaN(Number(n)) ? null : Math.round(Number(n) * 100) / 100;
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

async function fetchAndroid() {
  const app = await gplay.app({ appId: ANDROID_APP_ID, lang: 'zh_TW', country: 'tw' });
  return {
    rating: round2(app.score),
    // Google Play頁面顯示的數量最接近 ratings；同時保留 writtenReviews 供日後需要。
    reviewCount: Number(app.ratings ?? app.reviews ?? 0),
    writtenReviews: app.reviews == null ? null : Number(app.reviews),
    version: app.version ?? null,
    source: app.url ?? `https://play.google.com/store/apps/details?id=${ANDROID_APP_ID}&hl=zh_TW&gl=TW`
  };
}

async function main() {
  const date = taipeiDate();
  const [ios, android] = await Promise.all([fetchIOS(), fetchAndroid()]);
  let history = [];
  if (fs.existsSync(OUT)) {
    try { history = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (_) {}
  }
  if (!Array.isArray(history)) history = [];
  const record = {
    date,
    fetchedAt: new Date().toISOString(),
    ios,
    android
  };
  const index = history.findIndex(r => r.date === date);
  if (index >= 0) history[index] = record; else history.push(record);
  history.sort((a, b) => a.date.localeCompare(b.date));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(history, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(record, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
