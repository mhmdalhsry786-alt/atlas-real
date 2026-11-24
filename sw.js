const C='atlas-real-v9';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.pathname.endsWith('/models/')||u.pathname.includes('.glb')){
    e.respondWith(caches.open(C).then(async c=>{
      const hit=await c.match(e.request); if(hit) return hit;
      const r=await fetch(e.request); if(r.ok) c.put(e.request,r.clone()); return r; }));
    return;
  }
  e.respondWith(fetch(e.request).then(r=>{ if(r.ok) caches.open(C).then(c=>c.put(e.request,r.clone())); return r; })
    .catch(()=>caches.match(e.request)));
});
