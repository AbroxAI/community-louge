// sw.js (patched)
// Abrox – Service Worker
// Handles precaching + offline-first fetch with stale-while-revalidate and navigation fallback

const SW_VERSION = 'v1.0.1';
const CACHE_NAME = `abrox-chat-${SW_VERSION}`;

const PRECACHE_ASSETS = [
  '/',
  '/index.html',

  // core scripts
  '/precache.js',
  '/synthetic-people.js',
  '/message-pool.js',
  '/typing-engine.js',
  '/simulation-engine.js',
  '/ui-adapter.js',
  '/message.js',

  // ui / assets
  '/styles.css',
  '/emoji-pack.js',
  '/emoji-pack.css', // optional, if you add one
  '/assets/logo.png'
];

// Util: safe cache addAll (don't fail install completely if one asset 404s)
async function safePrecache(cache, assets){
  const results = await Promise.allSettled(assets.map(url => fetch(url, { credentials: 'same-origin' }).then(r => {
    if(!r.ok) throw new Error(`Request failed ${r.status} ${url}`);
    return cache.put(url, r.clone()).then(()=>({ url, ok: true })).catch(err => { throw err; });
  })));
  const failures = results.filter(r => r.status === 'rejected');
  if(failures.length) {
    // log but continue — we prefer SW to install even if some assets miss
    console.warn('[sw] precache: some assets failed to cache', failures.map(f => f.reason && f.reason.message));
  }
}

// ---------- INSTALL ----------
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try{
      const cache = await caches.open(CACHE_NAME);
      // Use safePrecache to avoid hard-failing install when a resource is unreachable in dev
      await safePrecache(cache, PRECACHE_ASSETS);
      // Ensure the updated SW activates ASAP
      await self.skipWaiting();
      console.info('[sw] installed', CACHE_NAME);
    }catch(err){
      console.error('[sw] install failure (continuing):', err);
    }
  })());
});

// ---------- ACTIVATE ----------
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try{
      const keys = await caches.keys();
      await Promise.all(keys
        .filter(k => (k !== CACHE_NAME) && k.startsWith('abrox-chat-'))
        .map(k => caches.delete(k))
      );
      // take control of uncontrolled clients
      await self.clients.claim();
      console.info('[sw] activated, cleaned old caches');
    }catch(err){
      console.warn('[sw] activate error', err);
    }
  })());
});

// ---------- FETCH ----------
// Strategy:
// - Navigation requests -> network-first, fallback to cache index.html
// - Same-origin GET for precached assets/images/scripts -> stale-while-revalidate
// - Other GET requests -> network-first with cache fallback
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Navigation (HTML) requests: network-first then fallback to cached index.html
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResp = await fetch(req);
        // Update cache for navigation responses if OK
        if (networkResp && networkResp.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put('/index.html', networkResp.clone()).catch(()=>{});
        }
        return networkResp;
      } catch (err) {
        // fallback to cache
        const cached = await caches.match('/index.html');
        if (cached) return cached;
        // Last-resort: return a small offline fallback response
        return new Response('<!doctype html><meta charset="utf-8"><title>Offline</title><p>Offline</p>', {
          headers: { 'Content-Type': 'text/html' }
        });
      }
    })());
    return;
  }

  // For same-origin static assets (scripts/styles/images etc) - stale-while-revalidate
  const shouldUseStaleWhileRevalidate = isSameOrigin && (
    PRECACHE_ASSETS.includes(url.pathname) ||
    /\.(js|css|png|jpg|jpeg|svg|webp|gif|ico|mp4|webm)$/.test(url.pathname)
  );

  if (shouldUseStaleWhileRevalidate) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      const networkFetch = fetch(req).then(async (networkResp) => {
        // only cache valid responses (200). Opaque responses may occur for cross-origin resources and are cached cautiously.
        try {
          if (networkResp && (networkResp.ok || networkResp.type === 'opaque')) {
            await cache.put(req, networkResp.clone());
          }
        } catch (e) {
          // Ignore put failures (quota or opaque issues)
        }
        return networkResp;
      }).catch(() => null);

      // Return cached if present immediately, while updating in background
      if (cached) {
        networkFetch.catch(()=>{}); // kick off background refresh
        return cached;
      }

      // If no cache, wait for network then fallback to cache if network fails
      const net = await networkFetch;
      if (net) return net;
      // fallback
      const fallback = await cache.match(req);
      if (fallback) return fallback;
      return new Response(null, { status: 504, statusText: 'Gateway Timeout' });
    })());
    return;
  }

  // Default: network-first, fallback to cache
  event.respondWith((async () => {
    try {
      const resp = await fetch(req);
      // cache GET responses (best-effort)
      if (resp && (resp.ok || resp.type === 'opaque')) {
        try {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, resp.clone()).catch(()=>{});
        } catch(e){}
      }
      return resp;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      return new Response(null, { status: 504, statusText: 'Gateway Timeout' });
    }
  })());
});

// ---------- MESSAGE handling from pages ----------
// Allows client to send {type: 'SKIP_WAITING'} to activate new SW immediately
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if(!data || typeof data !== 'object') return;
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting().then(() => {
      console.info('[sw] skipWaiting handled');
    }).catch(e => console.warn('[sw] skipWaiting failed', e));
  }
  if (data.type === 'CLEAR_CACHES') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => {
      console.info('[sw] cleared caches on client request');
    }).catch(e => console.warn('[sw] clear caches failed', e));
  }
});

// Fallback to catch-all errors
self.addEventListener('error', (ev) => {
  console.error('[sw] error', ev);
});
