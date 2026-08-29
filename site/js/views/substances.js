/* Substance reference and the combination checker.
 *
 * The checker is the point of this view. Most overdose deaths involve more than
 * one substance, and the deadly pairs are boringly consistent - opioids with
 * benzodiazepines, opioids with alcohol - because both sides suppress
 * breathing. Answering "I took X, what happens if I add Y" is the single most
 * useful thing this app can do for someone standing in a room deciding.
 *
 * Everything is looked up in memory against the bundled files. Typing a drug
 * name here produces no network request, which is deliberate: a live API call
 * would tell a third party exactly which substance someone was asking about. */

import {
  h, frag, clear, section, callout, badge, extLink, empty, englishOnlyNotice, group,
  jumpNav, disclosure, sourcesDisclosure, skeleton, SEV_GLYPH, checkedLine,} from "../ui.js";
import * as data from "../data.js";
import { CLASSES, classInfo, groupAll } from "../taxonomy.js";
import { draw as drawStructure } from "../structure.js";
import { reagentLabel } from "../reagentnames.js";
import { matchSubstance } from "../substancematch.js";
import { liveRegion, dropRow, slotLabel, removeButton, relabelRows } from "../slots.js";

/* `label` is what renders; the KEY is TripSit's verbatim status, kept for
   data fidelity and shown in the definitions block. The raw terms are chart
   jargon ("Low Risk & Decrease") and, worse, they put the words "Low Risk"
   in the app's own mouth about a drug combination - the closest this app
   ever came to calling something safe. The labels state the mechanism
   instead and never grade safety. */
/* Every name a substance can be FOUND by, which is not every name it should be
   SHOWN as. data.js keeps misleading street names in `searchAliases` rather
   than `aliases`, so that 2C-B can be reached by typing "tusi" without the page
   claiming 2C-B is also called that. Matching uses both; display uses aliases.
   The matcher itself lives in substancematch.js now, shared with the sold-as
   picker on Test — which needs the same names but must NOT take a searchAlias
   hit silently; see the note there. Here a searchAlias hit is safe: the page
   it opens leads with the warning. */
const matches = (s, t) => matchSubstance(s, t) !== null;

const RISK = {
  Dangerous: { kind: "critical", glyph: SEV_GLYPH.critical, rank: 0, label: "Dangerous" },
  Unsafe: { kind: "critical", glyph: SEV_GLYPH.critical, rank: 1, label: "Unsafe" },
  Caution: { kind: "elevated", glyph: SEV_GLYPH.elevated, rank: 2, label: "Caution" },
  /* "Reduce"/"Amplify each other", not "EFFECTS reduce each other". The longer
     pair needed 203px and the badge gets 183-200px at 375px - three nested
     card paddings deep, that is all the room there is - so both wrapped to two
     lines inside a pill and read as a mistake. "Effects" was the droppable
     word: the badge sits on a combination result, so what is reducing or
     amplifying is not in question. The mechanism is still stated and neither
     one grades safety, which is the rule this table exists to keep. */
  "Low Risk & Decrease": { kind: "neutral", glyph: SEV_GLYPH.neutral, rank: 3, label: "Reduce each other" },
  "Low Risk & No Synergy": { kind: "neutral", glyph: SEV_GLYPH.neutral, rank: 4, label: "No known interaction" },
  "Low Risk & Synergy": { kind: "neutral", glyph: SEV_GLYPH.neutral, rank: 5, label: "Amplify each other" },
  Unknown: { kind: "neutral", glyph: "?", rank: 6, label: "No data" },
};

export async function render(route, ctx) {
  /* Warm the index page's bundles before the gate below, not after it.
     Everything the index needs is independent of the substance list, so there
     is no reason for it to queue behind a 250KB parse.

     Guarded on the route: a detail or class page does not use any of these,
     and speculatively pulling four bundles someone will not look at is how a
     "fast" app spends a metered connection on nothing. */
  const warmIndex = !route.id;
  const pre = warmIndex
    ? [data.rx(), data.conditions(), data.regional(), import("../regional.js")]
    /* A detail page is the ONLY thing that renders reagent colors, so it is
       the only route that pays for that bundle - started here so it arrives
       alongside the drug list instead of after it. A class page renders
       neither and warms nothing. */
    : route.id !== "class" ? [data.reagentsFor(route.id)] : [];
  pre.forEach((p) => p.catch(() => {}));

  /* Started together; only the index gets to skip waiting on combos. */
  const combosP = data.combos();
  combosP.catch(() => {});

  const subs = await data.substances();
  if (!subs?.substances?.length) {
    return empty("The drug reference didn’t load with this copy of the app.",
      "Try reloading. If it keeps happening, this copy is incomplete.");
  }

  if (route.id === "class") return classView(route.sub, subs, ctx);
  /* The detail page genuinely needs the matrix to render interactions, so it
     still waits. The index does not - see the note at mixSlot. */
  if (route.id) return detailView(route.id, subs, await combosP, ctx);
  return indexView(subs, combosP, ctx);
}

/* ================================================================ index == */

async function indexView(subs, combosP, { go }) {
  /* Bundles were started in render() above - see the note there. Nothing is
     awaited here; data.js shares one in-flight promise per bundle, so the
     awaits further down find the work already done and the page order is
     unchanged. Without this the requests went out in a staircase, each one
     waiting for the section above it to render. On localhost that is
     invisible. On a phone it is one round trip per step. */
  const regionalMod = import("../regional.js");
  regionalMod.catch(() => {});

  const wrap = h("div");
  wrap.appendChild(h("h1", null, "Drugs"));
  { const n = englishOnlyNotice(); if (n) wrap.appendChild(n); }

  /* This page never said what it was. Every other tab opens by telling you,
     and this is the one people arrive at holding a name they half-remember. */
  wrap.appendChild(
    /* "Is this mix dangerous?" not "Combination checker": the chip should ask
       the reader's question, not name the tool. Its target is unchanged.
       "Your situation" lands ahead of "Food and drink" because the situation
       group renders inside the checker (directly under the verdict) while food
       is a sibling below it - so in DOM order the situation comes first, and
       the strip has to match the page (see the chip-order test). */
    jumpNav([
      { id: "sec-find", label: "Find a drug" },
      { id: "sec-checker", label: "Is this mix dangerous?" },
      { id: "grp-yours", label: "Your situation" },
      { id: "sec-food", label: "Food and drink" },
      { id: "sec-market", label: "Why the supply is like this" },
    ]));

  /* ---- search ---- */
  const input = h("input", {
    class: "input", type: "text", autocomplete: "off", spellcheck: "false",
    "aria-label": "Search drugs",
    placeholder: "Search a drug — fentanyl, xylazine, MDMA…",
  });
  const list = h("div", { class: "list" });

  /* Browsing by class is the default way in; search takes over the moment
     someone types, because a person who knows the name should never have to
     work out which class it lives in first. */
  const { groups } = groupAll(subs.substances);
  const browse = h("div", { class: "classgrid" },
    CLASSES.map((c) => {
      const n = groups.get(c.slug).length;
      if (!n) return null;
      /* data-class carries the slug so the stylesheet can colour the card
         without a second list of names to keep in step with CLASSES. Six of
         the ten have a hue; the rest fall through to the neutral default. */
      return h("button", {
          type: "button", class: "classcard", "data-class": c.slug,
          onClick: () => go(`#/substances/class/${c.slug}`),
        },
        h("span", { class: "classcard__label" }, c.label),
        h("span", { class: "classcard__hint" }, c.hint),
        h("span", { class: "classcard__n" }, `${n} drugs`));
    }));

  const paint = (term) => {
    const t = term.trim().toLowerCase();
    clear(list);

    if (!t) {                       // nothing typed - show the way in, not a list
      list.appendChild(browse);
      return;
    }

    const hits = subs.substances
      .filter((s) => matches(s, t))
      .slice(0, 40);

    if (!hits.length) {
      list.appendChild(empty("No match.",
        "Try another name, or browse by class."));
      return;
    }
    for (const s of hits) list.appendChild(row(s, go));
  };

  input.addEventListener("input", () => paint(input.value));

  wrap.appendChild(
    h("div", { id: "sec-find" },
      section("Find a drug", `${subs.substances.length} with published data`,
        h("div", { class: "search" }, h("div", { class: "search__row" }, input)),
        list))
  );
  paint("");

  /* Order changed 2026-08-11. The module header says the checker is the point
     of this view, and it still is - but it was FIRST, which made the page open
     on a form. Search leads now for two reasons: most people arrive holding a
     name rather than a pair, and the checker's dropdowns use category names
     ("opioids", "benzodiazepines") that the search and class grid are what
     teach you. The checker is second, still above the fold on a phone.

     The two qualifier sections are grouped rather than stacked: neither is
     something you read on the way in, both are "does my situation change
     this", and as siblings they made a six-block page out of a four-block
     one. */
  /* The checker fills in when its data lands, rather than holding the whole
     page hostage to it.

     combos.json is 165KB and NOTHING above this line needs it - the search,
     the class grid and the counts all come from the drug list. Awaiting it
     before the first paint meant the page someone came for waited on a
     feature they may never touch. The container is appended in place now and
     populated a moment later, so the layout order is unchanged and nothing
     jumps except this one block appearing.

     Reserved height, so the sections below do not shift downward when it
     arrives - see .checkerslot. */
  /* aria-busy + a skeleton while combos.json (165KB) is in flight, so the slot
     reads as "loading" rather than as an empty gap the eye skips past - and
     .checkerslot already reserves its height so nothing below jumps when the
     checker lands. Both are cleared when replaceChildren fills it below. */
  const mixSlot = h("div", { class: "checkerslot", id: "sec-checker", "aria-busy": "true" },
    skeleton(3));
  wrap.appendChild(mixSlot);

  /* Built here, rendered inside the checker below - see the note in
     mixChecker for why it belongs with the result rather than after it. */
  /* Food and drink, under the checker rather than under "your situation".
   *
   * The ask was a diet and wellbeing section. This is not that, and the
   * difference is the whole point: "wellbeing" tells somebody to be healthier,
   * which this app does not do, and generic nutrition advice is unusable at
   * three in the morning. What survives the filter is the short list of things
   * people eat and drink that change what a DOSE does — which makes them
   * combinations, and puts them here, next to the chart that rates the others.
   *
   * "Your situation" was the other candidate and it is the wrong shelf: every
   * item there answers "given this fact about me, what is different" — a
   * prescription, a heart condition. Food is not a fact about you.
   *
   * Built from RESOLVED combos and filled into a slot below, because the index
   * deliberately does not wait on that bundle. Reading `combos` directly here
   * is what took the whole Drugs tab down: this function is handed combosP, a
   * promise, and the name simply was not in scope. */
  const foodBlockFrom = (combos) => (combos?.food
    ? disclosure("sec-food", combos.food.headline, null,
        frag(combos.food.items.map((x) =>
          h("div", { class: "card" },
            h("h3", null, x.t),
            h("p", null, x.d),
            x.note ? h("p", { class: "sec__note" }, x.note) : null,
            x.sources?.length
              ? h("div", { class: "sources" }, x.sources.map((z) => extLink(z.url, z.name)))
              : null))),
        combos.food.sourceNote
          ? h("p", { class: "sec__note" }, combos.food.sourceNote) : null)
    : null);

  /* Open with the lens when the lens has picks (see conditionLens): an open
     child inside a shut parent is still a shut box, and the picks a reader
     left applied would be hidden behind two taps instead of none. */
  const yoursGroup = group("grp-yours", "Does your situation change the picture?",
    "Prescribed medication and health conditions both change what a combination does.", [
      await rxBlock(),
      await conditionLens(),
    ],
    ["Prescribed medication", "Health conditions"],
    { open: lensPicks.size > 0 });

  /* Regional patterns come AFTER the search box. Someone who arrived knowing
     what they took needs the lookup first; "what is common in this region" is
     context they can already get from Alerts by searching or tapping Near me,
     so leading with it here made the page repeat itself before answering the
     question it exists to answer. */
  const foodSlot = h("div");
  wrap.appendChild(foodSlot);

  const { regionalOverview, uncAttribution } = await regionalMod;
  const regional = await regionalOverview();
  if (regional) wrap.appendChild(regional);
  const uncAttr = await uncAttribution();

  wrap.appendChild(marketPointer());

  const attrSlot = h("div");
  wrap.appendChild(attrSlot);

  /* Both consumers of combos, filled together once it lands. Failure is
     silent on purpose: a missing combination checker is a smaller harm than
     an error banner on a page that is otherwise entirely usable. */
  combosP.then((combos) => {
    const checker = mixChecker(combos, yoursGroup);
    if (checker) mixSlot.replaceChildren(checker);
    else mixSlot.replaceChildren(yoursGroup);
    mixSlot.removeAttribute("aria-busy");   // the skeleton is gone; say so
    attrSlot.replaceChildren(attributionBlock(subs, combos, uncAttr));
    const food = foodBlockFrom(combos);
    if (food) foodSlot.replaceChildren(food);
  }).catch(() => {
    mixSlot.replaceChildren(yoursGroup);
    mixSlot.removeAttribute("aria-busy");
    attrSlot.replaceChildren(attributionBlock(subs, null, uncAttr));
  });

  return wrap;
}

/* A pointer to /supply, where the mechanics of an unregulated supply now live.
 *
 * This used to render the whole explainer inline, as a collapsed `details` at
 * the foot of this page. It outgrew that twice over. It is now thirteen
 * mechanisms in six groups - too much to sit folded under one summary on the
 * page a reader opened to look up a drug - and, more to the point, it is the
 * only part of the app that explains WHY the rest of the advice says what it
 * says. That should not be reachable only by someone who scrolled to the
 * bottom of Drugs and thought to open a box.
 *
 * So the content moved to its own section and this is the doorway. It keeps
 * the `sec-market` id because the jump chip and everything else that points
 * here uses it, and it is a real section with a heading so the chip has
 * something to land on.
 *
 * The one-line summary is not decoration: a bare "read more" link asks the
 * reader to spend a tap on faith. Saying what is on the other side is what
 * makes the tap worth it. */
function marketPointer() {
  return h("div", { id: "sec-market" },
    section("Why the supply is like this", null,
      h("a", { class: "bigptr", href: "#/supply" },
        h("span", { class: "bigptr__hd" }, "What makes an unregulated supply behave this way"),
        h("span", { class: "bigptr__sub" },
          "Why it keeps getting stronger, why two bags off one batch differ, "
          + "why a pill that looks right proves nothing, and why coming from "
          + "another country is a different set of unknowns rather than fewer."))));
}

/** One substance row. Shared by search results and class listings so the two
 *  can never drift apart. */
/* WHERE THE READER CAME FROM, remembered for exactly one hop.
 *
 * A drug page's back button always said "All drugs", so opening Fentanyl from
 * inside Opioids and going back dropped the reader at the top of the drugs
 * screen - they lost the class they were reading through and had to find it
 * again. Reported 2026-08-25.
 *
 * Recorded at the moment of navigation by the view that owns the row, which is
 * the only place that actually knows: a row on a class page passes its slug, a
 * row in search results passes nothing and clears it. So the back button
 * describes a journey that happened rather than one inferred afterwards from
 * which classes a drug happens to belong to - and a drug in two classes still
 * goes back to the one the reader was actually in.
 *
 * A module variable, deliberately. It is one hop of navigation state, it is
 * meaningless to a later session, and this app does not put what someone
 * looked up into storage. A cold load straight to a drug URL has no origin and
 * correctly says "All drugs". */
let cameFromClass = null;

function row(s, go, fromClass = null) {
  return h("button", {
      type: "button", class: "nbr",
      onClick: () => { cameFromClass = fromClass; go(`#/substances/${s.id}`); },
    },
    /* Title over subtitle, not "Name · alias, alias, alias" on one line. The
       inline form wrapped to three lines on a phone and ran under the badge;
       a native list row keeps one line each and truncates the second. */
    h("span", { class: "nbr__text" },
      h("span", { class: "nbr__name" }, s.name),
      s.aliases.length
        ? h("span", { class: "nbr__sub" }, s.aliases.slice(0, 3).join(", "))
        : null),
    h("span", { class: "nbr__right" },
      /* Labelled in the list, not just on the page, so nobody taps into a
         xylazine entry expecting a dose chart. */
      s.adulterant ? badge("Adulterant", "elevated") : null,
      s.interactions.dangerous.length
        ? badge(`${s.interactions.dangerous.length} dangerous`, "critical")
        : null,
      h("span", { "aria-hidden": "true" }, "›")));
}

/* =========================================================== adulterant == */

/* Something found IN a supply, not something sold as itself.
 *
 * The ordering is the design. Naloxone comes first, before what the substance
 * is, before wounds, before prevalence - because the only question that
 * matters while someone is going under is whether the thing in your hand will
 * help. Two of these four are not opioids and naloxone will not reverse them,
 * and the single most dangerous misunderstanding this page can leave someone
 * with is "naloxone won't work, so don't bother". Every one of them says give
 * it anyway, in the same breath. */
function adulterantBody(wrap, s) {
  const cite = (sources) =>
    sources?.length
      ? h("div", { class: "sources" }, sources.map((x) => extLink(x.url, x.name)))
      : null;

  /* The heading is per-entry, because the four original adulterants and tusi
     are opposite cases wearing the same page.
     Xylazine, medetomidine, nitazenes and BTMPS are things nobody asked for,
     mixed into something else — "found in the supply, not sold as itself" is
     exactly right for them. Tusi is the reverse: it is sold as itself, under
     its own name, at a premium, and the problem is that the name describes
     something it does not contain. Telling a reader holding a bag of it that
     it is "not sold as itself" would be the first false thing on the page. */
  wrap.appendChild(
    callout("warn", s.soldAs || "Found in the supply — not sold as itself",
      h("p", null, s.summary))
  );

  /* ---- naloxone, first ---- */
  const n = s.naloxone;
  if (n) {
    wrap.appendChild(
      section("If someone is overdosing", null,
        callout(n.reverses === true ? "info" : "stop", n.lead,
          h("p", null, n.text),
          cite(n.sources)),
        frag((s.overdose || []).map((b) =>
          h("div", { class: "card" },
            h("h3", null, b.title),
            h("p", null, b.body),
            cite(b.sources)))))
    );
  }

  /* ---- why it is there ---- */
  if (s.whyInSupply) {
    wrap.appendChild(
      section("Why it is in the supply", null,
        h("div", { class: "card" },
          h("p", null, s.whyInSupply.text),
          cite(s.whyInSupply.sources)))
    );
  }

  /* ---- other effects ---- */
  if (s.effects?.length) {
    wrap.appendChild(
      section("What it does", null,
        frag(s.effects.map((b) =>
          h("div", { class: "card" },
            h("h3", null, b.title),
            h("p", null, b.body),
            cite(b.sources)))))
    );
  }

  /* ---- withdrawal ---- */
  if (s.withdrawal) {
    /* "Evidence is limited" is shown as a badge rather than buried in the
       prose, because the difference between medetomidine (documented, people
       are in intensive care) and xylazine (suspected, not established) is the
       difference between going to a hospital and not. */
    const limited = s.withdrawal.evidence === "limited";
    wrap.appendChild(
      section("Withdrawal", null,
        h("div", { class: "card" },
          h("div", { class: "card__top" },
            badge(limited ? "Evidence is limited" : "Well documented",
                  limited ? "neutral" : "critical")),
          h("p", null, s.withdrawal.text),
          cite(s.withdrawal.sources)))
    );
  }

  /* ---- detection ---- */
  if (s.detection) {
    wrap.appendChild(
      section("Testing for it", null,
        h("div", { class: "card" },
          h("div", { class: "card__top" },
            badge(s.detection.strips ? "Test strips exist" : "No test strip", "neutral")),
          h("p", null, s.detection.text),
          cite(s.detection.sources)))
    );
  }

  /* ---- prevalence, deliberately last ---- */
  if (s.prevalence) {
    wrap.appendChild(
      section("How common it is", null,
        h("p", { class: "sec__note" },
          "Numbers describe where and when they were measured, and the supply " +
          "changes faster than the reporting does."),
        h("div", { class: "card" },
          h("p", null, s.prevalence.text),
          cite(s.prevalence.sources)))
    );
  }

  return wrap;
}

/* ================================================================ class == */

function classView(slug, subs, { go }) {
  const info = classInfo(slug);
  if (!info) {
    return empty("That isn’t a class we list.",
      "Go back to Drugs to browse the classes.");
  }

  const { groups } = groupAll(subs.substances);
  const members = groups.get(slug) || [];

  const wrap = h("div");
  wrap.appendChild(
    h("button", { type: "button", class: "btn btn--ghost btn--sm", onClick: () => go("#/substances") },
      h("span", { "aria-hidden": "true" }, "‹"), " All classes")
  );
  /* The h1 is the only place the class is named. An earlier version also gave
     the list a section title, so every class page said its own name twice. */
  wrap.appendChild(
    h("div", { class: "county-head" },
      h("h1", null, info.label),
      h("p", { class: "classcard__hint" }, info.hint),
      h("p", { class: "classcard__n" }, `${members.length} drugs`))
  );

  /* Filter within the class. At 90 entries, psychedelics is still a wall of
     names without this. */
  const input = h("input", {
    class: "input", type: "text", autocomplete: "off", spellcheck: "false",
    "aria-label": `Filter ${info.label}`,
    placeholder: `Filter ${info.label.toLowerCase()}…`,
  });
  const list = h("div", { class: "list" });
  /* A live count for the screen reader. The list re-renders on every
     keystroke in silence, so a reader typing "ket" into a class of ninety had
     no way to hear it narrow until they tabbed into it. Off-screen: the
     visible page already shows the rows, and the empty state below already
     says "No match" in words. The same wording the class tile under the grid
     uses for its own count. */
  const count = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });

  const paint = (term) => {
    const t = term.trim().toLowerCase();
    const hits = !t ? members : members.filter((s) => matches(s, t));

    clear(list);
    count.textContent = !t ? "" : hits.length
      ? `${hits.length} drug${hits.length === 1 ? "" : "s"}`
      : "No match in this class.";
    if (!hits.length) {
      list.appendChild(empty("No match in this class.",
        "Clear the filter, or search the Drugs screen to look across all classes."));
      return;
    }
    for (const s of hits) list.appendChild(row(s, go, slug));
  };
  input.addEventListener("input", () => paint(input.value));

  wrap.appendChild(h("div", { class: "search" }, h("div", { class: "search__row" }, input), count));
  wrap.appendChild(list);
  paint("");

  /* A drug can honestly sit in more than one class, and saying so is safer than
     implying these boxes are exclusive. */
  wrap.appendChild(
    h("p", { class: "sec__note" },
      "Some drugs belong to more than one class. " +
      "Effects vary by person, dose, and what a drug is actually mixed with.")
  );

  return wrap;
}

/* ========================================================= mix checker == */

/* CNS depressants. Counted separately from the matrix because the matrix
   cannot express what matters most here: respiratory depression stacks across
   ALL of them at once, not pair by pair. */
const DEPRESSANTS = new Set([
  "opioids", "benzodiazepines", "alcohol", "ghb/gbl", "pregabalin", "tramadol",
]);

/* Four, not five.
 *
 * The data is pairwise - 841 two-drug pairs and no three-way data anywhere in
 * it, because no free validated source has any. So N substances can only be
 * shown as its C(N,2) pairs: 3 gives 3, 4 gives 6, 5 gives 10.
 *
 * Each pair stays exactly as accurate as it ever was. What grows with N is
 * UNDERSTATEMENT. Twelve of the thirteen depressant-vs-depressant pairs are
 * already "Dangerous", so adding a third depressant does not change a single
 * label while the real risk climbs - the screen looks identical and the person
 * is in more danger. Ten pair verdicts is also more than anyone reads while
 * deciding something. Four keeps it legible and keeps the gap small; the
 * stacking warning below covers what the pairs cannot say. */
const MAX_MIX = 4;

function mixChecker(combos, yours) {
  if (!combos?.matrix) return null;

  const cats = combos.categories || [];
  const slots = [];
  const rows = h("div", { class: "mixslots" });
  /* NOT A LIVE REGION. It carried role="status", so every change to a select
     re-read the whole verdict - card, badge, definition, the depressant
     callout and every pair - from the top. The results render here in
     silence; the one-line region below says what changed. Same shape as the
     reagent tracker on Test, which shares this control. */
  const out = h("div", { class: "mixout" });
  /* ONE SENTENCE PER CHANGE, verdict first: the card's exact badge, then the
     depressant heading verbatim when it is shown, then a removal if a × was
     pressed. The shared region in slots.js - off-screen, atomic, re-announced
     even when the sentence repeats. */
  const { el: live, announce } = liveRegion();

  const addBtn = h("button", {
    type: "button", class: "btn btn--ghost btn--sm",
    onClick: () => { addSlot(); check(); },
  }, "+ Add another drug");

  function makeSelect() {
    /* No aria-label - slotLabel() puts the visible word ("I took", "and") on
       the select as its name, with the row number off-screen beside it. */
    const sel = h("select", { class: "input" },
      h("option", { value: "" }, "Choose…"),
      cats.map((c) => h("option", { value: c }, prettyCat(c))));
    sel.addEventListener("change", check);
    return sel;
  }

  function addSlot(want) {
    if (slots.length >= MAX_MIX) return;
    const i = slots.length;
    const sel = makeSelect();
    /* A value carried across from a previous render (rehydrate below). Only a
       real category is honoured; anything else leaves the row on "Choose…". */
    if (want && cats.includes(want)) sel.value = want;
    /* The shared slot row (slots.js): label, then the select wearing a
       disclosure row, the chevron centred on it by .pick__field - the same
       control the reagent tracker on Test is built from. The × goes on the
       rows past the floor of two; a combination of one is not a combination. */
    const row = h("div", { class: "mixslot" },
      slotLabel(i === 0 ? "I took" : "and", sel, i + 1, "drug"),
      i > 1
        ? removeButton(`Remove drug ${i + 1}`, () => {
            const at = slots.indexOf(sel);
            if (at > -1) slots.splice(at, 1);
            /* The number the row wore when pressed; relabel() renumbers
               what is left. */
            const was = at > -1 ? at + 1 : i + 1;
            dropRow(row, addBtn);
            relabel();
            check(`Drug ${was} removed.`);
          })
        : null);
    slots.push(sel);
    rows.appendChild(row);
    relabel();                                  // numbered by position
  }

  function relabel() {
    relabelRows(rows, "I took", "and", "drug");
    addBtn.disabled = slots.length >= MAX_MIX;
  }

  /* `tail` is a clause for the live region - the removal, when a × was
     pressed. A change event arriving here from the select listeners is not
     one. */
  function check(tail) {
    clear(out);
    /* Persist the current picks so a trip to a drug page and Back restores
       them - module-scoped, never storage; see checkerSession. */
    checkerSession = { picks: slots.map((s) => s.value) };
    /* Assembled as the cards are built, in their own words. */
    let verdict = null;
    const notes = [];
    const done = () => announce([verdict, ...notes, typeof tail === "string" ? tail : null]);
    const picked = slots.map((s) => s.value).filter(Boolean);
    const unique = [...new Set(picked)];

    if (picked.length > unique.length) {
      notes.push("You picked the same category twice.");
      out.appendChild(callout("warn", "You picked the same category twice",
        h("p", null,
          "Taking more raises the dose. Redosing before the first amount has " +
          "fully come up is a common way people take far more than they meant " +
          "to.")));
    }
    if (unique.length < 2) { done(); return; }

    /* Every pair, worst first. */
    const results = [];
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const a = unique[i], b = unique[j];
        const hit = combos.matrix[a]?.[b] || combos.matrix[b]?.[a] || null;
        results.push({ a, b, hit });
      }
    }
    results.sort((x, y) =>
      (RISK[x.hit?.s]?.rank ?? 9) - (RISK[y.hit?.s]?.rank ?? 9));

    const worst = results.find((r) => r.hit)?.hit?.s || null;
    const deps = unique.filter((c) => DEPRESSANTS.has(c));

    /* Overall verdict. Deliberately says "at least" - the pairs are a floor,
       not the whole picture. */
    /* The badge, exactly as printed, then the pairing it is about. When no
       pair has data there is no card, but every pair row wears the "No data"
       badge, and that is what a sighted reader sees - so it is what is said. */
    {
      const meta = worst ? RISK[worst] || RISK.Unknown : RISK.Unknown;
      verdict = `${worst && unique.length > 2 ? `At least: ${meta.label}` : meta.label}. `
        + `${unique.map(prettyCat).join(" + ")}.`;
    }
    if (worst) {
      const meta = RISK[worst] || RISK.Unknown;
      out.appendChild(
        h("div", { class: `card card--${meta.kind === "critical" ? "critical" : meta.kind === "elevated" ? "elevated" : "advisory"}` },
          h("div", { class: "card__top" },
            h("span", { class: `badge badge--${meta.kind}` },
              h("span", { "aria-hidden": "true" }, meta.glyph),
              unique.length > 2 ? `At least: ${meta.label}` : meta.label),
            h("span", { class: "card__meta" },
              unique.map(prettyCat).join(" + "))),
          unique.length > 2
            ? h("p", { class: "sec__note" },
                `${results.length} pairs checked. There is no data anywhere on how ` +
                `three or more drugs behave together, so this is the worst ` +
                `single pair — treat it as a floor, not the whole picture.`)
            : null,
          definitionFor(combos, worst))
      );
    }

    /* The warning the matrix cannot give. */
    if (deps.length >= 2) {
      /* The callout's heading, verbatim. */
      notes.push(`${deps.length} of these slow your breathing down.`);
      out.appendChild(
        callout("stop", `${deps.length} of these slow your breathing down`,
          h("p", null,
            deps.map(prettyCat).join(", ") + " all suppress breathing, and the " +
            "effects stack. Together they are more dangerous than any pair above " +
            "shows — the pair view only rates two at a time."),
          h("p", null,
            "Naloxone reverses the opioid. It does nothing for alcohol, " +
            "benzodiazepines, GHB or pregabalin — so breathing can stay " +
            "suppressed after a reversal that otherwise worked."))
      );
    }

    /* Per-pair detail. */
    if (unique.length > 2) {
      out.appendChild(h("h3", { class: "mixpairs__h" }, "Pair by pair"));
    }
    for (const r of results) {
      const meta = RISK[r.hit?.s] || RISK.Unknown;
      out.appendChild(
        h("details", { class: "acc", open: unique.length === 2 || null },
          h("summary", null,
            h("span", null, `${prettyCat(r.a)} + ${prettyCat(r.b)}`),
            h("span", { class: `badge badge--${meta.kind}` },
              h("span", { "aria-hidden": "true" }, meta.glyph),
              meta.label)),
          h("div", { class: "acc__body" },
            r.hit?.n
              ? h("p", null, r.hit.n)
              : h("p", null,
                  "No information is not the same as no risk. Treat an unknown " +
                  "combination as risky: take much less than usual, wait, and do " +
                  "not be alone.")))
      );
    }
    if (unique.length > 2) notes.push(`${results.length} pairs checked.`);
    done();
  }

  /* Rehydrate the picks from this session if there are any, else open with two
     empty rows. Restoring more than two rebuilds those too, up to the floor of
     two the checker never goes below. check() runs after a rehydrate so the
     verdict the reader left with comes back with it. */
  if (checkerSession?.picks?.length) {
    for (const v of checkerSession.picks.slice(0, MAX_MIX)) addSlot(v);
    while (slots.length < 2) addSlot();
    relabel();
    check();
  } else {
    addSlot();
    addSlot();
  }

  /* No death-count caption under the title. The stakes are already carried
     by the results themselves (Dangerous badges, the depressant-stacking
     callout); a mortality tagline on the section header was tone, not
     information. The map's mortality layers keep the word "deaths" because
     there it labels the data. */
  return section("Is this combination dangerous?", null,
    h("div", { class: "card" },
      rows,
      /* This sentence maps the pill in someone's hand onto a menu of category
         names. It was the first thing in the card, which put a paragraph of
         explanation directly under the class squares before the reader had
         been offered anything to do - moved down 2026-08-25 on that report.
         It sits under the dropdowns and ABOVE the results, so it is still on
         screen before a combination is chosen rather than only after one
         fails, which was the reason it was lifted in the first place. */
      h("p", { class: "sec__note mixnote" },
        "Categories, not brands. Fentanyl, heroin, oxycodone and methadone are all ",
        h("strong", null, "opioids"), "; Xanax, Valium and etizolam are all ",
        h("strong", null, "benzodiazepines"), "."),
      h("div", { class: "chips" }, addBtn),
      out,
      live),
    /* Directly under the result. This used to sit outside the section, which
       looked adjacent on an empty page and was a screenful away the moment a
       combination produced results - moving out of sight exactly when it
       started to matter. Whether someone is on methadone, or pregnant, or has
       a heart condition, changes what a "Dangerous" verdict means for them,
       so it belongs with the verdict. */
    yours || null,
    supplementBlock(combos));
}

function supplementBlock(combos) {
  if (!combos.supplement?.length) return null;
  return frag(
    h("h3", { class: "sec__note mixsupp" }, "Not in the chart, but worth knowing"),
    combos.supplement.map((s) =>
      h("details", { class: "acc acc--flag" },
        h("summary", null,
          /* s.with, not a hardcoded "opioids". Every supplement entry paired
             with opioids until now, so the field was never read and the label
             was right by coincidence - the first entry that pairs with
             anything else would have been captioned wrongly. */
          h("span", null, `${s.name} + ${catInSentence(s.with || "opioids")}`),
          badge(s.status, "critical")),
        h("div", { class: "acc__body" },
          h("p", null, s.note),
          h("div", { class: "sources" }, extLink(s.source.url, s.source.name)))))
  );
}

function definitionFor(combos, status) {
  const d = (combos.definitions || []).find((x) => x.status === status);
  return d ? h("p", { class: "sec__note" }, d.definition) : null;
}

/* Categories whose casing is part of the name. Everything else is an ordinary
   noun that takes a capital only because it starts a label. */
const CAT_LABEL = {
  "ghb/gbl": "GHB / GBL", ssris: "SSRIs", maois: "MAOIs", nbomes: "NBOMes",
  lsd: "LSD", mdma: "MDMA", dmt: "DMT", mxe: "MXE", pcp: "PCP", amt: "AMT",
  "2c-x": "2C-x", "2c-t-x": "2C-T-x", dox: "DOx", "5-meo-xxt": "5-MeO-xxT",
  dextromethorphan: "DXM (dextromethorphan)",
};

/* For a label that IS the whole thing: a select option, a chart row, one half
   of "Opioids + Benzodiazepines". */
const prettyCat = (c) =>
  CAT_LABEL[c] || c.charAt(0).toUpperCase() + c.slice(1);

/* For a category appearing INSIDE a phrase, where it is not a proper noun.
 *
 * "Xylazine ("tranq") + opioids" is a sentence fragment; "+ Opioids" reads as
 * though opioids were a brand. The supplement captions used to be written with
 * "opioids" hardcoded in lowercase, and fixing the real bug underneath them -
 * the caption said opioids for an entry that pairs with benzodiazepines - was
 * done by routing the field through prettyCat, which capitalised all of them
 * on the way past. The fix and the regression came in the same line.
 *
 * The acronyms still have to survive: GHB and SSRIs are not lowercase words. */
const catInSentence = (c) => CAT_LABEL[c] || c;

/* =============================================================== detail == */

async function detailView(id, subs, combos, { go }) {
  const base = subs.substances.find((x) => x.id === id);
  if (!base) return empty("Not found.", "That drug isn’t in the dataset.");

  /* Reagent colors are fetched here rather than merged into every drug up
     front - see data.reagentsFor. This is the only view that renders them, and
     loading them for all 302 was costing the Drugs list 111KB before it could
     paint. Attached to a local copy so the cached bundle stays untouched. */
  /* The structures bundle is STARTED here and AWAITED AFTER THE FIRST PAINT -
     see the figure below. It was in this Promise.all, so every drug page
     waited on a 29 KB file whose only job is a diagram before it could show
     the name, the mix warning or the dose. Nothing above the figure needs it. */
  const structsP = data.structures().catch(() => null);
  const [rg, plantMatrix, detect] = await Promise.all([
    data.reagentsFor(id), data.isPlantOrFungal(id), data.detectionFor(id),
  ]);
  const s = rg ? { ...base, reagentResults: rg } : base;

  const wrap = h("div");

  /* Back to the class the reader opened this from, when there was one. The
     label names it, so the button says where it goes instead of making them
     find out by pressing it. */
  const origin = CLASSES.find((c) => c.slug === cameFromClass);
  wrap.appendChild(
    h("button", {
        type: "button", class: "btn btn--ghost btn--sm",
        onClick: () => go(origin ? `#/substances/class/${origin.slug}` : "#/substances"),
      },
      h("span", { "aria-hidden": "true" }, "‹"), origin ? ` ${origin.label}` : " All drugs")
  );

  wrap.appendChild(h("div", { class: "county-head" },
    h("h1", null, s.name),
    s.aliases.length ? h("p", { class: "sec__note" }, `Also called: ${s.aliases.join(", ")}`) : null));

  /* The molecule.
   *
   * Not decoration, and not on every page: 263 of the 298 entries have one,
   * and the ones that do not are families and plants - "2C-x", Cannabis,
   * Ayahuasca - which have no single structure and correctly show nothing
   * rather than a stand-in.
   *
   * It earns the space because this app argues from structure elsewhere and
   * could not show one: the Test page says BTNX's strip is blind to bulky
   * changes at the phenethyl end while WHPM's is blind at the carbonyl, which
   * is the practical difference between the two brands and is unreadable as
   * prose unless you already know which end is which.
   *
   * IT SITS AT THE TOP, under the name - moved back up on request
   * 2026-08-19 for how the page looks, reversing the earlier move into "Read
   * more". That move was made because a picture above the fold pushes the
   * dose and mix warnings down, which is still true and is the cost being
   * accepted here: the reader who scrolls past a molecule to reach a dose
   * chart is the same reader either way, and the page reads as a reference
   * on a substance rather than a warning sheet about one.
   *
   * WHAT DOES NOT MOVE: the height reservation below. Above the fold a late
   * SVG would shove the whole page down as it lands, which is the one thing
   * this figure must never do now that everything is underneath it.
   *
   * FILLED IN AFTER THE FIRST PAINT, INTO A BOX THAT IS ALREADY THE RIGHT
     SIZE. The figure is created now, empty, at the height the drawing and its
     caption will take (.struct__fig reserves it in CSS), and the SVG lands in
     it when the bundle arrives - so the page paints without waiting for
     structures.json and nothing below the figure moves when it loads. The 22
     entries with no structure (families and plants) get the box removed once
     that is known. */
  const structFig = h("figure", { class: "struct__fig struct__fig--pending", "aria-busy": "true" });
  structsP.then((structs) => {
    const packed = structs?.structures?.[id];
    const svg = packed ? drawStructure(packed, 200) : null;
    if (!svg) { structFig.remove(); return; }
    structFig.append(svg,
      h("figcaption", { class: "sec__note" },
        "2D structure from ",
        extLink(`https://pubchem.ncbi.nlm.nih.gov/compound/${packed.cid}`,
                `PubChem CID ${packed.cid}`),
        ". Hydrogens on carbon are not drawn."));
    structFig.classList.remove("struct__fig--pending");
    structFig.removeAttribute("aria-busy");
  }).catch(() => structFig.remove());
  /* Straight under the name. Empty at this point and the right height already
     (.struct__fig reserves it), so nothing below shifts when the SVG lands. */
  wrap.appendChild(structFig);

  const cls = [...(s.class.psychoactive || []), ...(s.class.chemical || [])];
  if (cls.length) {
    wrap.appendChild(h("div", { class: "tags" }, cls.slice(0, 6).map((c) => h("span", { class: "tag" }, c))));
  }

  /* A deceptive street name is an adulteration vector: someone holding "tusi"
     searched their way here believing they hold 2C-B. This renders before
     anything else so the correction lands first. */
  if (s.nameWarning) {
    wrap.appendChild(
      callout("warn", "This gets sold under a name that isn’t its own",
        h("p", null, s.nameWarning.text),
        /* A WAY OUT, not just a correction.
           The warning tells a reader that what they are holding is probably a
           different substance, and then this page goes on to be entirely about
           THIS one - its dose chart, its duration, its reagent colours, its
           flowchart. Somebody who arrived holding pink powder was being told
           "not this" and given no "then what". The named substance has its own
           page now; this is the door to it. */
        s.nameWarning.seeInstead
          ? h("a", { class: "bigptr", href: `#/substances/${s.nameWarning.seeInstead.id}` },
              h("span", { class: "bigptr__hd" }, s.nameWarning.seeInstead.label),
              h("span", { class: "bigptr__sub" }, s.nameWarning.seeInstead.sub))
          : null,
        h("div", { class: "sources" },
          s.nameWarning.sources.map((x) => extLink(x.url, x.name))))
    );
  }

  /* Plain-language description, before anything technical.
     A dose chart is meaningless to someone who does not yet know what the
     substance is, and that reader is the one most likely to be here. */
  if (s.description) {
    wrap.appendChild(
      h("div", { class: "leadin" }, h("p", null, s.description))
    );
  } else {
    /* Say so, rather than opening on a dose chart for something the reader
       cannot identify. The entries left in this state are research chemicals
       with no plain-language description published anywhere we could check -
       writing one from memory is exactly how a confident sentence about an
       unfamiliar drug ends up wrong. An absence, stated, is more useful than
       a guess.

       But an absence of EFFECTS data is not an absence of identity, and this
       used to read as though we knew nothing at all. The page already carries
       the drug's chemical and psychoactive families as tags directly above
       this paragraph; naming the family here turns "we have nothing" into the
       one true, checked thing we do have - what kind of drug it is. Anything
       whose ordinary identity is describable at all - a supplement, a spice,
       an over-the-counter box - now has a written description instead and
       never reaches this branch. */
    const fam = [...new Set([
      ...(s.class?.psychoactive || []),
      ...(s.class?.chemical || []),
    ].filter(Boolean))];
    /* "a and b", not test.js's "a or b" - these are families the drug is in at
       the same time, not alternatives it might be one of. */
    const listOf = (a) => a.length > 1
      ? `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}` : a[0];

    wrap.appendChild(
      h("div", { class: "leadin leadin--none" },
        h("p", null,
          fam.length
            ? `Nobody has published a checked description of what ${s.name} does, `
              + "so there is not one here — we won’t guess. What is on record is "
              + `the family it belongs to: ${listOf(fam.map((f) => f.toLowerCase()))}.`
            : `Nobody has published a checked description of what ${s.name} is or `
              + "does, so there is not one here — we won’t guess."),
        h("p", { class: "sec__note" },
          "The dose, duration and interaction data below comes from PsychonautWiki " +
          "and TripSit and is sourced at the foot of the page."))
    );
  }

  /* Adulterants take a different page shape entirely, and return early.
     Nobody chooses a dose of xylazine, so the dose chart, tolerance and
     duration sections below would be meaningless at best - and at worst would
     imply this is something a person sets out to take. */
  if (s.adulterant) return adulterantBody(wrap, s);

  /* ---- dangerous interactions first ----
   *
   * This section renders ALWAYS, and that is the fix for the app's worst
   * failure mode. It used to be gated on `d.length || u.length`, so a drug
   * whose per-drug record happened to hold only "uncertain" entries showed no
   * interaction section at all - and pregabalin is one of four such drugs,
   * while the combination matrix in the very same bundle rates pregabalin x
   * opioids DANGEROUS, and build-combos.mjs carries an FDA-sourced note
   * saying the same. The reader most likely to need that warning got a page
   * with no warning on it. 84 of 298 drugs have no per-drug lists at all and
   * likewise said nothing.
   *
   * Two changes: backfill from the category matrix the page already has in
   * memory, and when there is genuinely nothing, SAY so - the same way this
   * file already states a missing description rather than leaving a blank. */
  const d = s.interactions.dangerous;
  const u = s.interactions.unsafe;

  /* The per-drug lists name individual drugs; the matrix rates CATEGORIES.
     A drug's categories are already in combos.drugs[].cats. */
  const catsOf = (id) => (combos?.drugs || []).find((x) => x.id === id)?.cats || [];
  const RATING = { Dangerous: "dangerous", Unsafe: "unsafe", Caution: "caution" };
  /* CAUTION IS CARRIED TOO, and it was not.
   *
   * RATING has always named three bands and this loop collected two, so every
   * Caution pair in the matrix was read and thrown away. The combination
   * checker on Drugs shows those pairs; the drug page did not - nitrous rates
   * Caution with alcohol, GHB/GBL, opioids, pregabalin and tramadol, and its
   * page listed none of them while the checker two taps away flagged all five
   * (reported 2026-08-24). 100 drugs and 682 pairs were in that gap.
   *
   * It gets its own band rather than being folded into Unsafe. The source
   * defines Caution as "not usually physically harmful, but may produce
   * undesirable effects ... care should be taken", which is a different claim
   * from Unsafe's "considerable risk of physical harm" - promoting it would
   * overstate what was published, and this file does not do that in either
   * direction. */
  const fromMatrix = { dangerous: new Set(), unsafe: new Set(), caution: new Set() };
  for (const cat of catsOf(s.id)) {
    const row = combos?.matrix?.[cat];
    if (!row) continue;
    for (const [other, cell] of Object.entries(row)) {
      const band = RATING[cell?.s];
      if (band === "dangerous") fromMatrix.dangerous.add(other);
      else if (band === "unsafe") fromMatrix.unsafe.add(other);
      else if (band === "caution") fromMatrix.caution.add(other);
    }
  }
  /* Do not repeat a category the per-drug list already names. */
  const seen = new Set([...d, ...u].map((x) => String(x).toLowerCase()));
  const extraD = [...fromMatrix.dangerous].filter((x) => !seen.has(x.toLowerCase()));
  const extraU = [...fromMatrix.unsafe].filter((x) => !seen.has(x.toLowerCase()));
  /* A pair the louder bands already carry never repeats as Caution. A drug's
     categories can rate the same partner twice - one category Dangerous,
     another Caution - and listing it in both would read as the page
     contradicting itself. The louder rating wins, the same way the class wins
     over the individual drug below. */
  const louder = new Set([...fromMatrix.dangerous, ...fromMatrix.unsafe]
    .map((x) => x.toLowerCase()));
  const extraC = [...fromMatrix.caution]
    .filter((x) => !seen.has(x.toLowerCase()) && !louder.has(x.toLowerCase()));

  /* THE CLASS WINS, AND THE DRUG IT ALREADY COVERS GOES.
   *
   * These two sources overlap by design: the per-drug list names individual
   * drugs, the matrix rates whole classes, and a named drug is very often a
   * member of a class the matrix has just rated. So alcohol's Dangerous list
   * read "... GHB, GBL, Opioids, Tramadol ... ghb/gbl" — GHB and GBL are the
   * ghb/gbl class, Tramadol is an opioid, and the reader is being asked to
   * notice that twice.
   *
   * The class is the one to keep. It says everything the individual entry says
   * and it covers the things this page does not list by name, which is exactly
   * what the footnote under these lists promises. Dropping the class instead
   * would narrow a warning. 50 lists across the file were carrying at least
   * one of these. */
  /* DEDUPE ON IDS, LABEL AFTERWARDS. Doing it the other way round is a bug I
     wrote and then watched: prettyCat turns "ghb/gbl" into "GHB / GBL" and
     "dextromethorphan" into "DXM (dextromethorphan)", so by the time the
     comparison ran, the class no longer looked anything like the id a drug's
     `cats` holds, and GHB, GBL and DXM all survived beside the classes that
     cover them. Every entry now carries the key it is matched on. */
  /* BOTH SOURCES GET THE SAME LABELLER. The per-drug lists are upstream text
     and 39 of their entries arrive lowercase — amt, maois, nbomes,
     amphetamines — so a callout ended up mixing "Alcohol" and "Benzodiazepines"
     with "cocaine" and "pregabalin". prettyCat is safe on already-correct
     input: it looks up the acronym table first, so GHB, DXM and MAOIs survive
     intact, and otherwise only lifts the first letter. */
  const asEntry = (name) => ({ key: String(name).toLowerCase(), label: prettyCat(name) });
  const asClass = (cat) => ({ key: String(cat).toLowerCase(), label: prettyCat(cat) });

  const dRaw = [...d.map(asEntry), ...extraD.map(asClass)];
  const uRaw = [...u.map(asEntry), ...extraU.map(asClass)];

  /* Then the classes win. These two sources overlap by design — the per-drug
     list names individual drugs, the matrix rates whole classes, and a named
     drug is very often a member of a class the matrix has just rated. Alcohol
     read "... GHB, GBL, Opioids, Tramadol ... GHB / GBL": GHB and GBL ARE the
     ghb/gbl class, Tramadol is an opioid, and the reader is being asked to
     notice the same warning twice.

     Keep the class. It says everything the individual entry says and it covers
     what this page does not list by name, which is exactly what the footnote
     under these lists promises. Dropping the class instead would narrow a
     warning. 50 lists in the file were carrying at least one of these. */
  const prune = (rows) => {
    const present = new Set(rows.map((r) => r.key));
    /* Aliases too. "DXM" is an ALIAS of dextromethorphan, not its name, so a
       name-only lookup left DXM sitting next to "DXM (dextromethorphan)" —
       the same substance twice, once as the drug and once as its own class. */
    const byName = (k) => (combos?.drugs || []).find(
      (x) => String(x.name || x.id).toLowerCase() === k
        || [...(x.aliases || []), ...(x.searchAliases || [])]
             .some((a) => String(a).toLowerCase() === k));
    return rows.filter((r, i) => {
      if (rows.findIndex((y) => y.key === r.key) !== i) return false;   // exact repeat
      const drug = byName(r.key);
      /* A drug whose class shares its own name is not a duplicate of itself —
         Cocaine the drug and cocaine the class are one entry, not two. */
      return !drug || !(drug.cats || []).some(
        (c) => c.toLowerCase() !== r.key && present.has(c.toLowerCase()));
    });
  };
  const cRaw = extraC.map(asClass);
  const dRows = prune(dRaw), uRows = prune(uRaw), cRows = prune(cRaw);
  const dAll = dRows.map((r) => r.label);
  const uAll = uRows.map((r) => r.label);
  const cAll = cRows.map((r) => r.label);
  /* Everything the three bands now state, by key, so Uncertain can drop what
     they cover - including a drug covered by a class, which is why the class
     keys of each rated entry count too. */
  const ratedKeys = new Set([...dRows, ...uRows, ...cRows].map((r) => r.key));
  const coveredByClass = (name) => {
    const key = String(name).toLowerCase();
    if (ratedKeys.has(key)) return true;
    const drug = (combos?.drugs || []).find(
      (x) => String(x.name || x.id).toLowerCase() === key
        || [...(x.aliases || []), ...(x.searchAliases || [])]
             .some((a) => String(a).toLowerCase() === key));
    return !!drug && (drug.cats || []).some((c) => ratedKeys.has(String(c).toLowerCase()));
  };
  const uncertainLeft = s.interactions.uncertain.filter((x) => !coveredByClass(x));
  /* ONE FOOTNOTE UNDER THE SECTION, not one inside each band.
   *
   * This sat at the foot of every callout that had a class-derived entry, so a
   * drug rated in Dangerous, Unsafe and Caution said the same sentence three
   * times on one screen - reported as wanting them moved down. It is a
   * footnote about where the names came from, which is exactly what a reader
   * does not need in the middle of the list of things that can kill them.
   *
   * So it renders once, after the bands, if ANY of them drew on a class. The
   * per-band precision is not lost in any way a reader could use: the sentence
   * was identical in all three, and the section is what it is annotating. */
  const classNote = () => h("p", { class: "sec__note" },
    "Some of these are whole drug classes, so they cover things this page "
    + "does not name individually.");
  const anyFromClass = extraD.length || extraU.length || cAll.length;

  const anything = dAll.length || uAll.length || cAll.length || uncertainLeft.length;

  wrap.appendChild(
    /* THE HEADING NAMES THE SUBJECT, not the worst thing in it.
     *
     * It was "Dangerous to mix with", which was accurate while the section held
     * Dangerous, Unsafe and Uncertain. It now also carries Caution, which the
     * source defines as "not usually physically harmful" - and filing those
     * under a heading that calls them dangerous overstates them exactly as
     * badly as omitting them understated them.
     *
     * Nothing is softened by the change: severity is carried by the callouts,
     * where Dangerous keeps the stop tone and its glyph, and never by the
     * heading alone. Still not an instruction - "Mixing with other drugs", not
     * "Do not mix" - because the reader decides what to do with it. */
    section("Mixing with other drugs", null,
      /* ONE Dangerous and ONE Unsafe, not four callouts.
       *
       * The per-drug lists name individual drugs and the matrix rates whole
       * classes, and the page used to split them into "Dangerous" and
       * "Dangerous, by drug class" - which asks the reader to hold a
       * distinction about OUR data model while looking at a list of things
       * that can kill them. The verdict is the same either way; where it came
       * from is a footnote, and it now reads as one. */
      dAll.length
        ? callout("stop", "Dangerous",
            h("div", { class: "tags" }, dAll.map((x) => h("span", { class: "tag tag--danger" }, x))))
        : null,
      uAll.length
        ? callout("warn", "Unsafe",
            h("div", { class: "tags" }, uAll.map((x) => h("span", { class: "tag" }, x))))
        : null,
      /* Its own band, in the source's own words. Caution is defined there as
         combinations that "may produce undesirable effects, such as physical
         discomfort or overstimulation" - so the line says that rather than
         leaving a reader to guess what a third list means. info, not warn:
         warn is Unsafe's tone on this page and reusing it would make the two
         look like one claim. */
      cAll.length
        ? callout("info", "Caution",
            h("p", null,
              "Not usually physically harmful, but they can produce undesirable "
              + "effects — discomfort, or overstimulation. Care is worth taking."),
            h("div", { class: "tags" }, cAll.map((x) => h("span", { class: "tag" }, x))))
        : null,
      /* UNCERTAIN NEVER REPEATS A PAIR THE BANDS ABOVE RATE.
       *
       * The per-drug list and the matrix are separate sources and they overlap:
       * nitrous carries alcohol, GHB, GBL, opioids and tramadol as "uncertain",
       * and the matrix rates all five Caution. Once Caution renders, the same
       * page listed the same pairs twice under two different answers - which is
       * the drug page contradicting itself, the thing views.test.mjs already
       * guards for the reagent table.
       *
       * The rating wins. "Uncertain" is the absence of a published finding, and
       * a published Caution is one - so the pair moves up to the band that
       * states something and leaves the list that states nothing. Matched on
       * keys, not labels, for the reason DEDUPE ON IDS gives above. */
      uncertainLeft.length
        ? h("p", { class: "sec__note" },
            `Uncertain: ${uncertainLeft.map(prettyCat).join(", ")}`)
        : null,
      anyFromClass ? classNote() : null,
      /* The stated absence. An empty section here would read as "nothing to
         worry about", which is the one thing it must never mean. */
      anything
        ? null
        : callout("warn", "Nobody has published interaction data for this one",
            h("p", null,
              "That is a hole in what has been published, not a finding that it "
              + "mixes safely. Anything you combine it with is an unknown."))));

  /* ---- FDA boxed warning, where it applies ---- */
  const isOpioid = cls.some((c) => /opioid/i.test(c));
  const isBenzo = cls.some((c) => /benzodiazepine|depressant/i.test(c));
  const warn = isOpioid ? subs.warnings?.["opioid-benzo"] : isBenzo ? subs.warnings?.benzo : null;
  if (warn) {
    wrap.appendChild(
      h("details", { class: "acc acc--flag" },
        h("summary", null, h("span", null, "FDA Boxed Warning"), badge("FDA", "critical")),
        h("div", { class: "acc__body" },
          h("p", { class: "sec__note" }, "The FDA’s strongest warning, quoted from the drug label."),
          h("p", { class: "quote" }, warn.text.slice(0, 1400) + (warn.text.length > 1400 ? "…" : ""))))
    );
  }

  /* WHICH COMEDOWN ENTRY BELONGS TO THIS SUBSTANCE.
 *
 * The substance's own id wins, then the first psychoactive class with an
 * entry. Class names come from PsychonautWiki and are exactly what
 * substances.json holds - "Psychedelic" and "Depressant" singular, "Stimulants"
 * and "Opioids" plural - so these keys are matched against the taxonomy rather
 * than against what reads well in English. Getting that wrong is silent: the
 * section simply never appears. */
function comedownFor(doc, s) {
  if (!doc) return null;
  /* SUBSTANCE-SPECIFIC ONLY, by design. The section renders for a drug that has
   * its own comedown entry - the twelve in data/comedown.json - and for
   * nothing else.
   *
   * There was once a fallback to a per-CLASS entry, so any stimulant without
   * its own entry inherited a generic stimulant crash, any psychedelic a
   * generic one, and so on. That put "Coming down" on pages where the words did
   * not address the drug they sat under - the stimulant text opened by naming
   * "cocaine, meth and amphetamines" and would render on a research chemical
   * that is none of them - which read as confident, generic advice about the
   * wrong thing. The class fallback and its data are gone for good: a comedown
   * section only ever speaks about the drug whose page it is on. */
  return doc.bySubstance?.[s.id] || null;
}

/* THE SECTIONS BELOW ARE BUILT INTO VARIABLES, THEN APPENDED IN ORDER.
   The reading order for a substance page was reworked (IA-08): dose and
   duration and the comedown come before the reagent table, which drops to the
   foot as reference. Rather than move large blocks of building code around
   each other - and risk a helper being used before it is defined - each block
   is assigned to a node here and the ordered append happens once, at the end. */

  /* ---- at-a-glance duration tiles ----
     The three numbers someone actually scans for, lifted out of the tables.
     First route with duration data wins; the full per-route tables remain
     below for the rest. */
  let statTilesBlock = null;
  const durRoa = s.roas?.find((r) => r.duration?.onset || r.duration?.peak || r.duration?.total);
  if (durRoa) {
    const d = durRoa.duration;
    const fmt = (x) => Array.isArray(x) && x.length >= 3 ? `${x[0]}–${x[1]} ${x[2]}`
      : Array.isArray(x) ? x.join("–") : x || null;
    const tile = (label, v) => v ? h("div", { class: "stattile" },
      h("span", { class: "stattile__label" }, label),
      h("span", { class: "stattile__v" }, v)) : null;
    const tiles = [tile("Onset", fmt(d.onset)), tile("Peak", fmt(d.peak)), tile("Total", fmt(d.total))].filter(Boolean);
    if (tiles.length) {
      statTilesBlock = h("div", { class: "stattiles" }, tiles,
        h("span", { class: "stattiles__roa" }, durRoa.name));
    }
  }

  /* ---- expected reagent reactions ---- */
  /* Plant and fungal material gets an explanation instead of a color table.
     The table used to render here from PsychonautWiki's per-COMPOUND colors,
     which describe an isolated molecule rather than the bud or mushroom
     somebody is holding - and it appeared under the heading "expected reagent
     reactions", promising a result the chemistry cannot give. Every claim
     below was read at source; see scripts/build-reagents.mjs. */
  let plantBlock = null;
  if (plantMatrix) {
    plantBlock = (
      callout("warn", "A reagent can’t tell you what this is",
        h("p", null,
          "Reagent colors were worked out on powders and crystals. DanceSafe says it " +
          "plainly: plant matter and fungi are difficult, if not impossible, to test " +
          "with at-home tools."),
        /* No reagent is named here any more. Naming one - and this said
           Ehrlich's - reads as a test you could run, however the sentence
           around it is worded. Nothing identifies a mushroom at home, so the
           paragraph makes the point without handing over a procedure. The
           evidence behind it is unchanged: ordinary supermarket mushrooms and
           death cap both produce the same purple as psilocybin, and New Zealand
           drug checkers got no reaction at all from confirmed psilocybin
           mushrooms - and a reaction on the cap but not the stem of the same
           one. */
        /^psilocyb/.test(id)
          ? h("p", null,
              "That goes double for mushrooms. Nothing you can buy identifies a " +
              "species: ordinary supermarket mushrooms produce the same color as " +
              "psilocybin ones, and so does death cap. A color is not an " +
              "identification, and no color does not mean it is clean.")
          : h("p", null,
              "The blue that stands for THC in the cannabis reagent has been recorded " +
              "coming from ordinary thyme and oregano, and no spot test detects synthetic " +
              "cannabinoids at all."),
        h("p", { class: "sec__note" },
          "A lab service is the only way to identify this material or measure its strength."),
        /* The sentence used to end "...is on the Test page" as plain text, on a
           page that could link there. A reader following an instruction should
           not have to go and find the thing they were just told to use. */
        h("a", { class: "bigptr", href: "#/test" },
          h("span", { class: "bigptr__hd" }, "Where to send it"),
          h("span", { class: "bigptr__sub" },
            "Mail-in labs, what each method can actually identify, and what it costs.")))
    );
  }

  let reagentBlock = null;
  if (s.reagentResults?.length) {
    /* Class-based, never an inline style attribute - the CSP has no
       unsafe-inline, so a style attr silently renders nothing (found by
       screenshot: a table of empty squares). The color WORD is always
       present; the swatch is reinforcement. */
    const KNOWN = new Set(["yellow","green","blue","purple","black","brown",
      "orange","red","pink","gray","white","violet","olive"]);
    /* The reaction as one bar with a band per stage, in order, plus the words.
       A reagent result is a SEQUENCE - ["yellow","black"] is one reaction with
       a direction, not two facts - and dots joined by an arrow read as the
       latter. Bands are crisp rather than blended on purpose: see .reagbar in
       app.css, a smooth gradient would paint an olive middle the reaction
       never produces.

       The bar is aria-hidden and the words carry the meaning, so nothing is
       conveyed by colour alone and a screen reader reads "yellow, then black"
       rather than a row of empty spans. */
    const bar = (colors) => h("span", { class: "reagbar", "aria-hidden": "true" },
      colors.map((c) => h("span", { class: KNOWN.has(c) ? `swatch--${c}` : "" })));

    const seq = (colors) => h("span", { class: "reagrow" },
      bar(colors),
      h("span", { class: "reagrow__words" },
        colors.map((c, i) => frag(i ? ", then " : null, c))));

    /* One reading, however it is published: colors, a settling sequence, no
       reaction, or - the case that was silently dropped - no reaction OR
       colors, joined by "or" exactly as the tracker's own copy phrases it. */
    const reading = (x) => {
      const colored = (x.colors || []).length
        ? frag(seq(x.colors),
            x.to ? h("span", { class: "reag__settles" }, "settling to") : null,
            x.to ? seq(x.to) : null)
        : null;
      const none = h("span", { class: "reag__none" }, "No reaction expected");
      if (x.none && colored) return frag(none, h("span", { class: "reag__settles" }, "or"), colored);
      return x.none ? none : (colored || h("span", { class: "reag__none" }, "—"));
    };

    /* This callout used to say flatly "reagents do not detect fentanyl" - on
       the fentanyl page, directly above a table of fentanyl's own reagent
       colors. Both facts are true at different scales, and the old wording
       collapsed them:
         - PURE fentanyl in a lab does react (that is what this table is).
         - Fentanyl mixed INTO something else is present in microgram amounts,
           far below the threshold where a color appears - so the reagent
           shows you the bulk drug and says nothing about the fentanyl.
       The distinction is the whole point, so it is now stated rather than
       compressed into a contradiction. */
    const isOpioidish = cls.some((c) => /opioid/i.test(c)) || /fentanyl|nitazene/i.test(s.name);

    /* SHUT, WITH THE CAVEAT AS THE LEAD OUTSIDE THE FOLD. The colour table is
       reference the reader opens when they want it; the sentence that stops it
       being read as an all-clear is not something they should have to open a
       fold to reach, so it sits above the fold. Same shape as Dose. The
       section heading is kept as the fold's own summary rather than inventing
       a new label. The plant/fungal callout is a separate block and stays
       outside this entirely. */
    reagentBlock = frag(
        callout("warn", "This reads the main drug. It can’t see what else is in there",
          h("p", null,
            "These are the colors you get from this drug on its own. If the expected " +
            "reaction doesn’t show up, that tells you a lot — walk away. If it does " +
            "show up, that tells you very little: it speaks for the bulk of what you " +
            "have, not for everything in it."),
          h("p", null,
            "A reagent cannot find fentanyl mixed into something else. Fentanyl is " +
            "active in microgram amounts, far below the amount a color change can show, " +
            "so a cut sample gives you the color of the main drug either way. " +
            (isOpioidish
              ? "The colors below are what this drug does as pure material in a lab — they are not a way to detect it in a mix. "
              : "") +
            "Fentanyl strips answer that question; reagents answer this one. See the " +
            "Test section for each reagent’s limits.")),
        disclosure("sec-reagent-colors", "Expected reagent reactions", { open: false },
        h("div", { class: "card" },
          h("table", { class: "reagtable" },
            h("tbody", null,
              s.reagentResults.map((r) =>
                h("tr", null,
                  /* The label, not the key. "Morr" and "Simons" were being
                     printed straight out of the data at a reader holding a
                     bottle that says Morris and Simon's. */
                  h("th", { scope: "row" }, reagentLabel(r.reagent)),
                  h("td", null,
                    /* `to` is a SECOND sequence - what the reaction settles
                       into - not a continuation of the first. Concatenating
                       them produced strings like "brown, then green, then
                       brown, then brown, then green" on MDMA/Gallic. All 22
                       entries carrying a `to` were mangled the same way; the
                       old arrow rendering hid it by reading as one long chain.
                       Two sequences, shown as two. */
                    /* ALTERNATIVES, where upstream reported the same reagent
                       twice with different results. PsychonautWiki lists 25C-
                       NBOMe on Mandelin as yellow-red-brown AND yellow-green-
                       brown; pethidine on Mecke as no reaction AND yellow-
                       orange. Those used to render as two rows with the same
                       name, which reads as two reagents. One row, and the
                       readings joined by "or" — never merged into a single
                       sequence, which would invent a reaction neither source
                       reported. */
                    /* BOTH-WAYS ROWS SAY BOTH. A row can carry `none: true` AND
                       colors - cocaine on Marquis (PsychonautWiki: no reaction;
                       DanceSafe's 2023 chart: light pink or peach) and MDA on
                       Simon's (no reaction; or gray-green since ~2021). The
                       reaction is faint and genuinely reported both ways, and
                       the tracker and the flowchart already score it both
                       ways. This cell tested `none` first and never reached
                       the colors, so the drug page told a reader "no reaction
                       expected" while the tracker two tabs over told them
                       peach was fine. Reported from the live site: same
                       reagent, same drug, two answers. One helper renders any
                       reading, so the plain row and the alternatives can no
                       longer disagree with each other either. */
                    r.alts
                      ? frag(r.alts.map((a, i) => frag(
                          i ? h("span", { class: "reag__settles" }, "or") : null,
                          reading(a))))
                      : reading(r)))))))));
  }

  /* ---- dose ---- */
  const dosed = s.roas.filter((r) => r.dose);
  let doseBlock = null;
  if (dosed.length) {
    /* CLOSED BY DEFAULT, and the caveat sits outside it.
       Route-of-administration dose tables are the part of this page that reads
       worst out of context - three taps from launch, they are the first thing
       an App Store reviewer meets under guideline 1.4.3, and they are what a
       screenshot of this app would be cropped to by anyone arguing it promotes
       use. Nothing is deleted: the ranges are defensible, sourced, and the
       reason somebody came here.
       What changes is the order. The warning that these numbers assume a pure,
       correctly identified drug is now unavoidable - you read it before you can
       open the table, rather than above a table already on screen. That is a
       better reading order for a person as well as for a reviewer. */
    doseBlock = (
      section("Dose", "Ranges reported by PsychonautWiki — not a recommendation",
        callout("warn", "Nothing off the street comes measured",
          h("p", null, "These ranges assume a pure drug that is what it says it is. " +
            "What you have may be a different drug, a different strength, or mixed " +
            "unevenly through the batch. Start well below the low end.")),
        disclosure("sec-dose", "Reported Dosage Ranges", { open: false },
          dosed.map((r) => doseTable(r))))
    );
  }

  /* ---- duration ---- */
  const timed = s.roas.filter((r) => r.duration);
  let durationBlock = null;
  if (timed.length) {
    durationBlock = section("How long it lasts", null, timed.map((r) => durationTable(r)));
  }

  /* ---- coming down ----
   *
   * After duration, because it is the question the duration table raises: the
   * table says when the effects stop, and this says what the hours after that
   * are like. Before detection windows, which are about somebody else testing
   * you rather than about you.
   *
   * RENDERS ONLY WHERE THE ADVICE IS ABOUT THIS DRUG. data/comedown.json has a
   * substance-specific entry for twelve drugs, and only those twelve show a
   * section; every other page gets none. Padding a drug page with a class's
   * generic crash would teach the reader to scroll past the one page where the
   * advice is specific to what they took - and this app does not fill space
   * with things that are true of everything. See comedownFor.
   *
   * Awaited rather than appended asynchronously, unlike the mortality block:
   * comedown lives in topics.json, which is already in flight from boot, so
   * there is nothing to wait for by the time this runs. */
  const cd = comedownFor(await data.comedown(), s);
  let comedownBlock = null;
  if (cd) {
    comedownBlock = (
      section("Coming down", null,
        cd.lead ? h("p", { class: "leadin" }, cd.lead) : null,
        frag(cd.items.map((it) =>
          h("div", { class: "card" },
            h("h3", null, it.t),
            h("p", null, it.d),
            it.sources?.length
              ? h("div", { class: "sources" }, it.sources.map((x) => extLink(x.url, x.name)))
              : null)))));
  }

  /* How long it stays DETECTABLE, which is a different question from how long
     it lasts and is the one somebody on probation is actually asking. It sits
     after tolerance now, near the foot of the page, because it is about
     somebody else testing you rather than about the experience - but its
     heading still has to separate it from "How long it lasts".

     Only rendered where we have a verified figure. Most drugs have none, and
     an empty section would read as "we checked and it is short". */
  let detectBlock = null;
  if (detect) {
    detectBlock = (
      section("How long it stays detectable", "On a urine test — a different question from how long the effects last",
        h("div", { class: "card" },
          h("p", null, detect.urine),
          detect.note ? h("p", { class: "sec__note" }, detect.note) : null,
          h("p", { class: "sec__note" }, detect.perDrugNote)),
        h("a", { class: "bigptr", href: "#/supervision" },
          h("span", { class: "bigptr__hd" }, "If you are being tested"),
          h("span", { class: "bigptr__sub" },
            "What a positive screen actually is, how to contest one, and what "
            + "they cannot make you stop taking."))));
  }

  /* ---- tolerance / addiction ---- */
  let toleranceBlock = null;
  if (s.addiction || s.tolerance) {
    toleranceBlock = (
      section("Tolerance and dependence", null,
        h("div", { class: "card" },
          s.addiction ? h("p", null, h("strong", null, "Addiction potential: "), s.addiction) : null,
          s.tolerance?.half ? h("p", null, h("strong", null, "Tolerance halves in: "), s.tolerance.half) : null,
          s.tolerance?.zero ? h("p", null, h("strong", null, "Back to baseline: "), s.tolerance.zero) : null,
          h("p", { class: "sec__note" },
            "Tolerance dropping is a leading cause of overdose accidents. After any " +
            "break — jail, hospital, treatment, illness — a previously normal amount can " +
            "cause one.")))
    );
  }

  /* ---- outbound ----
     The molecule figure used to ride here, beside the PubChem link that
     captions it. It sits under the name again as of 2026-08-19 - see the
     figure's own comment up top. The PubChem link stays in its caption, so
     the citation travelled with it. */
  const readMoreBlock = (
    section("Read more", null,
      h("div", { class: "chips" },
        s.links.psychonautwiki ? extLink(s.links.psychonautwiki, "PsychonautWiki", "btn btn--ghost btn--sm") : null,
        s.links.erowid ? extLink(s.links.erowid, "Erowid", "btn btn--ghost btn--sm") : null,
        extLink(`https://tripsit.me/factsheets/`, "TripSit factsheets", "btn btn--ghost btn--sm"),
        extLink(
          `https://www.drugsdata.org/results.php?search_field=all&s=${encodeURIComponent(s.name)}`,
          "Lab results on DrugsData", "btn btn--ghost btn--sm")),
      h("p", { class: "sec__note" },
        "DrugsData is an archive of laboratory-tested samples. It stopped accepting " +
        "new samples in April 2024, so it shows what was circulating up to then."))
  );

  /* THE ORDER (IA-08): tiles → dose → how long it lasts → coming down →
     tolerance → detectable → the reagent reference (plant/fungal caveat, then
     the folded colour table) → read more → sources. */
  if (statTilesBlock) wrap.appendChild(statTilesBlock);
  if (doseBlock) wrap.appendChild(doseBlock);
  if (durationBlock) wrap.appendChild(durationBlock);
  if (comedownBlock) wrap.appendChild(comedownBlock);
  if (toleranceBlock) wrap.appendChild(toleranceBlock);
  if (detectBlock) wrap.appendChild(detectBlock);
  if (plantBlock) wrap.appendChild(plantBlock);
  if (reagentBlock) wrap.appendChild(reagentBlock);
  wrap.appendChild(readMoreBlock);
  wrap.appendChild(attributionBlock(subs, combos));
  return wrap;
}


/* Route names arrive lowercase from PsychonautWiki - "oral", "insufflated",
   "intravenous" - and were printed straight into a caption, so every duration
   and dose table on a substance page opened with a lowercase word while
   everything around it was sentence case. */
const routeLabel = (n) =>
  String(n || "").replace(/^([a-z])/, (m) => m.toUpperCase());

function doseTable(r) {
  const d = r.dose;
  const fmt = (v) =>
    v == null ? "—" : Array.isArray(v) ? `${v[0] ?? "?"}–${v[1] ?? "?"} ${d.units || ""}` : `${v} ${d.units || ""}`;
  const rows = [
    ["Threshold", d.threshold], ["Light", d.light], ["Common", d.common],
    ["Strong", d.strong], ["Heavy", d.heavy],
  ].filter(([, v]) => v != null);

  /* data--pairs: a fixed first column, so the four dose tables stacked on one
     page all start their Amount column at the same x. See the note in app.css. */
  return h("div", { class: "tablewrap" },
    h("table", { class: "data data--pairs" },
      h("caption", null, `${routeLabel(r.name)} — dose`),
      h("thead", null, h("tr", null,
        h("th", { scope: "col" }, "Tier"), h("th", { scope: "col" }, "Amount"))),
      h("tbody", null, rows.map(([k, v]) =>
        h("tr", null, h("th", { scope: "row" }, k), h("td", null, fmt(v)))))));
}

function durationTable(r) {
  const d = r.duration;
  const fmt = (v) => (!v ? "—" : `${v[0] ?? "?"}–${v[1] ?? "?"} ${v[2] || ""}`);
  const rows = [
    ["Onset", d.onset], ["Come-up", d.comeup], ["Peak", d.peak],
    ["Offset", d.offset], ["Total", d.total],
  ].filter(([, v]) => v);

  return h("div", { class: "tablewrap" },
    h("table", { class: "data data--pairs" },
      h("caption", null, `${routeLabel(r.name)} — duration`),
      h("thead", null, h("tr", null,
        h("th", { scope: "col" }, "Stage"), h("th", { scope: "col" }, "Time"))),
      h("tbody", null, rows.map(([k, v]) =>
        h("tr", null, h("th", { scope: "row" }, k), h("td", null, fmt(v)))))));
}

/* Attribution is a license condition for both PsychonautWiki (CC BY-SA) and
   TripSit (link-back plus a source note on every page showing their data).
   It renders on the index and on every detail page. Do not remove it. */
/* `unc` is the regional dataset's provenance, moved here out of the middle of
   the page. Passing it in rather than fetching it keeps this function
   synchronous and keeps every source in one list. */
function attributionBlock(subs, combos, unc = null) {
  return sourcesDisclosure("Where this data comes from",
    h("ul", { class: "srclist" },
      (subs.attribution || []).map((a) =>
        h("li", null,
          extLink(a.url, a.source), " — ",
          a.licenseUrl ? extLink(a.licenseUrl, a.license) : a.license,
          a.note ? h("span", { class: "sec__note" }, ` ${a.note}`) : null)),
      combos?.attribution
        ? h("li", null,
            extLink(combos.attribution.factsheets, "TripSit"),
            " — combination risk data. ",
            extLink(combos.attribution.comboChart, "Combination chart"))
        : null,
      unc
        ? h("li", null,
            extLink(unc.url, unc.source), " — ", unc.license,
            h("span", { class: "sec__note" }, ` ${unc.period}. ${unc.note}`))
        : null));
}

/* Prescribed medication + everything else.
 *
 * The TripSit matrix barely covers prescriptions, and "I take methadone and
 * also use" is one of the most common real situations there is. Every claim
 * here is individually sourced (data/rx.json) - FDA labels via DailyMed,
 * SAMHSA TIP 63, the Liverpool HIV checker - with per-claim confidence, and
 * the combinations we could NOT source are listed too, so silence is never
 * mistaken for safety. */
async function rxBlock() {
  const d = await data.rx();
  if (!d) return h("span");

  return h("details", { class: "disc", id: "sec-rx" },
    h("summary", null, h("h2", null, "On prescribed medication?")),
    h("div", { class: "disc__body" },
      frag(d.meds.map((m) =>
        h("details", { class: "acc" },
          h("summary", null, h("span", null, m.name)),
          h("div", { class: "acc__body" },
            m.items.map((it) =>
              h("div", { class: "card" },
                h("div", { class: "card__top" },
                  badge(it.confidence === "high" ? "Well documented" : it.confidence, "neutral")),
                /* Sentence-case the lead word - unless it is an acronym.
                   The naive lowercase turned "MDMA, GHB..." into "mDMA". */
                h("h3", null, `With ${/^[A-Z]{2}/.test(it.with) ? it.with
                  : it.with.charAt(0).toLowerCase() + it.with.slice(1)}`),
                h("p", null, it.claim),
                h("div", { class: "sources" },
                  (it.sources || []).map((x) => extLink(x.url, x.name))))))))),
      callout("info", "Where the honest answer is “nobody knows”",
        h("p", null, d.unresolved)),
      checkedLine("Sources verified", d.lastVerified,
        "Never stop a prescribed medication over anything on this page — talk to "
        + "whoever prescribes it.")));
}

/* The condition lens - what PartyWise's Profile should have been.
 *
 * Theirs stores weight, sex, health conditions and a medication list on the
 * device, behind a "100% private" banner. On-device is exactly where this
 * app's threat model lives: the phone gets searched. So this lens is
 * SESSION-ONLY BY CONSTRUCTION - the selection lives in this module variable,
 * never in storage, and the privacy test suite's storage allowlist would fail
 * the build if anyone tried to persist it. Close the tab and it never
 * happened.
 *
 * Conditions appear only when every caution beneath them carries a verified
 * source, and the not-covered list is shown rather than implied. */
let lensPicks = new Set();   // module-scope, deliberately not persisted

/* SESSION STATE FOR THE INLINE TOOLS, and where it may live.
 *
 * The combination checker's picks and the condition lens's selections survive
 * a trip to a drug page and back - so someone who checks "opioids + benzos",
 * taps into a substance to read about one, and comes Back finds their pairing
 * still there. Module variables, never storage: what somebody is checking is
 * exactly the kind of thing the privacy model (and test/privacy.test.mjs's
 * storage allowlist) keeps off the device. Same construction as lensPicks
 * above, and the same as the reagent tracker in views/test.js.
 *
 * Both are wiped early on the two events that mean "someone may be about to
 * look at this screen who should not": Quick Exit (app.js dispatches nl:panic
 * on the document before it clears anything else) and pagehide (backgrounding
 * on iOS, the app-switcher snapshot, a phone changing hands). The page reload
 * a Quick Exit triggers would destroy these anyway; clearing them here is the
 * belt to that brace, and it is what makes "cleared on Quick Exit" true rather
 * than incidental. */
let checkerSession = null;
const forgetCheckerState = () => { checkerSession = null; lensPicks = new Set(); };
document.addEventListener("nl:panic", forgetCheckerState);
window.addEventListener("pagehide", forgetCheckerState);

async function conditionLens() {
  const d = await data.conditions();
  if (!d) return h("span");

  const body = h("div");

  /* HOW MANY ARE PICKED, on the summary, so a shut lens is not a shut box.
     The picks survive a trip to a drug page and Back (lensPicks is
     module-scoped), and a reader returning to a closed "Health conditions"
     row had no way to see that two of theirs were still applied under it.
     A neutral badge with the number - the same accessory the strip cards
     wear for their limit count - in the heading itself, so the summary says
     it. Hidden at zero rather than reading "0". */
  const count = h("span", { class: "badge badge--neutral", hidden: true });
  const syncCount = () => {
    const n = lensPicks.size;
    count.hidden = !n;
    count.textContent = n ? String(n) : "";
  };

  const paint = () => {
    clear(body);
    syncCount();
    const active = d.conditions.filter((c) => lensPicks.has(c.id));
    for (const c of active) {
      body.appendChild(
        h("div", { class: "card" },
          h("h3", null, c.label),
          frag(c.items.map((it) =>
            h("div", { class: "lens__item" },
              h("p", null, it.text),
              h("div", { class: "sources" },
                it.sources.map((x) => x.url.startsWith("#")
                  ? h("a", { href: x.url }, x.name)
                  : extLink(x.url, x.name))))))));
    }
    if (active.length) {
      body.appendChild(h("p", { class: "sec__note" }, d.notCovered));
    }
  };

  const chips = h("div", { class: "chips" },
    d.conditions.map((c) =>
      h("button", {
        type: "button", class: "chip", "aria-pressed": String(lensPicks.has(c.id)),
        onClick: (e) => {
          lensPicks.has(c.id) ? lensPicks.delete(c.id) : lensPicks.add(c.id);
          e.currentTarget.setAttribute("aria-pressed", String(lensPicks.has(c.id)));
          paint();
        },
      }, c.label)));

  paint();

  /* OPEN WHEN ANYTHING IS PICKED. The lens starts shut - nothing is applied,
     nothing to show - but a reader who picked conditions, left for a drug
     page and came Back had them re-applied inside a closed row, which is the
     one state where the shut box hides something the reader did. Picks mean
     open. */
  return h("details", { class: "disc", id: "sec-lens", open: lensPicks.size ? true : null },
    h("summary", null, h("h2", null, "Health conditions", " ", count)),
    h("div", { class: "disc__body" },
      h("p", { class: "sec__note" },
        "Pick anything that applies. Nothing you select here is saved — not on " +
        "this device, not anywhere."),
      chips,
      body));
}
