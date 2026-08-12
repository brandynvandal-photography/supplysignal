/* Map projection, kept separate from the renderer so it can be tested.
 *
 * It lives here because of a bug that nothing else caught: the map shipped
 * upside down. Albers computes y = rho0 - rho*cos(theta), and rho shrinks as
 * latitude rises, so north comes out as a LARGER y - which screen coordinates
 * draw downward. Maine rendered at the bottom, Florida at the top, and a
 * vertically flipped United States is still a plausible-looking blob, so it
 * survived several rounds of visual review.
 *
 * No DOM, no imports. test/projection.test.mjs asserts north is up.
 */

const rad = Math.PI / 180;

export function makeAlbers({ parallels: [p1, p2], rotate, center }) {
  const s1 = Math.sin(p1 * rad), s2 = Math.sin(p2 * rad);
  const n = (s1 + s2) / 2;
  const C = Math.cos(p1 * rad) ** 2 + 2 * n * s1;
  const rho0 = Math.sqrt(C - 2 * n * Math.sin(center * rad)) / n;
  return (lng, lat) => {
    const theta = n * ((lng - rotate) * rad);
    const v = C - 2 * n * Math.sin(lat * rad);
    const rho = Math.sqrt(v < 0 ? 0 : v) / n;
    return [rho * Math.sin(theta), rho0 - rho * Math.cos(theta)];
  };
}

/* Insets, the convention every US thematic map uses: Alaska at true scale
   would swallow the country. The territories get their own boxes rather than
   being dropped, which is what the off-the-shelf US projections do.

   `at` is in SCREEN sense - a positive y parks an inset lower down - because
   the flip is applied before the offset. */
export const REGIONS = {
  conus: { proj: makeAlbers({ parallels: [29.5, 45.5], rotate: -96, center: 37.5 }), k: 1.0, at: [0, 0] },
  ak: { proj: makeAlbers({ parallels: [55, 65], rotate: -154, center: 62 }), k: 0.36, at: [-0.50, 0.30] },
  hi: { proj: makeAlbers({ parallels: [8, 18], rotate: -157, center: 20 }), k: 1.0, at: [-0.26, 0.32] },
  pr: { proj: makeAlbers({ parallels: [8, 18], rotate: -66, center: 18 }), k: 1.6, at: [0.12, 0.30] },
  // Guam/Marianas and American Samoa need separate boxes: they sit ~55 degrees
  // of longitude apart and on opposite sides of the equator, so one shared
  // center threw American Samoa thousands of units away and stretched the
  // bounding box to over twice its true width, shrinking the mainland to a corner.
  gu: { proj: makeAlbers({ parallels: [12, 16], rotate: 146, center: 14 }), k: 0.9, at: [-0.14, 0.33] },
  as: { proj: makeAlbers({ parallels: [-16, -12], rotate: -170.7, center: -14 }), k: 0.9, at: [-0.02, 0.33] },
};

export function regionFor(fips) {
  const p = String(fips).slice(0, 2);
  if (p === "02") return "ak";
  if (p === "15") return "hi";
  if (p === "72" || p === "78") return "pr";
  if (p === "66" || p === "69") return "gu";
  if (p === "60") return "as";
  return "conus";
}

/**
 * Project a coordinate into map space for the county identified by `fips`.
 * Returns [x, y] where **y increases downward**, matching screen convention.
 */
export function project(fips, lng, lat) {
  const r = REGIONS[regionFor(fips)];
  const [px, py] = r.proj(lng, lat);
  return [px * r.k + r.at[0], -py * r.k + r.at[1]];
}
