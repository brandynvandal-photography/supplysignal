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
  jumpNav, disclosure, sourcesDisclosure, skeleton,
} from "../ui.js";
import * as data from "../data.js";
import { CLASSES, classInfo, groupAll } from "../taxonomy.js";
import { draw as drawStructure } from "../structure.js";
import { reagentLabel } from "../reagentnames.js";
import { matchSubstance } from "../substancematch.js";

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
  Dangerous: { kind: "critical", glyph: "▲", rank: 0, label: "Dangerous" },
  Unsafe: { kind: "critical", glyph: "▲", rank: 1, label: "Unsafe" },
  Caution: { kind: "elevated", glyph: "●", rank: 2, label: "Caution" },
  /* "Reduce"/"Amplify each other", not "EFFECTS reduce each other". The longer
     pair needed 203px and the badge gets 183-200px at 375px - three nested
     card paddings deep, that is all the room there is - so both wrapped to two
     lines inside a pill and read as a mistake. "Effects" was the droppable
     word: the badge sits on a combination result, so what is reducing or
     amplifying is not in question. The mechanism is still stated and neither
     one grades safety, which is the rule this table exists to keep. */
  "Low Risk & Decrease": { kind: "neutral", glyph: "○", rank: 3, label: "Reduce each other" },
  "Low Risk & No Synergy": { kind: "neutral", glyph: "○", rank: 4, label: "No known interaction" },
  "Low Risk & Synergy": { kind: "neutral", glyph: "○", rank: 5, label: "Amplify each other" },
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
    ? [data.rx(), data.conditions(), data.market(), data.regional(), import("../regional.js")]
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
      { id: "sec-market", label: "In your region" },
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
      return h("button", {
          type: "button", class: "classcard",
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

  const yoursGroup = group("grp-yours", "Does your situation change the picture?",
    "Prescribed medication and health conditions both change what a combination does.", [
      await rxBlock(),
      await conditionLens(),
    ],
    ["Prescribed medication", "Health conditions"]);

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

  wrap.appendChild(await marketBlock());

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

/* Why an unregulated supply behaves the way it does.
 *
 * Every other section of this app tells someone WHAT to do. This one explains
 * why, and it earns its place because the rules stick better when the
 * mechanism behind them is visible: "assume a new batch is stronger" is an
 * instruction, but "micrograms cannot be mixed evenly by hand" is a reason.
 *
 * The hard boundary, and the reason this is written from data rather than
 * improvised: it explains the market and helps nobody buy in it. No
 * marketplaces, no vendors, no sourcing, no advice on avoiding detection while
 * purchasing. Mechanics, not logistics. Anything added here that would help a
 * person acquire drugs rather than understand them does not belong. */
async function marketBlock() {
  const m = await data.market();
  if (!m) return h("span");

  return h("details", { class: "disc", id: "sec-market" },
    h("summary", null, h("h2", null, m.headline)),
    h("div", { class: "disc__body" },
      /* No intro line. It said the section exists to give the reasoning behind
         the rules - which is what the four mechanisms below do, at length and
         with sources, immediately underneath. Opening a section by explaining
         what the section is for delays the first real sentence by a paragraph,
         and the heading already carries it: somebody who opened "Why the supply
         is like this" knows why they opened it. */
      frag(m.blocks.map((b) =>
        h("div", { class: "card" },
          h("h3", null, b.title),
          h("p", null, b.body),
          b.sotu ? h("p", { class: "sec__note" }, b.sotu) : null,
          b.sources?.length
            ? h("div", { class: "sources" }, b.sources.map((x) => extLink(x.url, x.name)))
            : null))),

      callout("info", m.close.title, h("p", null, m.close.body)),

      /* The omission, said out loud. A reader who came looking for sourcing
         deserves to know it is absent on purpose rather than concluding the
         page is half-finished - and the reason is honest: none of it would
         make them safer. */
      m.scope
        ? h("p", { class: "sec__note" },
            h("strong", null, m.scope.title + " "), m.scope.body)
        : null,

      m.lastVerified
        ? h("p", { class: "sec__note" }, `Checked ${m.lastVerified}.`)
        : null));
}

/** One substance row. Shared by search results and class listings so the two
 *  can never drift apart. */
function row(s, go) {
  return h("button", {
      type: "button", class: "nbr",
      onClick: () => go(`#/substances/${s.id}`),
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

  const paint = (term) => {
    const t = term.trim().toLowerCase();
    const hits = !t ? members : members.filter((s) => matches(s, t));

    clear(list);
    if (!hits.length) {
      list.appendChild(empty("No match in this class.",
        "Clear the filter, or search the Drugs screen to look across all classes."));
      return;
    }
    for (const s of hits) list.appendChild(row(s, go));
  };
  input.addEventListener("input", () => paint(input.value));

  wrap.appendChild(h("div", { class: "search" }, h("div", { class: "search__row" }, input)));
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
     pressed. Atomic so it is read whole; off-screen so nothing visible moves.
     Node replacement so an identical verdict is still announced. */
  const live = h("p", { class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const announce = (parts) => {
    const text = parts.filter(Boolean).join(" ");
    clear(live);
    if (text) live.appendChild(document.createTextNode(text));
  };

  const addBtn = h("button", {
    type: "button", class: "btn btn--ghost btn--sm",
    onClick: () => { addSlot(); check(); },
  }, "+ Add another drug");

  /* Take a row out without stranding focus. The × is inside the row it
     removes, so a keyboard user's focus fell to <body> and their next Tab
     started from the top of the page. Focus moves to the row that takes its
     place, else the one before, else the add button - and only if it was in
     the row, so a mouse user's focus is left where it is. */
  const dropRow = (row) => {
    const active = document.activeElement;
    if (active && row.contains?.(active)) {
      const near = row.nextElementSibling || row.previousElementSibling;
      const target = near?.querySelector?.("select, button") || addBtn;
      target?.focus?.({ preventScroll: true });
    }
    row.remove();
  };

  function makeSelect(i) {
    const sel = h("select", { class: "input", "aria-label": `Substance ${i + 1}` },
      h("option", { value: "" }, "Choose…"),
      cats.map((c) => h("option", { value: c }, prettyCat(c))));
    sel.addEventListener("change", check);
    return sel;
  }

  function addSlot(want) {
    if (slots.length >= MAX_MIX) return;
    const i = slots.length;
    const sel = makeSelect(i);
    /* A value carried across from a previous render (rehydrate below). Only a
       real category is honoured; anything else leaves the row on "Choose…". */
    if (want && cats.includes(want)) sel.value = want;
    /* Same control as the strip picker on Test: label above, the select
       wearing a disclosure row, the chevron centred on it by .pick__field.
       These were the app's only other dropdowns and they were the last two
       still dressed as search fields. */
    const row = h("div", { class: "mixslot" },
      h("label", { class: "pick__row" },
        h("span", { class: "mixlabel" }, i === 0 ? "I took" : "and"),
        h("span", { class: "pick__field" }, sel)),
      i > 1
        ? h("button", {
            type: "button", class: "iconbtn mixslot__x",
            "aria-label": `Remove drug ${i + 1}`,
            onClick: () => {
              const at = slots.indexOf(sel);
              if (at > -1) slots.splice(at, 1);
              /* The number the row wore when pressed; relabel() renumbers
                 what is left. */
              const was = at > -1 ? at + 1 : i + 1;
              dropRow(row);
              relabel();
              check(`Drug ${was} removed.`);
            },
          }, "×")
        : null);
    slots.push(sel);
    rows.appendChild(row);
    addBtn.disabled = slots.length >= MAX_MIX;
  }

  function relabel() {
    [...rows.children].forEach((row, i) => {
      const lab = row.querySelector(".mixlabel");
      if (lab) lab.textContent = i === 0 ? "I took" : "and";
    });
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
      /* This sentence is what lets someone map the pill in their hand onto a
         menu of category names. It rendered BELOW the dropdowns - useful only
         after failing. It is the first thing in the card now. */
      h("p", { class: "sec__note mixnote" },
        "Categories, not brands. Fentanyl, heroin, oxycodone and methadone are all ",
        h("strong", null, "opioids"), "; Xanax, Valium and etizolam are all ",
        h("strong", null, "benzodiazepines"), "."),
      rows,
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

  wrap.appendChild(
    h("button", { type: "button", class: "btn btn--ghost btn--sm", onClick: () => go("#/substances") },
      h("span", { "aria-hidden": "true" }, "‹"), " All drugs")
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
   * IT SITS IN "READ MORE" NOW, BESIDE PubChem, not beside the name. Above
   * the fold it pushed the dose/mix warnings down for a picture; next to the
   * PubChem link that captions it, it is reference material with the rest of
   * the reference material. Built here so the async fill can start at once;
   * appended into the Read more section far below.
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
  const fromMatrix = { dangerous: new Set(), unsafe: new Set() };
  for (const cat of catsOf(s.id)) {
    const row = combos?.matrix?.[cat];
    if (!row) continue;
    for (const [other, cell] of Object.entries(row)) {
      const band = RATING[cell?.s];
      if (band === "dangerous") fromMatrix.dangerous.add(other);
      else if (band === "unsafe") fromMatrix.unsafe.add(other);
    }
  }
  /* Do not repeat a category the per-drug list already names. */
  const seen = new Set([...d, ...u].map((x) => String(x).toLowerCase()));
  const extraD = [...fromMatrix.dangerous].filter((x) => !seen.has(x.toLowerCase()));
  const extraU = [...fromMatrix.unsafe].filter((x) => !seen.has(x.toLowerCase()));

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
  const dAll = prune(dRaw).map((r) => r.label);
  const uAll = prune(uRaw).map((r) => r.label);
  /* A fresh node each time: the same element cannot sit in two callouts. */
  const classNote = () => h("p", { class: "sec__note" },
    "Some of these are whole drug classes, so they cover things this page "
    + "does not name individually.");

  const anything = dAll.length || uAll.length || s.interactions.uncertain.length;

  wrap.appendChild(
    /* "Dangerous to mix with", not "Do not mix with". The heading names what
       the section contains rather than issuing an instruction - the reader
       decides what to do with it. Same rule as the autonomy pass. */
    section("Dangerous to mix with", null,
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
            h("div", { class: "tags" }, dAll.map((x) => h("span", { class: "tag tag--danger" }, x))),
            extraD.length ? classNote() : null)
        : null,
      uAll.length
        ? callout("warn", "Unsafe",
            h("div", { class: "tags" }, uAll.map((x) => h("span", { class: "tag" }, x))),
            extraU.length ? classNote() : null)
        : null,
      s.interactions.uncertain.length
        ? h("p", { class: "sec__note" },
            `Uncertain: ${s.interactions.uncertain.map(prettyCat).join(", ")}`)
        : null,
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
  const byId = doc.bySubstance?.[s.id];
  if (byId) return byId;
  /* MOST SPECIFIC CLASS FIRST, NOT FIRST-LISTED.
   *
   * PsychonautWiki lists MDA as ["Psychedelic", "Entactogen", "Stimulants"],
   * so taking the first match handed MDA the psychedelic entry - the same
   * advice LSD gets, for a drug that runs four hours longer and finishes like
   * a stimulant. The order below is by how much the comedown actually differs:
   * a drug that is both an entactogen and a psychedelic has an entactogen's
   * week, and one that is both a stimulant and something else has a
   * stimulant's crash. */
  const ORDER = ["Opioids", "Depressant", "Entactogen", "Dissociatives", "Stimulants", "Psychedelic"];
  const classes = s.class?.psychoactive || [];
  for (const c of ORDER) {
    if (classes.includes(c) && doc.byClass?.[c]) return doc.byClass[c];
  }
  for (const c of classes) {
    const hit = doc.byClass?.[c];
    if (hit) return hit;
  }
  return null;
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
                      : reading(r)))))))),
        /* Into the tool that scores these colours, seeded on this drug. Sits
           OUTSIDE the fold, so the deep-link stays visible without opening the
           colour table. The table above is the forward answer — what this drug
           does — and the tracker is the reverse one: enter what you actually
           saw and it walks the chart for this substance. Deep-linked with the
           id in the FRAGMENT (see routes.js), never the path. */
        h("a", { class: "bigptr", href: `#/test/tracker/${id}` },
          h("span", { class: "bigptr__hd" }, "Run a reagent test for this"),
          h("span", { class: "bigptr__sub" },
            "Say what each reagent did and the tracker checks it against " +
            s.name + "’s published sequence.")));
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
        disclosure("sec-dose", "Show reported dose ranges", { open: false },
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
   * RENDERS ONLY WHERE THERE IS SOMETHING TO SAY. data/comedown.json has an
   * entry for six psychoactive classes and a handful of substances; the other
   * 48 substances get no section at all. Padding every drug page with "drink
   * water and get some sleep" would teach the reader to scroll past the one
   * page where the advice is specific to what they took - and this app does
   * not fill space with things that are true of everything.
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
     The molecule figure rides here now (structFig, built up top so its async
     fill starts early), beside the PubChem link that captions it - reference
     material with the rest of the reference material, rather than a picture
     above the dose and mix warnings. */
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
        "new samples in April 2024, so it shows what was circulating up to then."),
      structFig)
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
    h("table", { class: "data data--pairs data--right" },
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
      h("p", { class: "sec__note" },
        `Sources verified ${d.lastVerified}. Never stop a prescribed medication ` +
        "over anything on this page — talk to whoever prescribes it.")));
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

  const paint = () => {
    clear(body);
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

  return h("details", { class: "disc", id: "sec-lens" },
    h("summary", null, h("h2", null, "Health conditions")),
    h("div", { class: "disc__body" },
      h("p", { class: "sec__note" },
        "Pick anything that applies. Nothing you select here is saved — not on " +
        "this device, not anywhere."),
      chips,
      body));
}
