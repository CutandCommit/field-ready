'use strict';
const CACHE='field-ready-cache-v6.0.0';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./cloud-config.js','./cloud.js'];
// Wait for the user's confirmation on updates rather than silently replacing a running workout.
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('field-ready-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
function remember(request,response){if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{})}return response}
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 const url=new URL(event.request.url);
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).then(response=>remember('./index.html',response)).catch(()=>caches.match('./index.html')));
 }else if(/\.(?:js|css|webmanifest)$/.test(url.pathname)){
  // Always check for new app logic and cloud configuration when online.
  event.respondWith(fetch(event.request).then(response=>remember(event.request,response)).catch(()=>caches.match(event.request)));
 }else {
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>remember(event.request,response))));
 }
});
