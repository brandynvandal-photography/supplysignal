/* Drug policy: what the law is, where the money goes, and how to weigh in.
 *
 * Three rules govern this page, and they are what keep it from becoming a
 * campaign leaflet sitting on top of a medical reference:
 *
 *   1. Everything factual carries a date. Drug policy moves faster than this
 *      app ships - test strip legality changed in two states in the last year,
 *      federal funding for those same strips reversed in April 2026, and
 *      cannabis rescheduling is mid-proceeding as this is written. An undated
 *      claim here is a liability, not a convenience.
 *   2. Where something is contested, both positions get stated and attributed.
 *      The reader can hold two arguments at once; they do not need to be
 *      steered. This is also self-interested: the asset this app actually has
 *      is that someone believes the overdose guidance at 3am, and a reader who
 *      decides the app has an axe to grind discounts the part that keeps them
 *      alive.
 *   3. No lookups. The whole app makes zero third-party requests, and asking
 *      "who represents you" would be the first - and the single most revealing
 *      one, since it is a location. Official lookup tools are linked, plainly
 *      marked as leaving the site.
 *
 * Content lives in data/policy.json so it can be re-verified and edited
 * without touching code, and so check-links.mjs sweeps every URL in it.
 *
 * FORMATTING, which is not optional and applies to any new page added here:
 * nothing sits bare on the background. Prose goes in .card, row lists go in
 * .list, and asides go in callout() - the same three surfaces every other view
 * uses. A new page that invents its own layout reads as a different app, and
 * the reader has to re-learn where to look on the one screen where they can
 * least afford to.
 */

import {
  h, frag, section, callout, extLink, empty, jumpNav, sourceSink,
} from "../ui.js";
import * as data from "../data.js";

let SRC = null;

/* Percentages and dollar amounts, lifted out of the prose.
 *
 * The whole argument of the "two things that work" block is the distance
 * between two numbers - 91% of staff call local impact helpful, 9% of
 * constituents include it - and both were sitting in body text at body weight,
 * where the eye slides straight past them. The figures ARE the point.
 *
 * Built as text nodes and elements rather than innerHTML: the CSP has no
 * unsafe-inline, and more to the point this content is data, so it must never
 * be able to inject markup. */
function withFigures(text) {
  const parts = String(text).split(
    /(\$[\d,.]+(?:\s(?:trillion|billion|million|thousand))?|\d[\d,.]*\s?%)/g);
  return frag(parts.map((t, i) =>
    i % 2 ? h("b", { class: "fig" }, t) : t));
}

/* A titled item with a body, the shape most of this file's content takes.
 *
 * Its own .card, not a row inside one .list. A grouped list says "these are
 * twenty rows of the same thing" - right for the bordering-counties list,
 * wrong here, where each item is a separate fact someone might read on its own
 * and where several carry their own sources. Individual bubbles, the same as
 * the drug category tiles. */
function item(it) {
  return h("div", { class: "card" },
    h("h3", null, it.t),
    h("p", null, withFigures(it.d)),
    it.sources ? SRC.add(it.sources) : null);
}

/** The numbered influence rows - a figure and what it belongs to. */
function statRow(it) {
  return h("div", { class: "card statcard" },
    h("p", { class: "stat__n" }, it.t),
    h("p", null, withFigures(it.d)));
}

function orgRow(o) {
  const tags = [];
  if (o.ledByPeopleWhoUse) tags.push("Led by people who use drugs");
  if (o.notDeductible) tags.push("Not tax-deductible");

  const links = [extLink(o.url, "Their site")];
  if (o.donate) links.push(extLink(o.donate, "Donate"));
  if (o.involved && o.involved !== o.donate) links.push(extLink(o.involved, "Get involved"));

  return h("div", { class: "card" },
    h("h3", null, o.name),
    tags.length
      ? h("p", { class: "org__tags" }, tags.join(" · "))
      : null,
    h("p", null, o.what),
    h("p", { class: "org__links" }, links));
}

export async function render(route, { go }) {
  const g = await data.policy();
  if (!g) {
    return empty("This section could not load.", "Check your connection and try again.");
  }

  SRC = sourceSink();
  const wrap = h("div");
  wrap.appendChild(h("h1", null, "Policy"));

  /* Jump nav directly under the title, ahead of the page's own blurb, so it
     is in the same place on every tab. */
  wrap.appendChild(
    jumpNav([
      { id: "sec-calling", label: "Calling 911" },
      { id: "sec-law", label: "The law now" },
      { id: "sec-money", label: "The money" },
      { id: "sec-voice", label: "Being heard" },
      { id: "sec-orgs", label: "Organizations" },
    ]));

  /* The dateline is a blurb, not a footnote. Everything below is only as good
     as when it was last checked, and the reader should know that before they
     read it rather than after. */
  wrap.appendChild(
    h("p", { class: "sec__note" },
      `Checked ${g.verified}. Drug policy changes faster than this app updates — ` +
      "anything here without a date should be treated as unverified."));

  /* ---- calling 911 -------------------------------------------------------
     First, and outside any collapsing, because it is the only thing on this
     page that changes what someone does tonight. Everything else here is
     civic; this is operational. */
  const c = g.calling;
  /* Anchored on a wrapper div, not on the section.
     section() returns a FRAGMENT, so there is no single element to hang an id
     on - setting it on wrap.lastChild silently marked whatever paragraph
     happened to come last, and every jump chip landed at the BOTTOM of the
     section it was supposed to open. Same wrapper pattern the Learn page
     uses, which also keeps the spacing identical to every other page. */
  wrap.appendChild(
    h("div", { id: "sec-calling" },
    section(c.headline, null,
      h("p", { class: "leadin" }, c.lead),
      h("div", { class: "card" }, c.body.map((t) => h("p", null, t))),

      callout("warn", c.limits.headline,
        ...c.limits.items.map((i) =>
          h("p", null, h("strong", null, i.t + " — "), i.d))),

      h("h3", null, c.variations.headline),
      frag(c.variations.items.map(item)),
      h("p", { class: "sec__note" }, c.variations.note),

      h("p", { class: "leadin" }, c.bottom),
      SRC.add(c.sources))));

  /* ---- the law ---- */
  wrap.appendChild(
    h("div", { id: "sec-law" },
      section(g.law.headline, g.law.blurb,
        frag(g.law.items.map(item)))));

  /* Testing and supervision is its own page: it is long, it is operational
     rather than civic, and the person who needs it arrived with a specific
     problem rather than a general interest in policy. */
  wrap.appendChild(
    h("a", { class: "bigptr", href: "#/supervision" },
      h("span", { class: "bigptr__hd" }, "Drug testing, probation and parole"),
      h("span", { class: "bigptr__sub" },
        "What a test can and cannot see, what to do when it says something "
        + "wrong, and why they cannot make you stop your medication.")));

  /* ---- money ---- */
  wrap.appendChild(
    h("div", { id: "sec-money" },
      section(g.money.headline, g.money.blurb,
        h("div", { class: "card" },
          g.money.body.map((t) => h("p", null, withFigures(t))),
          SRC.add(g.money.sources)))));

  /* ---- being heard ---- */
  const v = g.voice;
  wrap.appendChild(
    h("div", { id: "sec-voice" },
    section(v.headline, v.blurb,
      h("h3", null, v.what.headline),
      h("div", { class: "statgrid" }, v.what.items.map(statRow)),
      h("p", { class: "sec__note" }, v.what.note),

      h("h3", null, v.gap.headline),
      frag(v.gap.items.map(item)),
      h("p", { class: "sec__note" }, v.gap.note),

      h("h3", null, v.who.headline),
      h("div", { class: "card" },
        v.who.body.map((t) => h("p", null, t)),
        h("p", { class: "org__links" }, v.who.links.map((l) => extLink(l.url, l.name)))),
      /* Said plainly rather than buried. Every other page in this app can
         promise nothing leaves the device; this one cannot, because the whole
         point is reaching someone outside it. */
      callout("info", "These links take you off Nightlight", h("p", null, v.who.privacy)),
      SRC.add(v.sources))));

  /* ---- organizations ---- */
  const o = g.orgs;
  wrap.appendChild(
    h("div", { id: "sec-orgs" },
    section(o.headline, o.blurb,
      h("p", { class: "sec__note" }, o.ledNote),
      ...o.groups.map((grp) =>
        frag(
          h("h3", null, grp.title),
          frag(grp.items.map(orgRow)))),

      h("h3", null, o.giving.headline),
      h("div", { class: "card" },
        o.giving.body.map((t) => h("p", null, t)),
        h("p", { class: "org__links" },
          o.giving.links.map((l) => extLink(l.url, l.name)))))));

  const foot = SRC.render();
  if (foot) wrap.appendChild(foot);

  return wrap;
}
