/* If you inject.
 *
 * The one guide the app did not have. Skin infections are the most common
 * harm of injecting and endocarditis the most serious, and both are the
 * kind of thing a person can act on early - warm compresses, a same-day
 * clinic, a fever rule - if somebody has said the plain words. Built on
 * heat.js's shape: one data file, a section per question, sources gathered
 * once at the foot, the urgent rule in a stop callout (2026-09-09).
 *
 * WHAT IT DOES NOT DO. It does not teach technique beyond the five habits
 * that stop infections; NHRC's manual, linked from every section, is the
 * technique reference and this page sends people to it. It does not repeat
 * xylazine wound care, which lives on the xylazine page. And it gives no
 * duration for cotton fever, because no source read for this page states
 * one, and the safer rule - a fever past a day is a hospital - stands either
 * way.
 */

import { h, frag, section, callout, empty, jumpNav, sourceSink, checkedLine } from "../ui.js";
import * as data from "../data.js";

let SRC = null;

function item(it) {
  return h("div", { class: "card" },
    h("h3", null, it.t),
    h("p", null, it.d),
    it.note ? h("p", { class: "sec__note" }, it.note) : null);
}

const block = (id, g, opts = {}) =>
  h("div", { id },
    section(g.headline, g.blurb || null,
      g.lead ? h("p", { class: "leadin" }, g.lead) : null,
      g.items ? frag(g.items.map(item)) : null,
      opts.extra || null,
      g.sources ? SRC.add(g.sources) : null));

export async function render() {
  const g = await data.injection();
  if (!g) {
    return empty("This section could not load.", "Check your connection and try again.");
  }

  SRC = sourceSink();
  const wrap = h("div");
  wrap.appendChild(h("h1", null, g.headline));

  wrap.appendChild(
    jumpNav([
      { id: "sec-before", label: "Before the shot" },
      { id: "sec-missed", label: "A missed shot" },
      { id: "sec-abscess", label: "An abscess" },
      { id: "sec-fever", label: "A fever" },
      { id: "sec-endocarditis", label: "Endocarditis" },
    ]));

  wrap.appendChild(block("sec-before", g.before));
  wrap.appendChild(block("sec-missed", g.missed));
  wrap.appendChild(block("sec-abscess", g.abscess));
  wrap.appendChild(block("sec-fever", g.fever, {
    extra: g.fever.emergency
      ? callout("stop", g.fever.emergency.title, h("p", null, g.fever.emergency.body))
      : null,
  }));
  wrap.appendChild(block("sec-endocarditis", g.endocarditis));

  /* Two pointers to what already exists, never inlined: the wound care on the
     xylazine page and the testing on the Sex page are sourced there. */
  for (const p of g.pointers || []) {
    wrap.appendChild(
      h("a", { class: "bigptr", href: p.href },
        h("span", { class: "bigptr__hd" }, p.hd),
        h("span", { class: "bigptr__sub" }, p.sub)));
  }

  wrap.appendChild(
    checkedLine("Checked", g.verified,
      "Every claim here was read at its source. Where two chapters of the same "
      + "manual give different first steps, both are given in their order."));

  const foot = SRC.render();
  if (foot) wrap.appendChild(foot);

  return wrap;
}
