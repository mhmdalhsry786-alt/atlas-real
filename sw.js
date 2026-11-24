/* Atlas Real — Service Worker: تخزين كامل للعمل بلا إنترنت */
const CACHE = 'atlas-offline-v1';
const PRECACHE = ['./', './index.html', './app_v2.js', './manifest.json',
  './manifest.webmanifest', './tex/bind.json'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const u of PRECACHE) { try { await c.add(u); } catch (_) {} }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // نماذج ونسيج: من الكاش أولًا ثم الشبكة + تخزين (cache-first = أوفلاين مضمون)
  if (url.pathname.includes('/models/') || url.pathname.includes('/tex/')) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r.ok) { try { await c.put(req, r.clone()); } catch(_){} }
        return r;
      } catch (err) { return new Response('', {status: 504}); }
    })());
    return;
  }
  // بقية الملفات: الشبكة أولًا مع رجوع للكاش
  e.respondWith((async () => {
    try {
      const r = await fetch(req);
      if (r.ok) { const c = await caches.open(CACHE); c.put(req, r.clone()).catch(()=>{}); }
      return r;
    } catch (err) {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      return hit || (await c.match('./index.html')) || new Response('offline', {status: 503});
    }
  })());
});

// رسالة من الصفحة: خزّن هذه النماذج
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'CACHE_MODELS') return;
  const urls = e.data.urls || [];
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    let done = 0, failed = 0, bytes = 0;
    for (const u of urls) {
      try {
        const hit = await c.match(u);
        if (hit) { done++; }
        else {
          let r;
          try { r = await fetch(u, {cache: 'no-store'}); }
          catch (_) { r = await fetch(u, {mode: 'no-cors'}); }
          if (r && (r.ok || r.type === 'opaque')) {
            const blob = await r.blob();
            bytes += blob.size;
            await c.put(u, new Response(blob, {
              status: r.ok ? r.status : 200,
              headers: {'Content-Type': 'application/octet-stream', 'Content-Length': String(blob.size)}
            }));
            done++;
          } else { failed++; if (e.source) e.source.postMessage({type:'CACHE_FAIL', url:u, reason:'http '+(r?r.status:0)}); }
        }
      } catch (err) {
        failed++;
        if (e.source) e.source.postMessage({type:'CACHE_FAIL', url:u, reason:String(err).slice(0,80)});
      }
      if (e.source) e.source.postMessage({type:'CACHE_PROGRESS', done, failed, bytes, total: urls.length});
    }
    if (e.source) e.source.postMessage({type:'CACHE_DONE', done, failed, bytes, total: urls.length});
  })());
});
