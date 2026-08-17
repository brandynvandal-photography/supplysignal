/* Staying up, and coming down.
 *
 * Two subjects on one page because they arrive together: the person who has
 * been awake for three days and the person seeing things are frequently the
 * same person, and splitting them would make the reader assemble the
 * connection themselves at the worst possible moment.
 *
 * The rule that shapes this page: where the evidence cannot separate the drug
 * from the sleep, SAY SO. Sleep loss alone producing psychosis in drug-free
 * volunteers is solid. Methamphetamine alone producing it dose-dependently is
 * solid. The two multiplying is not established, and the page says that
 * outright rather than implying a mechanism nobody has demonstrated - because
 * the reader is going to be told the confident version everywhere else.
 *
 * The "calling for help" section exists because reassurance here would be a
 * lie. The numbers are given so somebody can decide, with the one thing that
 * is not negotiable stated plainly: overheating and not breathing are still
 * 911, whatever the risk.
 *
 * FORMATTING: same surfaces as every other view.
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

const block = (id, g, opts = {}) =>
  h("div", { id },
    section(g.headline, g.blurb || null,
      g.lead ? h("p", { class: "leadin" }, g.lead) : null,
      g.body ? h("div", { class: "card" }, g.body.map((t) => h("p", null, t))) : null,
      g.items ? frag(g.items.map(item)) : null,
      g.note ? h("p", { class: "sec__note" }, g.note) : null,
      opts.extra || null,
      g.sources ? SRC.add(g.sources) : null));

export async function render() {
  const g = await data.stimulants();
  if (!g) {
    return empty("This section could not load.", "Check your connection and try again.");
  }

  SRC = sourceSink();
  const wrap = h("div");
  wrap.appendChild(h("h1", null, g.headline));

  wrap.appendChild(
    jumpNav([
      { id: "sec-sleep", label: "Being awake" },
      { id: "sec-hallucination", label: "When it gets strange" },
      { id: "sec-interaction", label: "Sleep and the drug" },
      { id: "sec-psychosis", label: "Stimulant psychosis" },
      { id: "sec-helping", label: "Helping someone" },
      { id: "sec-calling", label: "Calling for help" },
      { id: "sec-coming", label: "Coming down" },
    ]));

  wrap.appendChild(block("sec-sleep", g.sleep));

  /* The timeline gets its own treatment rather than being prose. Somebody
     three days in needs to find where they are on it in one glance. */
  const hl = g.hallucination;
  wrap.appendChild(
    h("div", { id: "sec-hallucination" },
      section(hl.headline, null,
        h("p", { class: "leadin" }, hl.lead),
        h("div", { class: "statgrid" },
          hl.stages.map((s) =>
            h("div", { class: "card statcard" },
              h("p", { class: "stat__n" }, s.t),
              h("p", null, s.d)))),
        h("div", { class: "card" }, hl.body.map((t) => h("p", null, t))),
        callout("info", "If this is happening to you right now", h("p", null, hl.note)),
        SRC.add(hl.sources))));

  wrap.appendChild(block("sec-interaction", g.interaction));
  wrap.appendChild(block("sec-psychosis", g.psychosis));

  wrap.appendChild(block("sec-helping", g.helping, {
    extra: callout("stop", g.helping.emergency.title,
      h("p", null, g.helping.emergency.body)),
  }));

  /* Heat has its own page rather than a section here, because the people it
     kills are not all on a stimulant. This is the door for the ones who are. */
  wrap.appendChild(
    h("a", { class: "bigptr", href: "#/heat" },
      h("span", { class: "bigptr__hd" }, "Heat, and water"),
      h("span", { class: "bigptr__sub" },
        "Overheating is the most likely way this becomes an emergency, and the "
        + "fastest. Spotting it, cooling them down with what is in the room, and "
        + "why giving them water to drink can be the wrong move.")));

  wrap.appendChild(block("sec-calling", g.calling));
  wrap.appendChild(block("sec-coming", g.coming));

  wrap.appendChild(
    h("p", { class: "sec__note" },
      `Checked ${g.verified}. Where the evidence is thin or contested, this page says so.`));

  const foot = SRC.render();
  if (foot) wrap.appendChild(foot);

  return wrap;
}
