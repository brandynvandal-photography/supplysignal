// Precompute the county map mesh.
//
//   node scripts/build-mesh.mjs
//
// WHY
//
// Opening the map ran buildMesh() in the browser: decode every TopoJSON arc,
// project 3,199 counties, normalise, simplify, and measure bounding boxes.
// Measured on a desktop, first map open cost 5.0s — 1.06s to fetch and parse
// county-shapes.json, then 3.9s of buildMesh with the main thread pinned. A
// phone is several times worse. Nothing else can run during it: no scroll, no
// tap, no tab switch. On an older device that is a frozen app, which is the
// same 2.1 territory this project has already been rejected in once.
//
// None of that work depends on anything the browser knows. It is the same
// answer every time, for every reader. So it moves here.
//
// OUTPUT, two files:
//   data/county-mesh.bin   every ring's coordinates, one Uint16Array, packed
//                          back to back. The browser dequantises it into one
//                          Float32Array and maps subarray views over that —
//                          one allocation, no per-ring copies.
//   data/county-mesh.json  the index: width, height, mainlandCenter, the
//                          quantisation scale, and per county its fips and
//                          the length of each of its rings in the blob.
//
// WHY 16-BIT, AND WHAT IT COSTS IN PIXELS. The mesh is normalised to a 0..1
// box, and a Float32 spends 32 bits per coordinate on a precision the screen
// can never show: at 172 KB the blob was the largest thing a county page
// fetched, and most of every float was noise below the pixel. Each coordinate
// is stored instead as round(v * scale), scale = 65535 / max(width, height),
// so the whole box uses the full unsigned range (coordinates are never
// negative, which is why Uint16 and not Int16 - the sign bit would be a wasted
// bit of precision). Worst-case error is half a step: 0.5 / scale in mesh
// units, which on screen is 0.5 * unit / scale pixels where unit is the map's
// pixels-per-mesh-unit. At the county page's zoom of 6 on a 390px phone at
// 2x that is ~0.03px; at the national map's maximum zoom of 12 on a 1280px
// desktop at 2x it is ~0.2px. Nothing a reader can see, for half the bytes
// on the wire (and better than half: 16-bit values also compress better).
// The numbers are printed below each build; the browser is told the scale
// in the index and trusts nothing else.
//
// Both are national and byte-identical for every reader, so they carry the
// same privacy shape as every other bundle — no per-county request.
//
// The browser keeps buildMesh() as a fallback. If these files are missing or
// stale the map still works, just slowly, which is the right failure mode for
// a build artifact.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMesh } from "../site/js/mesh.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...a) => path.join(ROOT, ...a);

const readJson = async (f) => JSON.parse(await readFile(f, "utf8"));

const t0 = Date.now();
const shapes = await readJson(p("data/county-shapes.json"));
const gaz = await readJson(p("data/counties.json"));

const mesh = buildMesh(shapes, gaz.counties);
const built = Date.now() - t0;

/* Pack every ring into one Uint16Array, in county order.
 *
 * The index carries ONLY what cannot be recovered from the blob: the fips and
 * the length of each ring. Offsets accumulate on load, and the centroid, size
 * and bounding box are one cheap pass over 22k points in the browser - about a
 * millisecond, against the 341 KB of JSON it would take to ship them. That is
 * the difference between a 341 KB index and a 60 KB one. */
let total = 0;
for (const c of mesh.counties) for (const r of c.rings) total += r.length;

/* The quantisation step - see the header. Computed from the mesh's own extent
   so the full 16-bit range is used whatever the projection produces, and
   written into the index so the reader never has to know how it was chosen. */
const extent = Math.max(mesh.width, mesh.height);
const scale = 65535 / extent;
let maxErr = 0;                                  // in mesh units, for the report

const blob = new Uint16Array(total);
let at = 0;
const counties = mesh.counties.map((c) => {
  const lens = [];
  for (const r of c.rings) {
    for (let i = 0; i < r.length; i++) {
      const q = Math.round(r[i] * scale);
      /* A value outside the range would WRAP silently in a Uint16Array and put
         a vertex on the far side of the map. The mesh is normalised to 0..1 on
         its long axis so this cannot happen; assert it rather than trust it. */
      if (q < 0 || q > 65535) throw new Error(`coordinate ${r[i]} quantises outside 0..65535`);
      blob[at + i] = q;
      const err = Math.abs(q / scale - r[i]);
      if (err > maxErr) maxErr = err;
    }
    at += r.length;
    lens.push(r.length);
  }
  return [c.fips, ...lens];
});

/* No `generated` stamp. The mesh is a pure function of the shapes and the
   gazetteer, and a clock would make two builds of identical inputs differ -
   which defeats the content-hashed caching the deploy puts in front of this
   file (scripts/build-site.mjs) for nothing anybody reads. */
const index = {
  note: "Generated by scripts/build-mesh.mjs. Do not hand-edit. Rings live in county-mesh.bin as Uint16, packed in this order; each entry is [fips, ...ringLengths]; divide each value by `scale` to recover mesh units. Offsets, centroid, size and bbox are derived on load.",
  width: mesh.width,
  height: mesh.height,
  mainlandCenter: mesh.mainlandCenter,
  scale,
  values: total,
  counties,
};

await writeFile(p("data/county-mesh.bin"), Buffer.from(blob.buffer, 0, blob.byteLength));
await writeFile(p("data/county-mesh.json"), JSON.stringify(index) + "\n");

const kb = (b) => `${(b / 1024).toFixed(0)} KB`;
/* The error in pixels at two real views - the county page (zoom 6, a 390px
   phone at 2x) and the national map's maximum (zoom 12, 1280px at 2x).
   unit = min(W/width, H/height) * 0.94 * zoom, as map.js transform() does;
   the canvas is wide enough that width is the binding axis in both. */
const pxErr = (cssW, dpr, zoom) => maxErr * ((cssW * dpr) / mesh.width) * 0.94 * zoom;
console.log(`county mesh precomputed in ${built} ms`);
console.log(`  counties   ${counties.length}`);
console.log(`  rings      ${counties.reduce((n, c) => n + c.length - 1, 0)}`);
console.log(`  bin        ${kb(blob.byteLength)}  (uint16, scale ${scale.toFixed(1)})`);
console.log(`  index      ${kb(Buffer.byteLength(JSON.stringify(index)))}`);
console.log(`  max error  ${maxErr.toExponential(2)} mesh units = ${pxErr(390, 2, 6).toFixed(3)}px on a county page, ${pxErr(1280, 2, 12).toFixed(3)}px at max national zoom`);
