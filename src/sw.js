// Monol — Service Worker
// Cache-first strategy for static assets only; API requests always go to network.

const CACHE_NAME = 'monol-v3';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/settings.html',
  '/styles.css',
  '/script.js',
  '/api.js',
  '/config.js',
  '/crypto.js',
  '/utils.js',
  '/settings.js',
  '/manifest.json',
  '/logo.ico',
  '/icon-192.png',
  '/icon-512.png',
];

/**
 * Returns true if the request URL looks like an API call.
 * Adjust the patterns below to match your actual API base paths.
 */
function isApiRequest(url) {
  const { pathname, hostname } = new URL(url);

  // Match any path starting with /api/ on the same origin
  if (pathname.startsWith('/api/')) return true;

  // Match requests to external API hosts (add more as needed)
  const apiHosts = [
    'api.openai.com',
    'generativelanguage.googleapis.com',
    'api.anthropic.com',
  ];
  if (apiHosts.some((host) => hostname.endsWith(host))) return true;

  return false;
}

// Install: pre-cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-only for API requests; cache-first for everything else
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // API requests → always go to the network, never touch the cache
  if (isApiRequest(event.request.url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets → cache-first, populate cache on first miss
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Only cache valid same-origin responses
        if (
          !response ||
          response.status !== 200 ||
          response.type === 'opaque'
        ) {
          return response;
        }

        const toCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        return response;
      });
    })
  );
});
