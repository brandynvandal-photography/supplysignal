/* Search has to find what people actually type.
 *
 * This is the test that decides whether search feels good, and it is written
 * as queries rather than as unit assertions on the matcher: the matcher being
 * correct is not the same as somebody in a bad moment finding the page that
 * helps them. Each case below is a phrasing a real person would type.
 *
 * It runs against the shipped index, so a regenerated index that loses a
 * destination fails here rather than silently returning nothing.
 */

import { readFile } from "node:fs/promises";

const idx = JSON.parse(await readFile("data/search.json", "utf8"));
const intents = JSON.parse(await readFile("data/search-intents.json", "utf8"));

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

const SECTION_CAP = 3;

/* Mirrors search.js. Kept deliberately in sync by hand rather than imported,
   because search.js is a browser module and importing it here would drag in
   fetch and the whole data layer for no benefit. */
function search(term, limit = 10) {
  const q = norm(term);
  if (q.length < 2) return [];
  const out = []; const taken = new Set();
  const push = (r) => {
    const k = norm(r.label);
    if (k && !taken.has(k)) { taken.add(k); out.push(r); }
  };
  for (const it of intents.intents || []) {
    if ((it.q || []).some((p) => { const np = norm(p);
      return np === q || q.includes(np) || (q.includes(" ") && np.includes(q)); })) {
      push({ kind: "Answer", label: it.label, route: it.route, anchor: it.anchor });
    }
  }
  const slangId = (intents.slang || {})[q];
  if (slangId) {
    const d = idx.drugs.find((x) => x.i === slangId);
    if (d) push({ kind: "Drug", label: d.n, route: `#/substances/${d.i}` });
  }
  const starts = [], contains = [];
  for (const d of idx.drugs) {
    const n = norm(d.n);
    const res = { kind: "Drug", label: d.n, route: `#/substances/${d.i}` };
    if (n === q) { push(res); continue; }
    if (n.startsWith(q)) { starts.push(res); continue; }
    if ((d.a || []).some((a) => norm(a) === q || norm(a).startsWith(q))) { starts.push(res); continue; }
    if (n.includes(q)) contains.push(res);
  }
  starts.forEach(push);
  const dS = [], dW = [], dI = [];
  for (const e of idx.entries) {
    const t = norm(e.t);
    const r = { kind: e.k, label: e.t, route: e.r, anchor: e.a };
    if (t.startsWith(q)) dS.push(r); else if (t.includes(` ${q}`)) dW.push(r); else if (t.includes(q)) dI.push(r);
  }
  /* Per-section cap, mirroring search.js. Order only: each band's overflow is
     appended at the end of that band, so nothing is dropped and nothing falls
     below a band that outranks it. */
  const perSection = new Map(); const overflow = [];
  const flush = () => { overflow.splice(0).forEach(push); };
  const pushCapped = (r) => {
    const n = perSection.get(r.kind) || 0;
    if (n >= SECTION_CAP) { overflow.push(r); return; }
    const before = out.length;
    push(r);
    if (out.length > before) perSection.set(r.kind, n + 1);
  };
  dS.forEach(pushCapped); dW.forEach(pushCapped); flush();
  contains.forEach(push);
  dI.forEach(pushCapped); flush();
  if (!out.length && q.length >= 4) {
    const max = q.length > 7 ? 2 : 1;
    for (const d of idx.drugs) {
      if (within(q, norm(d.n), max) || (d.a || []).some((a) => within(q, norm(a), max))) {
        push({ kind: "Drug", label: d.n, route: `#/substances/${d.i}` });
      }
    }
    if (!out.length) for (const e of idx.entries) if (within(q, norm(e.t), max)) push({ kind: e.k, label: e.t, route: e.r, anchor: e.a });
  }
  return out.slice(0, limit);
}

/* [query, route the FIRST result must go to] */
const CASES = [
  // The questions people are most afraid to ask.
  ["will i get arrested if i call 911", "#/policy"],
  ["good samaritan", "#/policy"],
  ["how long does weed stay in your system", "#/supervision"],
  ["failed drug test", "#/supervision"],
  ["can they make me stop methadone", "#/supervision"],
  ["just got out", "#/supervision"],
  // Street names for the supply, not the drug.
  ["tranq", "#/substances/xylazine"],
  ["blues", "#/substances/fentanyl"],
  ["molly", "#/substances/mdma"],
  ["tina", "#/substances/methamphetamine"],
  ["bars", "#/substances/alprazolam"],
  ["narcan", "#/substances/naloxone"],
  // Ordinary drug lookups.
  ["fentanyl", "#/substances/fentanyl"],
  ["xylazine", "#/substances/xylazine"],
  // Content that is not a drug.
  ["free naloxone", "#/learn"],
  ["someone is overdosing", "#/help"],
  ["drink spiked", "#/sex"],
  ["morning after pill", "#/sex"],
  ["prep", "#/sex"],
  ["i hurt someone", "#/learn"],
  ["i love someone who uses", "#/support"],
  ["needle exchange", "#/support"],
  ["privacy", "#/about"],
  // Sleep loss and psychosis.
  ["havent slept", "#/stimulants"],
  ["seeing things", "#/stimulants"],
  ["my friend is freaking out", "#/stimulants"],
  ["should i call 988", "#/stimulants"],
  ["comedown", "#/stimulants"],
  // Typos - the fuzzy rescue.
  ["fentanol", "#/substances/fentanyl"],
  ["xanex", "#/substances/alprazolam"],
];

let pass = 0;
const fails = [];
for (const [q, want] of CASES) {
  const r = search(q);
  if (!r.length) { fails.push(`"${q}" → nothing found (wanted ${want})`); continue; }
  const got = r[0].route;
  if (got === want || got.startsWith(want)) pass++;
  else fails.push(`"${q}" → ${got} (wanted ${want}); top result "${r[0].label}"`);
}

/* -------------------------------------------- no one page owns the list */

/* Support is 143 of the index's 519 entries because it is a directory of named
   services and everything else is prose. Before the cap, a plain word spent the
   whole first screen on it: "help" returned nine Support rows out of ten,
   "line" ten out of ten. The row a reader wanted was under the fold. */
{
  const sections = (rs) => {
    const c = new Map();
    for (const r of rs) c.set(r.kind, (c.get(r.kind) || 0) + 1);
    return c;
  };

  /* Each of these queries genuinely matches several sections. The section named
     must reach the reader without scrolling past one page's contents. */
  for (const [q, want] of [
    ["help", "Staying up"],
    ["people", "Learn"],
    ["people", "Policy"],
    ["program", "Test"],
    ["find", "Policy"],
  ]) {
    const at = search(q).findIndex((r) => r.kind === want);
    if (at < 0) fails.push(`"${q}" never reaches ${want}`);
    else if (at >= 6) fails.push(`"${q}" buries ${want} at position ${at + 1}`);
  }

  /* The cap holds only until every section IN THE SAME BAND has been offered,
     after which that band's surplus is appended - so both the tail of a band
     and every later band may be one section, correctly. This checks the only
     thing the cap actually promises: within the title-match band, no section
     takes more than its share before another section in it is heard from. */
  for (const q of ["help", "people", "program", "find", "line", "narcan"]) {
    const t = norm(q);
    const band = new Set(idx.entries
      .filter((e) => norm(e.t).startsWith(t) || norm(e.t).includes(` ${t}`))
      .map((e) => norm(e.t)));
    const rs = search(q, 100).filter((r) => band.has(norm(r.label)));
    const firstSeen = new Map();
    rs.forEach((r, i) => { if (!firstSeen.has(r.kind)) firstSeen.set(r.kind, i); });
    const last = Math.max(...firstSeen.values(), 0);
    for (const [kind, n] of sections(rs.slice(0, last + 1))) {
      if (n > SECTION_CAP) fails.push(`"${q}" gives ${kind} ${n} of the band's first ${last + 1} rows`);
    }
  }

  /* The surplus is deferred within its band, never past the next one. "line"
     matches three crisis lines by title and seven substances ending -escaline
     by substring; holding the remaining crisis lines back until after the
     overflow flush put mescaline above them. */
  {
    const rs = search("line");
    const firstDrug = rs.findIndex((r) => r.kind === "Drug");
    const lastLine = rs.map((r) => r.kind).lastIndexOf("Support");
    if (firstDrug > -1 && lastLine > firstDrug) {
      fails.push(`"line" puts a substance above a crisis line (drug at ${firstDrug + 1}, Support at ${lastLine + 1})`);
    }
  }

  /* And the other half of the promise: capping reorders, it never hides. A
     query only Support can answer still returns every Support row. */
  {
    const q = "health";
    const inIndex = idx.entries.filter((e) => norm(e.t).includes(q));
    const got = search(q, 100);
    const labels = new Set(got.map((r) => norm(r.label)));
    const lost = inIndex.filter((e) => !labels.has(norm(e.t)));
    if (lost.length) {
      fails.push(`the cap dropped ${lost.length} result(s) for "${q}": ${lost[0].t}`);
    }
  }
}

/* ------------------------------------------------- the empty search box */

/* What a reader sees before typing anything. The 35 intents are written for
   people who cannot name what they need, and they were unreachable until a
   query happened to match one - opening search showed a blank panel, which
   serves that reader worst of all. */
{
  const labels = new Set((intents.intents || []).map((i) => i.label));
  const byLabel = new Map((intents.intents || []).map((i) => [i.label, i]));
  const starters = intents.starters || [];

  if (!starters.length) fails.push("no starters configured — the empty search box is blank again");

  for (const label of starters) {
    if (!labels.has(label)) {
      fails.push(`starter has no matching intent, so it silently vanishes: "${label}"`);
      continue;
    }
    const i = byLabel.get(label);
    if (!i.route || !i.route.startsWith("#/")) {
      fails.push(`starter "${label}" points at ${i.route}`);
    }
  }

  /* Ordering is an editorial decision about a frightened reader, not a ranking
     output. If these get reordered, the overdose entry must not drift down. */
  if (starters.length && !/overdos/i.test(starters[0])) {
    fails.push(`the first starting point is "${starters[0]}", not the overdose one`);
  }
  if (starters.length > 8) {
    fails.push(`${starters.length} starting points is a wall, not a way in`);
  }

  /* Every starter's destination must have a name for the kind slot, or the
     row falls back to "Start here" - which is what six identical labels looked
     like before, and told the reader nothing. */
  const WHERE = new Set(["#/help", "#/alerts", "#/test", "#/substances", "#/learn",
    "#/support", "#/policy", "#/supervision", "#/sex", "#/stimulants", "#/heat",
    "#/after", "#/about"]);
  for (const label of starters) {
    const i = byLabel.get(label);
    if (i && !WHERE.has(i.route)) {
      fails.push(`starter "${label}" goes to ${i.route}, which has no section name in search.js`);
    }
  }

  /* Six distinct destinations beats six routes into one page. */
  const dests = new Set(starters.map((l) => byLabel.get(l)?.route).filter(Boolean));
  if (starters.length && dests.size < starters.length - 1) {
    fails.push(`${starters.length} starting points lead to only ${dests.size} places`);
  }
}

console.log("SEARCH\n");
for (const f of fails) console.log("  not ok " + f);
if (!fails.length) console.log(`  ok   all ${pass} realistic queries reach the right page`);
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
