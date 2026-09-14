/* global self, caches */
const CACHE = 'jishingoto-offline-shell-v28';
const SHELL = ['index.html','style.css','app.mjs','map.mjs','core.mjs','routing.mjs','report.mjs','vector.mjs','vendor/maplibre-gl.mjs','vendor/maplibre-gl-shared.mjs','vendor/maplibre-gl-worker.mjs','vendor/maplibre-gl.css','storage.mjs','shelters.mjs','places.mjs','registration.mjs','entry.mjs','manifest.webmanifest','icon.svg'].map(p => new URL(p, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('jishingoto-offline-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Do not intercept APIs, Google resources, Next pages or unrelated caches.
  const canonical = event.request.mode === 'navigate' && url.pathname === new URL(self.registration.scope).pathname ? new URL('index.html', self.registration.scope).href : url.origin + url.pathname;
  if (!SHELL.includes(canonical)) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(canonical)) || fetch(event.request)));
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'CHECK_SHELL') return;
  event.waitUntil(caches.open(CACHE).then(async cache => {
    const complete = (await Promise.all(SHELL.map(url => cache.match(url)))).every(Boolean);
    event.ports[0]?.postMessage({complete});
  }));
});
