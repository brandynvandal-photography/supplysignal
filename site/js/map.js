/* County map.
 *
 * NO TILE SERVICE. A tile provider receives a request for every square of map
 * a reader looks at, which tells them the area that person cares about - the
 * exact leak this app exists to avoid, and blocked by the CSP regardless. The
 * map is drawn from data/county-shapes.json, already shipped for "Near me",
 * projected at runtime. Nothing is fetched to render it.
 *
 * This was a rotatable 3D prism map and is now flat, which is both easier to
 * use and more truthful. Extrusion made values harder to compare, not easier:
 * tall counties hid short ones behind them, and perspective meant two counties
 * with the same number looked different depending on where they sat. Flat
 * shows every county at once, all comparable. Drag now pans, which is the
 * gesture people already expect from a map.
 *
 * The map is never the only way to reach a county. Search and the ranked list
 * below it stay primary, because a canvas is unreachable by a screen reader.
 */

import { h, frag, clear, callout } from "./ui.js";
import * as data from "./data.js";
import { buildMesh as buildMeshFrom, hitTest } from "./mesh.js";

/* ------------------------------------------------------------------ mesh */

let MESH = null;

async function buildMesh() {
  if (MESH) return MESH;
  const shapes = await data.shapes();
  const g = await data.counties();
  MESH = buildMeshFrom(shapes, g.counties);
  return MESH;
}

/* --------------------------------------------------------------- metrics */

const METRICS = {
  change: {
    label: "Change vs last year",
    hint: "Overdose deaths compared with the same 12 months a year earlier. Independent of population.",
    diverging: true,
    async values() {
      const m = await data.mortality();
      const out = new Map();
      for (const [fips, v] of Object.entries(m.counties || {})) {
        if (v.n == null || v.p == null) continue;
        out.set(fips, v.n - v.p);
      }
      return out;
    },
  },
  deaths: {
    label: "Total deaths",
    hint: "Overdose deaths in the last 12 months. This largely tracks population — big counties are high because they are big.",
    diverging: false,
    async values() {
      const m = await data.mortality();
      const out = new Map();
      for (const [fips, v] of Object.entries(m.counties || {})) {
        if (v.n != null) out.set(fips, v.n);
      }
      return out;
    },
  },
  alerts: {
    label: "Published alerts",
    hint: "Supply alerts published in the selected window.",
    diverging: false,
    async values() {
      const a = await data.alerts();
      const out = new Map();
      for (const c of a.clusters || []) out.set(c.fips, (out.get(c.fips) || 0) + 1);
      return out;
    },
  },
};

/* ---------------------------------------------------------------- color */

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) =>
  `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;

/* Warm neutrals to match the rest of the app. Colour is the only visual
   encoding now that height is gone, so the tooltip and the ranked list below
   carry the actual numbers - nothing here depends on colour alone. */
const FLAT = [214, 204, 190];
const UP = [179, 48, 28];
const DOWN = [42, 107, 69];
const SEQ_LO = [238, 230, 218];
const SEQ_HI = [45, 106, 95];

function colorFor(v, scale, diverging) {
  if (v == null) return "rgba(160,148,132,.34)";
  if (diverging) {
    const t = Math.min(1, Math.abs(v) / scale);
    return mix(FLAT, v >= 0 ? UP : DOWN, 0.18 + t * 0.82);
  }
  return mix(SEQ_LO, SEQ_HI, Math.min(1, v / scale));
}

/* ------------------------------------------------------------------ view */

export async function mountMap(host, { go, focus = null, focusLabel = null, compact = false }) {
  /* `compact` embeds the map inside a county page: the canvas, its legend and
     the reset control, without the metric switcher or the national top-10 -
     that page already answers "what is here and next door" in text, and
     repeating a national ranking under it would bury the county's own alerts. */
  /* `focus` is a FIPS to center on - set when someone arrives from "Near me"
     and chose the map instead of going straight to their county page. */
  const state = { zoom: 1, panX: 0, panY: 0, metric: "change", hover: null, dragging: false,
    located: null, locatedLabel: null };

  const canvas = h("canvas", {
    class: "map__canvas",
    role: "img",
    "aria-label":
      "Map of US counties shaded by change in overdose deaths. The ranked list " +
      "below this map gives the same information as text, and the search box " +
      "opens any county directly.",
  });
  const tip = h("div", { class: "map__tip", hidden: true, "aria-hidden": "true" });
  const stage = h("div", { class: "map__stage" }, canvas, tip);

  const metricChips = h("div", { class: "chips" },
    Object.entries(METRICS).map(([k, m]) =>
      h("button", {
        type: "button", class: "chip",
        "aria-pressed": String(k === state.metric),
        onClick: () => { state.metric = k; refresh(); },
      }, m.label)));

  const hint = h("p", { class: "sec__note" });
  const notice = h("div");
  const legend = h("div", { class: "map__legend" });
  const topList = h("div", { class: "list" });   // grouped inset list, like every other row list

  const resetBtn = h("button", {
    type: "button", class: "linkbtn",
    onClick: () => { state.zoom = 1; state.panX = 0; state.panY = 0; draw(); drawPickSoon(); },
  }, "Reset view");

  host.appendChild(
    compact
      ? frag(
          stage,
          legend,
          h("p", { class: "map__help" },
            "Drag to move around. Scroll or pinch to zoom. Tap any county to open it. ",
            resetBtn))
      : frag(
          h("div", { class: "map__controls" }, metricChips),
          hint,
          notice,
          stage,
          legend,
          h("p", { class: "map__help" },
            "Drag to move around. Scroll or pinch to zoom. Tap a county to open it. ",
            resetBtn),
          topList)
  );

  const mesh = await buildMesh();
  const ctx2d = canvas.getContext("2d", { alpha: true });

  /* Offscreen base layer.
   *
   * Redrawing 3,231 counties every pan frame measured ~30ms, which is single
   * digit fps on a low-end phone. But panning a flat map is pure translation -
   * nothing about the drawing changes, only where it sits. So the map is
   * rendered once into a buffer larger than the viewport, and panning becomes
   * a single drawImage. Re-rendered only when the zoom, the metric, or the
   * size changes, or when the pan runs past the buffer's margin.
   *
   * This is the payoff for dropping rotation: with a rotating map every frame
   * was genuinely new pixels and no cache was possible. */
  const base = document.createElement("canvas");
  const baseCtx = base.getContext("2d", { alpha: true });
  const MARGIN = 0.32;                 // extra buffer beyond the viewport
  let baseState = null;                // {zoom, panX, panY, w, h, metric}


  let values = new Map();
  let scale = 1;

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(240, stage.clientWidth || host.clientWidth || 640);

    /* Height came from the WIDTH alone (w * 0.60), which is right for the
       full-page map where the stage grows to fit. It was wrong for the inline
       county map: CSS caps that stage at clamp(220px, 38vh, 340px) and hides
       overflow, so a canvas drawn 467px tall inside a 340px box simply had its
       bottom third cut off. The map looked broken on exactly the two routes
       people arrive by - Near me, and searching a county.

       When the stage has a CSS height (the compact case), fill it. Its
       clientHeight is reliable there precisely because CSS declares it, so
       this cannot feed back on the canvas's own size. */
    const boxed = compact && stage.clientHeight > 40;
    const hh = boxed
      ? stage.clientHeight
      : Math.max(300, Math.min(560, Math.round(w * 0.60)));
    const cw = Math.round(w * dpr), ch = Math.round(hh * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw; canvas.height = ch;
    }
    canvas.style.height = hh + "px";
    return dpr;
  }

  /** Screen transform. No rotation, no tilt - just fit, zoom and pan.
   *
   * Centering is 65% of the way toward the LOWER-48's center, not the mesh
   * bbox center. The inset panel (AK/HI/territories) spans the left third of
   * the layout, so bbox-centering pushed the mainland against the right edge -
   * "the map looks off-center" was exactly right. 65% rather than 100%, and
   * fit at 0.94 rather than 0.96, keeps every inset on screen at default zoom;
   * only the far Aleutian tail trades pixels for the mainland sitting where
   * the eye expects it. */
  function transform(W, H, dpr) {
    const fit = Math.min(W / mesh.width, H / mesh.height) * 0.94;
    const unit = fit * state.zoom;
    const [mcx, mcy] = mesh.mainlandCenter || [mesh.width / 2, mesh.height / 2];
    const cx = mesh.width / 2 + (mcx - mesh.width / 2) * 0.65;
    const cy = mesh.height / 2 + (mcy - mesh.height / 2) * 0.65;
    return {
      unit,
      ox: W / 2 + state.panX * dpr - cx * unit,
      oy: H / 2 + state.panY * dpr - cy * unit,
    };
  }

  /** Trace one county's rings into the current path. */
  function tracePath(c, co, u, x0, y0) {
    c.beginPath();
    for (const ring of co.rings) {
      const n = ring.length / 2;
      c.moveTo(x0 + ring[0] * u, y0 + ring[1] * u);
      for (let k = 1; k < n; k++) {
        c.lineTo(x0 + ring[k * 2] * u, y0 + ring[k * 2 + 1] * u);
      }
      c.closePath();
    }
  }

  /** Paint every county into `c` at the given scale/offset. */
  function paintAll(c, u, x0, y0, dpr) {
    const diverging = METRICS[state.metric].diverging;
    const minSize = 0.7 / u;
    const hairline = Math.max(0.4, dpr * 0.35);

    for (let i = 0; i < mesh.counties.length; i++) {
      const co = mesh.counties[i];
      if (co.size < minSize) continue;

      tracePath(c, co, u, x0, y0);
      c.fillStyle = colorFor(values.get(co.fips), scale, diverging);
      c.fill();

      {
        c.strokeStyle = "rgba(90,78,64,.22)";
        c.lineWidth = hairline;
        c.stroke();
      }
    }
  }

  /** Re-render the offscreen base for the current zoom and pan. */
  function renderBase(dpr) {
    const W = canvas.width, H = canvas.height;
    const bw = Math.round(W * (1 + MARGIN * 2));
    const bh = Math.round(H * (1 + MARGIN * 2));
    if (base.width !== bw || base.height !== bh) { base.width = bw; base.height = bh; }

    baseCtx.setTransform(1, 0, 0, 1, 0, 0);
    baseCtx.clearRect(0, 0, bw, bh);

    const { unit, ox, oy } = transform(W, H, dpr);
    paintAll(baseCtx, unit, ox + W * MARGIN, oy + H * MARGIN, dpr);

    baseState = {
      zoom: state.zoom, panX: state.panX, panY: state.panY,
      w: W, h: H, metric: state.metric,
      offX: W * MARGIN, offY: H * MARGIN,
    };
  }

  function baseStale(dpr) {
    if (!baseState) return true;
    const W = canvas.width, H = canvas.height;
    if (baseState.zoom !== state.zoom || baseState.metric !== state.metric) return true;
    if (baseState.w !== W || baseState.h !== H) return true;
    // Panned past the buffer's margin?
    const dx = Math.abs(state.panX - baseState.panX) * dpr;
    const dy = Math.abs(state.panY - baseState.panY) * dpr;
    return dx > W * MARGIN * 0.9 || dy > H * MARGIN * 0.9;
  }

  /* The located county, drawn as its own persistent layer. It cannot ride on
     `state.hover`: hover is cleared the moment the pointer leaves the canvas,
     so "here is your county" would vanish on the first mouse move. */
  function drawLocated(W, H, dpr) {
    if (!state.located) return;
    const co = mesh.counties.find((x) => x.fips === state.located);
    if (!co) return;
    const { unit, ox, oy } = transform(W, H, dpr);

    tracePath(ctx2d, co, unit, ox, oy);
    ctx2d.save();
    ctx2d.strokeStyle = "rgba(255,255,255,.95)";
    ctx2d.lineWidth = dpr * 3.5;
    ctx2d.stroke();
    ctx2d.strokeStyle = "#2d6a5f";
    ctx2d.lineWidth = dpr * 2;
    ctx2d.stroke();

    /* A pin above the county, with the name. Color is never the only signal -
       the label says which county this is in words. */
    const cx = co.cx * unit + ox, cy = co.cy * unit + oy;
    const label = state.locatedLabel || "Your county";
    ctx2d.font = `${dpr * 13}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    const w = ctx2d.measureText(label).width + dpr * 18;
    const hgt = dpr * 26, bx = cx - w / 2, by = cy - dpr * 44;

    ctx2d.beginPath();
    ctx2d.roundRect(bx, by, w, hgt, dpr * 13);
    ctx2d.fillStyle = "#2d6a5f";
    ctx2d.fill();
    ctx2d.beginPath();                       // stem down to the county
    ctx2d.moveTo(cx, by + hgt);
    ctx2d.lineTo(cx, cy - dpr * 4);
    ctx2d.strokeStyle = "#2d6a5f";
    ctx2d.lineWidth = dpr * 2;
    ctx2d.stroke();

    ctx2d.fillStyle = "#ffffff";
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "middle";
    ctx2d.fillText(label, cx, by + hgt / 2 + dpr * 0.5);
    ctx2d.restore();
  }

  function draw(target) {
    const dpr = sizeCanvas();

    if (baseStale(dpr)) renderBase(dpr);

    const W = canvas.width, H = canvas.height;
    ctx2d.setTransform(1, 0, 0, 1, 0, 0);
    ctx2d.clearRect(0, 0, W, H);

    // Panning is a blit: the map has not changed, only where it sits.
    const dx = (state.panX - baseState.panX) * dpr - baseState.offX;
    const dy = (state.panY - baseState.panY) * dpr - baseState.offY;
    ctx2d.drawImage(base, dx, dy);

    drawLocated(W, H, dpr);

    // Highlight is one county, drawn live so it tracks the pointer exactly.
    if (state.hover) {
      const co = mesh.counties.find((x) => x.fips === state.hover);
      if (co) {
        const { unit, ox, oy } = transform(W, H, dpr);
        tracePath(ctx2d, co, unit, ox, oy);
        ctx2d.strokeStyle = "rgba(255,255,255,.95)";
        ctx2d.lineWidth = dpr * 2;
        ctx2d.stroke();
        ctx2d.strokeStyle = "rgba(60,50,40,.55)";
        ctx2d.lineWidth = dpr * 0.8;
        ctx2d.stroke();
      }
    }
  }

  async function refresh() {
    const m = METRICS[state.metric];
    hint.textContent = m.hint;
    for (const b of metricChips.children) {
      b.setAttribute("aria-pressed", String(b.textContent === m.label));
    }

    values = await m.values();
    const nums = [...values.values()].map(Math.abs).sort((a, b) => a - b);
    scale = nums.length ? Math.max(1, nums[Math.floor(nums.length * 0.95)]) : 1;

    clear(notice);
    if (!values.size) {
      notice.appendChild(
        state.metric === "alerts"
          ? callout("warn", "No alerts published yet",
              h("p", null,
                "The scanner works through all 3,231 counties over about a week, and " +
                "genuine supply advisories are rare in any given hour. Nothing has " +
                "qualified so far."),
              h("p", null,
                "This is an absence of reporting, not evidence of a safe supply. " +
                "Try “Change vs last year”, which has data for every county with a " +
                "published figure."))
          : callout("info", "No figures available for this measure",
              h("p", null, "Nothing to map yet. Try another measure."))
      );
    }

    renderLegend(m);
    if (!compact) await renderTop(m);
    draw();
    /* Center and zoom on the located county. Runs after the first draw so the
       canvas has real dimensions - transform() needs them, and before the
       first paint they are zero. */
    if (focus) { centerOnFocus(); draw(); }

  }

  function renderLegend(m) {
    clear(legend);
    if (m.diverging) {
      const swatches = [
        ["Falling", colorFor(-scale, scale, true)],
        ["Little change", colorFor(0, scale, true)],
        ["Rising", colorFor(scale, scale, true)],
      ];
      legend.appendChild(
        h("div", { class: "map__scale" },
          swatches.map(([lab, col]) =>
            h("span", { class: "map__swatch" },
              h("i", { class: "map__chip", "data-c": col, "aria-hidden": "true" }), lab)))
      );
    } else {
      const steps = [0, 0.25, 0.5, 0.75, 1].map((t) => colorFor(t * scale, scale, false));
      legend.appendChild(
        h("div", { class: "map__scale" },
          h("span", { class: "map__swatch" }, "Lower"),
          h("span", { class: "map__ramp", "aria-hidden": "true" },
            steps.map((col) => h("i", { class: "map__chip", "data-c": col }))),
          h("span", { class: "map__swatch" }, `Higher (${Math.round(scale)}+)`))
      );
    }
    legend.querySelectorAll(".map__chip").forEach((el) => {
      el.style.backgroundColor = el.dataset.c;
    });
    legend.appendChild(
      h("p", { class: "map__note" },
        "Counties with no shading have no published figure. Counts of 1–9 are " +
        "withheld for confidentiality, so blank is not the same as none.")
    );
  }

  /* The keyboard- and screen-reader-accessible equivalent of the map, and the
     place the actual numbers live now that height no longer encodes them. */
  async function renderTop(m) {
    const g = await data.counties();
    const byFips = new Map(g.counties.map((c) => [c.fips, c]));
    const top = [...values.entries()]
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 10);

    clear(topList);
    if (!top.length) return;
    topList.appendChild(
      h("h3", { class: "map__toph" },
        m.diverging ? "Largest changes" : `Highest — ${m.label.toLowerCase()}`)
    );
    for (const [fips, v] of top) {
      const c = byFips.get(fips);
      if (!c) continue;
      topList.appendChild(
        h("button", { type: "button", class: "nbr", onClick: () => go(`#/alerts/${fips}`) },
          h("span", { class: "nbr__name" }, `${c.name}, ${c.state}`),
          h("span", { class: "nbr__right" },
            h("span", { class: "nbr__dist" },
              m.diverging ? `${v > 0 ? "+" : ""}${v}` : String(v)),
            h("span", { "aria-hidden": "true" }, "›")))
      );
    }
  }

  /* ------------------------------------------------------- interaction */

  /* Zoom re-renders the base layer (~46ms). Wheel events fire faster than
     that, so they are coalesced to one render per animation frame - otherwise
     a single scroll gesture queues a dozen full redraws. */
  let rafId = 0;
  /* Center and zoom on the located county.
   *
   * Extracted and made re-runnable because the pan offsets are DERIVED from
   * the canvas dimensions - so any resize invalidates them and the county
   * silently drifts off centre. It ran exactly once, which was fine only for
   * as long as the canvas never changed size.
   *
   * panX/panY are reset to zero before accumulating rather than being added
   * to, so calling this twice centres twice rather than panning twice as far.
   */
  function centerOnFocus() {
    if (!focus || !mesh?.counties) return;
    const co = mesh.counties.find((c) => c.fips === focus);
    if (!co) return;
    const dpr = sizeCanvas();
    state.zoom = 6;
    state.panX = 0;
    state.panY = 0;
    const { unit, ox, oy } = transform(canvas.width, canvas.height, dpr);
    state.panX = (canvas.width / 2 - (co.cx * unit + ox)) / dpr;
    state.panY = (canvas.height / 2 - (co.cy * unit + oy)) / dpr;
    state.located = focus;
    state.locatedLabel = focusLabel;
  }

  function scheduleDraw() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; draw(); });
  }

  function countyAt(ev) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const dpr = canvas.width / r.width;
    const { unit, ox, oy } = transform(canvas.width, canvas.height, dpr);
    const mx = ((ev.clientX - r.left) * dpr - ox) / unit;
    const my = ((ev.clientY - r.top) * dpr - oy) / unit;
    return hitTest(mesh, mx, my);
  }

  let last = null, moved = 0;

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    state.dragging = true;
    moved = 0;
    last = [e.clientX, e.clientY];
    tip.hidden = true;
  });

  canvas.addEventListener("pointermove", async (e) => {
    /* Two fingers down means this is a pinch, and the pinch handler below owns
       it. Without this both handlers ran on the same events: the map panned
       toward whichever finger moved more WHILE it zoomed, which is most of
       what made pinching feel like it was fighting back. */
    if (active.size >= 2) return;

    if (state.dragging && last) {
      const dx = e.clientX - last[0], dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      moved += Math.abs(dx) + Math.abs(dy);
      state.panX += dx;
      state.panY += dy;
      /* rAF-throttled, not a synchronous repaint per event. pointermove fires
         at up to 120Hz on a phone and draw() repaints the whole canvas, so the
         old code queued far more full repaints than the display could show and
         the gesture ran behind the finger. */
      scheduleDraw();
      return;
    }

    const co = countyAt(e);
    const fips = co?.fips || null;
    if (fips !== state.hover) { state.hover = fips; draw(); }
    if (!fips) { tip.hidden = true; return; }

    const c = await data.county(fips);
    const v = values.get(fips);
    tip.hidden = false;
    tip.textContent =
      `${c.name}, ${c.state}` +
      (v == null ? " — no published figure"
        : METRICS[state.metric].diverging
          ? ` — ${v > 0 ? "+" : ""}${v} vs last year`
          : ` — ${v}`);
    const r = canvas.getBoundingClientRect();
    tip.style.left = `${e.clientX - r.left}px`;
    tip.style.top = `${e.clientY - r.top}px`;
  });

  const endDrag = () => {
    if (!state.dragging) return;
    state.dragging = false;
  };

  canvas.addEventListener("pointerup", (e) => {
    const wasDrag = moved > 6;      // don't open a county at the end of a pan
    endDrag();
    if (wasDrag) return;
    const co = countyAt(e);
    if (co) go(`#/alerts/${co.fips}`);
  });
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("pointerleave", () => {
    tip.hidden = true;
    if (state.hover) { state.hover = null; draw(); }
  });

  /* Zoom toward the cursor, so the thing under the pointer stays put. */
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const cx = e.clientX - r.left - r.width / 2;
    const cy = e.clientY - r.top - r.height / 2;
    const before = state.zoom;
    state.zoom = Math.max(1, Math.min(12, state.zoom * (e.deltaY < 0 ? 1.15 : 0.87)));
    const k = state.zoom / before;
    state.panX = cx - (cx - state.panX) * k;
    state.panY = cy - (cy - state.panY) * k;
    scheduleDraw();
  }, { passive: false });

  /* Pinch. Two pointers, tracked by id. */
  const active = new Map();
  let pinchStart = null;
  canvas.addEventListener("pointerdown", (e) => active.set(e.pointerId, e));
  canvas.addEventListener("pointermove", (e) => {
    if (!active.has(e.pointerId)) return;
    active.set(e.pointerId, e);
    if (active.size !== 2) return;
    state.dragging = false;
    const [a, b] = [...active.values()];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    if (!pinchStart) { pinchStart = { dist, zoom: state.zoom }; return; }

    /* Zoom about the midpoint between the fingers, so the map stays put under
       them. It used to scale about the canvas centre, which slides whatever
       you are looking at off toward an edge as you zoom - you then chase it
       with a drag, and that chase is what reads as clunky. */
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    const px = (mid.x - r.left) * dpr, py = (mid.y - r.top) * dpr;

    const before = transform(canvas.width, canvas.height, dpr);
    const wx = (px - before.ox) / before.unit;
    const wy = (py - before.oy) / before.unit;

    state.zoom = Math.max(1, Math.min(12, pinchStart.zoom * (dist / pinchStart.dist)));

    const after = transform(canvas.width, canvas.height, dpr);
    // Shift pan so (wx, wy) lands back under the fingers.
    state.panX += (px - (wx * after.unit + after.ox)) / dpr;
    state.panY += (py - (wy * after.unit + after.oy)) / dpr;

    scheduleDraw();
  });
  const clearPointer = (e) => {
    active.delete(e.pointerId);
    if (active.size < 2) { pinchStart = null; drawPickSoon(); }
  };
  canvas.addEventListener("pointerup", clearPointer);
  canvas.addEventListener("pointercancel", clearPointer);

  /* mountMap runs BEFORE its host is in the document, so the first
     sizeCanvas() measures a stage of zero height and falls back to the
     aspect-ratio height - which on the inline county map is taller than the
     box CSS gives it, and the stage hides overflow. That is what cut the
     bottom off the map on the two routes people actually arrive by: Near me,
     and searching a county.

     Layout arrives after mount, so re-measure then. Re-centring is not
     optional here: the pan offsets were computed against the old dimensions,
     so a resize without it leaves the county off centre. */
  let lastW = 0, lastH = 0;
  const ro = new ResizeObserver(() => {
    sizeCanvas();
    if (canvas.width !== lastW || canvas.height !== lastH) {
      lastW = canvas.width; lastH = canvas.height;
      centerOnFocus();
    }
    scheduleDraw(); drawPickSoon();
  });
  ro.observe(stage);

  await refresh();

  /* Settle once layout exists.
   *
   * mountMap is called from countyView WITHOUT being awaited, so it runs while
   * its host is still detached. Every measurement in that first pass is the
   * fallback: stage.clientWidth is 0, so w falls back to 640 and the canvas is
   * sized 640x384 - taller than the 304px box CSS gives the inline map, whose
   * stage hides overflow. That is why the bottom of the map was missing on the
   * two routes people actually arrive by, Near me and county search.
   *
   * The ResizeObserver was supposed to catch this and does not fire reliably
   * for an element that is inserted after observation begins, so this does not
   * depend on it: two frames, because the host is inserted on one and laid out
   * on the next. Re-centring is part of settling - the pan offsets were
   * computed against the fallback dimensions and are meaningless once the
   * canvas changes size. */
  let tries = 0;
  const settle = () => {
    const beforeW = canvas.width, beforeH = canvas.height;
    sizeCanvas();
    /* Only when something actually changed. Assigning canvas.width or .height
       CLEARS the canvas, so repainting has to be part of the same step - and
       it has to be a direct draw() rather than scheduleDraw(), because that
       queues through requestAnimationFrame, which does not run in a background
       tab. Clearing on a timer and repainting on rAF leaves a blank map until
       the reader switches to it. */
    if (canvas.width !== beforeW || canvas.height !== beforeH) {
      centerOnFocus();
      draw();
      drawPickSoon();
    }
    /* Keep looking until the host is genuinely laid out. Two frames was not
       enough: countyView starts this with a bare import().then(), so it can
       finish before the view is ever appended, and every measurement until
       then returns zero. Capped so a map that never gets displayed cannot
       spin forever. */
    /* Poll unconditionally rather than stopping the moment a width appears:
       width and height arrive at different times, and stopping on width alone
       left the height on its fallback. sizeCanvas is a no-op when nothing has
       changed, so ~3s of 75ms checks costs nothing and guarantees the map
       corrects itself whenever layout actually lands. */
    if (tries++ < 40) setTimeout(settle, 75);
  };
  /* setTimeout rather than requestAnimationFrame, deliberately: rAF does not
     fire at all while a tab is in the background, so a map opened in a
     background tab would never size itself and would still be showing the
     640x384 fallback when the reader switched to it. Timers are throttled
     there but they do run. */
  setTimeout(settle, 0);

  return () => { ro.disconnect(); cancelAnimationFrame(rafId); };
}
