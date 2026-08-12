/* County mesh construction and hit testing.
 *
 * Pure: no DOM, no fetch, no imports beyond the projection. It lives apart
 * from the renderer so it can be tested in Node against the real boundary
 * data, which is how the hit-testing bug below gets caught rather than
 * reported by a user.
 */

import { project as projectRegion } from "./projection.js";

export const SIMPLIFY_TOL = 0.0009;   // normalized units; ~1px at national zoom

/** Douglas-Peucker. The 10m file carries ~73,000 vertices once rings are
 *  assembled; at national zoom most of that lands inside a single pixel. */
export function simplifyRing(flat, tol = SIMPLIFY_TOL) {
  const n = flat.length / 2;
  if (n < 5) return flat;

  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  const tol2 = tol * tol;

  while (stack.length) {
    const [lo, hi] = stack.pop();
    if (hi - lo < 2) continue;
    const ax = flat[lo * 2], ay = flat[lo * 2 + 1];
    const bx = flat[hi * 2], by = flat[hi * 2 + 1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;

    let far = -1, best = tol2;
    for (let i = lo + 1; i < hi; i++) {
      const px = flat[i * 2], py = flat[i * 2 + 1];
      let d2;
      if (len2 === 0) {
        d2 = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        d2 = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
      }
      if (d2 > best) { best = d2; far = i; }
    }
    if (far !== -1) { keep[far] = 1; stack.push([lo, far], [far, hi]); }
  }

  let kept = 0;
  for (let i = 0; i < n; i++) if (keep[i]) kept++;
  if (kept === n) return flat;

  const out = new Float32Array(kept * 2);
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    out[j * 2] = flat[i * 2];
    out[j * 2 + 1] = flat[i * 2 + 1];
    j++;
  }
  return out;
}

/**
 * Ray casting against a flat [x,y,x,y,...] ring.
 *
 * This replaced a color-indexed pick buffer, which was subtly and badly wrong:
 * canvas fills are ANTIALIASED, so any pixel on a county border is a blend of
 * two neighboring index colors, and that blend decodes to a third, unrelated
 * county. Hovering Alaska returned counties from other states because Alaska
 * at national zoom is almost entirely border pixels.
 *
 * Testing the geometry cannot have that failure mode.
 */
export function pointInRing(x, y, ring) {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2], yi = ring[i * 2 + 1];
    const xj = ring[j * 2], yj = ring[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Build the renderable mesh from a TopoJSON boundary file and the gazetteer.
 * Coordinates come out normalized into a 0..1 box on the long axis, north-up.
 */
export function buildMesh(shapes, gazCounties) {
  const known = new Set(gazCounties.map((c) => c.fips));

  const [sx, sy] = shapes.transform.scale;
  const [tx, ty] = shapes.transform.translate;
  const arcs = shapes.arcs.map((arc) => {
    let x = 0, y = 0;
    const out = new Array(arc.length);
    for (let i = 0; i < arc.length; i++) {
      x += arc[i][0]; y += arc[i][1];
      out[i] = [x * sx + tx, y * sy + ty];
    }
    return out;
  });

  const ringOf = (idxList) => {
    const pts = [];
    for (const i of idxList) {
      const a = i < 0 ? arcs[~i] : arcs[i];
      if (!a) continue;
      if (i < 0) for (let k = a.length - 1; k >= 0; k--) pts.push(a[k]);
      else for (let k = 0; k < a.length; k++) pts.push(a[k]);
    }
    return pts;
  };

  const raw = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const geom of shapes.geometries) {
    const fips = geom.id;
    if (!known.has(fips)) continue;

    const polys = geom.t === 0 ? [geom.a] : geom.a;
    const rings = [];

    for (const poly of polys) {
      if (!poly.length) continue;
      const src = ringOf(poly[0]);          // outer ring only
      if (src.length < 4) continue;

      const flat = new Float32Array(src.length * 2);
      for (let i = 0; i < src.length; i++) {
        const [x, y] = projectRegion(fips, src[i][0], src[i][1]);
        flat[i * 2] = x; flat[i * 2 + 1] = y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      rings.push(flat);
    }
    if (rings.length) raw.push({ fips, rings });
  }

  const span = Math.max(maxX - minX, maxY - minY);
  const counties = [];

  for (const c of raw) {
    const rings = [];
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;

    for (let ring of c.rings) {
      for (let i = 0; i < ring.length; i += 2) {
        ring[i] = (ring[i] - minX) / span;
        ring[i + 1] = (ring[i + 1] - minY) / span;
      }
      ring = simplifyRing(ring);
      if (ring.length < 8) continue;

      for (let i = 0; i < ring.length; i += 2) {
        const x = ring[i], y = ring[i + 1];
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
        if (y < by0) by0 = y; if (y > by1) by1 = y;
      }
      rings.push(ring);
    }
    if (!rings.length) continue;

    let big = rings[0];
    for (const r of rings) if (r.length > big.length) big = r;
    let cx = 0, cy = 0, n = 0;
    for (let i = 0; i < big.length; i += 2) { cx += big[i]; cy += big[i + 1]; n++; }

    counties.push({
      fips: c.fips, rings, cx: cx / n, cy: cy / n,
      size: Math.max(bx1 - bx0, by1 - by0),
      bb: [bx0, by0, bx1, by1],
    });
  }

  /* Where the lower-48 actually sit in mesh space. The full-mesh bbox center
     is NOT the visual center: the Alaska/Hawaii/territory insets span the left
     third of the layout, so centering on the bbox shoves the mainland toward
     the right edge. Measured: mainland occupies x 0.35-1.0 of the mesh. The
     map view centers most of the way toward this point instead. */
  const INSET_PREFIX = new Set(["02", "15", "72", "66", "60", "78", "69"]);
  let mx0 = Infinity, my0 = Infinity, mx1 = -Infinity, my1 = -Infinity;
  for (const co of counties) {
    if (INSET_PREFIX.has(String(co.fips).slice(0, 2))) continue;
    if (co.bb[0] < mx0) mx0 = co.bb[0];
    if (co.bb[1] < my0) my0 = co.bb[1];
    if (co.bb[2] > mx1) mx1 = co.bb[2];
    if (co.bb[3] > my1) my1 = co.bb[3];
  }
  const mainlandCenter = Number.isFinite(mx0)
    ? [(mx0 + mx1) / 2, (my0 + my1) / 2]
    : null;

  return { counties, width: (maxX - minX) / span, height: (maxY - minY) / span, mainlandCenter };
}

/**
 * Which county contains this point in mesh space? Bounding box first - a
 * reject is far cheaper than walking rings.
 */
export function hitTest(mesh, mx, my) {
  for (const co of mesh.counties) {
    const b = co.bb;
    if (mx < b[0] || mx > b[2] || my < b[1] || my > b[3]) continue;
    for (const ring of co.rings) {
      if (pointInRing(mx, my, ring)) return co;
    }
  }
  return null;
}
