/* Drug testing, probation and parole.
 *
 * SCOPE, which is deliberate and not negotiable: nothing here explains how to
 * beat a test, adulterate a sample or substitute urine. That is out of scope.
 * This page is for understanding what you are facing and what you are actually
 * entitled to - which is a different thing, and the thing nobody publishes.
 *
 * Two rules carried over from the policy page, for the same reasons:
 *   1. Everything factual carries a date or a denominator. Testing rules and
 *      state supervision law both move, and a number without its conditions is
 *      not a fact.
 *   2. Where we could not verify something, the page says so rather than
 *      rounding it off. The federal confirmation right is verified; the state
 *      equivalents are not, and the page says exactly that.
 *
 * FORMATTING: nothing sits bare on the background. Prose in .card, row items
 * in .card bubbles, asides in callout() - the same surfaces every other view
 * uses. Jump nav directly under the title, blurb after it, section anchors on
 * wrapper divs because section() returns a fragment.
 */

import {
  h, frag, section, callout, extLink, empty, jumpNav, sourceSink,
} from "../ui.js";
import * as data from "../data.js";

let SRC = null;

/** A titled item in its own bubble, the shape most of this file takes. */
function item(it) {
  return h("div", { class: "card" },
    h("h3", null, it.t),
    h("p", null, it.d),
    it.sources ? SRC.add(it.sources) : null);
}

/** A section wrapped so its id lands on the heading, not a trailing element. */
function anchored(id, ...kids) {
  return h("div", { id }, ...kids);
}

export async function render() {
  const g = await data.supervision();
  if (!g) {
    return empty("This section could not load.", "Check your connection and try again.");
  }

  SRC = sourceSink();
  const wrap = h("div");
  wrap.appendChild(h("h1", null, g.headline));

  wrap.appendChild(
    jumpNav([
      { id: "sec-rights", label: "A positive screen" },
      { id: "sec-panels", label: "What's on the test" },
      { id: "sec-windows", label: "How long it stays" },
      { id: "sec-misreads", label: "When it's wrong" },
      { id: "sec-cannabis", label: "Cannabis" },
      { id: "sec-medication", label: "Your medication" },
      { id: "sec-violations", label: "Violations" },
      { id: "sec-reentry", label: "Getting out" },
      { id: "sec-hair", label: "Hair tests" },
    ]));

  wrap.appendChild(h("p", { class: "sec__note" }, g.blurb));

  /* Said once, at the top, so nobody reads the page hoping for something it
     will not give them. */
  wrap.appendChild(
    callout("info", "What this page does not cover",
      h("p", null,
        "Nothing here is about beating a test. This is about what a test can " +
        "and cannot see, what to do when it says something wrong, and what the " +
        "law already entitles you to.")));

  /* ---- a positive screen is not a result ---- */
  const r = g.rights;
  wrap.appendChild(anchored("sec-rights",
    section(r.headline, null,
      h("div", { class: "card" }, r.body.map((t) => h("p", null, t))),
      callout("warn", r.callout.title, h("p", null, r.callout.body)),
      h("p", { class: "sec__note" }, r.caveat),
      SRC.add(r.sources))));

  /* ---- what is on the panel ---- */
  wrap.appendChild(anchored("sec-panels",
    section(g.panels.headline, g.panels.blurb,
      frag(g.panels.items.map(item)),
      SRC.add(g.panels.sources))));

  /* ---- how long it stays ----
     One bubble per drug rather than a table. A table forces a horizontal
     scroll on a phone and invites reading a single number out of its
     conditions, which is the whole failure mode here - these windows are
     meaningless without the study and the cutoff attached. */
  const w = g.windows;
  wrap.appendChild(anchored("sec-windows",
    section(w.headline, w.blurb,
      h("p", { class: "leadin" }, w.lead),

      h("div", { class: "card" },
        h("h3", null, w.method.title),
        h("p", null, w.method.body),
        SRC.add(w.method.sources)),

      frag(w.rows.map((r) =>
        h("div", { class: "card" },
          h("h3", null, r.drug),
          h("p", null, r.urine),
          r.note ? h("p", { class: "sec__note" }, r.note) : null))),

      /* The absence, stated as content. A reader who came looking for MDMA
         deserves to know it is missing on purpose rather than concluding the
         page is half-finished. */
      callout("info", w.gaps.title,
        h("ul", null, w.gaps.items.map((t) => h("li", null, t)))),

      SRC.add(w.sources))));

  /* ---- misreads ---- */
  wrap.appendChild(anchored("sec-misreads",
    section(g.misreads.headline, g.misreads.blurb,
      frag(g.misreads.items.map(item)))));

  /* ---- cannabis ----
     Its own section rather than an item in the list above, because it is the
     one thing on this page somebody may need to say out loud to a supervision
     officer, and burying it in a row of bubbles would be a mistake. */
  const c = g.cannabis;
  wrap.appendChild(anchored("sec-cannabis",
    section(c.headline, null,
      h("div", { class: "card" }, c.body.map((t) => h("p", null, t))),
      h("p", { class: "sec__note" }, c.note),
      SRC.add(c.sources))));

  /* ---- medication ---- */
  const m = g.medication;
  wrap.appendChild(anchored("sec-medication",
    section(m.headline, null,
      h("div", { class: "card" }, m.body.map((t) => h("p", null, t))),
      callout("stop", m.callout.title, h("p", null, m.callout.body)),
      h("p", { class: "org__links" }, m.links.map((l) => extLink(l.url, l.name))),
      h("p", { class: "sec__note" }, m.caveat),
      SRC.add(m.sources))));

  /* ---- violations ---- */
  wrap.appendChild(anchored("sec-violations",
    section(g.violations.headline, g.violations.blurb,
      frag(g.violations.items.map(item)))));

  /* ---- reentry ---- */
  const re = g.reentry;
  wrap.appendChild(anchored("sec-reentry",
    section(re.headline, null,
      callout("stop", re.headline,
        ...re.body.map((t) => h("p", null, t))),
      SRC.add(re.sources))));

  /* ---- hair ---- */
  const hr = g.hair;
  wrap.appendChild(anchored("sec-hair",
    section(hr.headline, null,
      h("div", { class: "card" }, hr.body.map((t) => h("p", null, t))),
      h("div", { class: "card" },
        h("h3", null, hr.bias.title),
        h("p", null, hr.bias.body),
        SRC.add(hr.bias.sources)),
      h("p", { class: "sec__note" }, hr.thc),
      SRC.add(hr.sources))));

  wrap.appendChild(
    h("p", { class: "sec__note" },
      `Checked ${g.verified}. Testing rules and state supervision law both change — ` +
      "anything here without a date should be treated as unverified."));

  const foot = SRC.render();
  if (foot) wrap.appendChild(foot);

  return wrap;
}
