/* global self */
// The offline map keeps its own, narrower service worker and asset cache.
// This worker only redirects failed document navigations to that saved page.
const OFFLINE_URL = '/offline-evac/index.html?entry=offline';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== self.location.origin || url.pathname.startsWith('/offline-evac/') || url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(request, { signal: controller.signal, cache: 'no-store' });
      if (response.status < 500) return response;
    } catch { /* Network unavailable: open the already saved map application. */ }
    finally { clearTimeout(timer); }
    return Response.redirect(new URL(OFFLINE_URL, self.location.origin).href, 302);
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'CHECK_SHELL') event.ports[0]?.postMessage({ complete: true });
});
