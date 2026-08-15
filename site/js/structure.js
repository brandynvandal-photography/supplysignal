/* Skeletal formulas, drawn from coordinates rather than derived.
 *
 * There is no chemistry library here and there does not need to be. Laying a
 * molecule out on a page is the hard part, and PubChem already did it — every
 * atom in data/structures.json carries an x and a y they computed. What is
 * left is lines between points and a label on anything that is not carbon,
 * which is this file.
 *
 * That matters beyond saving bytes. The alternative was a runtime drawing
 * library at 130 KB to 8 MB, fetched from somewhere, in an app whose CSP
 * forbids fetching anything and whose whole design is one dependency.
 *
 * WHY THIS IS ON THE PAGE AT ALL, because a pretty diagram is not a reason.
 * The Test page argues that BTNX's strip is blind to bulky changes on the
 * phenethyl end while WHPM's is blind to changes at the carbonyl — which is
 * the practical difference between the two brands, and is unreadable as prose
 * unless you already know which end is which. The drawing is the explanation.
 *
 * Conventions a chemist would expect, and which are the point of a SKELETAL
 * formula rather than a ball-and-stick:
 *   - Carbon is not labelled. It is the vertex.
 *   - Hydrogens on carbon are not drawn at all; they were dropped upstream.
 *   - Everything else carries its symbol, on a small patch of background so
 *     the bond does not run through the letter.
 */

/** Bond orders we draw distinctly. Anything higher is drawn as a triple. */
const OFFSET = 0.055;          // parallel line spacing, in normalised units

/**
 * Draw one packed structure.
 *
 * @param {{a:string[],x:number[],y:number[],b:number[][]}} s
 * @param {number} size  the square viewport, in px
 * @returns {SVGElement|null}
 */
export function draw(s, size = 220) {
  if (!s?.a?.length || !s.x?.length) return null;

  const NS = "http://www.w3.org/2000/svg";
  const n = s.a.length;

  /* Fit the layout into the box with room for labels at the edges. PubChem's
     units are arbitrary, so everything here is relative. */
  const minX = Math.min(...s.x), maxX = Math.max(...s.x);
  const minY = Math.min(...s.y), maxY = Math.max(...s.y);
  const w = Math.max(maxX - minX, 0.01), h = Math.max(maxY - minY, 0.01);
  const pad = 0.12;
  const scale = (1 - pad * 2) / Math.max(w, h);
  /* Centre the smaller axis, and FLIP Y: PubChem counts upward, SVG counts
     down, and a molecule drawn upside down is subtly wrong in a way that is
     hard to name and easy to see. */
  const ox = pad + (Math.max(w, h) - w) * scale / 2;
  const oy = pad + (Math.max(w, h) - h) * scale / 2;
  const px = (i) => (ox + (s.x[i] - minX) * scale) * size;
  const py = (i) => (oy + (maxY - s.y[i]) * scale) * size;

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("class", "struct");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");

  const el = (name, attrs) => {
    const e = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };

  /* Bonds first, so labels paint over their ends. */
  const labelled = new Set();
  for (let i = 0; i < n; i++) if (s.a[i] !== "C") labelled.add(i);

  const bonds = el("g", {
    stroke: "currentColor", "stroke-width": Math.max(1.15, size / 145),
    "stroke-linecap": "round",
  });

  for (const [i, j, order] of s.b) {
    let x1 = px(i), y1 = py(i), x2 = px(j), y2 = py(j);
    /* Stop the line short of a labelled atom so it meets the letter rather
       than striking through it. */
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const trim = size * 0.032;
    if (labelled.has(i)) { x1 += (dx / len) * trim; y1 += (dy / len) * trim; }
    if (labelled.has(j)) { x2 -= (dx / len) * trim; y2 -= (dy / len) * trim; }

    const lines = order >= 3 ? [-1, 0, 1] : order === 2 ? [-0.5, 0.5] : [0];
    /* Perpendicular, for the parallel strokes of a double or triple bond. */
    const nx = (-(y2 - y1) / len) * OFFSET * size;
    const ny = ((x2 - x1) / len) * OFFSET * size;
    for (const k of lines) {
      bonds.appendChild(el("line", {
        x1: x1 + nx * k, y1: y1 + ny * k, x2: x2 + nx * k, y2: y2 + ny * k,
      }));
    }
  }
  svg.appendChild(bonds);

  /* Atom labels: everything that is not carbon. */
  const labels = el("g", {
    fill: "currentColor", stroke: "none",
    "font-size": Math.max(9, size / 16.5),
    "font-weight": "650",
    "text-anchor": "middle",
  });
  for (const i of labelled) {
    const t = el("text", { x: px(i), y: py(i) + size / 48 });
    t.textContent = s.a[i];
    labels.appendChild(t);
  }
  svg.appendChild(labels);

  return svg;
}
