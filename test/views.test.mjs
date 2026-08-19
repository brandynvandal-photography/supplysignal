/* Every screen renders.
 *
 * WHY THIS EXISTS, and it is worth being blunt about it.
 *
 * On 2026-08-14 the Drugs tab threw a ReferenceError on every single load and
 * showed "This section could not load." for hours. The suite was green the
 * whole time — 186 checks — because not one of them rendered a view. The
 * offline test resolves imports and datasets; the refs test resolves symbols
 * across files; neither executes a render, so a name that is simply not in
 * scope inside a function is invisible to all of it. A passing suite was taken
 * as evidence the app worked, and it was never evidence of that.
 *
 * The bug was `combos` read inside indexView, which is handed `combosP`. No
 * import was missing and no file was malformed. Only running it finds that.
 *
 * SO THIS RUNS THEM. Each view's render() is called against the REAL bundled
 * data, through a DOM small enough to read in one sitting, and has to come back
 * with something a reader would recognise as a page.
 *
 * The shim is deliberately tiny. Views build nodes with h() and hand them back;
 * they do not measure layout or read computed style, so createElement, a few
 * properties and appendChild covers the whole render path. Anything a view
 * touches that is missing here will throw, which is the point — a stub that
 * silently absorbs everything would pass while proving nothing.
 */

import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ----------------------------------------------------------------- a DOM */

class Node {
  constructor() { this.childNodes = []; }
  /* FRAGMENTS FLATTEN, as they do in a real DOM.
   *
   * They used to be stored whole, and everything that walks the tree only
   * descends into elements — so anything a view built with frag() was invisible
   * to querySelector. textContent hid it, because that maps every child
   * including fragments, so the render assertions all passed over the top of
   * it. It surfaced the moment a check needed structure rather than words: the
   * jump-chip test reported 55 sections as having no heading, and every one of
   * them had a heading sitting inside an unflattened fragment. */
  appendChild(n, ...extra) {
    /* appendChild TAKES ONE NODE, and the real one ignores the rest in
       silence. That silence hid a whole section: learn.js called
       wrap.appendChild(spreadItem, stimulantsDiv) and "Staying up, and coming
       down" simply never rendered whenever the first argument was present.
       Here it is a hard error, because a view that calls it this way has lost
       content and there is no other signal that it did. */
    if (extra.length) {
      throw new Error(`appendChild got ${extra.length + 1} arguments; `
        + "everything after the first is dropped — use append() or one call each");
    }
    if (!n) return n;
    if (!(n instanceof El) && !(n instanceof Text) && n instanceof Node) {
      for (const c of [...n.childNodes]) this.appendChild(c);
      return n;
    }
    this.childNodes.push(n);
    return n;
  }
  append(...n) { n.forEach((x) => this.appendChild(x)); }
  replaceChildren(...n) { this.childNodes = []; this.append(...n); }
  remove() {}
  get children() { return this.childNodes.filter((c) => c instanceof El); }
  get textContent() {
    return this.childNodes.map((c) => c.textContent ?? "").join("");
  }
  set textContent(v) { this.childNodes = [new Text(String(v))]; }
  /* Depth-first, supporting the shapes the views actually use: "tag",
     ".class", "#id", and a comma list of those. */
  querySelectorAll(sel) {
    const parts = String(sel).split(",").map((s) => s.trim()).filter(Boolean);
    const out = [];
    const match = (el, p) => {
      const last = p.split(/\s+/).pop();
      if (last.startsWith(".")) return el.classList.contains(last.slice(1));
      if (last.startsWith("#")) return el.id === last.slice(1);
      return el.tag === last.toLowerCase();
    };
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c instanceof El) {
          if (parts.some((p) => match(c, p))) out.push(c);
          walk(c);
        }
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

class Text extends Node {
  constructor(t) { super(); this._t = t; }
  get textContent() { return this._t; }
}

class El extends Node {
  constructor(tag) {
    super();
    this.tag = String(tag).toLowerCase();
    this.attrs = {};
    this.dataset = {};
    this.id = "";
    this._class = "";
    this.hidden = false;
    this.style = {};
  }
  get className() { return this._class; }
  set className(v) { this._class = String(v); }
  get classList() {
    const self = this;
    return {
      contains: (c) => self._class.split(/\s+/).includes(c),
      add(...c) { self._class = [...self._class.split(/\s+/), ...c].filter(Boolean).join(" "); },
      remove() {}, toggle() {},
    };
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === "id") this.id = String(v);
    if (k === "class") this._class = String(v);
  }
  getAttribute(k) { return this.attrs[k] ?? null; }
  hasAttribute(k) { return k in this.attrs; }
  removeAttribute(k) { delete this.attrs[k]; }
  toggleAttribute() {}
  addEventListener() {}
  focus() {}
  scrollIntoView() {}
  getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; }
  closest() { return null; }
}

globalThis.Node = Node;
globalThis.document = {
  createElement: (t) => new El(t),
  createElementNS: (_ns, t) => new El(t),
  createTextNode: (t) => new Text(String(t)),
  createDocumentFragment: () => new Node(),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  documentElement: new El("html"),
  body: new El("body"),
  activeElement: null,
};
globalThis.window = {
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  addEventListener() {},
  requestIdleCallback: (fn) => fn(),
  scrollTo() {}, scrollY: 0, innerWidth: 375, innerHeight: 812,
  getComputedStyle: () => ({}),
};
globalThis.location = { href: "https://nightlight.help/", pathname: "/", hash: "", search: "", protocol: "https:" };
globalThis.history = { pushState() {}, replaceState() {}, go() {}, length: 1 };
/* Node ships a real navigator and defines it getter-only, so it is patched
   rather than replaced. */
Object.defineProperty(globalThis, "navigator", {
  value: { language: "en-US", languages: ["en-US"], onLine: true },
  configurable: true, writable: true,
});
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
globalThis.requestAnimationFrame = (fn) => fn();

/* Datasets come off disk, so the views run against what actually ships. */
globalThis.fetch = async (url) => {
  const name = String(url).split("/").pop().split("?")[0];
  const file = path.join(ROOT, "data", name);
  if (!existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
  const body = readFileSync(file, "utf8");
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
};

/* --------------------------------------------------------------- the run */

const fails = [];

/* The real data module, not a stub. Several views take it through their
   context rather than importing it - alerts is one - and handing them a null
   there would only prove that a null throws. */
const data = await import("../site/js/data.js");
const ctx = { go() {}, data };

/* route, and what the page must show. Detail and class routes are included
   because indexView and detailView are different functions with different
   arguments - which is exactly the seam the Drugs bug fell through. */
const SCREENS = [
  ["alerts", {}],
  ["test", {}],
  ["test", { id: "tracker" }],                 // the reagent tracker sub-screen
  ["test", { id: "tracker", sub: "mdma" }],    // deep-linked from a drug page
  ["substances", {}],                          // the index
  ["substances", { id: "fentanyl" }],          // a detail page
  ["substances", { id: "class", sub: "opioids" }],
  ["substances", { id: "cocaine" }],
  ["support", {}],
  ["learn", {}],
  ["policy", {}],
  ["supervision", {}],
  ["sex", {}],
  ["stimulants", {}],
  ["heat", {}],
  ["after", {}],
  ["emerging", {}],
  ["about", {}],
  ["help", {}],
];

/** Every element in a rendered tree, depth-first. */
function walkEls(root) {
  const out = [];
  const go = (n) => {
    for (const c of n.childNodes) {
      if (c instanceof El) { out.push(c); go(c); }
    }
  };
  go(root);
  return out;
}

console.log("VIEWS\n");
for (const [name, route] of SCREENS) {
  const label = route.id ? `${name}/${route.sub || route.id}` : name;
  try {
    const mod = await import(`../site/js/views/${name}.js`);
    const node = await mod.render(route, ctx);

    if (!node) { fails.push(`${label} rendered nothing`); continue; }
    const text = String(node.textContent || "").trim();
    if (text.length < 40) {
      fails.push(`${label} rendered only ${text.length} characters of text`);
      continue;
    }
    /* The error state IS a successful render, so it has to be caught by its
       words rather than by an exception - it is what the Drugs tab showed for
       hours while every test passed. */
    if (/could not load|didn’t load|did not load/i.test(text)) {
      fails.push(`${label} rendered its failure state: "${text.slice(0, 80)}"`);
      continue;
    }

    /* EVERY JUMP CHIP LANDS ON A REAL HEADING.
     *
     * A chip whose target no longer exists fails in complete silence:
     * jumpNav does getElementById, gets null, and returns. No error, no
     * console warning, nothing moves. The reader taps it and the page sits
     * there. Sections on this app get renamed, reordered and re-parented
     * constantly — "Test strips" alone has moved twice — so the chips drift
     * out of date and nothing notices.
     *
     * Two things are checked, because a chip can be broken in two ways: the
     * id may not be in the tree at all, and it may be in the tree on an
     * element with no heading to scroll to. jumpNav falls back to scrolling
     * the wrapper in that case, which lands the reader in the middle of a
     * section rather than at its title. */
    /* Document order, once. walkEls is depth-first pre-order, which is document
       order, so the index of an element in this list is its position in the
       tree - a compareDocumentPosition() stand-in the shim does not otherwise
       provide (its nodes carry no parent pointer). */
    const docOrder = walkEls(node);
    const posOf = new Map(docOrder.map((el, i) => [el, i]));
    const chips = docOrder.filter((e) => e.attrs["data-jump"]);
    const ids = new Map();
    for (const e of docOrder) if (e.id) ids.set(e.id, e);
    const chipTargets = [];        // [{ chip, pos }] for the order check below
    for (const chip of chips) {
      const want = chip.attrs["data-jump"];
      const target = ids.get(want);
      if (!target) {
        fails.push(`${label}: jump chip "${chip.textContent.trim()}" points at `
          + `#${want}, which this screen does not render`);
        continue;
      }
      const heading = /^h[1-4]$/.test(target.tag) || target.tag === "summary"
        ? target
        : target.querySelector("h1, h2, h3, h4, summary");
      if (!heading) {
        fails.push(`${label}: jump chip "${chip.textContent.trim()}" lands on `
          + `#${want}, which has no heading to scroll to`);
        continue;
      }
      /* Only the jump STRIP counts for the order check. Other controls carry
         data-jump too - Learn's "Start here" steps are .nbr rows deliberately
         ordered by what matters at 3am, not by where their sections sit - and
         they must still RESOLVE (checked above) without being held to DOM
         order. The jump strip is the row of .chip buttons jumpNav builds. */
      if (chip.classList.contains("chip")) {
        chipTargets.push({ chip, pos: posOf.get(target) });
      }
    }

    /* CHIP ORDER == DOM ORDER. The jump strip is a table of contents, and a
       TOC whose rows run in a different order from the page it indexes is a
       wrong map - a reader using it to gauge where a section sits is misled.
       The chips appear in the tree in the order jumpNav lists them (it is one
       contiguous block near the top), so their target positions must be
       strictly increasing. Test strips reading before "What could this be?" in
       the strip while sitting after it on the page was the reported case. */
    for (let i = 1; i < chipTargets.length; i++) {
      const prev = chipTargets[i - 1];
      const cur = chipTargets[i];
      if (cur.pos <= prev.pos) {
        fails.push(`${label}: jump chips are out of DOM order - `
          + `"${cur.chip.textContent.trim()}" (#${cur.chip.attrs["data-jump"]}) `
          + `is listed after "${prev.chip.textContent.trim()}" `
          + `(#${prev.chip.attrs["data-jump"]}) but its section comes earlier on the page`);
      }
    }

    console.log(`  ok   ${label.padEnd(24)} ${text.length.toLocaleString()} chars`
      + (chips.length ? `, ${chips.length} jump chips` : ""));
  } catch (e) {
    fails.push(`${label} THREW ${e.name}: ${e.message}`);
  }
}

/* THE DRUG PAGE AND THE TRACKER READ THE SAME TABLE AND MUST SAY THE SAME
 * THING. Reported from the live site: cocaine on Marquis is published both
 * ways (PsychonautWiki no reaction; DanceSafe light pink or peach), the
 * tracker scored either as fine, and the drug page said only "No reaction
 * expected" - an if/else that tested `none` first and never reached the
 * colors. Two screens, one drug, two answers. For every row in the table that
 * carries none AND colors, the rendered page must show both. */
{
  const T = JSON.parse(readFileSync(path.join(ROOT, "data/reagents.json"), "utf8")).reagents;
  const both = [];
  for (const [id, rows] of Object.entries(T))
    for (const r of rows) if (r.none === true && (r.colors || []).length && !r.alts) both.push([id, r]);
  if (!both.length) fails.push("no both-ways reagent rows found - the table shape changed, re-check this test");
  const mod = await import("../site/js/views/substances.js");
  for (const [id, r] of both) {
    try {
      const node = await mod.render({ id }, ctx);
      const label = r.reagent === "Morr" ? "Morris" : r.reagent === "Simons" ? "Simon" : r.reagent;
      const rowEl = walkEls(node).find((el) => el.tag === "tr"
        && el.children[0]?.tag === "th"
        && new RegExp(`^${label}`, "i").test(el.children[0].textContent));
      const text = rowEl ? String(rowEl.textContent) : "";
      if (!rowEl) { fails.push(`${id}: no ${r.reagent} row rendered`); continue; }
      if (!/No reaction expected/.test(text)) fails.push(`${id}/${r.reagent}: page dropped the "no reaction" reading`);
      for (const c of r.colors) if (!text.toLowerCase().includes(c)) fails.push(`${id}/${r.reagent}: page dropped published color "${c}" (row reads: ${text.trim().slice(0, 80)})`);
    } catch (e) { fails.push(`${id}/${r.reagent}: THREW ${e.message}`); }
  }
  console.log(`  ok   both-ways reagent rows say both (${both.length} checked)`);
}

/* EVERY SEARCH RESULT LANDS SOMEWHERE.
 *
 * app.js reveal() resolves a result two ways: by anchor id (`a`) if the
 * entry carries one, else by EXACT visible heading text (`t`) on the route
 * (`r`). A result that resolves neither way fails in complete silence - the
 * reader taps it, lands at the top of the right page, and the heading they
 * asked for is thousands of pixels down. The UI/UX audit found "If someone
 * died" pointing at grp-grief, an id no view renders, and 73 Test rows with
 * no anchor at all. Same species as the Morris bug: the data says one thing,
 * the screen another, and nothing held them together.
 *
 * So this renders every route the index points at, through the real views
 * against the real data, and checks each of search.json's entries and each of
 * search-intents.json's intents resolves on its route. Matching mirrors
 * reveal(): visible text only (sr-only excluded), same heading tags. */
{
  const { parseRoute } = await import("../site/js/routes.js");
  const idx = JSON.parse(readFileSync(path.join(ROOT, "data/search.json"), "utf8"));
  const intents = JSON.parse(readFileSync(path.join(ROOT, "data/search-intents.json"), "utf8"));
  const entries = [
    ...(idx.entries || []).map((e) => ({ ...e, src: "search.json" })),
    ...(Array.isArray(intents) ? intents : (intents.intents || [])).map((e) => ({
      t: e.label, r: e.route || e.r, a: e.anchor || e.a, src: "search-intents.json",
    })),
  ];

  /* One render per distinct route, cached - 554 entries fan out to a handful. */
  const rendered = new Map();
  const renderFor = async (hashRoute) => {
    const key = String(hashRoute || "");
    if (rendered.has(key)) return rendered.get(key);
    const route = parseRoute({ pathname: "/", hash: key }, false);
    const mod = await import(`../site/js/views/${route.tab}.js`);
    let node = null;
    try { node = await mod.render(route, ctx); } catch (e) { node = null; }
    rendered.set(key, node);
    return node;
  };

  /* MIRRORS app.js reveal(): same skip rules (sr-only, aria-hidden), same
     set of heading tags. If reveal() widens or narrows, this must follow, or
     the test passes on results the app cannot land. */
  const visibleText = (n) => {
    let out = "";
    for (const c of n.childNodes || []) {
      if (c instanceof El) {
        /* The shim keeps class in _class (className), not attrs. */
        const cls = String(c.className || c.attrs?.class || "").split(/\s+/);
        if (cls.includes("sr-only") || c.attrs?.["aria-hidden"] === "true") continue;
        out += visibleText(c);
      } else out += (c.textContent ?? "");
    }
    return out;
  };
  const HEAD = new Set(["h1", "h2", "h3", "h4", "h5", "summary"]);
  const isHeading = (el) => HEAD.has(el.tag) || String(el.className || el.attrs?.class || "").split(/\s+/).includes("lbl");

  let checked = 0, unresolved = [];
  for (const e of entries) {
    if (!e.r) continue;
    const node = await renderFor(e.r);
    if (!node) { unresolved.push(`${e.src}: route ${e.r} did not render for "${e.t}"`); continue; }
    checked++;
    const els = walkEls(node);
    const byId = e.a ? els.find((el) => (el.id || el.attrs?.id) === e.a) : null;
    if (byId) continue;
    const want = String(e.t || "").trim().toLowerCase();
    const byText = els.find((el) => {
      if (!isHeading(el)) return false;
      if (visibleText(el).trim().toLowerCase() === want) return true;
      // mirrors reveal(): a summary's first span is its title when a badge follows
      if (el.tag === "summary") {
        const first = el.children?.find((c) => c.tag === "span");
        return !!first && visibleText(first).trim().toLowerCase() === want;
      }
      return false;
    });
    if (byText) continue;
    /* An INTENT with no anchor is a page-level destination by design - its
       label is the query's intent ("Testing your supply"), not a heading the
       page contains, and reveal() correctly leaves the reader at the page top
       with its h1 focused. That is landed. A search.json ENTRY is always a
       heading the builder found in the data, so for those, not-found is a
       real miss. */
    if (e.src === "search-intents.json" && !e.a && els.some((el) => el.tag === "h1")) continue;
    unresolved.push(`${e.src}: "${e.t}" on ${e.r}` + (e.a ? ` (anchor ${e.a} not in the rendered page)` : " (no anchor, and no heading with that text)"));
  }
  for (const u of unresolved) fails.push(u);
  console.log(`  ok   search results land (${checked} checked, ${unresolved.length} unresolved)`);
}

for (const f of fails) console.log("  not ok " + f);
console.log(`\n${SCREENS.length + 1 - fails.length} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
