/* ONE REFRESH HAS TO BE ENOUGH.
 *
 * The worker served every request stale-while-revalidate, the shell included.
 * A returning reader therefore got the PREVIOUS deploy's index.html and the
 * current one only on the visit after that - reported as "one refresh is not
 * enough", and the same mechanism that made the county map vanish: a cached
 * shell asking for a chunk whose content-hashed name the deploy had removed.
 *
 * The shell is network-first now and everything else is unchanged. That is a
 * branch in a file no test could reach, and it cannot be checked in a browser
 * here - the preview pane refuses to register a worker at all - so this runs
 * the real sw.js source against a mocked environment and drives the fetch
 * handler directly.
 *
 * What it pins:
 *   - a navigation asks the network before the cache, and caches what it gets
 *     under ./index.html rather than under the route
 *   - offline, a navigation still answers from the cache
 *   - a slow network does not hang a navigation past the deadline
 *   - a content-hashed asset is still answered from cache without waiting
 */

import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../site/sw.js", import.meta.url), "utf8");

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

/* A cache that records what was asked of it and what was written. */
function makeCache(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    puts: [],
    async match(req) {
      const key = typeof req === "string" ? req : req.url;
      return store.get(key) || null;
    },
    async put(req, res) {
      const key = typeof req === "string" ? req : req.url;
      this.puts.push(key);
      store.set(key, res);
    },
    async addAll() {},
  };
}

/* Run sw.js with an environment we control, and hand back its fetch handler. */
function loadWorker({ cache, fetchImpl }) {
  const handlers = {};
  const self = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: () => {} },
    location: { origin: "https://example.test" },
    registration: {},
  };
  const env = {
    self,
    location: self.location,
    caches: { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => null },
    fetch: fetchImpl,
    Response: class { constructor(body, init) { this.body = body; Object.assign(this, init); } static error() { return { error: true }; } },
    URL,
    setTimeout,
    clearTimeout,
    console,
  };
  const fn = new Function(...Object.keys(env), src);
  fn(...Object.values(env));
  return handlers;
}

const request = (url, mode = "no-cors") => ({ url, method: "GET", mode });

/* Whatever respondWith is given, awaited - with a watchdog.
 *
 * Without one this test fails by HANGING when the shell branch is missing:
 * the old stale-while-revalidate path awaits a fetch that never settles, node
 * exits 13 with "unsettled top-level await", and the reader has to work out
 * whether that is the guard firing or the harness being broken. Verified by
 * deleting the branch and watching exactly that happen. A watchdog turns it
 * into a named failure. */
const WATCHDOG_MS = 6000;
async function drive(handler, req) {
  let out;
  handler({ request: req, respondWith: (p) => { out = p; } });
  if (!out) return null;
  return Promise.race([
    out,
    new Promise((resolve) => setTimeout(() => resolve({ hung: true }), WATCHDOG_MS)),
  ]);
}

/* ---- a navigation goes to the network first ---- */
{
  const cache = makeCache({ "./index.html": { ok: true, from: "cache", clone: () => ({ from: "cache" }) } });
  const asked = [];
  const net = async (req) => {
    asked.push(typeof req === "string" ? req : req.url);
    return { ok: true, from: "network", clone: () => ({ from: "network" }) };
  };
  const h = loadWorker({ cache, fetchImpl: net });
  const res = await drive(h.fetch, request("https://example.test/alerts", "navigate"));
  ok("a navigation is answered from the network, not the cache", res && res.from === "network");
  ok("the network was actually asked", asked.length === 1);
  ok("the fresh shell is cached under ./index.html", cache.puts.includes("./index.html"));
  ok("it is NOT cached under the route", !cache.puts.includes("https://example.test/alerts"));
}

/* ---- offline, the cache still answers ---- */
{
  const cache = makeCache({ "./index.html": { ok: true, from: "cache" } });
  const h = loadWorker({ cache, fetchImpl: async () => { throw new Error("offline"); } });
  const res = await drive(h.fetch, request("https://example.test/test", "navigate"));
  ok("offline, a navigation falls back to the cached shell", res && res.from === "cache");
}

/* ---- a slow network does not hang the shell ---- */
{
  const cache = makeCache({ "./index.html": { ok: true, from: "cache" } });
  const never = () => new Promise(() => {});          // never settles
  const h = loadWorker({ cache, fetchImpl: never });
  const started = Date.now();
  const res = await drive(h.fetch, request("https://example.test/", "navigate"));
  const waited = Date.now() - started;
  ok("a stalled network gives up and serves the cached shell"
     + (res && res.hung ? " - IT HUNG: the shell is not network-first with a deadline" : ""),
     res && res.from === "cache");
  ok(`it gives up on a deadline rather than hanging (waited ${waited}ms)`, waited < 5000);
}

/* ---- content-hashed assets stay cache-first ---- */
{
  const url = "https://example.test/site/js/app.abc12345.js";
  const cache = makeCache({ [url]: { ok: true, from: "cache" } });
  let networkCalls = 0;
  const h = loadWorker({
    cache,
    fetchImpl: async () => { networkCalls++; return { ok: true, from: "network", clone: () => ({}) }; },
  });
  const res = await drive(h.fetch, request(url));
  ok("a hashed asset is answered from cache", res && res.from === "cache");
  ok("and the answer did not wait on the network", networkCalls <= 1);
}

console.log("SW SHELL\n");
for (const f of fails) console.log("  not ok " + f);
if (!fails.length) console.log(`  ok   ${pass} checks: navigations are network-first, cache answers offline and on a stall`);
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
