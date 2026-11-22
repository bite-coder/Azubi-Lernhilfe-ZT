// Service Worker: macht die App offline lauffähig.
// WICHTIG: Nach jeder Änderung an HTML, CSS, JS oder Icons die VERSION erhöhen,
// sonst behalten installierte Apps die alte Fassung. Für neue Fragen ist das nicht nötig.
const VERSION = "1";
const APP_CACHE = "zt-app-v" + VERSION;
const DATEN_CACHE = "zt-daten";
const DATEN_URL = new URL("data/questions.json", self.location).href;

const APP_DATEIEN = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/app.js",
  "js/daten.js",
  "js/speicher.js",
  "js/karten.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const app = await caches.open(APP_CACHE);
    await app.addAll(APP_DATEIEN.map((p) => new Request(p, { cache: "reload" })));
    const daten = await caches.open(DATEN_CACHE);
    await daten.add(new Request(DATEN_URL, { cache: "reload" }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== APP_CACHE && name !== DATEN_CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

// Fragen: zuerst das Netz (höchstens 4 Sekunden), sonst die gespeicherte Fassung.
async function fragenLaden(request) {
  const cache = await caches.open(DATEN_CACHE);
  try {
    const antwort = await Promise.race([
      fetch(request, { cache: "no-store" }),
      new Promise((_, nein) => setTimeout(() => nein(new Error("Zeitüberschreitung")), 4000)),
    ]);
    if (antwort.ok) {
      await cache.put(DATEN_URL, antwort.clone());
      return antwort;
    }
    throw new Error("HTTP " + antwort.status);
  } catch (fehler) {
    const gespeichert = await cache.match(DATEN_URL);
    if (gespeichert) return gespeichert;
    throw fehler;
  }
}

// App-Dateien: zuerst aus dem Cache.
async function appDateiLaden(request) {
  const cache = await caches.open(APP_CACHE);
  if (request.mode === "navigate") {
    return (await cache.match("index.html")) || fetch(request);
  }
  const treffer = await cache.match(request, { ignoreSearch: true });
  return treffer || fetch(request);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.href.split("?")[0] === DATEN_URL) {
    event.respondWith(fragenLaden(request));
  } else {
    event.respondWith(appDateiLaden(request));
  }
});
