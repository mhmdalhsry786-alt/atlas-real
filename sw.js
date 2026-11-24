/* أتلس — يخزّن كل ما حمّله المستخدم (بما فيه النماذج من Releases) */
const VERSION="atlas-real-v2";
const CORE=["./","./index.html","./manifest.webmanifest","./icon-180.png"];
self.addEventListener("install",e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(VERSION);
    await Promise.all(CORE.map(u=>c.add(new Request(u,{cache:"reload"})).catch(()=>{})));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate",e=>{
  e.waitUntil((async()=>{
    const ks=await caches.keys();
    await Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method!=="GET")return;
  const u=new URL(req.url);
  // نخدم من نفس الأصل، ومن GitHub Releases أيضًا
  const isOwn = u.origin===self.location.origin;
  const isRel = u.hostname==="github.com" || u.hostname.endsWith("githubusercontent.com");
  if(!isOwn && !isRel) return;
  e.respondWith((async()=>{
    const c=await caches.open(VERSION);
    const hit=await c.match(req,{ignoreSearch:true});
    if(hit) return hit;
    try{
      const res=await fetch(req);
      if(res && res.ok) c.put(req, res.clone()).catch(()=>{});
      return res;
    }catch(_){
      if(req.mode==="navigate"){
        const idx=await c.match("./index.html"); if(idx)return idx;
      }
      return new Response("غير متصل — هذا النموذج لم يُحمّل بعد",{status:503,
        headers:{"Content-Type":"text/plain; charset=utf-8"}});
    }
  })());
});
