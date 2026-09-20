/* sw.js — service worker: offline app shell + runtime caching for Wikipedia.
 *
 * Strategy
 *   shell (HTML/CSS/JS/manifest/icons)  cache-first + background revalidate
 *   navigations                        network-first, fall back to cached shell
 *   Wikipedia API / articles           network-first, cache last N responses
 *   Wikimedia images                   cache-first, capped
 *
 * We never claim that arbitrary Wikipedia content is available offline: only
 * what the player actually visited is cached, and the UI shows an offline
 * indicator when the network is gone.
 */

const VERSION = 'wsr-v1.0.0';
const SHELL_CACHE = `${VERSION}-shell`;
const API_CACHE = `${VERSION}-api`;
const IMG_CACHE = `${VERSION}-img`;
const MAX_API_ENTRIES = 120;
const MAX_IMG_ENTRIES = 80;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/components.css',
  './css/article.css',
  './js/main.js',
  './js/core/util.js',
  './js/core/i18n.js',
  './js/core/store.js',
  './js/core/save.js',
  './js/api/wikipedia.js',
  './js/game/timer.js',
  './js/game/scoring.js',
  './js/game/difficulty.js',
  './js/game/challenges.js',
  './js/game/hints.js',
  './js/game/powerups.js',
  './js/game/gameState.js',
  './js/navigation/articleParser.js',
  './js/navigation/articleRouter.js',
  './js/storage/settings.js',
  './js/storage/statistics.js',
  './js/storage/achievements.js',
  './js/storage/profile.js',
  './js/storage/bookmarks.js',
  './js/storage/leaderboard.js',
  './js/storage/articleCache.js',
  './js/ui/router.js',
  './js/ui/hud.js',
  './js/ui/components.js',
  './js/ui/charts.js',
  './js/ui/notifications.js',
  './js/ui/sound.js',
  './js/ui/screens/index.js',
  './js/ui/screens/home.js',
  './js/ui/screens/play.js',
  './js/ui/screens/game.js',
  './js/ui/screens/daily.js',
  './js/ui/screens/results.js',
  './js/ui/screens/stats.js',
  './js/ui/screens/achievements.js',
  './js/ui/screens/profile.js',
  './js/ui/screens/settings.js',
  './js/ui/screens/replay.js',
  './js/ui/screens/bookmarks.js',
  './js/ui/screens/leaderboard.js',
  './icons/icon.svg',
  './data/popular-en.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Individual failures must not break the install (e.g. an icon missing).
    await Promise.all(SHELL_ASSETS.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (err) { console.warn('[sw] precache skipped', url, err && err.message); }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_ARTICLE_CACHE') {
    event.waitUntil(caches.delete(API_CACHE));
  }
});

async function trimCache(name, maxEntries) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  for (const key of keys.slice(0, keys.length - maxEntries)) await cache.delete(key);
}

function isWikipediaApi(url) {
  return /(^|\.)wikipedia\.org$/.test(url.hostname) && (url.pathname.includes('/w/api.php') || url.pathname.includes('/api/rest_v1'));
}

function isWikimediaImage(url) {
  return /(^|\.)(wikimedia\.org|wikipedia\.org)$/.test(url.hostname)
    && (/\.(png|jpe?g|gif|webp|svg)$/i.test(url.pathname) || url.hostname.startsWith('upload.'));
}

async function networkFirst(request, cacheName, { maxEntries = 60, timeoutMs = 12000 } = {}) {
  const cache = await caches.open(cacheName);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response && response.ok) {
      cache.put(request, response.clone()).then(() => trimCache(cacheName, maxEntries)).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName, { maxEntries = 80 } = {}) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) {
    // revalidate in the background
    fetch(request).then((res) => {
      if (res && res.ok) cache.put(request, res.clone()).then(() => trimCache(cacheName, maxEntries)).catch(() => {});
    }).catch(() => {});
    return cached;
  }
  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone()).then(() => trimCache(cacheName, maxEntries)).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 1. Navigations → offline shell
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(request, { ignoreVary: true }))
          || (await cache.match('./index.html'))
          || new Response('<h1>Offline</h1><p>The app shell is not cached yet. Reconnect once to install it.</p>', { headers: { 'Content-Type': 'text/html' }, status: 200 });
      }
    })());
    return;
  }

  // 2. Wikipedia API → network-first (so a fresh article always wins)
  if (isWikipediaApi(url)) {
    event.respondWith(networkFirst(request, API_CACHE, { maxEntries: MAX_API_ENTRIES }));
    return;
  }

  // 3. Wikimedia images → cache-first
  if (isWikimediaImage(url)) {
    event.respondWith(cacheFirst(request, IMG_CACHE, { maxEntries: MAX_IMG_ENTRIES }).catch(() => new Response('', { status: 504 })));
    return;
  }

  // 4. Same-origin static assets (app shell, data pools, module chunks)
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, SHELL_CACHE, { maxEntries: 200 }));
    return;
  }

  // Everything else: straight to the network.
});
