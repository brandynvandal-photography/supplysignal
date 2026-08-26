/* Early warning - substances turning up elsewhere, ahead of local reporting.
 *
 * This screen is deliberately walled off from the county views, and that
 * separation is the whole design.
 *
 * Neither feed is local to anyone reading this. Health Canada's file is
 * Canadian law-enforcement seizures; CFSRE's alerts are national US. Put either
 * one on a county page and a reader will take it as a statement about their
 * neighbourhood, which would be worse than showing nothing - it would
 * manufacture false confidence about a threat that may or may not be there.
 *
 * What these ARE good for is lead time. Xylazine, then medetomidine, then the
 * nitazenes each appeared in forensic surveillance before comparable local
 * signal existed. So this page answers "what should I know about before it gets
 * here", and never "what is in my area". The copy says that out loud, at the
 * top, in words rather than in a tooltip.
 *
 * No counts framed as rates, no province breakdown, no prevalence. A first
 * detection is a date and a name; that is all it honestly is. */

import {
  h, frag, section, subsection, callout, extLink, empty, badge, disclosure, sourcesDisclosure,
} from "../ui.js";
import * as data from "../data.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

function monthYear(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(+d) ? iso : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export async function render(route, { go }) {
  const doc = await data.emerging();
  const wrap = h("div");

  wrap.appendChild(
    h("button", { type: "button", class: "btn btn--ghost btn--sm", onClick: () => go("#/alerts") },
      h("span", { "aria-hidden": "true" }, "‹"), " Alerts")
  );

  wrap.appendChild(
    h("div", { class: "county-head" },
      h("h1", null, "Early warning"),
      h("p", { class: "classcard__hint" },
        "Substances being identified elsewhere, often before they are documented locally."))
  );

  /* The framing has to do real work here, so it is a callout rather than fine
     print, and it is the first thing on the page. */
  wrap.appendChild(
    callout("warn", "None of this is about your area",
      h("p", null,
        "Everything below is ", h("strong", null, "national"),
        " — from Canada’s drug-testing lab and a US forensic science center. " +
        "None of it tells you whether any of these have reached your county."),
      h("p", null,
        "It is here so that a drug is not brand new to you the first time you meet it."))
  );

  /* ---- US alerts ---- */
  if (doc.alerts?.length) {
    /* A SUBHEADING, NOT A SECTION HEAD. Asked for 2026-08-26.
     *
     * The h2 stays an h2 - the outline, the jump chips and reveal()'s
     * match-by-visible-text all key off it, and demoting the element to fit a
     * visual weight would cost all three. What changes is the treatment: the
     * same .subhead the map's ranked lists use, so it reads as a label over
     * the cards rather than as a peer of "Early warning" itself. */
    wrap.appendChild(
      subsection("Published alerts", "United States, national",
        frag(doc.alerts.map((a) =>
          h("div", { class: "card" },
            h("div", { class: "card__top" },
              badge("Alert", "neutral"),
              h("time", { class: "card__meta", datetime: a.date }, monthYear(a.date))),
            h("h3", null, a.title),
            h("div", { class: "sources" }, extLink(a.url, "Read the alert"))))))
    );
  }

  /* ---- Canadian first detections, grouped by what the substance is ----
   *
   * This was 96 bare names and dates, which is the most honest thing the feed
   * itself carries - Health Canada publishes a name and a date, no class, no
   * description - and also nearly unreadable. "Methylclonazepam, first
   * identified June 2026" tells a reader nothing unless they already know what
   * it is, and 96 of those in a column is 96 lookups.
   *
   * So the class is the row, the substances sit inside it, and the same
   * disclosure the alerts screen uses does the opening.
   *
   * WHAT WE ARE ALLOWED TO SAY ABOUT A SUBSTANCE. Only what is already
   * published in this app or by a lab, in that order:
   *   1. our own entry, when the name matches one - its class, and its plain
   *      description where one has been written, and a link to the full page;
   *   2. NIST RaDAR's printed class, when the same compound turned up there;
   *   3. nothing.
   *
   * Nothing is inferred from the NAME. The suffixes are tempting - -azolam and
   * -azepam really do mean benzodiazepine nearly every time - but "nearly
   * every time" is how Tetracaine becomes a stimulant and Hydrochlorothiazide
   * becomes an opioid, and a wrong class here is worse than no class at all.
   * 71 of the 96 land in the last bucket today and it says so in words.
   *
   * Groups are ordered by their most recent detection, because recency is what
   * this feed is for; the undescribed group sits last whatever its dates. */
  if (doc.firstDetections?.length) {
    const known = await describeFirstDetections(doc.firstDetections);

    wrap.appendChild(
      section("First detections", "Canada, national",
        h("p", { class: "sec__note" },
          "Substances Canada’s national lab identified for the first time in a sample " +
          "submitted to it. A first detection means a drug exists and has been " +
          "confirmed somewhere — not that it is common, and not that it is here."),
        h("div", { class: "list newly" }, known))
    );
  }

  /* ---- RaDAR: first detections in US samples, by coast ----
   *
   * THIS SCREEN, NOT THE COUNTY PAGE. The county view deliberately links here
   * rather than inlining national data, because "the moment national data
   * renders inside a county page a reader takes it as local". A coast-level
   * finding has exactly that failure mode and worse - it has no state either -
   * so it lives where the page has already said, in a callout above, that none
   * of this is about your area.
   *
   * The section names the coast in its own subtitle rather than per row, so
   * the geography is stated once and cannot be missed by someone scanning. */
  const byCoast = await data.alertsRegional(365);
  if (byCoast.length) {
    /* ONE SECTION, COAST ON THE ROW.
     *
     * This grouped by region and emitted a section per coast, so the page
     * carried two headings reading "Newly detected in US samples" one after
     * the other - which reads as a mistake rather than as a grouping, and
     * reported as one. The geography belongs on the row anyway: a reader
     * scanning a list does not re-read a heading to find out where they are,
     * which is the same reason the homepage puts it there. */
    const label = { west: "West Coast", east: "East Coast", national: "United States" };
    wrap.appendChild(
      section("Newly detected in US samples",
        `${byCoast.length} in the last 12 months`,
        h("p", { class: "sec__note" },
          "Compounds a federal lab identified in submitted samples for the first "
          + "time. Samples are voluntarily submitted and may not be representative "
          + "of the wider drug supply. The finest location this data has is a coast — "
          + "it is not county-level, and it does not say whether any of these is here."),
        frag(byCoast.map((c) => {
          const src = c.sources?.[0];
          const body = frag(
            h("div", { class: "card__top" },
              badge(label[c.region] || "United States", "neutral"),
              h("time", { class: "card__meta", datetime: c.eventDate }, monthYear(c.eventDate))),
            h("h3", null, c.substances?.[0] || c.headline),
            c.summary ? h("p", null, c.summary) : null);
          return src?.url
            ? extLink(src.url, body, "card card--link")
            : h("div", { class: "card" }, body);
        })))
    );
  }

  if (!doc.alerts?.length && !doc.firstDetections?.length) {
    wrap.appendChild(
      empty("The early-warning feed didn’t load with this copy of the app.",
        "Try reloading. If it keeps happening, this copy is incomplete.")
    );
  }

  /* ---- global systems, link-out only ---- */
  if (doc.globalLinks?.length) {
    wrap.appendChild(
      section("Wider than North America", null,
        h("p", { class: "sec__note" },
          "These systems watch other continents. Neither offers a feed this app " +
          "could bundle, so they are links to check."),
        frag(doc.globalLinks.map((s) =>
          h("div", { class: "card" },
            h("h3", null, s.name),
            h("p", { class: "card__meta" }, s.author),
            h("p", null, s.note),
            h("div", { class: "sources" }, extLink(s.url, "Visit")))))));
  }

  /* Attribution is a licence condition for Health Canada, not a courtesy.
     In the app's own disclosure like every other section, and like the same
     block on every other page - it was a plain section here and a bulleted
     footer elsewhere, for the same job. */
  if (doc.sources?.length) {
    wrap.appendChild(
      sourcesDisclosure("Where this data comes from",
        frag(doc.sources.map((s) =>
          h("div", { class: "card" },
            h("h3", null, s.name),
            h("p", { class: "card__meta" }, `${s.author} · ${s.scope}`),
            h("p", null, s.note),
            h("div", { class: "sources" }, extLink(s.url, "Source"))))))
    );
  }

  return wrap;
}

/* Group the first detections by class, describing each only from what is
   already published here or by a lab. See the block comment at the call site
   for why nothing is inferred from the substance's name. */
const NO_CLASS = "No published description";

async function describeFirstDetections(items) {
  const [subsDoc, regional] = await Promise.all([
    data.substances().catch(() => null),
    data.alertsRegional(365).catch(() => []),
  ]);

  const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const byName = new Map();
  for (const s of subsDoc?.substances || []) {
    byName.set(norm(s.name), s);
    for (const a of s.aliases || []) if (!byName.has(norm(a))) byName.set(norm(a), s);
  }
  const printed = new Map();
  for (const c of regional) {
    if (c.printedClass) printed.set(norm(c.substanceHint || c.substances?.[0]), c.printedClass);
  }

  const groups = new Map();
  for (const d of items) {
    const key = norm(d.substance);
    const s = byName.get(key);
    const label = s
      ? (s.class?.psychoactive?.[0] || s.class?.chemical?.[0] || NO_CLASS)
      : (printed.get(key) ? sentenceCase(printed.get(key)) : NO_CLASS);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push({ ...d, entry: s || null });
  }

  /* Newest first inside a group, and groups ordered by their newest - except
     the undescribed one, which goes last however fresh it is: it is the
     absence of an answer, not an answer. */
  const newest = (rows) => rows.reduce((m, r) => (r.date > m ? r.date : m), "");
  const ordered = [...groups.entries()]
    .map(([label, rows]) => [label, rows.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))])
    .sort((a, b) => {
      if (a[0] === NO_CLASS) return 1;
      if (b[0] === NO_CLASS) return -1;
      return newest(b[1]).localeCompare(newest(a[1]));
    });

  return ordered.map(([label, rows]) => h("details", { class: "acc" },
    h("summary", null, h("span", null, label), badge(String(rows.length), "neutral")),
    h("div", { class: "acc__body" },
      label === NO_CLASS
        ? h("p", { class: "sec__note" },
            "The lab confirmed these exist in a sample. Nothing here has a published "
            + "entry in this app, and we do not guess a class from a chemical name.")
        : null,
      h("div", { class: "list" }, rows.map(firstDetRow)))));
}

/* A row links to the substance's own page when there is one - that is where
   the full description, the interactions and the reagent results live, and it
   is what "click into more detail" has to mean here. Where there is no page
   the row is not a link, and says only the two things the feed actually
   carries: the name and when it was first identified. */
function firstDetRow(d) {
  const when = `first identified ${monthYear(d.date)}`;
  const inner = frag(
    h("span", { class: "nbr__text" },
      h("span", { class: "nbr__name" }, d.substance),
      h("span", { class: "nbr__sub nbr__sub--wrap" },
        d.entry?.description ? `${firstSentence(d.entry.description)} · ${when}` : when)));

  return d.entry
    ? h("a", { class: "nbr", href: `#/substances/${d.entry.id}` },
        inner, h("span", { class: "nbr__right" }, h("span", { "aria-hidden": "true" }, "\u203A")))
    : h("div", { class: "nbr nbr--flat" }, inner);
}

/* One sentence of a description that runs to paragraphs on the substance's own
   page. Cut at the first full stop that ends a sentence rather than one inside
   a decimal or an abbreviation. */
function firstSentence(text) {
  const m = String(text).match(/^.*?[.!?](?=\s+[A-Z(]|$)/);
  return (m ? m[0] : String(text)).trim();
}

function sentenceCase(x) {
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : x;
}
