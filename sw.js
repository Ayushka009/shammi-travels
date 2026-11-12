// Makes the site installable as an app. Network first, so a new version shows up straight away;
// the cached copy is only used when the phone is offline (data still needs a connection).
const CACHE = 'shammi-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return; // database and CDN requests go straight through
  e.respondWith(
    fetch(r.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; })
      .catch(() => caches.match(r, { ignoreSearch: true }).then((m) => m || Response.error()))
  );
});
