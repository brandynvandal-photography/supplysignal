/* Sex, and being out.
 *
 * The framing rule, which is the whole reason this page reads the way it does:
 * the standard nightlife safety list is not merely unevidenced, it is
 * counterproductive. In a review of nightlife sexual-harm prevention, people
 * given victim-focused prevention tips went on to blame victims MORE than
 * people given perpetrator-focused ones. So this page is built around what a
 * reader can do for other people, what actually reduces risk, and what to do
 * afterwards - not a list of precautions that implies fault.
 *
 * Second rule: where a product is sold for safety and does not work, say so.
 * The drink-strip section is the sharpest thing here, and it exists because a
 * false negative is worse than no test at all.
 *
 * FORMATTING: same three surfaces as every other view - .card for prose, .card
 * bubbles for items, callout() for asides. Jump nav under the title, blurb
 * after, anchors on wrapper divs because section() returns a fragment.
 */

import { h, frag, section, callout, empty, jumpNav, sourceSink } from "../ui.js";
import * as data from "../data.js";

let SRC = null;

function item(it) {
  return h("div", { class: "card" },
    h("h3", null, it.t),
    h("p", null, it.d),
    it.note ? h("p", { class: "sec__note" }, it.note) : null,
    it.sources ? SRC.add(it.sources) : null);
}

const block = (id, g) =>
  h("div", { id },
    section(g.headline, g.blurb || null,
      frag((g.items || []).map(item)),
      g.sources ? SRC.add(g.sources) : null));

export async function render() {
  const g = await data.sex();
  if (!g) {
    return empty("This section could not load.", "Check your connection and try again.");
  }

  SRC = sourceSink();
  const wrap = h("div");
  wrap.appendChild(h("h1", null, g.headline));

  wrap.appendChild(
    jumpNav([
      { id: "sec-framing", label: "How this is written" },
      { id: "sec-spiking", label: "Drink spiking" },
      { id: "sec-barriers", label: "Barriers" },
      { id: "sec-prep", label: "PrEP and PEP" },
      { id: "sec-ec", label: "Emergency contraception" },
      { id: "sec-interactions", label: "Dangerous mixes" },
      { id: "sec-out", label: "Long nights" },
    ]));

  wrap.appendChild(h("p", { class: "sec__note" }, g.blurb));

  const f = g.framing;
  wrap.appendChild(
    h("div", { id: "sec-framing" },
      section(f.headline, null,
        h("div", { class: "card" }, f.body.map((t) => h("p", null, t))),
        SRC.add(f.sources))));

  wrap.appendChild(block("sec-spiking", g.spiking));
  wrap.appendChild(block("sec-barriers", g.barriers));
  wrap.appendChild(block("sec-prep", g.prep));
  wrap.appendChild(block("sec-ec", g.ec));

  /* The one section that earns a severity treatment: everything in it can put
     somebody in an emergency room tonight. */
  wrap.appendChild(
    h("div", { id: "sec-interactions" },
      section(g.interactions.headline, null,
        callout("stop", "These are the ones that land people in the hospital",
          h("p", null,
            "Not a general warning about mixing. Three specific combinations, "
            + "each with a documented mechanism.")),
        frag(g.interactions.items.map(item)))));

  wrap.appendChild(block("sec-out", g.out));

  /* The nightlife block above says overheating and over-drinking in three
     sentences, which is the right length for somebody skimming before they go
     out and the wrong length for somebody using it on the night. */
  wrap.appendChild(
    h("a", { class: "bigptr", href: "#/heat" },
      h("span", { class: "bigptr__hd" }, "Heat, and water"),
      h("span", { class: "bigptr__sub" },
        "The long version: spotting heat stroke when they are still sweating, "
        + "cooling somebody down with what is in the room, and how much water is "
        + "too much.")));

  wrap.appendChild(
    h("p", { class: "sec__note" },
      `Checked ${g.verified}. Guidance and access rules change — anything here ` +
      "without a date should be treated as unverified."));

  const foot = SRC.render();
  if (foot) wrap.appendChild(foot);

  return wrap;
}
