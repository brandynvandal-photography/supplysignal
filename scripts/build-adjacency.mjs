// Build the county adjacency graph.
//
// Drug supply does not respect county lines - a batch that surfaces in one
// county is a signal for the counties it borders. That neighbor relationship
// has to come from somewhere, and the obvious answer (Census adjacency file,
// or a geo API) means another download to keep in sync.
//
// It is already here. TopoJSON's defining property is that a border shared by
// two counties is stored ONCE, as a single arc referenced by both geometries.
// So two counties are neighbors exactly when they reference the same arc.
// Reading data/county-shapes.json gives an exact adjacency graph for free.
//
// Islands and counties separated by water share no arc and would strand with
// zero neighbors, so those fall back to nearest-centroid.
//
//   node scripts/build-adjacency.mjs   ->  data/adjacency.json
//
// OUTPUT SHAPE, and why it is this tight:
//
//   { "counties": { "<fips>": [["<idx>", <mi>], ...], ... } }
//
// Each county maps to its neighbours nearest-first, every neighbour a two-item
// pair: the neighbour's INDEX into data/counties.json (in file order, base 36 -
// the same convention data/places.json already uses, decoded by
// parseInt(i, 36) in site/js/data.js) and the centroid distance in whole
// miles. It used to be { c: [lng, lat], n: [{ fips, mi }, ...] }: 575 KB raw
// and 100 KB over the wire, fetched on every county page. The centroid was
// never read by anything - it was an intermediate of this script that leaked
// into the output - and the repeated keys and five-character FIPS were most of
// the bytes. Indices into a file the county page has already loaded carry
// the same information in a third of the space.
//
// REGENERATE THIS WHENEVER data/counties.json IS REBUILT. The indices are
// positions in that file, so a gazetteer rebuild that reorders or adds
// counties silently points every neighbour somewhere else until this runs.
// places.json has the same dependency for the same reason.

import { readFileSync, writeFileSync } from "node:fs";

const shapes = JSON.parse(readFileSync("data/county-shapes.json", "utf8"));
const counties = JSON.parse(readFileSync("data/counties.json", "utf8"));

const NAME = new Map(counties.counties.map((c) => [c.fips, c]));

/* ---- decode arcs once, to compute centroids ---- */
const [sx, sy] = shapes.transform.scale;
const [tx, ty] = shapes.transform.translate;
const arcPoints = shapes.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => {
    x += dx; y += dy;
    return [x * sx + tx, y * sy + ty];
  });
});

/** Normalize a TopoJSON arc reference: ~i and i are the same physical arc. */
const norm = (i) => (i < 0 ? ~i : i);

/** Every ring index list used by a geometry, flattened. */
function ringsOf(geom) {
  return geom.t === 0 ? geom.a : geom.a.flat();
}

/* ---- pass 1: arc -> counties that reference it ---- */
const arcOwners = new Map();
for (const g of shapes.geometries) {
  const seen = new Set();
  for (const ringIdx of ringsOf(g)) {
    for (const i of ringIdx) seen.add(norm(i));
  }
  for (const a of seen) {
    if (!arcOwners.has(a)) arcOwners.set(a, []);
    arcOwners.get(a).push(g.id);
  }
}

/* ---- pass 2: co-owners of an arc are neighbors ---- */
const adj = new Map(shapes.geometries.map((g) => [g.id, new Set()]));
for (const owners of arcOwners.values()) {
  if (owners.length < 2) continue; // coastline / national border: one owner
  for (let i = 0; i < owners.length; i++) {
    for (let j = i + 1; j < owners.length; j++) {
      adj.get(owners[i])?.add(owners[j]);
      adj.get(owners[j])?.add(owners[i]);
    }
  }
}

/* ---- centroids: vertex mean of the largest ring, weighted by ring length ---- */
const centroid = new Map();
for (const g of shapes.geometries) {
  let best = null, bestLen = -1;
  for (const ringIdx of ringsOf(g)) {
    const pts = [];
    for (const i of ringIdx) {
      const a = i < 0 ? arcPoints[~i] : arcPoints[i];
      if (a) pts.push(...a);
    }
    if (pts.length > bestLen) { bestLen = pts.length; best = pts; }
  }
  if (!best || !best.length) {
    centroid.set(g.id, [(g.b[0] + g.b[2]) / 2, (g.b[1] + g.b[3]) / 2]);
    continue;
  }
  let x = 0, y = 0;
  for (const [px, py] of best) { x += px; y += py; }
  const r = (n) => Math.round(n * 1e4) / 1e4;
  centroid.set(g.id, [r(x / best.length), r(y / best.length)]);
}

/* ---- great-circle miles ---- */
function miles(a, b) {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
  const la1 = a[1] * rad, la2 = b[1] * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---- pass 3: island fallback ----
   A county with no shared arc is islanded (Nantucket, the Hawaiian counties,
   some Alaskan boroughs). Give it the nearest few by centroid so "nearby
   counties" is never empty, and mark HOW the link was derived so the UI can
   say "near" rather than falsely claiming a shared border. */
const all = [...centroid.entries()];
let islanded = 0;
for (const [fips, set] of adj) {
  if (set.size) continue;
  islanded++;
  const me = centroid.get(fips);
  const near = all
    .filter(([f]) => f !== fips && NAME.has(f))
    .map(([f, c]) => [f, miles(me, c)])
    .sort((a, b) => a[1] - b[1])
    .slice(0, 4);
  for (const [f] of near) set.add(f);
}

/* ---- emit ---- */
/* No `generated` stamp. The output is a pure function of counties.json and
   county-shapes.json, and a clock in the file would make two builds of the
   same inputs differ - which defeats the content-hashed caching the deploy
   puts in front of it (scripts/build-site.mjs) for no information anybody
   reads. */
const out = { counties: {} };
let pairs = 0, missing = 0;

/* Index into counties.json, in file order, base 36 - see the header. */
const IDX = new Map(counties.counties.map((c, i) => [c.fips, i.toString(36)]));

for (const [fips, set] of adj) {
  if (!NAME.has(fips)) { missing++; continue; }
  const me = centroid.get(fips);
  const neighbors = [...set]
    .filter((f) => NAME.has(f))
    .map((f) => [IDX.get(f), Math.round(miles(me, centroid.get(f)))])
    .sort((a, b) => a[1] - b[1]);
  pairs += neighbors.length;
  out.counties[fips] = neighbors;
}

/* Keyed in sorted FIPS order, so the file is byte-stable across runs and the
   ordering of the Map above can never leak into the output. */
out.counties = Object.fromEntries(Object.entries(out.counties).sort(([a], [b]) => a < b ? -1 : 1));

writeFileSync("data/adjacency.json", JSON.stringify(out));

const sizes = Object.values(out.counties).map((v) => v.length);
const avg = (sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(2);
const kb = (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0);
console.log(
  `counties: ${Object.keys(out.counties).length}\n` +
  `neighbor links: ${pairs} (avg ${avg}, min ${Math.min(...sizes)}, max ${Math.max(...sizes)})\n` +
  `islanded (centroid fallback): ${islanded}\n` +
  `shape ids not in gazetteer: ${missing}\n` +
  `size: ${kb} KB`
);
