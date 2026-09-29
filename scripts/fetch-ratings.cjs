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

  const map = Object.fromEntries(parts.map(function (p) {
    return [p.type, p.value];
  }));

  return map.year + '-' + map.month + '-' + map.day;
}

function round2(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return Math.round(Number(n) * 100) / 100;
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
  }

  const n = Number(numeric);
  return Number.isFinite(n) ? Math.round(n * multiplier) : null;
}

async function fetchIOS() {
  const url = 'https://itunes.apple.com/lookup?id=' + IOS_APP_ID + '&country=tw';

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 AppRatingTracker/1.0'
    }
  });

  if (!res.ok) {
    throw new Error('Apple Lookup API HTTP ' + res.status);
  }

  const json = await res.json();
  const app = json.results && json.results[0];

  if (!app) {
    throw new Error('Apple Lookup API returned no app');
  }

  return {
    rating: round2(app.averageUserRating),
    reviewCount: Number(app.userRatingCount || 0),
    version: app.version || null,
    source: app.trackViewUrl || ('https://apps.apple.com/tw/app/id' + IOS_APP_ID)
  };
}

async function fetchGooglePlayVisibleReviewCount() {
  const url =
    'https://play.google.com/store/apps/details?id=' +
    ANDROID_APP_ID +
    '&hl=en&gl=TW';

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/140.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!res.ok) {
    throw new Error('Google Play page HTTP ' + res.status);
  }

  const html = await res.text();

  const patterns = [
    /aria-label="[^"]*?([\d,.]+(?:[KMB])?)\s+(?:ratings|reviews)[^"]*?"/gi,
    />([\d,.]+(?:[KMB])?)\s+(?:ratings|reviews)</gi,
    /([\d,.]+(?:[KMB])?)\s+(?:ratings|reviews)/gi
  ];

  const candidates = [];

  for (const pattern of patterns) {
    let match;

    while ((match = pattern.exec(html)) !== null) {
      const n = parseCount(match[1]);

      if (n != null && n > 0) {
        candidates.push(n);
      }
    }

    if (candidates.length > 0) {
      break;
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  return Math.max.apply(null, candidates);
}

async function fetchAndroid() {
  const app = await gplay.app({
    appId: ANDROID_APP_ID,
    lang: 'zh_TW',
    country: 'tw'
  });

  let visibleReviewCount = null;

  try {
    visibleReviewCount = await fetchGooglePlayVisibleReviewCount();
  } catch (err) {
    console.warn(
      'Google Play visible count failed; using scraper count: ' + err.message
    );
  }

  const scraperReviewCount = Number(app.ratings || app.reviews || 0);

  return {
    rating: round2(app.score),
    reviewCount:
      visibleReviewCount != null
        ? visibleReviewCount
        : scraperReviewCount,
    scraperReviewCount: scraperReviewCount,
    writtenReviews:
      app.reviews == null
        ? null
        : Number(app.reviews),
    version: app.version || null,
    source:
      app.url ||
      ('https://play.google.com/store/apps/details?id=' +
        ANDROID_APP_ID +
        '&hl=zh_TW&gl=TW')
  };
}

async function main() {
  const date = taipeiDate();

  const results = await Promise.all([
    fetchIOS(),
    fetchAndroid()
  ]);

  const ios = results[0];
  const android = results[1];

  let history = [];

  if (fs.existsSync(OUT)) {
    try {
      history = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    } catch (err) {
      history = [];
    }
  }

  if (!Array.isArray(history)) {
    history = [];
  }

  const record = {
    date: date,
    fetchedAt: new Date().toISOString(),
    ios: ios,
    android: android
  };

  const index = history.findIndex(function (r) {
    return r.date === date;
  });

  if (index >= 0) {
    history[index] = record;
  } else {
    history.push(record);
  }

  history.sort(function (a, b) {
    return a.date.localeCompare(b.date);
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(history, null, 2) + '\n',
    'utf8'
  );

  console.log(JSON.stringify(record, null, 2));
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
