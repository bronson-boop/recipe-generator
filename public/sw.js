const CACHE = 'whatcanicook-v1';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.includes('/api/')) return;
  if (url.pathname !== '/' && url.pathname !== '/index.html' && url.pathname.endsWith('.html')) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
