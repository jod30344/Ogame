// 星塵方舟：起源 — PWA service worker.
//
// Scope: caches ONLY the static "app shell" (this game's own HTML/manifest/
// icons) so the game can be installed and opens instantly / has an offline
// fallback shell. It deliberately does NOT cache anything on *.supabase.co —
// this is a live multiplayer game, so every actual game-data request must
// always go straight to the network, never a stale cached response.
//
// IMPORTANT for future updates: bump CACHE_NAME (v1 -> v2 -> ...) any time
// the game's main HTML file (or this file) changes and you want players'
// browsers to pick up the new version promptly, rather than briefly serving
// a cached copy of the old one. Without a version bump, players still get
// the update eventually (the background revalidate fetch in the "fetch"
// handler below refreshes the cache every time they load the page), just
// with a one-load lag instead of an immediate switch.
//
// BUG FIX (v1 -> v2): SHELL_FILES used to list the game's HTML file by its
// own literal name, 'planetmultiplayer.html'. That's this file's name while
// it's being worked on here, but it does NOT have to be the name it's
// actually deployed under — e.g. on GitHub Pages it typically gets renamed
// to index.html so it can serve as the site's root document. When deployed
// that way, this line 404'd inside cache.addAll() (which fails ALL-OR-
// NOTHING — one missing file fails the entire install), so the service
// worker's install step silently failed every time, on top of the exact
// same wrong-filename problem also existing in manifest.webmanifest's
// start_url (that one is what caused the visible bug: "加入主畫面" shortcuts
// 404'd on iOS even though the site itself loaded fine in Safari — the
// shortcut launches via the manifest's start_url, not a plain page load).
// Fixed by caching './' instead — the directory root, i.e. whatever file
// is actually serving as the site's index, regardless of its real name.
const CACHE_NAME = 'stardust-ark-shell-v2';

const SHELL_FILES = [
  './',
  './manifest.webmanifest',
  './icon-32.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .catch((err) => console.error('SW install: shell caching failed', err))
  );
  // Take over from any previously-installed service worker immediately,
  // rather than waiting for every open tab to be closed first.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept the live Supabase API — game data must always be fresh.
  if (url.hostname.endsWith('supabase.co')) return;
  // Only handle simple same-origin GET requests for the static shell files
  // above; let everything else (Google Fonts, any future POST/PATCH/DELETE,
  // etc.) go straight to the network untouched.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Stale-while-revalidate: serve the cached shell immediately if we have it
  // (instant load, works offline), while always kicking off a fresh network
  // fetch in the background to update the cache for next time.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
