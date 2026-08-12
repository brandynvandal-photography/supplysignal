// Build data/places.json - city and town search.
//
// Almost nobody knows which county they live in. They know their town. Making
// someone name a county before they can see an alert is a real barrier for the
// people this is for, so the search box accepts either and city names resolve
// to the county that publishes the data.
//
// The county stays the unit of DATA. Nothing here is displayed at
// below-county precision - a place name is an index into a county, not a
// location claim about anyone.
//
// Source: US Census Bureau place gazetteer (public domain). Each place carries
// an internal lat/lng point, so the city-to-county mapping is computed by
// running that point against the county boundaries already in this repo, using
// the same routine "Near me" uses. No extra dataset and no license to honour.
//
//   curl -O https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_place_national.zip
//   unzip 2024_Gaz_place_national.zip
//   node scripts/build-places.mjs 2024_Gaz_place_national.txt

import { readFileSync, writeFileSync } from "node:fs";
import { findCountyFips } from "../src/locate.mjs";

const SRC = process.argv[2];
const POP_SRC = process.argv[3]; // optional GeoNames cities1000.txt
if (!SRC) {
  console.error(
    "usage: node scripts/build-places.mjs <Gaz_place_national.txt> [cities1000.txt]"
  );
  process.exit(1);
}

/* Population, used only for RANKING search results - typing "portland" should
   offer Oregon before Maine. The Census gazetteer carries no population and
   the Census API now requires a key, so this comes from GeoNames (CC BY 4.0).
   It is optional: without it, results fall back to land area, which ranks
   sparse Alaskan boroughs above every major city and is noticeably worse. */
const popBy = new Map();
if (POP_SRC) {
  for (const line of readFileSync(POP_SRC, "utf8").split("\n")) {
    const f = line.split("\t");
    if (f[8] !== "US") continue;
    const pop = Number(f[14]) || 0;
    const key = `${f[1].toLowerCase()}|${f[10]}`;
    if (pop > (popBy.get(key) || 0)) popBy.set(key, pop);
  }
}

const shapes = JSON.parse(readFileSync("data/county-shapes.json", "utf8"));
const gaz = JSON.parse(readFileSync("data/counties.json", "utf8"));
const known = new Set(gaz.counties.map((c) => c.fips));

/* Census appends the legal/statistical description to the name: "Abbeville
   city", "Abanda CDP", "Nashville-Davidson metropolitan government (balance)".
   People type "Abbeville" and "Nashville", so strip it. */
const LSAD = new RegExp(
  "\\s+(" +
    [
      "city and borough", "consolidated government", "metropolitan government",
      "unified government", "urban county", "municipality", "corporation",
      "borough", "village", "township", "plantation", "comunidad",
      "zona urbana", "town", "city", "CDP", "reservation",
    ].join("|") +
    ")(\\s*\\(balance\\))?$",
  "i"
);

function cleanName(raw) {
  let n = raw.trim();
  n = n.replace(/\s*\(balance\)$/i, "");
  // Strip the descriptor exactly ONCE. Running it twice eats the real name of
  // every place that legitimately ends in a descriptor word: "Kansas City city"
  // becomes "Kansas City" on the first pass and "Kansas" on the second. Same
  // for Oklahoma City, Salt Lake City, Jersey City, Lake Village.
  n = n.replace(LSAD, "");
  return n.trim();
}

const lines = readFileSync(SRC, "utf8").split("\n");
const header = lines[0].split("\t").map((h) => h.trim());
const col = Object.fromEntries(header.map((h, i) => [h, i]));

const rows = [];
let unmatched = 0, malformed = 0;

for (let i = 1; i < lines.length; i++) {
  const f = lines[i].split("\t");
  if (f.length < header.length) { if (lines[i].trim()) malformed++; continue; }

  const lat = Number(f[col.INTPTLAT]);
  const lng = Number(f[col.INTPTLONG]);
  const area = Number(f[col.ALAND_SQMI]) || 0;
  const name = cleanName(f[col.NAME]);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) { malformed++; continue; }

  const fips = findCountyFips(shapes, lat, lng);
  if (!fips || !known.has(fips)) { unmatched++; continue; }

  const pop = popBy.get(`${name.toLowerCase()}|${f[col.USPS].trim()}`) || 0;
  rows.push({ name, fips, area, pop });
}

/* A handful of places where a single interior point gives a misleading answer.
   New York City spans five counties and its centroid lands in Brooklyn, so
   "New York" alone would silently send someone to Kings County. The boroughs
   ARE the counties, so name them directly - that is more useful than any
   disambiguation prompt. */
const ALIASES = [
  ["Manhattan", "36061", 1_600_000],
  ["Brooklyn", "36047", 2_700_000],
  ["Queens", "36081", 2_400_000],
  ["The Bronx", "36005", 1_400_000],
  ["Staten Island", "36085", 490_000],
  ["New York City", "36061", 8_800_000],
  ["NYC", "36061", 8_800_000],
];
for (const [name, fips, pop] of ALIASES) {
  if (known.has(fips)) rows.push({ name, fips, area: 0, pop });
}

/* Ranked by population, falling back to land area. Search walks the array in
   order, so this ordering IS the result ranking. */
rows.sort((a, b) => b.pop - a.pop || b.area - a.area);

/* De-duplicate exact name+county pairs (a few places appear twice across
   overlapping entity types). */
const seenOut = new Set();

/* Split into two files so the first search does not wait on the long tail.
 *
 * The whole index is 241 KB gzipped, which is a real wait on a slow connection
 * for the app's primary interaction. Cutting it by dropping small places was
 * the obvious fix and the wrong one - rural counties have the worst overdose
 * outcomes and the thinnest services, so they are the last coverage to give up.
 *
 * Instead: everything with a known population (~15,000 places, down to about a
 * thousand residents) ships first at 106 KB, ranked so the biggest match wins.
 * The remaining ~17,000 unincorporated places and CDPs stream in right behind
 * it. Nothing is lost; the tail just arrives a moment later.
 */
const idxOf = new Map(gaz.counties.map((c, i) => [c.fips, i]));
const enc = (fips) => (idxOf.get(fips) ?? 0).toString(36);

const ranked = [];        // has a population figure - ordering is meaningful
const tail = {};          // everything else, grouped by county to save bytes

for (const r of rows) {
  const k = `${r.name.toLowerCase()}|${r.fips}`;
  if (!seenOut.has(k)) {
    seenOut.add(k);
    if (r.pop > 0) ranked.push([r.name, enc(r.fips)]);
    else (tail[r.fips] = tail[r.fips] || []).push(r.name);
  }
}

const head = {
  generated: new Date().toISOString(),
  source: {
    name: "US Census Bureau place gazetteer",
    url: "https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html",
    license: "US public domain",
    population: "GeoNames (CC BY 4.0), used only to rank search results",
  },
  note:
    "City and town names are a search index into the county that publishes the " +
    "data. Nothing is reported below county level. County codes are base-36 " +
    "indexes into data/counties.json, in file order.",
  ranked,
};

writeFileSync("data/places.json", JSON.stringify(head));
writeFileSync("data/places-rural.json", JSON.stringify({ generated: head.generated, tail }));

const kb = (o) => (Buffer.byteLength(JSON.stringify(o)) / 1024).toFixed(0);
const tailCount = Object.values(tail).reduce((n, a) => n + a.length, 0);
console.log(
  `places: ${ranked.length + tailCount}\n` +
  `  tier 1 (ranked, loads on focus):  ${ranked.length} — ${kb(head)} KB raw\n` +
  `  tier 2 (rural, streams behind):   ${tailCount} — ${kb({ tail })} KB raw\n` +
  `  counties covered: ${new Set([...ranked.map((p) => p[1]), ...Object.keys(tail).map(enc)]).size}\n` +
  `  point not inside any US county: ${unmatched}\n` +
  `  malformed rows: ${malformed}`
);
