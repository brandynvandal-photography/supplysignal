/* Data access.
 *
 * Every dataset is a static, same-origin file that is byte-identical for every
 * visitor, and every lookup runs against it in memory. Selecting a county or
 * searching a substance makes NO network request, so the host's access log
 * cannot show which county or which drug anyone was interested in.
 *
 * That is the entire reason this module exists rather than a fetch-per-county.
 * Do not add a per-item endpoint here. See PRIVACY.md §1.
 */

const BASE = "../data";

const cache = new Map();
const inflight = new Map();

/** Fetch-once, share-the-promise. Missing files resolve to a fallback so a
 *  dataset that has not been generated yet degrades instead of blanking. */
function load(name, fallback) {
  if (cache.has(name)) return Promise.resolve(cache.get(name));
  if (inflight.has(name)) return inflight.get(name);

  const p = fetch(`${BASE}/${name}.json`, { credentials: "omit", cache: "default" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .catch(() => fallback)
    .then((v) => {
      cache.set(name, v);
      inflight.delete(name);
      return v;
    });

  inflight.set(name, p);
  return p;
}

/* ------------------------------------------------------------- gazetteer */

let byFips = null;

export async function counties() {
  const g = await load("counties", { states: {}, counties: [] });
  if (!byFips) byFips = new Map(g.counties.map((c) => [c.fips, c]));
  return g;
}

export async function county(fips) {
  await counties();
  return byFips.get(fips) || null;
}

/** Label a county the way a person would say it: "Hamilton County, TN". */
export function label(c) {
  return c ? `${c.name}, ${c.state}` : "";
}

/* ---------------------------------------------------------------- search */

/** Prefix-first, then substring. Ranked so typing "hamil" puts Hamilton on top. */
export async function searchCounties(term, limit = 12) {
  const g = await counties();
  const t = term.trim().toLowerCase();
  if (t.length < 2) return [];

  const starts = [];
  const contains = [];
  for (const c of g.counties) {
    const name = c.name.toLowerCase();
    if (name.startsWith(t) || `${name}, ${c.state.toLowerCase()}`.startsWith(t)) {
      starts.push(c);
    } else if (name.includes(t)) {
      contains.push(c);
    }
    if (starts.length >= limit * 3) break;
  }
  return starts.concat(contains).slice(0, limit);
}

/* ------------------------------------------------------------- city search
   Most people cannot name their county, but everyone knows their town. Cities
   are an index INTO a county - the county remains the unit of data, and
   nothing is ever reported below county level. */

/* The place index ships in two parts. Tier 1 is every place with a known
   population, ranked, and it is what the first search runs against. Tier 2 is
   the ~17,000 unincorporated places and CDPs, which stream in behind it.
   Rural coverage is never dropped - it just arrives a moment later. */

let rankedPlaces = null;
let ruralPlaces = null;
let ruralPromise = null;

export async function places() {
  if (rankedPlaces) return rankedPlaces;
  const g = await counties();
  const doc = await load("places", { ranked: [] });
  // County codes are base-36 indexes into counties.json, in file order.
  rankedPlaces = (doc.ranked || [])
    .map(([name, i]) => [name, g.counties[parseInt(i, 36)]?.fips])
    .filter((p) => p[1]);
  prefetchRural();
  return rankedPlaces;
}

/** Start tier 2 without blocking. Safe to call repeatedly. */
export function prefetchRural() {
  if (ruralPlaces || ruralPromise) return ruralPromise;
  ruralPromise = load("places-rural", { tail: {} }).then((doc) => {
    const out = [];
    for (const [fips, names] of Object.entries(doc.tail || {})) {
      for (const n of names) out.push([n, fips]);
    }
    ruralPlaces = out;
    return out;
  });
  return ruralPromise;
}

export const ruralReady = () => ruralPlaces !== null;

function scan(list, t, limit, starts, contains) {
  for (const [name, fips] of list) {
    const n = name.toLowerCase();
    if (n.startsWith(t)) starts.push([name, fips]);
    else if (n.includes(t)) contains.push([name, fips]);
    if (starts.length >= limit * 3) return;
  }
}

/** Cities and towns matching `term`, ranked by population at build time. */
export async function searchPlaces(term, limit = 10) {
  const t = term.trim().toLowerCase();
  if (t.length < 2) return [];
  await counties();
  const ranked = await places();

  const starts = [], contains = [];
  scan(ranked, t, limit, starts, contains);
  // Tier 2 only if it has already arrived - never block a keystroke on it.
  if (ruralPlaces) scan(ruralPlaces, t, limit, starts, contains);

  return starts.concat(contains).slice(0, limit).map(([name, fips]) => {
    const c = byFips.get(fips);
    return { kind: "place", name, fips, county: c?.name, state: c?.state };
  });
}

/**
 * One search box for both. County matches lead when the term looks like a
 * county name; city matches follow, ranked by population.
 */
export async function searchAll(term, limit = 12) {
  const [cs, ps] = await Promise.all([
    searchCounties(term, 6),
    searchPlaces(term, 10),
  ]);

  const out = cs.map((c) => ({ kind: "county", ...c }));
  const seen = new Set(out.map((c) => c.fips));

  for (const p of ps) {
    // Skip a city whose name duplicates a county already listed for the same
    // county - "Chattanooga" and "Hamilton County" are different enough, but
    // "Denver" and "Denver County" are not.
    if (seen.has(p.fips) && p.name.toLowerCase() === (p.county || "").toLowerCase().replace(/ county$/, "")) {
      continue;
    }
    out.push(p);
  }
  return out.slice(0, limit);
}

/* -------------------------------------------------------------- adjacency */

export async function adjacency() {
  const a = await load("adjacency", { counties: {} });
  return a.counties || {};
}

/**
 * Counties bordering `fips`, nearest first. Cross-state by construction - a
 * supply that shows up in Hamilton County, TN is a signal for Catoosa and
 * Walker County, GA, and the border is not a reason to hide it.
 */
export async function neighbors(fips) {
  const adj = await adjacency();
  const entry = adj[fips];
  if (!entry) return [];
  await counties();
  return entry.n
    .map((n) => ({ ...byFips.get(n.fips), fips: n.fips, mi: n.mi }))
    .filter((c) => c.name);
}

/* ----------------------------------------------------------------- alerts */

let alertsByFips = null;

/** One national bundle. See PRIVACY.md §1 for why this is not per-county. */
export async function alerts() {
  const a = await load("alerts", { generated: null, clusters: [], coverage: {} });
  if (!alertsByFips) {
    alertsByFips = new Map();
    for (const cl of a.clusters || []) {
      if (!alertsByFips.has(cl.fips)) alertsByFips.set(cl.fips, []);
      alertsByFips.get(cl.fips).push(cl);
    }
  }
  return a;
}

const rank = { critical: 0, elevated: 1, advisory: 2 };

export async function alertsFor(fips, days = 90) {
  await alerts();
  const cutoff = Date.now() - days * 864e5;
  return (alertsByFips.get(fips) || [])
    .filter((c) => Date.parse(c.eventDate) >= cutoff)
    .sort(
      (a, b) =>
        rank[a.severity] - rank[b.severity] || String(b.eventDate).localeCompare(a.eventDate)
    );
}

/** Alerts in bordering counties, each tagged with the county and distance. */
export async function alertsNearby(fips, days = 90) {
  const nbrs = await neighbors(fips);
  const out = [];
  for (const n of nbrs) {
    for (const c of await alertsFor(n.fips, days)) {
      out.push({ ...c, _county: n, _mi: n.mi });
    }
  }
  return out.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] || String(b.eventDate).localeCompare(a.eventDate)
  );
}

export async function coverage() {
  return (await alerts()).coverage || {};
}

/** CDC provisional county overdose deaths, 12-month rolling, with prior year. */
export async function mortality() {
  return load("mortality", { counties: {}, asOf: null, caveats: [] });
}

/** UNC regional drug-checking fingerprints (CC0). */
export async function regional() {
  return load("regional", { substances: [], regions: [], stateRegion: {} });
}

/* ------------------------------------------------------------- reference */

export async function testingGuide() {
  return load("testing", null);
}

/** National early-warning feeds. Bundled like everything else - opening this
 *  screen makes no request to Health Canada or CFSRE. */
export async function emerging() {
  return load("emerging", { generated: null, sources: [], firstDetections: [], alerts: [] });
}

/** Peer support for someone having a hard time. Not overdose response. */
export async function sitting() {
  return load("sitting", null);
}

/** What happens after an overdose, for the person and for whoever was there. */
export async function after() {
  return load("after", null);
}

/** Culturally-specific support, rendered on Support. One national bundle like
 *  everything else, so opening a group makes NO request - the host's access log
 *  cannot show that someone looked at the trans section or the immigration one,
 *  which for this dataset is the entire point. */
export async function communities() {
  return load("communities", null);
}

/** Why an unregulated supply behaves the way it does. */
export async function market() {
  return load("market", null);
}

/** Practice exercises. Nothing about them is stored; see site/js/practice.js. */
export async function practice() {
  return load("practice", null);
}

/** Consent in using settings, and repairing harm you caused. Bundled like
 *  everything else - nobody's interest in this page reaches a server. */
export async function consent() {
  return load("consent", null);
}

/** Training and courses. */
export async function education() {
  return load("education", null);
}

/** Drug policy: what the law is, who decides it, and how to weigh in. */
export async function policy() {
  return load("policy", null);
}

/** Drug testing, probation and parole. */
export async function supervision() {
  return load("supervision", null);
}

/* How long one drug stays detectable, for its own page.
 *
 * Indexed out of the same bundle the supervision page uses rather than kept in
 * a second file, so there is one place to correct a window and no way for the
 * two surfaces to drift apart. Returns null when we have no verified figure -
 * which is most drugs, and the view says so rather than inventing a range. */
export async function detectionFor(id) {
  const s = await load("supervision", null);
  const rows = s?.windows?.rows || [];
  const row = rows.find((r) => (r.ids || []).includes(id));
  return row ? { ...row, note: row.note, perDrugNote: s.windows.perDrugNote } : null;
}

/* Articles, keyed by substance.
 *
 * Bundled and indexed here rather than fetched per drug, for the same reason
 * reagentsFor is: a request for "articles about heroin" tells whoever serves
 * it that this reader is interested in heroin. That is precisely the leak this
 * app exists to avoid, so the whole index ships and the lookup is local.
 *
 * Returns [] rather than null for a drug with nothing filed, because "we have
 * no articles for this one" is a real answer the view is expected to show. An
 * empty shelf stated plainly beats a padded one. */
export async function articlesFor(id) {
  const a = await load("articles", { bySubstance: {} });
  return a.bySubstance?.[id] || [];
}

/** Policy articles not tied to any one drug. */
export async function articles() {
  return load("articles", { general: [], bySubstance: {}, generated: null });
}

/** Session-only condition lens content. */
export async function conditions() {
  return load("conditions", null);
}

/** Where to get a sample checked - hand-verified directory. */
export async function checking() {
  return load("checking", null);
}

/** Prescribed-medication interactions - hand-verified, per-claim sourced. */
export async function rx() {
  return load("rx", null);
}

/** Recovery, mental health, trauma, and supply sources. */
export async function support() {
  return load("support", null);
}

/* Substances, with the adulterants merged in.
 *
 * They live in a SEPARATE file rather than inside substances.json, because
 * substances.json is regenerated wholesale from PsychonautWiki by
 * build-substances.mjs and would silently erase them on the next run. The
 * upstream wikis document drugs people choose to take; nothing in them covers
 * what turns up in the supply uninvited, which is why this gap existed at all.
 *
 * Adulterants are appended, never allowed to overwrite: if a name ever appears
 * in both files the upstream record wins and the adulterant copy is dropped,
 * so this file can never quietly shadow the real dose data for something like
 * a benzodiazepine that is both prescribed and used as an adulterant. */
export async function substances() {
  const [base, extra, desc, nameWarn, reag] = await Promise.all([
    load("substances", { generated: null, substances: [], warnings: {} }),
    load("adulterants", { substances: [], attribution: [] }),
    load("descriptions", { descriptions: {} }),
    load("name-warnings", { warnings: {} }),
  ]);

  const have = new Set((base.substances || []).map((s) => s.id));
  const added = (extra.substances || []).filter((s) => !have.has(s.id));

  /* Plain-language descriptions are attached where they exist and simply
     absent where they do not - the view omits the section rather than showing
     a placeholder. Coverage is partial on purpose: these are written by hand
     because no upstream source has usable ones. */
  const withDesc = [...(base.substances || []), ...added].map((s) => {
    /* Hand-written description first; an adulterant's own verified summary
       second. The four adulterants already carried a checked one-line summary
       and were still rendering with no description at all, purely because the
       two fields had different names. */
    const plain = desc.descriptions?.[s.id] || s.summary || null;
    let out = plain ? { ...s, description: plain } : s;
    /* Deceptive street names: the warning renders on the page, and the names
       join the aliases so searching "tusi" finds the page that says tusi is
       probably not this. */
    const w = nameWarn.warnings?.[s.id];
    if (w) out = { ...out, nameWarning: w, aliases: [...(out.aliases || []), ...w.names] };
    return out;
  });

  return {
    ...base,
    substances: withDesc,
    attribution: [...(base.attribution || []), ...(extra.attribution || [])],
    adulterantsReviewed: extra.reviewed || null,
  };
}

/**
 * Reagent colors for ONE drug, loaded on demand.
 *
 * This used to be merged into substances() for all 302 at once, which meant
 * 111KB had to arrive before the Drugs list could paint - on a page that never
 * shows a reagent color. Only the detail view does. The bundle is still a
 * single national file fetched whole, so nothing here reveals which drug was
 * looked up; it is simply not on the critical path any more.
 */
export async function reagentsFor(id) {
  const r = await load("reagents", { reagents: {} });
  return r.reagents?.[id] || null;
}

/** Is this a plant or fungal material, where a reagent color table would be
 *  misleading? See the note in scripts/build-reagents.mjs. */
export async function isPlantOrFungal(id) {
  const r = await load("reagents", { plantOrFungal: [] });
  return (r.plantOrFungal || []).includes(id);
}

/** Combination risk matrix. Bundled, so checking a pair makes no request. */
export async function combos() {
  return load("combos", { matrix: null, categories: [], definitions: [], drugs: [] });
}

/* -------------------------------------------------------------- boundary */

/** Only fetched if the reader actually taps "Near me". */
export async function shapes() {
  return load("county-shapes", null);
}
