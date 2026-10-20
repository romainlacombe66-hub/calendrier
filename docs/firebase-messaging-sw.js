// Service worker : fonctionnement hors connexion + réception des notifications.
importScripts("./config.js");
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js"
);

const CACHE = "calendrier-v3";
const SHELL = [
  "./", "./index.html", "./style.css", "./app.js", "./calendar.js", "./config.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord (pour recevoir les mises à jour), cache si hors connexion.
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  const cacheable = u.origin === location.origin || u.hostname === "www.gstatic.com" || u.hostname.endsWith("fonts.googleapis.com") || u.hostname.endsWith("fonts.gstatic.com");
  if (e.request.method !== "GET" || !cacheable) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || (e.request.mode === "navigate" ? caches.match("./index.html") : undefined)))
  );
});

const cfg = self.APP_CONFIG;
if (cfg && !String(cfg.firebase.apiKey).startsWith("A_REMPLIR")) {
  firebase.initializeApp(cfg.firebase);
  firebase.messaging().onBackgroundMessage((p) => {
    const d = p.data || {};
    self.registration.showNotification(d.title || "Rappel", {
      body: d.body || "",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: d.tag || undefined,
      data: { url: "./" },
    });
  });
}

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) if ("focus" in c) return c.focus();
      return clients.openWindow("./");
    })
  );
});
