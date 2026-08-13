/* Point-in-polygon county lookup, on the device.
 *
 * MOVED FROM src/ ON PURPOSE. It used to live at src/locate.mjs and the Alerts
 * view reached it with import("../../../src/locate.mjs") - three levels up and
 * out of the served directory. That worked until netlify.toml started 404ing
 * /src/* with force = true to keep server-side files off the web, and from
 * that moment "Near me" was dead in production: the dynamic import 404'd, the
 * catch swallowed it, and the button just stopped doing anything.
 *
 * It lives under site/ now because it is client code. Nothing outside site/
 * may be imported by the browser - the 404 rules are the privacy boundary and
 * they are not going to move. The build-time users (test/locate.test.mjs,
 * scripts/build-places.mjs) import it from here, so there is one copy.
 *
 * Also a prerequisite for packaging: a Capacitor bundle contains site/ and
 * nothing above it, so a file outside site/ could never have shipped at all.
 */

/**
 * Resolve a latitude/longitude to a county FIPS code entirely client-side.
 *
 * Deliberately no geocoding API: no key to manage, no rate limit, no CORS,
 * no per-lookup cost, and nothing to break when a third party changes terms.
 * The shapes file is ~270 KB gzipped and is fetched only when a user actually
 * asks to use their location.
 *
 * Bounding boxes are precomputed at build time, so a lookup tests point-in-
 * polygon against a handful of candidates rather than all 3,231 geometries.
 */

/** Decode TopoJSON quantized delta-encoded arcs into absolute coordinates. */
export function decodeArcs(topo) {
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;
  return topo.arcs.map((arc) => {
    let x = 0, y = 0;
    const out = new Array(arc.length);
    for (let i = 0; i < arc.length; i++) {
      x += arc[i][0];
      y += arc[i][1];
      out[i] = [x * sx + tx, y * sy + ty];
    }
    return out;
  });
}

function ring(arcs, idxList) {
  const pts = [];
  for (const i of idxList) {
    const a = i < 0 ? arcs[~i] : arcs[i];
    if (i < 0) {
      for (let k = a.length - 1; k >= 0; k--) pts.push(a[k]);
    } else {
      for (let k = 0; k < a.length; k++) pts.push(a[k]);
    }
  }
  return pts;
}

/** Standard ray-casting. Points exactly on an edge are treated as inside. */
function pointInRing(pt, pts) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function inGeometry(pt, arcs, geom) {
  // t: 0 = Polygon (rings), 1 = MultiPolygon (list of ring-lists)
  const polys = geom.t === 0 ? [geom.a] : geom.a;
  for (const poly of polys) {
    if (!poly.length) continue;
    if (!pointInRing(pt, ring(arcs, poly[0]))) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (pointInRing(pt, ring(arcs, poly[h]))) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

/**
 * @param {{transform,arcs,geometries}} shapes  data/county-shapes.json
 * @param {number} lat
 * @param {number} lng
 * @returns {string|null} 5-digit FIPS
 */
export function findCountyFips(shapes, lat, lng) {
  if (!shapes._decoded) shapes._decoded = decodeArcs(shapes);
  const arcs = shapes._decoded;
  const pt = [lng, lat];

  const candidates = shapes.geometries.filter(
    (g) => lng >= g.b[0] && lng <= g.b[2] && lat >= g.b[1] && lat <= g.b[3]
  );

  for (const g of candidates) {
    if (inGeometry(pt, arcs, g)) return g.id;
  }
  return null;
}
