// Bina Pooche service worker: makes the installed app open instantly and offline.
// Only same-origin GETs are handled. Every other request (Anon-RPC, the relay, providers) passes through untouched.
// Pages: network first (a new deploy always wins), cached copy when offline. Hashed assets/icons: cache first.
const CACHE = "bp-shell-v1";
const SCOPE = new URL(self.registration.scope).pathname; // e.g. /bina-pooche/

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}icon-192.png`])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(SCOPE, copy)); return res; })
        .catch(() => caches.match(SCOPE)),
    );
    return;
  }
  if (/\/assets\/|\.(png|svg|jpg|webmanifest|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});
