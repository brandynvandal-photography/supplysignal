/* The recency count, and the session marker behind the welcome card.
 *
 * These branches were all verified by hand in a browser once. That is exactly
 * the kind of verification that rots, so they are pinned here.
 *
 * seen.js reads storage at import time, so each case stubs globalThis
 * .sessionStorage and then imports a FRESH copy via a cache-busting query.
 *
 * REWRITTEN when the app moved to session-only storage. "New since you last
 * looked" is gone on purpose: a marker that dies with the tab cannot answer
 * it, and the old tests asserted the behaviour that replaced it. The tests
 * that survive are the ones that were really about privacy rather than about
 * counting - one fixed key, a bare timestamp, no county anywhere near it.
 */

const cases = [];
const check = (name, fn) => cases.push({ name, fn });

const DAY = 864e5;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();
const alert = (d) => ({ eventDate: ago(d) });

let n = 0;
/** Load seen.js as if the app were opened `openedDaysAgo` ago (null = not yet
 *  this session). Also asserts the module never touches localStorage. */
async function load(openedDaysAgo) {
  const store = new Map();
  if (openedDaysAgo !== null) store.set("sc.seen", ago(openedDaysAgo));
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  const local = [];
  globalThis.localStorage = {
    getItem: (k) => { local.push(`get ${k}`); return null; },
    setItem: (k) => { local.push(`set ${k}`); },
    removeItem: (k) => { local.push(`remove ${k}`); },
  };
  const mod = await import(`../site/js/seen.js?n=${++n}`);
  return { mod, store, local };
}

/* -------------------------------------------------------------- counting */

check("counts what landed inside the recency window", async () => {
  const { mod } = await load(null);
  const { count } = mod.countNew([alert(2), alert(5), alert(40)]);
  if (count !== 2) return `expected 2 inside ${mod.FALLBACK_DAYS} days, got ${count}`;
  return null;
});

/* The window is fixed now, so an earlier open in the same session must not
   change the number. This is what stops "3 new since you last looked" coming
   back through the side door after a reload. */
check("an earlier open in the same session does not change the count", async () => {
  const fresh = await load(null);
  const opened = await load(0);
  const a = fresh.mod.countNew([alert(2), alert(5), alert(40)]).count;
  const b = opened.mod.countNew([alert(2), alert(5), alert(40)]).count;
  if (a !== b) return `count moved with the session marker: ${a} vs ${b}`;
  return null;
});

check("nothing recent counts as zero, so the UI can render nothing", async () => {
  const { mod } = await load(null);
  const { count } = mod.countNew([alert(40), alert(120)]);
  if (count !== 0) return `expected 0, got ${count}`;
  return null;
});

check("undated and malformed entries are never counted", async () => {
  const { mod } = await load(null);
  const { count } = mod.countNew(
    [{ eventDate: undefined }, { eventDate: "not a date" }, {}, alert(1)]);
  if (count !== 1) return `only the real alert should count, got ${count}`;
  return null;
});

check("missing input does not throw", async () => {
  const { mod } = await load(null);
  if (mod.countNew(undefined).count !== 0) return "expected 0";
  if (mod.countNew([]).count !== 0) return "expected 0";
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

/* The whole point of the move: whatever this writes must die with the tab. */
check("nothing is written to localStorage", async () => {
  const { mod, local } = await load(3);
  mod.markVisit();
  mod.lastVisit();
  mod.countNew([alert(1)]);
  if (local.length) return `touched localStorage: ${local.join(", ")}`;
  return null;
});

check("the earlier open survives being overwritten by this one", async () => {
  const { mod } = await load(3);
  const before = mod.lastVisit();
  mod.markVisit();
  if (mod.lastVisit() !== before) {
    return "reading must still reflect the EARLIER open after stamping this one";
  }
  return null;
});

check("storage being unavailable degrades quietly", async () => {
  globalThis.sessionStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  const mod = await import(`../site/js/seen.js?n=${++n}`);
  if (mod.lastVisit() !== null) return "expected null when storage is blocked";
  mod.markVisit();                       // must not throw
  const { count } = mod.countNew([alert(1)]);
  if (count !== 1) return "the recency count should still work";
  return null;
});

/* ------------------------------------------------------------------- run */

console.log("\nSESSION MARKER AND RECENCY COUNT");
let pass = 0, fail = 0;
for (const c of cases) {
  let err;
  try { err = await c.fn(); } catch (e) { err = e.stack || String(e); }
  if (err) { fail++; console.log(`  FAIL ${c.name}\n      ${err}`); }
  else { pass++; console.log(`  ok   ${c.name}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
