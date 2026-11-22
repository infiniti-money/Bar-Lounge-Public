/**
 * Offline static shell for Cera Bar & Lounge public GitHub Pages only.
 * Does NOT cache API, requests, order data, staff pages or third-party assets.
 * Paths derive from this registration's scope: works on /Bar-Lounge-Public/ and custom domains.
 */
const GUEST_CACHE = 'cera-guest-shell-v1';
const CACHE_PREFIX = 'cera-guest-shell-';
const SITE_SCOPE = new URL(self.registration.scope);
const FILES = ['index.html', 'venue.css', 'cera-theme.css', 'venue.js', 'guest-utils.mjs', 'config.js', 'icon.svg', 'guest.webmanifest'];
const STATIC_URLS = FILES.map(name => new URL(name, SITE_SCOPE));
const STATIC_PATHS = new Set(STATIC_URLS.map(url => url.pathname));
const HOME_PATH = SITE_SCOPE.pathname;
const HOME_FILE = STATIC_URLS[0].href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(GUEST_CACHE);
    await cache.addAll(STATIC_URLS.map(url => url.href));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== GUEST_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SITE_SCOPE.origin) return; // no third-party images, Google Fonts or remote API
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/pos') || url.pathname.startsWith('/order')) return;
  const isHome = request.mode === 'navigate' && (url.pathname === HOME_PATH || url.pathname === STATIC_URLS[0].pathname);
  if (!isHome && (url.search || !STATIC_PATHS.has(url.pathname))) return;
  // Never use query strings such as ?table=... as cache keys; fallback is the generic static shell.
  const cacheKey = isHome ? HOME_FILE : url.href;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        event.waitUntil(caches.open(GUEST_CACHE).then(cache => cache.put(cacheKey, response.clone())).catch(() => {}));
      }
      return response;
    } catch {
      return (await caches.match(cacheKey)) || Response.error();
    }
  })());
});
