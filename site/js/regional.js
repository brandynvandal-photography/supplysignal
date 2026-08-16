/* "What is characteristic of this part of the country."
 *
 * Rendered from data/regional.json (UNC, CC0) in two places: on a county page,
 * scoped to that county's Census region, and on the Substances page as the
 * whole picture.
 *
 * The reason this earns space in a county-level tool is the finding itself.
 * Only 20 of 90 routinely-detected substances appear everywhere at similar
 * rates; the rest cluster regionally, some almost entirely in one region. That
 * is the evidence behind the whole premise of this app - a national number is
 * wrong nearly everywhere, and what is next door matters more than what is
 * average.
 */

import { h, frag, section, callout, extLink, badge } from "./ui.js";
import * as data from "./data.js";

/** Substances most concentrated in `region`, most concentrated first. */
function topFor(doc, region, limit = 10) {
  const i = doc.regions.indexOf(region);
  if (i < 0) return [];
  return doc.substances
    .filter((s) => s.group === region)
    .map((s) => ({ ...s, pct: Math.round(s.share[i] * 100), rate: s.rate[i] }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit);
}

function substanceRow(s) {
  return h("div", { class: "regrow" },
    h("div", { class: "regrow__head" },
      h("span", { class: "regrow__name" }, s.name),
      h("span", { class: "regrow__pct" }, `${s.pct}%`)),
    // The bar restates the number visually; the number is always present, so
    // the bar is reinforcement rather than the only signal.
    h("div", { class: "regbar", role: "presentation" },
      h("i", { class: "regbar__fill", "data-w": String(s.pct) })),
    s.desc ? h("p", { class: "regrow__desc" }, s.desc) : null);
}

function paintBars(root) {
  // CSS forbids inline styles under our CSP, so widths are applied here.
  root.querySelectorAll(".regbar__fill").forEach((el) => {
    el.style.width = `${Math.max(2, Number(el.dataset.w) || 0)}%`;
  });
}

/**
 * County-scoped block. `state` is a postal code.
 * Returns null when the state has no Census region (the territories), rather
 * than guessing one.
 */
export async function regionalForState(state, countyName) {
  const doc = await data.regional();
  if (!doc?.substances?.length) return null;

  const region = doc.stateRegion?.[state];
  if (!region) return null;

  const top = topFor(doc, region, 8);
  if (!top.length) return null;

  const node = h("details", { class: "acc" },
    h("summary", null,
      h("span", null, `Characteristic of the ${region}`),
      badge(`${top.length}`, "neutral")),
    h("div", { class: "acc__body" },
      h("p", { class: "sec__note" },
        `Substances that drug checking finds far more often in the ${region} than ` +
        `elsewhere. This is a regional pattern, not a report about ${countyName} — ` +
        `it is context for what a local result might mean.`),
      top.map(substanceRow),
      h("p", { class: "sec__note" }, doc.caveat),
      h("div", { class: "sources" },
        h("span", { class: "card__meta" }, "Source:"),
        extLink(doc.source.url, doc.source.attribution))));

  paintBars(node);
  return node;
}

/**
 * The regional dataset's provenance, as one entry for a "Where this comes
 * from" list. Returns null if the bundle is missing, so the list simply omits
 * it rather than showing a source for data that never loaded.
 *
 * Kept here, next to the view that renders the data, so the two cannot drift -
 * an attribution living in another file is an attribution nobody updates.
 */
export async function uncAttribution() {
  const doc = await data.regional();
  if (!doc?.source) return null;
  return {
    url: doc.source.url,
    source: doc.source.attribution,
    license: doc.source.license,
    period: doc.period,
    note: doc.caveat,
  };
}

/** Full picture, for the Substances page. */
export async function regionalOverview() {
  const doc = await data.regional();
  if (!doc?.substances?.length) return null;

  const wrap = h("div");

  wrap.appendChild(
    callout("info", doc.headline,
      h("p", null, doc.summary))
  );

  const counts = doc.groupCounts || {};
  wrap.appendChild(
    h("div", { class: "chips" },
      [...doc.regions, "Ubiquitous"].map((r) =>
        h("span", { class: "tag" }, `${counts[r] || 0} ${r}`)))
  );

  for (const region of doc.regions) {
    const top = topFor(doc, region, 6);
    if (!top.length) continue;
    const block = h("details", { class: "acc" },
      h("summary", null,
        h("span", null, region),
        badge(`${counts[region] || 0} drugs`, "neutral")),
      h("div", { class: "acc__body" },
        /* The same line the county page puts on this block, and it was missing
           here. Opened cold, these rows are a drug name and a percentage with
           nothing saying what the percentage IS - a reader can reasonably take
           "62%" as "62% of samples here contained it" when it means 62% of the
           times that drug was detected happened here. The "Everywhere" block
           below has carried its explanation all along; the four that need it
           more had none.

           Inside each block rather than once above them, for the same reason
           the county page does it that way: these are collapsed by default, so
           somebody opens one and reads it on its own. */
        h("p", { class: "sec__note" },
          `Substances that drug checking finds far more often in the ${region} ` +
          "than elsewhere. The figure is the share of that drug's detections " +
          "that happened here, not how common it is here."),
        top.map(substanceRow)));
    paintBars(block);
    wrap.appendChild(block);
  }

  const ubiq = doc.substances.filter((s) => s.group === "Ubiquitous");
  if (ubiq.length) {
    wrap.appendChild(
      h("details", { class: "acc" },
        h("summary", null,
          h("span", null, "Everywhere"),
          badge(`${ubiq.length}`, "neutral")),
        h("div", { class: "acc__body" },
          h("p", { class: "sec__note" },
            "These saturate the supply nationwide — no region accounts for more " +
            "than a third of their detections. Fentanyl and methamphetamine are " +
            "in this group."),
          h("div", { class: "tags" },
            ubiq.map((s) => h("span", { class: "tag" }, s.name)))))
    );
  }

  /* The sampling caveat, the date range, the attribution and the licence used
     to sit here as a footer under the region tiles. They are source
     information, and source information belongs in one place - "Where this
     comes from" at the foot of the page - rather than repeated as a slab of
     grey metadata in the middle of the reading. See uncAttribution() below,
     which the Substances page folds into that list.

     The short subtitle stays. "Only 20 of 90 drugs turn up everywhere" is
     the finding itself, not provenance, and it costs one line. */
  return section("Drugs are regional", "Only 20 of 90 drugs turn up everywhere", wrap);
}
