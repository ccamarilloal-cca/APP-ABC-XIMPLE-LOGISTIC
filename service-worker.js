// ============================================================
// SERVICE WORKER — HUB NAL · ABC Ximple Logistics
// ============================================================

const CACHE_NAME = 'hub-nal-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/config.js',
  '/app.js',
  '/sheets.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // No cachear llamadas al Apps Script (siempre fresco)
  if (url.hostname.includes('script.google.com')) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response(JSON.stringify({ ok: false, error: 'Sin conexión' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    ));
    return;
  }

  // Cache-first para assets estáticos
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200) return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
