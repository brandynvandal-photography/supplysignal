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

/* THE APP READS THE BUNDLE, NOT THIS FILE. data.js serves search-intents out
   of data/topics.json, so an intent added here is invisible on the site until
   scripts/build-topics.mjs runs - which is exactly how 28 new intents passed
   every test and matched nothing in the browser (2026-09-09). */
{
  const bundle = JSON.parse(await readFile("data/topics.json", "utf8"))["search-intents"];
  if (JSON.stringify(bundle) !== JSON.stringify(intents)) {
    console.log("SEARCH\n\n  not ok data/topics.json carries a different search-intents than data/search-intents.json - run node scripts/build-topics.mjs\n\n0 passed, 1 failed");
    process.exit(1);
  }
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/* Mirrors search.js hasPhrase(): whole words, a stem may run on. */
function hasPhrase(text, phrase) {
  if (!phrase) return false;
  let at = text.indexOf(phrase);
  while (at >= 0) {
    const end = at + phrase.length;
    const startOk = at === 0 || text[at - 1] === " ";
    const endOk = end === text.length || text[end] === " " || phrase.length >= 4;
    if (startOk && endOk) return true;
    at = text.indexOf(phrase, at + 1);
  }
  return false;
}
function bagOf(q, phrase) { const w = phrase.split(" "); return q.split(" ").every((x) => w.includes(x)); }
/* Mirrors search.js pairOf() / mixRoute(). */
const PAIR_SPLIT = /\s*(?:\+|&|\band\b|\bwith\b|\bplus\b|\bmixed with\b|\bon top of\b)\s*/i;
const CAT_WORDS = {
  opioid: "opioids", opioids: "opioids", opiate: "opioids", opiates: "opioids",
  benzo: "benzodiazepines", benzos: "benzodiazepines",
  benzodiazepine: "benzodiazepines", benzodiazepines: "benzodiazepines",
  ssri: "ssris", ssris: "ssris", maoi: "maois", maois: "maois",
  mushrooms: "mushrooms", shrooms: "mushrooms", amphetamines: "amphetamines",
  booze: "alcohol", beer: "alcohol", wine: "alcohol", liquor: "alcohol",
  vodka: "alcohol", whiskey: "alcohol", drinking: "alcohol", drinks: "alcohol",
  coffee: "caffeine", "energy drink": "caffeine", "energy drinks": "caffeine",
};
const CAT_NAMES = { opioids: "Opioids", benzodiazepines: "Benzodiazepines", ssris: "SSRIs", maois: "MAOIs", mushrooms: "Mushrooms", amphetamines: "Amphetamines", alcohol: "Alcohol", caffeine: "Caffeine" };
function sideOf(raw) {
  const s = norm(raw);
  if (!s) return null;
  if (CAT_WORDS[s]) return { cat: CAT_WORDS[s], name: CAT_NAMES[CAT_WORDS[s]] || CAT_WORDS[s] };
  const slangId = (intents.slang || {})[s];
  let d = slangId ? idx.drugs.find((x) => x.i === slangId) : null;
  if (!d) d = idx.drugs.find((x) => norm(x.n) === s || (x.a || []).some((a) => norm(a) === s));
  if (!d || !d.c?.length) return null;
  return { cat: d.c[0], name: d.n };
}
function pairOf(term) {
  const sides = String(term || "").split(PAIR_SPLIT).map((x) => x.trim()).filter(Boolean);
  if (sides.length !== 2) return null;
  const a = sideOf(sides[0]), b = sideOf(sides[1]);
  return a && b ? [a, b] : null;
}
const mixRoute = (cats) => `#/substances/mix/${cats.map((c) => c.replace("/", "_")).join("+")}`;

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
  const pair = pairOf(term);
  if (pair) push({ kind: "Drugs", label: `${pair[0].name} + ${pair[1].name}`, route: mixRoute(pair.map((p) => p.cat)), anchor: "sec-checker" });
  const tiers = [[], [], []];
  for (const it of intents.intents || []) {
    let best = -1;
    for (const p of it.q || []) { const np = norm(p); let t = -1;
      if (np === q) t = 0; else if (hasPhrase(q, np)) t = 1;
      else if (q.includes(" ") && (hasPhrase(np, q) || bagOf(q, np))) t = 2;
      if (t >= 0 && (best < 0 || t < best)) best = t; }
    if (best >= 0) tiers[best].push(it);
  }
  for (const it of tiers.flat()) push({ kind: "Answer", label: it.label, route: it.route, anchor: it.anchor });
  const slangId = (intents.slang || {})[q];
  if (slangId) {
    const d = idx.drugs.find((x) => x.i === slangId);
    if (d) push({ kind: "Drug", label: d.n, route: `#/substances/${d.i}` });
  }
  const starts = [], contains = [];
  for (const d of idx.drugs) {
    const n = norm(d.n);
    const res = { kind: "Drug", label: d.n, route: `#/substances/${d.i}` };
    if (n === q || (d.a || []).some((a) => norm(a) === q)) { push(res); continue; }
    if (n.startsWith(q)) { starts.push(res); continue; }
    if ((d.a || []).some((a) => norm(a).startsWith(q))) { starts.push(res); continue; }
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
  ["carfentanil", "#/substances/carfentanil"],
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
  // 2026-09-09: the audit of what people actually type. A prescription
  // opioid is a drug, not the overdose answer ("od" used to match inside it).
  ["codeine", "#/substances/codeine"],
  ["hydrocodone", "#/substances/hydrocodone"],
  ["vicodin", "#/substances/hydrocodone"],
  // Exact street names beat alphabetical prefix hits.
  ["meth", "#/substances/methamphetamine"],
  ["oxy", "#/substances/oxycodone"],
  ["roxy", "#/substances/oxycodone"],
  ["percocet", "#/substances/oxycodone"],
  ["xans", "#/substances/alprazolam"],
  ["2cb", "#/substances/2c-b"],
  ["k2", "#/substances/synthetic-cannabinoid"],
  ["zaza", "#/substances/tianeptine"],
  ["sublocade", "#/substances/buprenorphine"],
  // The crisis words.
  ["passed out", "#/help"],
  ["unresponsive", "#/help"],
  ["wont wake up", "#/help"],
  ["blue lips", "#/help"],
  ["cant breathe", "#/help"],
  ["can't breathe", "#/help"],
  ["overdosed", "#/help"],
  ["seizure", "#/stimulants"],
  ["chest pain", "#/stimulants"],
  ["heart racing", "#/stimulants"],
  ["tweaking", "#/stimulants"],
  ["bad trip", "#/learn"],
  ["panic attack", "#/learn"],
  ["too high", "#/learn"],
  ["nalmefene", "#/help"],
  ["opvee", "#/help"],
  ["second dose", "#/help"],
  ["narcan not working", "#/help"],
  ["rescue breathing", "#/help"],
  // Support, by the words for it.
  ["suicidal", "#/support"],
  ["kill myself", "#/support"],
  ["hotline", "#/support"],
  ["talk to someone", "#/support"],
  ["rape", "#/support"],
  ["trans", "#/support"],
  ["espanol", "#/support"],
  ["español", "#/support"],
  ["nar-anon", "#/support"],
  ["shelter", "#/support"],
  ["withdrawal", "#/support"],
  ["dope sick", "#/support"],
  ["precipitated withdrawal", "#/support"],
  ["mail in test", "#/support"],
  ["alcohol withdrawal", "#/substances/alcohol"],
  ["xanax withdrawal", "#/substances/alprazolam"],
  // Injecting.
  ["abscess", "#/injection"],
  ["wound", "#/injection"],
  ["infection", "#/injection"],
  ["shooting up", "#/injection"],
  ["missed shot", "#/injection"],
  ["cotton fever", "#/injection"],
  ["tranq wounds", "#/substances/xylazine"],
  ["hep c", "#/sex"],
  // Alerts, and the site itself.
  ["alerts", "#/alerts"],
  ["bad batch", "#/alerts"],
  ["my county", "#/alerts"],
  ["who made this", "#/about"],
  ["sources", "#/about"],
  ["report a mistake", "#/about"],
  ["quick exit", "#/about"],
  ["cops", "#/policy"],
  ["police", "#/policy"],
  // Two names joined the way people join them open the checker, both picked.
  ["alcohol and xanax", "#/substances/mix/alcohol+benzodiazepines"],
  ["xanax and alcohol", "#/substances/mix/benzodiazepines+alcohol"],
  ["molly + coke", "#/substances/mix/mdma+cocaine"],
  ["benzos with opioids", "#/substances/mix/benzodiazepines+opioids"],
  ["cocaine and alcohol", "#/substances/mix/cocaine+alcohol"],
  ["shrooms and weed", "#/substances/mix/mushrooms+cannabis"],
  ["g and alcohol", "#/substances/mix/ghb_gbl+alcohol"],
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

/* ------------------------------------------ what must NOT happen (2026-09-09) */
{
  /* "od" inside a word is not the overdose answer. */
  for (const q of ["food", "codeine", "hydrocodone", "vicodin", "methadone"]) {
    const r = search(q)[0];
    if (r && r.route === "#/help") fails.push(`"${q}" opens with the overdose answer: ${r.label}`);
  }
  /* A brand that contains a common word still reaches its own row. */
  {
    const rs = search("bunk police", 5);
    if (!rs.some((r) => /bunk police/i.test(r.label))) fails.push('"bunk police" no longer reaches Bunk Police');
  }
  /* The old intents still match with the whole-word rule. */
  for (const [q, want] of [["arrested 911", "#/policy"], ["overdosing", "#/help"], ["he overdosed", "#/help"], ["took too much meth", "#/stimulants"]]) {
    const r = search(q)[0];
    if (!r || !r.route.startsWith(want)) fails.push(`"${q}" → ${r ? r.route : "nothing"} (wanted ${want})`);
  }
  /* A pair the chart cannot rate falls through to the drug rows, not an
     empty checker. */
  {
    const rs = search("xylazine and fentanyl");
    if (rs.some((r) => /\/mix\//.test(r.route))) fails.push('"xylazine and fentanyl" offers the checker, which has no xylazine row');
  }
  /* The exact phrase outranks the partial one, and the partial one is still
     there: "took too much meth" is the stimulant page first, SOS second. */
  {
    const rs = search("took too much meth");
    if (!(rs[0]?.route === "#/stimulants" && rs[1]?.route === "#/help")) fails.push(`"took too much meth" → ${rs.slice(0, 2).map((r) => r.route).join(", ")}`);
  }
  /* Three names is not a pair. */
  if (search("coke and molly and alcohol").some((r) => /\/mix\//.test(r.route))) fails.push("three names produced a pair");
  pass += 4;
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

/* EVERY SLANG TARGET IS A REAL INDEX ID. "nangs" and "whippits" pointed at
   "nitrous-oxide" while the id is "nitrous", and "poppers" at an id that does
   not exist, so three of the most-typed party words resolved to nothing
   (2026-09-09). */
{
  const drugIds = new Set((idx.drugs || []).map((x) => x.i));
  const dead = Object.entries(intents.slang || {}).filter(([, id]) => !drugIds.has(id)).map(([w, id]) => `${w} -> ${id}`);
  if (dead.length) fails.push(`slang targets that are not in the index: ${dead.join(", ")}`); else pass++;
}

/* STREET NAMES REACH THE PAGE BY PREFIX, not only by the exact-match slang
   map: "vike", "shard", "sizz" each land on their drug (2026-09-09). */
for (const [q, id] of [["vikes", "hydrocodone"], ["shards", "methamphetamine"], ["sizzurp", "codeine"], ["k-pins", "clonazepam"], ["blotter", "lsd"]]) {
  const hit = search(q).find((r) => r.route === `#/substances/${id}`);
  if (hit) pass++; else fails.push(`"${q}" does not reach ${id}`);
}

console.log("SEARCH\n");
for (const f of fails) console.log("  not ok " + f);
if (!fails.length) console.log(`  ok   all ${pass} realistic queries reach the right page`);
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
