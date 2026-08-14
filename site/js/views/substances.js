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
  jumpNav, disclosure, sourcesDisclosure,
} from "../ui.js";
import * as data from "../data.js";
import { CLASSES, classInfo, groupAll } from "../taxonomy.js";

/* `label` is what renders; the KEY is TripSit's verbatim status, kept for
   data fidelity and shown in the definitions block. The raw terms are chart
   jargon ("Low Risk & Decrease") and, worse, they put the words "Low Risk"
   in the app's own mouth about a drug combination - the closest this app
   ever came to calling something safe. The labels state the mechanism
   instead and never grade safety. */
const RISK = {
  Dangerous: { kind: "critical", glyph: "▲", rank: 0, label: "Dangerous" },
  Unsafe: { kind: "critical", glyph: "▲", rank: 1, label: "Unsafe" },
  Caution: { kind: "elevated", glyph: "●", rank: 2, label: "Caution" },
  "Low Risk & Decrease": { kind: "neutral", glyph: "○", rank: 3, label: "Effects reduce each other" },
  "Low Risk & No Synergy": { kind: "neutral", glyph: "○", rank: 4, label: "No known interaction" },
  "Low Risk & Synergy": { kind: "neutral", glyph: "○", rank: 5, label: "Effects amplify each other" },
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
    jumpNav([
      { id: "sec-find", label: "Find a drug" },
      { id: "sec-checker", label: "Combination checker" },
      { id: "grp-yours", label: "Your situation" },
      { id: "sec-market", label: "In your region" },
    ]));

  wrap.appendChild(
    h("p", { class: "sec__note" },
      "What something is, what it does, how long it lasts, and which combinations " +
      "carry the most risk — plus what a reagent can and cannot tell you about " +
      "it. Search by name, or browse by class."));

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
      .filter((s) =>
        s.name.toLowerCase().includes(t) ||
        s.aliases.some((a) => a.toLowerCase().includes(t)))
      .slice(0, 40);

    if (!hits.length) {
      list.appendChild(empty("No match.",
        "Try another name, or browse by class. Not every drug has published dose data."));
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
  const mixSlot = h("div", { class: "checkerslot", id: "sec-checker" });
  wrap.appendChild(mixSlot);

  /* Built here, rendered inside the checker below - see the note in
     mixChecker for why it belongs with the result rather than after it. */
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
    attrSlot.replaceChildren(attributionBlock(subs, combos, uncAttr));
  }).catch(() => {
    mixSlot.replaceChildren(yoursGroup);
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
      h("p", { class: "sec__note" }, m.intro),

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

  wrap.appendChild(
    callout("warn", "Found in the supply — not sold as itself",
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
      "Go back to Substances to browse the classes.");
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
    const hits = !t ? members : members.filter((s) =>
      s.name.toLowerCase().includes(t) || s.aliases.some((a) => a.toLowerCase().includes(t)));

    clear(list);
    if (!hits.length) {
      list.appendChild(empty("No match in this class.",
        "Clear the filter, or search from the Substances screen to look across all classes."));
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
      "Some drugs belong to more than one class and appear in each. " +
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
  const out = h("div", { class: "mixout", role: "status", "aria-live": "polite" });

  const addBtn = h("button", {
    type: "button", class: "btn btn--ghost btn--sm",
    onClick: () => { addSlot(); check(); },
  }, "+ Add another drug");

  function makeSelect(i) {
    const sel = h("select", { class: "input", "aria-label": `Substance ${i + 1}` },
      h("option", { value: "" }, "Choose…"),
      cats.map((c) => h("option", { value: c }, prettyCat(c))));
    sel.addEventListener("change", check);
    return sel;
  }

  function addSlot() {
    if (slots.length >= MAX_MIX) return;
    const i = slots.length;
    const sel = makeSelect(i);
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
              row.remove();
              relabel();
              check();
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

  function check() {
    clear(out);
    const picked = slots.map((s) => s.value).filter(Boolean);
    const unique = [...new Set(picked)];

    if (picked.length > unique.length) {
      out.appendChild(callout("warn", "Same category chosen twice",
        h("p", null,
          "Taking more of the same thing raises the dose. Redosing before the " +
          "first amount has fully come up is a common way people take far more " +
          "than they meant to.")));
    }
    if (unique.length < 2) return;

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
      out.appendChild(
        callout("stop", `${deps.length} of these slow your breathing`,
          h("p", null,
            deps.map(prettyCat).join(", ") + " all suppress breathing, and the " +
            "effects stack. Taken together they are more dangerous than any pair " +
            "above shows, because the pair view can only compare two at a time."),
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
  }

  addSlot();
  addSlot();

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
      out),
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

  const cls = [...(s.class.psychoactive || []), ...(s.class.chemical || [])];
  if (cls.length) {
    wrap.appendChild(h("div", { class: "tags" }, cls.slice(0, 6).map((c) => h("span", { class: "tag" }, c))));
  }

  /* A deceptive street name is an adulteration vector: someone holding "tusi"
     searched their way here believing they hold 2C-B. This renders before
     anything else so the correction lands first. */
  if (s.nameWarning) {
    wrap.appendChild(
      callout("warn", "Sold under a misleading name",
        h("p", null, s.nameWarning.text),
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
       cannot identify. 250 of 302 entries are in this state, almost all of
       them obscure research chemicals with no plain-language description
       published anywhere we could check - and writing one from memory is
       exactly how a confident sentence about an unfamiliar drug ends up
       wrong. An absence, stated, is more useful than a guess. */
    wrap.appendChild(
      h("div", { class: "leadin leadin--none" },
        h("p", null,
          "We don’t have a plain description of this one yet. Nobody has published a " +
          "checked one, and we would rather leave a gap than write something that " +
          "sounds confident and turns out to be wrong."),
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

  const anything = d.length || u.length || extraD.length || extraU.length ||
                   s.interactions.uncertain.length;

  wrap.appendChild(
    /* "Dangerous to mix with", not "Do not mix with". The heading names what
       the section contains rather than issuing an instruction - the reader
       decides what to do with it. Same rule as the autonomy pass. */
    section("Dangerous to mix with", null,
      d.length
        ? callout("stop", "Dangerous",
            h("div", { class: "tags" }, d.map((x) => h("span", { class: "tag tag--danger" }, x))))
        : null,
      u.length
        ? callout("warn", "Unsafe",
            h("div", { class: "tags" }, u.map((x) => h("span", { class: "tag" }, x))))
        : null,
      extraD.length
        ? callout("stop", "Dangerous, by drug class",
            h("p", { class: "sec__note" },
              "Rated against whole classes rather than named drugs, so it covers "
              + "things this page does not list individually."),
            h("div", { class: "tags" }, extraD.map((x) => h("span", { class: "tag tag--danger" }, x))))
        : null,
      extraU.length
        ? callout("warn", "Unsafe, by drug class",
            h("div", { class: "tags" }, extraU.map((x) => h("span", { class: "tag" }, x))))
        : null,
      s.interactions.uncertain.length
        ? h("p", { class: "sec__note" }, `Uncertain: ${s.interactions.uncertain.join(", ")}`)
        : null,
      /* The stated absence. An empty section here would read as "nothing to
         worry about", which is the one thing it must never mean. */
      anything
        ? null
        : callout("warn", "We have no interaction data for this one",
            h("p", null,
              "That is a gap in what has been published, not a finding that it "
              + "mixes safely. Anything combined with it is an unknown, and the "
              + "combination checker will say the same rather than guess."))));

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

  /* ---- at-a-glance duration tiles ----
     The three numbers someone actually scans for, lifted out of the tables.
     First route with duration data wins; the full per-route tables remain
     below for the rest. */
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
      wrap.appendChild(h("div", { class: "stattiles" }, tiles,
        h("span", { class: "stattiles__roa" }, durRoa.name)));
    }
  }

  /* ---- expected reagent reactions ---- */
  /* Plant and fungal material gets an explanation instead of a color table.
     The table used to render here from PsychonautWiki's per-COMPOUND colors,
     which describe an isolated molecule rather than the bud or mushroom
     somebody is holding - and it appeared under the heading "expected reagent
     reactions", promising a result the chemistry cannot give. Every claim
     below was read at source; see scripts/build-reagents.mjs. */
  if (plantMatrix) {
    wrap.appendChild(
      callout("warn", "A reagent can’t tell you what this is",
        h("p", null,
          "Reagent colors are worked out on powders and crystals. DanceSafe puts it " +
          "plainly: plant matter and fungi are difficult, if not impossible, to test " +
          "with at-home tools."),
        /^psilocyb/.test(id)
          ? h("p", null,
              "Ehrlich’s turns purple for indoles in general — ordinary supermarket " +
              "mushrooms can do it, and so can death cap. Drug checkers in New Zealand " +
              "also got no reaction at all from confirmed psilocybin mushrooms, and a " +
              "reaction on the cap but not the stem of the same one. A purple result " +
              "does not tell you the species, and no result does not mean it is clean.")
          : h("p", null,
              "The blue that stands for THC in the cannabis reagent has been recorded " +
              "coming from ordinary thyme and oregano, and no spot test detects synthetic " +
              "cannabinoids at all."),
        h("p", { class: "sec__note" },
          "A lab service is the only way to identify this material or measure its strength. " +
          "Where to send it is on the Test page."))
    );
  }

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

    wrap.appendChild(
      section("Expected reagent reactions", "From PsychonautWiki",
        callout("warn", "This identifies the main drug — it cannot find what is mixed in",
          h("p", null,
            "These are the colors a reagent gives with this drug on its own. " +
            "The expected reaction failing to appear is strong information — walk away. " +
            "The expected color appearing is weak information: it tells you the bulk of " +
            "the sample, not what else is in there."),
          h("p", null,
            "A reagent cannot find fentanyl mixed into something else. Fentanyl is " +
            "active in microgram amounts, far below the amount a color change can show, " +
            "so a cut sample gives you the color of the main drug either way. " +
            (isOpioidish
              ? "The colors below are what this drug does as pure material in a lab — they are not a way to detect it in a mix. "
              : "") +
            "Fentanyl strips answer that question; reagents answer this one. See the " +
            "Test section for each reagent’s limits.")),
        h("div", { class: "card" },
          h("table", { class: "reagtable" },
            h("tbody", null,
              s.reagentResults.map((r) =>
                h("tr", null,
                  h("th", { scope: "row" }, r.reagent),
                  h("td", null,
                    /* `to` is a SECOND sequence - what the reaction settles
                       into - not a continuation of the first. Concatenating
                       them produced strings like "brown, then green, then
                       brown, then brown, then green" on MDMA/Gallic. All 22
                       entries carrying a `to` were mangled the same way; the
                       old arrow rendering hid it by reading as one long chain.
                       Two sequences, shown as two. */
                    r.none
                      ? h("span", { class: "reag__none" }, "No reaction expected")
                      : frag(
                          seq(r.colors),
                          r.to ? h("span", { class: "reag__settles" }, "settling to") : null,
                          r.to ? seq(r.to) : null))))))))
    );
  }

  /* ---- dose ---- */
  const dosed = s.roas.filter((r) => r.dose);
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
    wrap.appendChild(
      section("Dose", "Ranges reported by PsychonautWiki — not a recommendation",
        callout("warn", "A street supply is not a measured dose",
          h("p", null, "These ranges assume a pure, correctly identified drug. " +
            "Anything from an unregulated supply may be a different drug, a different " +
            "strength, or unevenly mixed. Start far below the low end.")),
        disclosure("sec-dose", "Show reported dose ranges", { open: false },
          dosed.map((r) => doseTable(r))))
    );
  }

  /* ---- duration ---- */
  const timed = s.roas.filter((r) => r.duration);
  if (timed.length) {
    wrap.appendChild(section("How long it lasts", null, timed.map((r) => durationTable(r))));
  }

  /* How long it stays DETECTABLE, which is a different question from how long
     it lasts and is the one somebody on probation is actually asking. Placed
     immediately after the duration table because the two get confused, and the
     heading has to do the work of separating them.

     Only rendered where we have a verified figure. Most drugs have none, and
     an empty section would read as "we checked and it is short". */
  if (detect) {
    wrap.appendChild(
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
  if (s.addiction || s.tolerance) {
    wrap.appendChild(
      section("Tolerance and dependence", null,
        h("div", { class: "card" },
          s.addiction ? h("p", null, h("strong", null, "Addiction potential: "), s.addiction) : null,
          s.tolerance?.half ? h("p", null, h("strong", null, "Tolerance halves in: "), s.tolerance.half) : null,
          s.tolerance?.zero ? h("p", null, h("strong", null, "Back to baseline: "), s.tolerance.zero) : null,
          h("p", { class: "sec__note" },
            "Tolerance dropping is a leading cause of fatal overdose. After any break — " +
            "jail, hospital, treatment, illness — a previously normal amount can be fatal.")))
    );
  }

  /* ---- outbound ---- */
  wrap.appendChild(
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

  wrap.appendChild(attributionBlock(subs, combos));
  return wrap;
}


function doseTable(r) {
  const d = r.dose;
  const fmt = (v) =>
    v == null ? "—" : Array.isArray(v) ? `${v[0] ?? "?"}–${v[1] ?? "?"} ${d.units || ""}` : `${v} ${d.units || ""}`;
  const rows = [
    ["Threshold", d.threshold], ["Light", d.light], ["Common", d.common],
    ["Strong", d.strong], ["Heavy", d.heavy],
  ].filter(([, v]) => v != null);

  return h("div", { class: "tablewrap" },
    h("table", { class: "data" },
      h("caption", null, `${r.name} — dose`),
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
    h("table", { class: "data" },
      h("caption", null, `${r.name} — duration`),
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
      h("p", { class: "sec__note" }, d.intro),
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
      callout("info", "What nobody has good data on",
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
        "Pick anything that applies and the cautions that are actually sourced appear. " +
        "Nothing you select here is saved — not on this device, not anywhere. " +
        "Close the tab and it’s gone."),
      chips,
      body));
}
