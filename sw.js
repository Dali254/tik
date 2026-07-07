/* sw.js — TikTok Followers Service Worker
   Caches the app shell for offline support + fast loads.
   Bumped version forces users to get latest code on redeploy.
*/

var CACHE_NAME = 'tiktok-followers-v1';

var ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/profile.js',
  '/manifest.json',
  '/img/tiktok.png',
  '/img/icon-192.png',
  '/img/icon-512.png',
  '/img/mpesa-logo.svg',
  '/img/cointiktok.png'
];

/* Install — cache all shell assets */
self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS).catch(function(err) {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    })
  );
});

/* Activate — delete old caches */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k)   { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* Fetch — network first, fall back to cache for HTML/CSS/JS
   API calls always go to network (never cached) */
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  /* Never intercept API calls, admin, or cross-origin */
  if (url.includes('/api/') || url.includes('/admin')) {
    return; // pass through
  }

  e.respondWith(
    fetch(e.request)
      .then(function(response) {
        /* Cache a fresh copy of successful GET requests */
        if (e.request.method === 'GET' && response.status === 200) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, copy);
          });
        }
        return response;
      })
      .catch(function() {
        /* Network failed — serve from cache */
        return caches.match(e.request).then(function(cached) {
          return cached || caches.match('/index.html');
        });
      })
  );
});
