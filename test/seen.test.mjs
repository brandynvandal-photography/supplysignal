/* "New since you last looked" - the counting logic.
 *
 * These branches were all verified by hand in a browser once. That is exactly
 * the kind of verification that rots, so they are pinned here.
 *
 * seen.js reads storage at import time, so each case stubs globalThis
 * .localStorage and then imports a FRESH copy via a cache-busting query. */

const cases = [];
const check = (name, fn) => cases.push({ name, fn });

const DAY = 864e5;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();
const alert = (d) => ({ eventDate: ago(d) });

let n = 0;
/** Load seen.js as if the last visit were `lastVisitDaysAgo` (null = never). */
async function load(lastVisitDaysAgo) {
  const store = new Map();
  if (lastVisitDaysAgo !== null) store.set("sc.seen", ago(lastVisitDaysAgo));
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  const mod = await import(`../site/js/seen.js?n=${++n}`);
  return { mod, store };
}

const WIN_90 = () => Date.now() - 90 * DAY;

/* ------------------------------------------------------------- branches */

check("counts only what arrived since the last visit", async () => {
  const { mod } = await load(3);
  const { count, sinceVisit } = mod.countNew([alert(2), alert(5), alert(40)], WIN_90());
  if (!sinceVisit) return "should be measuring against the visit";
  if (count !== 1) return `expected 1 new, got ${count}`;
  return null;
});

check("first visit falls back to a fixed recency window", async () => {
  const { mod } = await load(null);
  const { count, sinceVisit } = mod.countNew([alert(2), alert(5), alert(40)], WIN_90());
  if (sinceVisit) return "there is no previous visit to measure against";
  if (count !== 2) return `expected 2 inside ${mod.FALLBACK_DAYS} days, got ${count}`;
  return null;
});

/* The important one. If the last visit predates the window on screen, then
   "new since you last looked" would silently mean "everything shown" - the same
   number the section heading already gives, relabelled as news. */
check("a visit older than the window does not claim novelty", async () => {
  const { mod } = await load(200);
  const { count, sinceVisit } = mod.countNew([alert(2), alert(5), alert(40)], WIN_90());
  if (sinceVisit) return "must not say 'since you last looked' for a stale visit";
  if (count !== 2) return `expected the ${mod.FALLBACK_DAYS}-day fallback count of 2, got ${count}`;
  return null;
});

check("nothing new counts as zero, so the UI can render nothing", async () => {
  const { mod } = await load(0);
  const { count } = mod.countNew([alert(2), alert(5)], WIN_90());
  if (count !== 0) return `expected 0, got ${count}`;
  return null;
});

check("undated and malformed entries are never counted", async () => {
  const { mod } = await load(null);
  const { count } = mod.countNew(
    [{ eventDate: undefined }, { eventDate: "not a date" }, {}, alert(1)], WIN_90());
  if (count !== 1) return `only the real alert should count, got ${count}`;
  return null;
});

check("missing input does not throw", async () => {
  const { mod } = await load(null);
  if (mod.countNew(undefined, WIN_90()).count !== 0) return "expected 0";
  if (mod.countNew([], WIN_90()).count !== 0) return "expected 0";
  return null;
});

/* --------------------------------------------------------- what is stored */

check("a visit writes one key holding a bare timestamp", async () => {
  const { mod, store } = await load(3);
  mod.markVisit();
  const keys = [...store.keys()];
  if (keys.length !== 1) return `expected exactly 1 key, got ${keys.length}: ${keys}`;
  if (keys[0] !== "sc.seen") return `unexpected key: ${keys[0]}`;
  const v = store.get("sc.seen");
  if (Number.isNaN(Date.parse(v))) return `stored value is not a timestamp: ${v}`;
  if (/[{[]/.test(v)) return `stored value is structured, not a bare timestamp: ${v}`;
  return null;
});

check("the previous visit survives being overwritten by this one", async () => {
  const { mod } = await load(3);
  const before = mod.lastVisit();
  mod.markVisit();
  if (mod.lastVisit() !== before) {
    return "reading must still reflect the PREVIOUS visit after stamping this one";
  }
  return null;
});

check("storage being unavailable degrades quietly", async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  const mod = await import(`../site/js/seen.js?n=${++n}`);
  if (mod.lastVisit() !== null) return "expected null when storage is blocked";
  mod.markVisit();                       // must not throw
  const { count, sinceVisit } = mod.countNew([alert(1)], WIN_90());
  if (sinceVisit) return "cannot claim a remembered visit without storage";
  if (count !== 1) return "the fixed-window fallback should still work";
  void store;
  return null;
});

/* ------------------------------------------------------------------- run */

console.log("\nSINCE LAST VISIT");
let pass = 0, fail = 0;
for (const c of cases) {
  let err;
  try { err = await c.fn(); } catch (e) { err = e.stack || String(e); }
  if (err) { fail++; console.log(`  FAIL ${c.name}\n      ${err}`); }
  else { pass++; console.log(`  ok   ${c.name}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
