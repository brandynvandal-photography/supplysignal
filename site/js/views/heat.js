/* Heat, and water.
 *
 * Its own page rather than a section on Staying up, because the three people
 * who need it arrive by different doors and only one of them is dancing:
 *
 *   - somebody in a hot room on a stimulant, which is the classic case;
 *   - somebody outside in a heat wave with nowhere air-conditioned to go;
 *   - somebody whose medication has quietly stopped them sweating properly,
 *     who has no idea that is what happened.
 *
 * Rules this page keeps:
 *
 *   - THE COOLING ADVICE IS WHAT A BYSTANDER CAN ACTUALLY DO. Cold-water
 *     immersion is the treatment with the best evidence and it is useless as
 *     advice to somebody in a club toilet with a T-shirt and a cold tap. This
 *     page gives the sequence that works with what is in the room. Naming a
 *     gold standard nobody can reach reads as instructions and lands as
 *     failure.
 *   - THE WATER SECTION IS NOT A FOOTNOTE. "Drink water" is the single most
 *     repeated piece of party advice there is, and taken literally it kills
 *     people. Hyponatremia gets its own section at the same weight as heat,
 *     not a caveat hanging off the end of one.
 *   - THE OVERLAP IS THE POINT. Heat exhaustion, water intoxication and simply
 *     being high on a stimulant share most of their early signs. A page that
 *     listed three tidy symptom sets would be lying about the hardest part.
 *     Where the signs cannot be told apart, say so and give the thing that
 *     does separate them.
 *
 * FORMATTING: same surfaces as every other view - .card for prose, statgrid
 * for the ladder, callout() for the two asides that are genuinely urgent.
 */

import { h, frag, section, callout, empty, jumpNav, sourceSink, checkedLine} from "../ui.js";
import * as data from "../data.js";

let SRC = null;

function item(it) {
  return h("div", { class: "card" },
    h("h3", null, it.t),
    h("p", null, it.d),
    it.note ? h("p", { class: "sec__note" }, it.note) : null,
    it.sources ? SRC.add(it.sources) : null);
}

/** A numbered thing to do, in order. Order is the whole content here. */
function step(s, i) {
  return h("div", { class: "card" },
    h("h3", null, `${i + 1}. ${s.t}`),
    h("p", null, s.d),
    s.note ? h("p", { class: "sec__note" }, s.note) : null);
}

const block = (id, g, opts = {}) =>
  h("div", { id },
    section(g.headline, g.blurb || null,
      g.lead ? h("p", { class: "leadin" }, g.lead) : null,
      g.body ? h("div", { class: "card" }, g.body.map((t) => h("p", null, t))) : null,
      opts.before || null,
      g.items ? frag(g.items.map(item)) : null,
      g.steps ? frag(g.steps.map(step)) : null,
      g.note ? h("p", { class: "sec__note" }, g.note) : null,
      opts.extra || null,
      g.sources ? SRC.add(g.sources) : null));

export async function render() {
  const g = await data.heat();
  if (!g) {
    return empty("This section could not load.", "Check your connection and try again.");
  }

  SRC = sourceSink();
  const wrap = h("div");
  wrap.appendChild(h("h1", null, g.headline));

  wrap.appendChild(
    jumpNav([
      { id: "sec-spot", label: "Spotting it" },
      { id: "sec-cool", label: "Cooling someone" },
      { id: "sec-water", label: "Too much water" },
      { id: "sec-prevent", label: "Staying ahead of it" },
      { id: "sec-risk", label: "Who it hits hardest" },
    ]));

  /* The ladder gets the statgrid treatment rather than prose, for the same
     reason the sleep timeline does: somebody looking at a person right now
     needs to find which rung they are on in one glance, not read to it. */
  const sp = g.spot;
  wrap.appendChild(
    h("div", { id: "sec-spot" },
      section(sp.headline, null,
        h("p", { class: "leadin" }, sp.lead),
        h("div", { class: "statgrid" },
          sp.stages.map((s) =>
            h("div", { class: "card statcard" },
              h("p", { class: "stat__n" }, s.t),
              h("p", null, s.d)))),
        sp.body ? h("div", { class: "card" }, sp.body.map((t) => h("p", null, t))) : null,
        sp.emergency
          ? callout("stop", sp.emergency.title,
              h("p", null, sp.emergency.body),
              sp.emergency.detail ? h("p", null, sp.emergency.detail) : null)
          : null,
        SRC.add(sp.sources))));

  /* Cooling and the "do not" list ship together. Separating them would let
     somebody act on the first half of the page. */
  wrap.appendChild(block("sec-cool", g.cool, {
    extra: g.cool.never
      ? callout("warn", g.cool.never.title,
          h("ul", null, g.cool.never.items.map((t) => h("li", null, t))))
      : null,
  }));

  wrap.appendChild(block("sec-water", g.water, {
    extra: g.water.emergency
      ? callout("stop", g.water.emergency.title, h("p", null, g.water.emergency.body))
      : null,
  }));

  wrap.appendChild(block("sec-prevent", g.prevent));
  wrap.appendChild(block("sec-risk", g.risk));

  wrap.appendChild(
    checkedLine("Checked", g.verified,
      "Where this page and common party advice disagree, it follows the clinical "
      + "evidence and says so."));

  const foot = SRC.render();
  if (foot) wrap.appendChild(foot);

  return wrap;
}
