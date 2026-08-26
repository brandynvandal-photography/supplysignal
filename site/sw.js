/* Offline.
 *
 * The overdose-response steps are needed most in exactly the situations where
 * a connection is least reliable. Until this file existed, the "app" was a
 * bookmark that white-screened offline - and app.js already cleared caches in
 * Quick Exit as though a service worker existed. Now one does.
 *
 * Privacy rules this file must keep:
 *   - Same-origin only. Nothing else is ever requested (CSP enforces it),
 *     so nothing else is ever cached.
 *   - Cache names are versioned and unrevealing. The cache holds the same
 *     byte-identical bundle every visitor gets - it cannot say what anyone
 *     looked AT, only that the app was installed.
 *   - Quick Exit calls caches.delete() from the page; nothing here resists it.
 *
 * Strategy: precache the shell on install; then stale-while-revalidate for
 * everything same-origin. The reader always gets an instant (possibly
 * day-old) copy while a fresh one is fetched behind it - right for data that
 * updates hourly and must never block an emergency lookup on the network.
 */

/* Bump this on any release that changes the shell. Stale-while-revalidate
   means a returning reader gets the CACHED shell first, so without a bump the
   Nightlight rename would have shown them the old name for one more visit.
   Changing it drops the previous cache on activate, and skipWaiting +
   clients.claim below make that take effect on this visit rather than the
   next one. */
/* The suffix is a hash of every JS, CSS and index.html file under site/ -
   exactly the set where serving a stale copy is a BUG rather than merely old
   data. test/sw.test.mjs recomputes it and fails if this string is out of
   date, printing the value to paste in.

   That test exists because relying on the instruction above did not work.
   Near me was fixed, deployed, and STILL broken for anyone who had opened the
   app before: stale-while-revalidate served the cached alerts.js first, and
   that copy still imported the old src/locate.mjs path that the /src/* 404
   rule had killed. Verified in the live cache - cachedImportsOldPath: true.
   A comment saying "remember to bump this" is not a mechanism. */
const VERSION = "nl-8ef94adb";

/* The minimum set that makes every screen renderable offline. Data files are
   picked up on first use by the runtime cache.

   MIRRORED IN app.js (its WARM list) and test/sw.test.mjs holds the two
   together. The page re-fetches this set after its boot cache sweep, because
   `install` runs once per worker version and the sweep runs on every load:
   on a reload the worker is already installed, nothing re-precaches, and
   whatever the sweep deleted stays gone until a reader happens to open it. */
const SHELL = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  /* Loaded blocking from <head>, so a cache miss on it would block the first
     paint of every offline launch. It decides whether the opening splash
     renders — see the file. */
  "./js/native-flag.js",
  /* The emergency page, precached rather than picked up on first use: it is
     the one screen a reader may open for the first time with no connection,
     and "This section could not load" is the worst thing it can say. Its
     imports (ui.js, i18n.js) are already in the runtime cache from boot. */
  "./js/views/help.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* What may be written to the device.
 *
 * The header above claims this cache "cannot say what anyone looked AT". That
 * was only incidentally true: the handler cached every same-origin GET, so any
 * URL containing a county or a substance would have been written into Cache
 * Storage and left there, readable on a seized device until Quick Exit ran.
 *
 * An allowlist makes the claim structural instead of lucky. Everything the app
 * legitimately needs is byte-identical for every reader - the shell, the
 * national data bundles, the locale files. Nothing per-county is cacheable,
 * and `/feeds/` is called out because those files are the one per-county path
 * that exists on this origin at all. */
/* The i18n group is not decoration. The comment above has always claimed the
   locale files are covered, and the pattern could not match them: `[^/]+`
   stops at the directory separator, so data/i18n/en-US.json was never
   cacheable. Mostly latent, because the boot sweep wipes the cache anyway -
   but setLocale() re-fetches, so switching language offline mid-session failed
   both the target locale AND the en-US fallback, leaving `strings` empty and
   re-rendering the whole interface as raw dot-paths: "nav.help",
   "alerts.heading". Still one file per language, still identical for every
   reader, so nothing about the allowlist's guarantee changes. */
/* .bin as well as .json: the precomputed county mesh ships as a packed
   Uint16 blob (data/county-mesh.bin). Same national, byte-identical shape
   as every other bundle here - it says nothing about who looked at what -
   and without it the map falls back to rebuilding the mesh from
   county-shapes.json, which is a 3.9s main-thread freeze. */
/* data/h/ as well as data/: on the web the national bundles are served under
   content-hashed names in that directory (scripts/assets.mjs), so that the
   host can mark them immutable without touching alerts.json beside them.
   Same files, same national shape - only the directory and the suffix are
   new - and without this group the runtime cache would have silently stopped
   holding every bundle the moment the deploy started hashing them. */
const CACHEABLE = /^\.?\/?(index\.html|css\/|js\/|img\/|data\/(h\/)?(i18n\/)?[^/]+\.(json|bin)$|manifest\.webmanifest)/;

function mayCache(url) {
  const path = url.pathname.replace(/^.*\/site\//, "");
  if (path === "" || path === "/") return true;          // the shell itself
  if (/(^|\/)feeds\//.test(url.pathname)) return false;  // per-county: never
  if (/(^|\/)data\/counties\//.test(url.pathname)) return false;
  return CACHEABLE.test(path);
}

/* THE SHELL IS FETCHED BEFORE THE CACHE IS TRUSTED, and everything else is
 * not. This is the one asymmetry in here and it is the whole point of it.
 *
 * Stale-while-revalidate on EVERY request meant a returning reader always got
 * the previous deploy's index.html, and the current one only on the visit
 * after that. One refresh was never enough - reported exactly that way - and
 * the same mechanism caused the county map to vanish earlier: a cached shell
 * asking for a chunk whose content-hashed name the deploy had already removed.
 *
 * So a navigation goes to the network first and falls back to the cache. The
 * shell is the only file whose name never changes, which is exactly why it is
 * the only one that can go stale; everything under it is content-hashed, so
 * cache-first is not just safe there, it is correct - a hash that matches is
 * the same bytes by definition.
 *
 * WITH A DEADLINE, because this app is opened on bad connections at three in
 * the morning and a network-first shell with no timeout is a white screen. Two
 * seconds, then the cached shell. Offline is unchanged: the fetch throws at
 * once and the cache answers.
 *
 * cache: "no-store" so the browser's own HTTP cache cannot serve the stale
 * copy the service worker just declined to serve. */
const SHELL_DEADLINE_MS = 2000;

function isShell(url, request) {
  if (request.mode === "navigate") return true;
  const path = url.pathname.replace(/^.*\/site\//, "");
  return path === "" || path === "/" || path === "index.html";
}

async function shellFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const net = await Promise.race([
      fetch(request, { cache: "no-store" }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), SHELL_DEADLINE_MS)),
    ]);
    if (net && net.ok) {
      /* Under ./index.html, not under the request: every route on this site -
         /alerts, /test, a county deep link - is that one file, and caching it
         per URL would fill the cache with copies and still miss the next
         route someone opens offline. */
      cache.put("./index.html", net.clone());
      return net;
    }
  } catch { /* offline, or slower than the deadline */ }
  return (await cache.match("./index.html")) || (await cache.match(request)) || Response.error();
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  if (isShell(url, e.request)) {
    e.respondWith(shellFirst(e.request));
    return;
  }

  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cacheOk = mayCache(url);
      const cached = cacheOk ? await cache.match(e.request) : null;
      const refresh = fetch(e.request)
        .then((res) => {
          if (res.ok && cacheOk) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => null);

      /* Serve cache instantly when there is one; fall back to the network
         while populating the cache when there is not. Navigations never reach
         here - see shellFirst above - so this is the content-hashed half of
         the site, where a cache hit is the same bytes as the network by
         definition and waiting for the network would be pure latency. */
      return cached || (await refresh) || Response.error();
    })
  );
});
