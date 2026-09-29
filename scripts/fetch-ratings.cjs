const fs = require('fs');
const path = require('path');

const gplayModule = require('google-play-scraper');
const gplay = gplayModule.default || gplayModule;

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
  return n == null || Number.isNaN(Number(n))
    ? null
    : Math.round(Number(n) * 100) / 100;
}

function parseCount(value) {
  if (!value) return null;

  const s = String(value)
    .trim()
    .replace(/\s+/g, '')
    .replace(/,/g, '')
    .toUpperCase();

  let multiplier = 1;
  let numeric = s;

  if (s.endsWith('K')) {
    multiplier = 1000;
    numeric = s.slice(0, -1);
  } else if (s.endsWith('M')) {
    multiplier = 1000000;
    numeric = s.slice(0, -1);
  } else if (s.endsWith('B')) {
    multiplier = 1000000000;
    numeric = s.slice(0, -1);
  } else if (s.endsWith('萬')) {
    multiplier = 10000;
    numeric = s.slice(0, -1);
  } else if (s.endsWith('千')) {
    multiplier = 1000;
    numeric = s.slice(0, -1);
  }

  const n = Number(numeric);
  return Number.isFinite(n) ? Math.round(n * multiplier) : null;
}

async function fetchIOS() {
  const url = `https://itunes.apple.com/lookup?id=${IOS_APP_ID}&country=tw`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 AppRatingTracker/1.0'
    }
  });

  if (!res.ok) {
    throw new Error(`Apple Lookup API HTTP ${res.status}`);
  }

  const json = await res.json();
  const app = json.results && json.results[0];

  if (!app) {
    throw new Error('Apple Lookup API returned no app');
  }

  return {
    rating: round2(app.averageUserRating),
    reviewCount: Number(app.userRatingCount ?? 0),
    version: app.version ?? null,
    source: app.trackViewUrl ?? `https://apps.apple.com/tw/app/id${IOS_APP_ID}`
  };
}

/**
 * 直接讀取 Google Play 公開商店頁面上顯示的評論/評分數。
 *
 * Google Play 頁面常把「所有評分數」顯示成 "... reviews"，
 * 這個數字可能和 google-play-scraper 的 ratings 有短暫不同步。
 *
 * 這裡優先採用頁面顯示值；抓不到時才 fallback 到 scraper。
