// sw.js
// Abrox – Service Worker (offline-first)
const CACHE_NAME = 'abrox-chat-v1';
const PRECACHE_ASSETS = [ '/', '/index.html', '/precache.js', '/synthetic-people.js', '/message-pool.js', '/typing-engine.js', '/simulation-engine.js', '/ui-adapter.js', '/message.js', '/styles.css', '/emoji-pack.js', '/assets/logo.png' ];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => { return cache.addAll(PRECACHE_ASSETS); })); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', event => { if (event.request.method !== 'GET') return; event.respondWith(caches.match(event.request).then(cached => { return ( cached || fetch(event.request).then(res => { const copy = res.clone(); caches.open(CACHE_NAME).then(cache => { cache.put(event.request, copy); }); return res; }).catch(() => cached) ); })); });
