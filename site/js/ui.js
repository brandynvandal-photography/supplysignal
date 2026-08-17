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

/* THE DESCRIPTOR LINE UNDER A HEADING IS NOT RENDERED.
 *
 * `note` is the slot that held a section's "here is what is in this section"
 * line - "Barriers, PrEP and PEP, emergency contraception, and an honest answer
 * about drink testing" under a heading that already says what it is. On a phone
 * each one cost two or three lines above the content it described, and the
 * reader had usually already decided to read the section by the time they got
 * to the sentence explaining why they might.
 *
 * The parameter stays. Something over a hundred call sites pass it, several
 * build it from data, and dropping it from all of them would be a large silent
 * edit to files this change is not otherwise touching - while keeping it means
 * this decision is undone by deleting one line rather than re-authoring a
 * hundred. It is deliberately not rendered, which is different from unused.
 *
 * What is NOT this: every other .sec__note on the site. Dates ("Checked
 * 2026-08-04"), source attributions, statistical caveats ("Provisional CDC
 * counts... usually an undercount"), safety notes ("Breathing is the target,
 * not waking up") and the lines that tell a reader how to work a control all
 * carry something the reader cannot get from the heading. They stay. */
export function section(title, note, ...kids) {
  void note;
  return frag(
    h("div", { class: "sec" },
      h("div", { class: "sec__head" }, h("h2", null, title))),
    ...kids
  );
}

export function empty(title, ...body) {
  return h("div", { class: "empty" }, h("h3", null, title), ...body.map((b) =>
    b instanceof Node ? b : h("p", null, b)
  ));
}

/**
 * A callout, collapsible, and OPEN until the reader closes it.
 *
 * These are the app's infographic blocks — the location-privacy note, "why one
 * line means positive", "the two fentanyl brands miss different drugs" — and
 * several run to a full screen on a phone. A reader who has already taken one
 * in should be able to fold it away and get to what is underneath.
 *
 * THEY START CLOSED, by the maintainer's decision. I argued for open-by-default
 * — a closed box is not half-read, it is unread, and the disclosure helper
 * below exists on the principle that anything dangerous to half-read stays
 * visible. The counterweight is real too: several of these run a full screen on
 * a phone, and a wall of open boxes is its own way of not being read. The call
 * was made with that trade in view.
 *
 * What the summary carries therefore matters more than it did. The title is
 * visible when closed, so a title that only labels the box — "A note" — hides
 * the thing it is about. Every one of these titles states the claim: "why one
 * line means positive", "the two fentanyl brands miss different drugs", "your
 * location stays on your device".
 *
 * STOP CALLOUTS DO NOT COLLAPSE. Thirteen of them carry the things that get
 * somebody killed: no reagent detects fentanyl, these xylazine strips are only
 * for fentanyl, naloxone does not reverse this. A control that folds those
 * away is a control for dismissing them, and there is no version of this app
 * where that is worth the tidiness.
 *
 * A callout with a title and no body stays a plain block too — a disclosure
 * whose summary IS its entire content is a control that does nothing.
 */
/* The first sentence of a paragraph, without flattening what is inside it.
 *
 * Callout bodies are mostly ONE paragraph holding several sentences, so
 * demoting whole nodes was not enough - the box still carried eight sentences
 * in a single <p>. This walks the paragraph's own child nodes and cuts at the
 * first sentence end that falls in a text node, which keeps any <strong>, <em>
 * or link intact on whichever side of the cut it belongs to.
 *
 * Anything that is not a paragraph - a list, a table, a tag cloud - is left
 * exactly as it is and stays in the box. A list of five one-line don'ts is not
 * an essay, and chopping it after the first item would be vandalism.
 *
 * Abbreviations are the known limitation: "U.S. Marshals" would split at the
 * first period. No callout in this app opens with one, and the failure mode is
 * a short first line rather than lost text - the remainder still renders. */
function splitLead(p) {
  if (!(p instanceof Node) || p.nodeName !== "P") return [p, null];
  const kids = [...p.childNodes];
  const END = /[.!?]["”’)]?(\s|$)/;

  for (let i = 0; i < kids.length; i++) {
    const n = kids[i];
    if (n.nodeType !== 3) continue;               // element: keep looking
    const m = END.exec(n.textContent);
    if (!m) continue;
    const cut = m.index + m[0].length;
    const head = n.textContent.slice(0, cut).trimEnd();
    const tailText = n.textContent.slice(cut);
    /* Last node and nothing after the cut: it was already one sentence. */
    if (i === kids.length - 1 && !tailText.trim()) return [p, null];

    const lead = h("p", null);
    for (const before of kids.slice(0, i)) lead.appendChild(before);
    lead.appendChild(document.createTextNode(head));

    const rest = h("p", null);
    if (tailText.trim()) rest.appendChild(document.createTextNode(tailText.trimStart()));
    for (const after of kids.slice(i + 1)) rest.appendChild(after);
    return [lead, rest.childNodes.length ? rest : null];
  }
  return [p, null];
}

/* ONE SENTENCE IN THE BOX. THE REST UNDERNEATH IT.
 *
 * A callout is an interruption, and an interruption that runs to three
 * paragraphs stops being read as one - 34 of the 38 callouts on this site had
 * grown past a sentence, several past ten, and the longest was 1,374
 * characters inside a coloured box. Past a certain length the severity colour
 * is doing nothing except tinting an essay.
 *
 * So the box now holds the heading and the FIRST block only, and everything
 * after it renders directly beneath, in ordinary prose, still in reading order.
 * Nothing is deleted and no call site changes: a callout written with four
 * paragraphs still says all four things, but only the first one is shouted.
 *
 * Enforced here rather than by editing copy, because copy grows back. A caller
 * that wants more inside the box does not have a way to ask for it, which is
 * the point.
 *
 * The heading is expected to carry its share: "heading plus one sentence" is
 * the shape, and a heading that says nothing wastes the one line the box has. */
export function callout(kind, title, ...body) {
  /* "✕" rather than "■". A bare filled square is indistinguishable from a
     missing-glyph box, so the most severe callout in the app looked like a
     font failure. Each kind keeps a distinct shape, because colour alone is
     never allowed to carry severity. */
  const glyph = { stop: "✕", warn: "▲", info: "ℹ" }[kind] || "ℹ";
  const kids = body.filter((b) => b != null && b !== false);
  const node = (b) => (b instanceof Node ? b : h("p", null, b));

  const head = (tag) => h(
    tag,
    { class: "callout__hd" },
    h("span", { "aria-hidden": "true" }, glyph),
    h("h3", null, title)
  );

  const [lead, tail] = kids.length ? splitLead(node(kids[0])) : [null, null];
  /* Sources stay with the box rather than being demoted - a citation is not a
     second point, it is the first one's provenance. */
  const rest = [tail, ...kids.slice(1).map(node)].filter(Boolean);
  const after = rest.length ? h("div", { class: "callout__after" }, ...rest) : null;

  const box = (kind === "stop" || !lead)
    ? h("div", { class: `callout callout--${kind}` }, head("div"), lead)
    : h("details", { class: `callout callout--${kind} callout--fold` },
        head("summary"),
        h("div", { class: "callout__body" }, lead));

  return after ? frag(box, after) : box;
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
 * Open a section and land on its heading.
 *
 * Extracted from jumpNav's click handler so anything else that navigates
 * within a page gets the identical behavior — Learn's "Start here" path is the
 * second caller. Three separate attempts at this scroll have failed in the
 * past, each for its own reason (see the note inside), so a second copy of the
 * logic is a second thing to get wrong rather than a convenience.
 *
 * Carries no dependency on where it was called from: give it an id, it opens
 * the target and every disclosure above it and puts the heading below the bar.
 * A missing id is a no-op, which is why every caller must also set data-jump on
 * the control so test/views.test.mjs can prove the target exists.
 */
export function jumpTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.open = true;
  /* Sections can be nested inside a parent group. Opening the target alone
     would scroll to something still collapsed. */
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.tagName === "DETAILS") p.open = true;
  }
  /* Scroll the HEADING, not the wrapper - the same resolution reveal() does
     for search results, so a chip and a result for the same section land in
     exactly the same place. Scrolling the wrapper happened to work while its
     first child was always the heading; it stopped being true the moment a
     section opened with a lead paragraph. */
  const head = /^H[1-4]$/.test(el.tagName) || el.tagName === "SUMMARY"
    ? el
    : el.querySelector("h1, h2, h3, h4, summary") || el;
  const target = head.tagName === "SUMMARY" ? head.parentElement : head;

  /* INSTANT, MEASURED, AND THEN CHECKED. Three attempts at this have now
   * failed and each failed for its own reason, so this one removes the
   * assumptions rather than replacing them.
   *
   * It began as scrollIntoView plus a scroll-margin-top keyed on --bar-h. The
   * margin is a CSS constant and the header is not: it carries the
   * early-access banner, and at 960 the tab bar moves into the row. When the
   * constant and the rendered height disagree the heading is what goes under.
   * So it started measuring the header instead.
   *
   * That still left SMOOTH, which is where it kept breaking, and Safari worst
   * of all. A smooth scroll commits to a destination the moment it is called
   * and then animates toward it — while this handler has just opened the
   * target and every disclosure above it, so anything expanding above the
   * target moves it after the browser has already decided where to stop.
   * Waiting two frames helped and did not fix it, because there is no frame
   * count that is correct for every engine.
   *
   * There is no animation to get stale now. The position is measured and
   * jumped to, and then verified once on the next frame and corrected if the
   * layout moved underneath it — which is the only claim that actually
   * matters: the heading is below the bar when the scrolling stops. A jump is
   * a destination request, not a scenic route. */
  const place = () => {
    const bar = document.querySelector(".topbar");
    const barH = bar ? bar.getBoundingClientRect().height : 0;
    /* Relative, so it is correct whether or not a scroll is already in flight
       — no reading of window.scrollY to go stale between the measurement and
       the move. */
    const delta = target.getBoundingClientRect().top - barH - 14;
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "auto" });
    return Math.abs(delta);
  };
  /* TELL THE HEADER THIS IS A NAVIGATION, BEFORE MOVING.
   *
   * place() offsets by the bar's height so the heading lands below it. The bar
   * hides itself on a downward scroll — and a jump IS a downward scroll, of
   * exactly the size that trips it. So the sequence was: measure a 94px bar,
   * scroll down, watcher sees the movement and slides the bar away, and the
   * heading arrives 108px down with 95px of the PREVIOUS section sitting above
   * it. Every long downward jump on a phone ended that way.
   *
   * Measuring the slide instead of the bar does not fix it either, because the
   * hide happens AFTER this scroll, not before. What is wrong is the hiding, not
   * the measurement: somebody who just asked to be taken to a section has not
   * asked for the header to leave. app.js listens for this and reseeds its
   * direction tracking at the destination. */
  try { document.dispatchEvent(new CustomEvent("nl:jump")); } catch {}

  place();
  requestAnimationFrame(() => {
    place();
    /* Again after the jump, because the scroll this function just performed is
       what the watcher would otherwise read as "the reader scrolled down". */
    try { document.dispatchEvent(new CustomEvent("nl:jump")); } catch {}
    const s = el.querySelector("summary");
    if (s) s.focus({ preventScroll: true });
  });
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
            /* The target, on the element, so it can be checked.
             *
             * The id lived only in this closure, which meant a chip pointing at
             * a section that had been renamed or moved was invisible to
             * everything: getElementById returns null, the handler returns, and
             * the chip does nothing at all with no error anywhere. Sections get
             * reordered and re-parented on this app constantly. Written here so
             * test/views.test.mjs can render every screen and assert that every
             * chip still lands on a real heading. */
            "data-jump": id,
            onClick: () => jumpTo(id),
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
/* The id every page's provenance disclosure carries, so there is one name for
   it rather than a string typed out in five files. One per page - a second
   would be a second answer to a question that has one. */
export const SOURCES_ID = "sec-sources";

/**
 * The provenance disclosure, with the rule that separates it from the page.
 *
 * .foot-attr drew a border-top and a wide top margin, and moving the block
 * into a `disclosure()` lost them: the sources ended up butted against the
 * last section, reading as one more topic rather than as the page's footing.
 * The rule is the same idiom .jump already uses to close a block off.
 *
 * A wrapper rather than a border on the details itself, because details.disc
 * carries its own border and `overflow: hidden` - a border-top there would be
 * a second line hard against the card's own.
 */
export function sourcesDisclosure(title, ...kids) {
  return h("div", { class: "srcfoot" },
    disclosure(SOURCES_ID, title || "Where this data comes from", null, ...kids));
}

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
    /**
     * ONE dropdown, in the app's own disclosure, at the foot of the page.
     *
     * It was a bare block with a small-caps heading and a bulleted list - a
     * shape that appears nowhere else in the app, sitting under pages whose
     * every other section is a `details` you open. Four surfaces rendered
     * provenance four different ways: this, a hand-rolled twin in
     * substances.js, a plain section in emerging.js, and cards in about.js.
     *
     * "Where this DATA comes from", not "where this comes from": collapsed,
     * all a reader sees is the summary, and the shorter wording reads as if
     * it might be about the app itself. The word doing the work is the one
     * that says what is inside.
     */
    render(title = "Where this data comes from") {
      if (!seen.size) return null;
      return sourcesDisclosure(title,
        h("ul", { class: "srclist" },
          [...seen.values()].map((s) =>
            h("li", null, extLink(s.url, s.name || s.url)))));
    },
  };
}

export function group(id, title, blurb, children, preview = null, opts = null) {
  const kids = (children || []).filter(Boolean);
  if (!kids.length) return h("span");
  if (kids.length === 1) return kids[0];

  const items = (preview || []).filter(Boolean);

  /* Open by default, same as disclosure()'s option. A group carrying the
     thing a page is FOR should not cost a tap to see; the preview list in the
     summary is a good index when it is shut and redundant when it is not. */
  return h("details", { class: "disc disc--group", id, open: opts?.open || null },
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
      /* Not rendered, same reason as section()'s note above: the group's own
         title and its preview list already name what is inside it. */
      /* Content that belongs to the WHOLE group, above its children. The
         fentanyl warning is the case: it applies to every section under here,
         and while it lived inside the first child a reader who opened any of
         the other two never met it. */
      opts?.intro || null,
      h("div", { class: "groupkids" }, kids)));
}
