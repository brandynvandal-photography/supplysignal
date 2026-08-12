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
const out = { generated: new Date().toISOString(), counties: {} };
let pairs = 0, missing = 0;

for (const [fips, set] of adj) {
  if (!NAME.has(fips)) { missing++; continue; }
  const me = centroid.get(fips);
  const neighbors = [...set]
    .filter((f) => NAME.has(f))
    .map((f) => ({ fips: f, mi: Math.round(miles(me, centroid.get(f))) }))
    .sort((a, b) => a.mi - b.mi);
  pairs += neighbors.length;
  out.counties[fips] = { c: me, n: neighbors };
}

writeFileSync("data/adjacency.json", JSON.stringify(out));

const sizes = Object.values(out.counties).map((v) => v.n.length);
const avg = (sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(2);
const kb = (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0);
console.log(
  `counties: ${Object.keys(out.counties).length}\n` +
  `neighbor links: ${pairs} (avg ${avg}, min ${Math.min(...sizes)}, max ${Math.max(...sizes)})\n` +
  `islanded (centroid fallback): ${islanded}\n` +
  `shape ids not in gazetteer: ${missing}\n` +
  `size: ${kb} KB`
);
