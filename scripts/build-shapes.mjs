// Build a compact county-boundary file for offline location lookup.
// Strips states/nation objects and properties, precomputes bounding boxes so
// point-in-polygon only runs on real candidates. No geocoding API, no key.
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2] || "/tmp/package/counties-10m.json";
const topo = JSON.parse(readFileSync(src, "utf8"));
const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;

// Decode quantized delta-encoded arcs once, to compute bboxes.
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => {
    x += dx; y += dy;
    return [x * sx + tx, y * sy + ty];
  });
});

function ringPoints(idxList) {
  const pts = [];
  for (const i of idxList) {
    const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
    for (const p of a) pts.push(p);
  }
  return pts;
}

const out = { transform: topo.transform, arcs: topo.arcs, geometries: [] };
let skipped = 0;

for (const g of topo.objects.counties.geometries) {
  if (!g.id || !g.arcs) { skipped++; continue; }
  const rings = g.type === "Polygon" ? g.arcs : g.arcs.flat();
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const r of rings) {
    for (const [x, y] of ringPoints(r)) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const r4 = (n) => Math.round(n * 1e4) / 1e4;
  out.geometries.push({
    id: String(g.id).padStart(5, "0"),
    t: g.type === "Polygon" ? 0 : 1,
    a: g.arcs,
    b: [r4(minX), r4(minY), r4(maxX), r4(maxY)],
  });
}

writeFileSync("data/county-shapes.json", JSON.stringify(out));
const kb = (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0);
console.log(`counties: ${out.geometries.length}, skipped: ${skipped}, size: ${kb} KB`);
