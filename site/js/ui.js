/* Rendering helpers.
 *
 * Everything here builds real DOM nodes. Nothing in this app assembles an HTML
 * string from data, because the data is other people's text - RSS headlines
 * from local news sites and health departments we do not control. A string
 * template plus a hand-rolled escape function is one forgotten call away from
 * script injection; `document.createTextNode` cannot be forgotten.
 */

/**
 * h("div", {class: "card"}, "text", childNode, [more, nodes])
 *
 * Strings always become text nodes. There is deliberately no `html` escape
 * hatch - if you need markup, compose elements.
 */
/* i18n.js imports nothing, so this direction is safe - no cycle. */
import { t, locale as i18nLocale } from "./i18n.js";

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);

  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else el.setAttribute(k, v === true ? "" : String(v));
  }

  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function frag(...kids) {
  return append(document.createDocumentFragment(), kids);
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

/**
 * Outbound links. Every one of these is hardened the same way, so a reader
 * clicking through to a news story never tells that site where they came from.
 */
/* Only http(s) reaches an href. Feed URLs arrive from trust-2 community feeds
   (WordPress, CFSRE) whose <link> an attacker could set to `javascript:` or
   `data:`. The page CSP already blocks those from EXECUTING, but this app
   serves people who are criminally exposed - a future CSP regression here must
   not become stored XSS. A non-web scheme renders as plain, unclickable text. */
export function safeHref(url) {
  try {
    const scheme = new URL(url, "https://x.invalid/").protocol;
    return scheme === "http:" || scheme === "https:" ? url : null;
  } catch { return null; }
}

export function extLink(url, label, cls = null) {
  const href = safeHref(url);
  if (!href) {
    // Show what it claimed to link to, but do not make it clickable.
    return h("span", { class: cls, title: "Link removed: unsupported address" }, label);
  }
  return h(
    "a",
    {
      href,
      class: cls,
      target: "_blank",
      rel: "noopener noreferrer external",
      referrerpolicy: "no-referrer",
    },
    label,
    h("span", { "aria-hidden": "true" }, " ↗")
  );
}

/* ------------------------------------------------------------------ time */

export function relTime(iso) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return String(iso ?? "");
  const d = Math.floor((Date.now() - ms) / 864e5);
  if (d < 0) return "just now";
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 31) return `${d} days ago`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m} month${m === 1 ? "" : "s"} ago`;
  const y = Math.floor(d / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

/** Machine-readable date for <time datetime>. */
export const isoDate = (iso) => String(iso || "").slice(0, 10);

/* -------------------------------------------------------------- severity */

const SEV = {
  critical: { label: "Critical", glyph: "▲" },
  elevated: { label: "Elevated", glyph: "●" },
  advisory: { label: "Advisory", glyph: "○" },
};

/**
 * Severity badge. The glyph and the word both carry the meaning, so the badge
 * still reads correctly in greyscale, under a color-blind filter, and in a
 * screen reader. Color is the third signal, never the only one.
 */
export function sevBadge(sev) {
  const s = SEV[sev] || SEV.advisory;
  return h(
    "span",
    { class: `badge badge--${sev in SEV ? sev : "advisory"}` },
    h("span", { "aria-hidden": "true" }, s.glyph),
    s.label
  );
}

export function badge(text, kind = "neutral") {
  return h("span", { class: `badge badge--${kind}` }, text);
}

/* ---------------------------------------------------------------- layout */

export function section(title, note, ...kids) {
  return frag(
    h(
      "div",
      { class: "sec" },
      h(
        "div",
        { class: "sec__head" },
        h("h2", null, title),
        note ? h("span", { class: "sec__note" }, note) : null
      )
    ),
    ...kids
  );
}

export function empty(title, ...body) {
  return h("div", { class: "empty" }, h("h3", null, title), ...body.map((b) =>
    b instanceof Node ? b : h("p", null, b)
  ));
}

export function callout(kind, title, ...body) {
  /* "✕" rather than "■". A bare filled square is indistinguishable from a
     missing-glyph box, so the most severe callout in the app looked like a
     font failure. Each kind keeps a distinct shape, because colour alone is
     never allowed to carry severity. */
  const glyph = { stop: "✕", warn: "▲", info: "ℹ" }[kind] || "ℹ";
  return h(
    "div",
    { class: `callout callout--${kind}` },
    h(
      "div",
      { class: "callout__hd" },
      h("span", { "aria-hidden": "true" }, glyph),
      h("h3", null, title)
    ),
    ...body.map((b) => (b instanceof Node ? b : h("p", null, b)))
  );
}

/**
 * A collapsible top-level section.
 *
 * These pages are long by necessity - the limitations of a test strip are the
 * part that keeps someone alive, so they cannot be cut. Collapsing is how you
 * keep the depth without making a reader scroll past it to find the one thing
 * they came for.
 *
 * `open` is a safety decision, not a style one: anything needed in an
 * emergency, or that is dangerous to half-read, stays open.
 */
export function disclosure(id, title, opts, ...kids) {
  const { open = false, tone = null } = opts || {};
  return h(
    "details",
    { class: `disc${tone ? ` disc--${tone}` : ""}`, id, open: open || null },
    h("summary", null, h("h2", null, title)),
    h("div", { class: "disc__body" }, ...kids)
  );
}

/**
 * Chips that jump to a section and open it on the way. Anchor links alone
 * would scroll to a collapsed section and appear to do nothing.
 */
export function jumpNav(items) {
  return h(
    "nav",
    { class: "jump", "aria-label": "Jump to a section" },
    h("span", { class: "jump__label" }, "Jump to"),
    h(
      "div",
      { class: "chips" },
      items.map(({ id, label }) =>
        h(
          "button",
          {
            type: "button",
            class: "chip",
            onClick: () => {
              const el = document.getElementById(id);
              if (!el) return;
              el.open = true;
              /* Sections can now be nested inside a parent group. Opening the
                 target alone would scroll to something still collapsed. */
              for (let p = el.parentElement; p; p = p.parentElement) {
                if (p.tagName === "DETAILS") p.open = true;
              }
              el.scrollIntoView({ behavior: "smooth", block: "start" });
              const s = el.querySelector("summary");
              if (s) s.focus({ preventScroll: true });
            },
          },
          label
        )
      )
    )
  );
}

export function skeleton(n = 3) {
  return h(
    "div",
    { class: "skel", "aria-hidden": "true" },
    Array.from({ length: n }, () => h("div", { class: "skel__row" }))
  );
}

/**
 * "This part is only in English."
 *
 * The app's chrome, navigation and alert copy are translated; the clinical
 * bodies - overdose response, test strip limits, substance detail - are not.
 *
 * That gap is the dangerous part, and it is dangerous in a specific way: a
 * Spanish-speaking reader who sees a fully Spanish interface has every reason
 * to assume they have read everything the app has. They then skim past the
 * English and never learn that naloxone does not reverse xylazine.
 *
 * Machine-translating those bodies is NOT the fix and is deliberately not
 * done here. A mistranslated dose interval or a flipped "give it anyway" can
 * kill someone, and there is no qualified reviewer in this pipeline. Saying
 * plainly what is missing, in the reader's own language, is honest and safe.
 * Translating it properly needs a person; until then this says so.
 *
 * Renders nothing for English readers.
 */
export function englishOnlyNotice() {
  if (String(i18nLocale()).toLowerCase().startsWith("en")) return null;
  return callout("info", t("content.title"),
    h("p", null, t("content.body")),
    h("p", null, t("content.lines")));
}

/**
 * A parent disclosure holding related sections.
 *
 * Long reference pages accumulate top-level dropdowns until the first screen
 * is a filing cabinet rather than a set of choices - Support reached eleven,
 * Test reached ten. Related sections go under a parent so the page opens on
 * a handful of decisions instead.
 *
 * A parent wrapping a single child is a click that buys nothing, so in that
 * case the child is handed straight back.
 */
/**
 * A parent tile holding two or more related sections.
 *
 * `preview` is not decoration. A collapsed group used to show its title and
 * nothing else - the blurb lives in the body, which is exactly the part that
 * is hidden - so "Does your situation change the picture?" gave a reader no
 * way to know whether what they wanted was inside without opening it. A tile
 * that hides its own contents is a tile people scroll past. The preview lists
 * what is underneath, on the summary, where it survives being closed.
 */
/**
 * Collects citations while a page builds and renders them ONCE at the foot.
 *
 * Every claim still carries its source; it just does not interrupt the reading
 * to prove itself. Rows of grey links between every two paragraphs turned
 * pages people read while frightened into bibliographies with prose in them.
 *
 * WHAT DOES NOT GO IN HERE, and this distinction is the whole reason this is a
 * helper rather than a find-and-replace: a link is only a citation if it backs
 * a claim. "Open" on a training course, "Visit the store", "Read the alert",
 * the donate link, and every organization link in the support directory are
 * DESTINATIONS - the thing a reader taps to actually do something. Moving
 * those to a footer would break the page's job. Only sources move.
 *
 *   const src = sourceSink();
 *   ... src.add(block.sources) ...        // returns null, sits inline in a tree
 *   const foot = src.render(); if (foot) wrap.appendChild(foot);
 */
export function sourceSink() {
  const seen = new Map();               // url -> {name, url}, deduped across blocks
  return {
    add(list) {
      for (const s of list || []) {
        if (s?.url && !seen.has(s.url)) seen.set(s.url, s);
      }
      return null;
    },
    size: () => seen.size,
    render(title = "Where this comes from") {
      if (!seen.size) return null;
      return h("div", { class: "foot-attr" },
        h("h3", null, title),
        h("ul", null,
          [...seen.values()].map((s) =>
            h("li", null, extLink(s.url, s.name || s.url)))));
    },
  };
}

export function group(id, title, blurb, children, preview = null) {
  const kids = (children || []).filter(Boolean);
  if (!kids.length) return h("span");
  if (kids.length === 1) return kids[0];

  const items = (preview || []).filter(Boolean);

  return h("details", { class: "disc disc--group", id },
    h("summary", null,
      /* Title and preview stack in a column; the summary itself stays a row so
         the +/- keeps its place at the far right. */
      h("div", { class: "disc__sum" },
        h("h2", null, title),
        /* aria-hidden: the list is a visual affordance that repeats headings
           the screen reader will reach anyway once the group is open.
           Announcing it here would read every child title twice. */
        items.length
          ? h("span", { class: "disc__preview", "aria-hidden": "true" },
              items.map((label, i) =>
                frag(i ? h("span", { class: "disc__sep" }, "·") : null,
                     h("span", { class: "disc__previtem" }, label))))
          : null)),
    h("div", { class: "disc__body" },
      blurb ? h("p", { class: "sec__note groupnote" }, blurb) : null,
      h("div", { class: "groupkids" }, kids)));
}
