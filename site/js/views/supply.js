/* Why an unregulated supply behaves the way it does.
 *
 * This used to be a collapsed `details` at the foot of the Drugs page, under a
 * summary somebody had to already be curious enough to open. That is the wrong
 * place for it. Every other section of this app tells a reader WHAT to do; this
 * is the only one that says why, and the rules stick better when the mechanism
 * is visible: "assume a new batch is stronger" is an instruction, and
 * "micrograms cannot be mixed evenly by hand" is a reason. A reason that is
 * three taps down and folded shut is a reason nobody reads.
 *
 * THE HARD BOUNDARY, and it is the reason this page is written from a data file
 * rather than improvised: it explains the market and helps nobody buy in it. No
 * marketplaces, no vendors, no sourcing, no shipping or customs guidance, no
 * advice on avoiding detection while purchasing. Mechanics, not logistics.
 * Anything added here that would help a person acquire drugs rather than
 * understand them does not belong, and the page says so out loud at the bottom
 * rather than leaving a reader to conclude it is half-finished.
 *
 * That boundary is why the international section is shaped the way it is. The
 * honest finding about a supply from another country is that it carries a
 * DIFFERENT set of unknowns, not fewer of them - a different adulterant
 * landscape, and often a strip that no longer detects what is actually in it.
 * Written the other way round it would be a comparison of markets, which is a
 * buying guide with citations.
 *
 * FORMATTING follows policy.js: nothing sits bare on the background. Prose goes
 * in .card, asides go in callout(), sources collect into one sink at the foot.
 */

import {
  h, frag, section, callout, empty, jumpNav, sourceSink, checkedLine,
} from "../ui.js";
import * as data from "../data.js";

let SRC = null;

function anchored(id, ...kids) {
  return h("div", { id }, ...kids);
}

/* One mechanism: a claim as the heading, the explanation, and the consequence.
 *
 * `sotu` is the "so what" line — the sentence that turns the mechanism back
 * into something a reader can act on. It is rendered as a note rather than
 * body text because it is the part somebody skimming should still catch, and
 * every block that has one ends on it. */
function mechanism(b) {
  return h("div", { class: "card" },
    h("h3", null, b.title),
    h("p", null, b.body),
    b.sotu ? h("p", { class: "sec__note" }, b.sotu) : null,
    SRC.add(b.sources));
}

export async function render() {
  const m = await data.market();
  if (!m?.groups?.length) {
    return empty("This section could not load.", "Check your connection and try again.");
  }

  SRC = sourceSink();
  const wrap = h("div");
  wrap.appendChild(h("h1", null, m.headline));

  /* SHORT chip labels, carried in the data as `chip` rather than reusing the
     headline.
   *
   * They were the headlines, on the reasoning that two names for one section is
   * how a jump nav starts lying about where it goes. Rendered at 390px that was
   * plainly wrong: "Why it keeps getting stronger" alone filled the strip and
   * the other five chips sat off-screen, so the nav pointed at one section and
   * hid the existence of the rest. Every other page in the app already labels
   * chips short and distinct from the heading - supervision's "A positive
   * screen", policy's "Calling 911" - and this is why.
   *
   * Falls back to the headline so a group added without a chip still renders a
   * working chip rather than an empty one. */
  wrap.appendChild(jumpNav(m.groups.map((g) => ({
    id: g.id,
    label: g.chip || g.headline,
  }))));

  /* The opener is a scope note that warns of nothing, so it is worn as .intro
     rather than a callout — the same call supervision.js made. Spending a
     severity treatment on "here is what this page is for" makes the real
     callouts further down worth less. */
  wrap.appendChild(
    h("div", { class: "intro" },
      h("h2", null, "This is the why, not the what"),
      h("p", null, m.blurb)));

  for (const g of m.groups) {
    wrap.appendChild(anchored(g.id,
      section(g.headline, null, frag(g.blocks.map(mechanism)))));
  }

  wrap.appendChild(callout("info", m.close.title, h("p", null, m.close.body)));

  /* The omission, said out loud. A reader who came looking for sourcing
     deserves to know it is absent on purpose, and the reason given is the
     honest one: none of it would make them safer. */
  wrap.appendChild(
    h("p", { class: "sec__note" },
      h("strong", null, m.scope.title + " "), m.scope.body));

  wrap.appendChild(SRC.render());
  wrap.appendChild(checkedLine("Checked", m.lastVerified));

  return wrap;
}
