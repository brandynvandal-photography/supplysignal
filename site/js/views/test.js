/* How to test a supply.
 *
 * Two things drive the layout. First, "one line means positive" is backwards
 * from every other test strip people have used, and misreading it is the
 * failure mode that gets someone killed - so it is the first thing on screen,
 * stated as plainly as it can be stated, before any procedure detail.
 *
 * Second, published guidance genuinely conflicts (water volumes vary by up to
 * ten times between CDC, DanceSafe, and state health departments, because the
 * requirement differs by strip brand). Rather than pick a number and present it
 * as settled, this teaches the mechanism and says where sources disagree.
 * Every source is linked so a reader can check the original. */

import {
  h, frag, clear, section, callout, badge, extLink, empty, disclosure, jumpNav,
  group, sourceSink,
} from "../ui.js";
import * as data from "../data.js";

export async function render() {
  const g = await data.testingGuide();
  if (!g) return empty("The testing guide could not load.", "Check your connection and try again.");

  SRC = sourceSink();          // fresh per render; see the note on sourceRow
  const wrap = h("div");

  wrap.appendChild(h("h1", null, "Test your supply"));

  wrap.appendChild(
    /* One chip per top-level section, in page order. It had accumulated one
       per SUB-section too, which after grouping meant eleven chips, "Reagents"
       listed twice, and entries pointing inside collapsed parents. */
    jumpNav([
      { id: "sec-reading", label: "Reading a strip" },
      { id: "sec-prevalence", label: "What's out there" },
      { id: "sec-compare", label: "Which one to get" },
      { id: "sec-strips", label: "Test strips" },
      { id: "grp-reagents", label: "Reagents" },
      { id: "sec-storage", label: "Storing supplies" },
    ])
  );

  /* ---- framing stays outside the collapsing, and short ----
     .intro, not callout("info"). This is the page introducing itself, which is
     the same act as the Alerts welcome and the Support letter, so it wears the
     same soft wash. A filled info panel here spent a severity treatment on a
     sentence that warns of nothing - and made the real callouts further down
     the page worth slightly less. */
  wrap.appendChild(
    h("div", { class: "intro" },
      h("h2", null, g.framing.headline),
      h("p", null, g.framing.ruleInRuleOut))
  );


  /* The page had no section headings at all, so eight top-level disclosures
     floated in a row and nothing told a reader where one idea ended and the
     next began. Three headings, in the order the questions actually arrive:
     what a test can tell me, which one do I get, how do I run it. */
  wrap.appendChild(section("What a test can tell you", null));

  wrap.appendChild(
    disclosure("sec-limits", "What testing can and cannot tell you", null,
      h("div", { class: "card" },
        h("div", { class: "twocol" },
          h("div", null,
            h("h3", null, "What testing can do"),
            h("ul", null, g.framing.canBullets.map((b) => h("li", null, b)))),
          h("div", null,
            h("h3", null, "What it cannot do"),
            h("ul", null, g.framing.cannotBullets.map((b) => h("li", null, b))))),
        sourceRow(g.framing.sources)))
  );

  /* ---- what is actually out there ----
     Deliberately specific. "Fentanyl is in everything" is falsifiable against
     a reader's own experience, and once it fails they discount the warnings
     that are true. Real numbers hold up and are a better argument for
     testing than alarm is. */
  /* ---- reading strips ----
     The ONLY section open by default. "One line means positive" is inverted
     from every strip most people have used, and a half-read explanation of it
     is more dangerous than none. It does not get hidden behind a click. */
  const fts = g.strips.find((s) => s.id === "fentanyl");
  wrap.appendChild(
    /* Open, but not toned urgent. disc--urgent only paints the summary in
       --critical, which on THIS page is the colour of a positive fentanyl
       result - spending it on a default-open explainer where nothing is wrong
       made the real result cards below mean slightly less. */
    disclosure("sec-reading", "Reading a test strip",
      { open: true },
      h("div", { class: "readout" },
        resultCard("1", "line", "POSITIVE", "Drug detected", "critical"),
        /* Neutral, not green. A green NEGATIVE card under the headline
           "testing never gives a green light" was the app contradicting
           itself in color while agreeing in words. Only POSITIVE keeps a
           severity color; a negative cannot rule out nitazenes or every
           analogue, and the card now says so. */
        resultCard("2", "lines", "NEGATIVE", "Not detected — can’t rule out everything", "neutral"),
        resultCard("0", "lines", "INVALID", "Retest with a new strip", "neutral")),
      callout("warn", "Why one line means positive",
        h("p", null, fts.reading.explain),
        h("p", null, fts.reading.faintLine)),
      /* Directly under how to read one, because it changes how to read one.
         It lived inside each strip's own card, which is where it belongs by
         subject and nowhere near where anyone would find it: Test, then Test
         strips, then Fentanyl test strips, two collapsed disclosures deep.
         A five-fold difference in how much water to use is not detail. */
      brandPicker(g.brands))
  );

  /* The prevalence table is the page's center of gravity - the claims audit
     made visible, answering the question people actually arrive with. It was
     buried under the reagent block in a closed disclosure with its headline
     rendered twice. Now: first content block, open by default, said once. */
  if (g.prevalence) {
    wrap.appendChild(
      disclosure("sec-prevalence", g.prevalence.headline, { open: true },
        prevalenceBlock(g.prevalence))
    );
  }

  /* One level, not two. This was a section called "Getting hold of one"
     wrapping a single tile called "Choosing a test" - a heading over one
     child, with the two names disagreeing, over content that is really about
     choosing, buying, legality AND labs. The heading now does the grouping
     itself and the five sections sit directly under it, which also matches
     how the other two blocks on this page are built. */
  wrap.appendChild(section("Which one to get",
    "Which tool answers which question, where to buy it, whether it is legal where you are, and how to get a lab to check."));

  wrap.appendChild(
    frag([
      /* The at-a-glance comparison leads: someone deciding WHICH test to use
         cannot answer that from four separate sections read in sequence - the
         differences only become visible side by side. */
      g.compare ? (
        disclosure("sec-compare", g.compare.headline, null,
          h("p", { class: "sec__note" }, g.compare.intro),

          /* .card + .reagtable, the same shape the reagent tables and the
             fentanyl-prevalence table use, so every data block on this page
             reads as the same kind of thing.
             
             This one had four columns and a 520px floor, and scrolled sideways
             on purpose - the comment on .cmp argued that wrapping every cell
             would destroy the side-by-side reading the table exists for. That
             was true on a desktop and false where this is actually read: on a
             375px screen the table was 520px inside a 293px wrapper, so 229px
             of it - "what it misses" and most of the negative - sat off-screen,
             and reaching them scrolled the tool name away. There was no side by
             side to protect.
             
             So the four columns become one labelled block per tool. The column
             headers do not vanish the way the reagent table's did, because
             unlike "Drug / Reaction" they each carry meaning the cell alone
             does not - they move inline, which is what the stacked layout was
             going to do to them at 560px anyway. */
          h("div", { class: "card" },
            h("table", { class: "reagtable" },
              h("caption", { class: "sr-only" },
                "What each test finds, what it misses, and how much a negative result is worth"),
              h("tbody", null, g.compare.rows.map((r) =>
                h("tr", null,
                  h("th", { scope: "row" }, r.tool),
                  h("td", null,
                    h("span", { class: "cellnote" },
                      h("strong", null, "Finds: "), r.finds),
                    h("span", { class: "cellnote" },
                      h("strong", null, "Misses: "), r.misses),
                    h("span", { class: "cellnote" },
                      h("strong", null, "A negative is worth: "),
                      /* The word carries it; the tint only reinforces.
                         rate--mid was asked for here and has never existed in
                         the stylesheet, so "medium" and "different question"
                         rendered as bare text sitting between two real pills.
                         --verylow is the neutral tier that was already there;
                         adding a second class to do its job is how the pair
                         drift apart later. */
                      h("span", { class: `rate rate--${
                        r.confidence === "high" ? "low"
                        : r.confidence === "low" ? "high"
                        : "verylow"
                      }` }, r.confidence === "n/a" ? "different question" : r.confidence),
                      " ", r.negative))))))),

          h("p", { class: "sec__note" }, g.compare.note))
      ) : null,
      /* "Where to buy" and "who to buy from" are two questions, and the second
         was buried at the foot of the first - past the trap warning, the price
         list and the state-law callout. Someone who already knows what they
         need and just wants a trustworthy shop had to read all of that to find
         four links. Its own section, straight after. */
      g.buying?.storefronts ? (
        disclosure("sec-shops", g.buying.storefronts.title, null,
          h("p", { class: "sec__note" }, g.buying.storefronts.intro),
          frag(g.buying.storefronts.shops.map((sh) =>
            h("div", { class: "card" },
              h("h3", null, sh.name),
              h("p", null, h("strong", null, "Carries: "), sh.carries),
              h("p", { class: "sec__note" }, sh.why),
              h("div", { class: "sources" }, extLink(sh.url, "Visit the store"))))),
          callout("warn", g.buying.storefronts.avoid.title,
            h("p", null, g.buying.storefronts.avoid.body)))
      ) : null,

      /* Where to buy comes before how to read: the urine-screen confusion is a
         purchase someone makes once, wrongly, then believes they have checked
         their supply. */
      g.buying ? (
        disclosure("sec-buying", g.buying.headline, null,
          h("p", { class: "sec__note" }, g.buying.intro),
  
          callout("stop", g.buying.trap.title,
            h("p", null, g.buying.trap.body),
            h("p", null, h("strong", null, "How to tell them apart: "), g.buying.trap.tell),
            h("p", { class: "sec__note" }, g.buying.trap.examples)),
  
          frag(g.buying.items.map((it) =>
            h("div", { class: "card" },
              h("h3", null, it.what),
              h("p", null, h("strong", null, "Where: "), it.where),
              h("p", null, h("strong", null, "About: "), it.price),
              h("p", { class: "sec__note" }, it.note),
              /* Organizations named in the prose get linked where they are
                 named. "Grassroots Harm Reduction" as unlinked text reads as
                 a category of program rather than the specific place it is. */
              it.links
                ? h("div", { class: "sources" }, it.links.map((l) => extLink(l.url, l.name)))
                : null))),
  
          callout("warn", g.buying.legal.title,
            h("p", null, g.buying.legal.body),
            h("p", { class: "sec__note" }, g.buying.legal.note),
            h("div", { class: "sources" },
              g.buying.legal.sources.map((x) => extLink(x.url, x.name)))),
  
          sourceRow(g.buying.sources),
          h("p", { class: "sec__note" },
            `Prices and availability checked ${g.buying.lastVerified}. Both change.`))
      ) : null,
      (
      disclosure("sec-legal", "Is this legal where you are?", null,
        h("div", { class: "card" },
          h("h3", null, g.legal.headline),
          h("p", null, g.legal.body),
          h("p", null, g.legal.stale),
          h("p", null, h("strong", null, g.legal.advice)),
          sourceRow([g.legal.source])))
    ),
      (
      disclosure("sec-labs", "Getting a lab to confirm it", null,
        h("div", { class: "card" },
          h("p", null, g.labs.intro),
          h("ul", null, g.labs.options.map((o) =>
            h("li", null, h("strong", null, o.name), " — ", o.detail))),
          h("div", { class: "chips" },
            g.labs.options.map((o) => extLink(o.url, o.name, "btn btn--ghost btn--sm"))),
          callout("warn", "DrugsData is not accepting samples", h("p", null, g.labs.note))),

        /* What the machines are. "Send it to a lab" is advice people are given
           constantly without ever being told what a lab does differently -
           and the difference (FTIR reads the bulk, GC-MS finds the traces) is
           exactly what explains why a strip and a lab answer different
           questions, and why services run both. */
        g.labs.how ? frag(
          h("h3", null, g.labs.how.title),
          h("p", { class: "sec__note" }, g.labs.how.intro),
          frag(g.labs.how.methods.map((m) =>
            h("div", { class: "card" },
              h("h4", null, m.name),
              h("p", null, m.what),
              h("p", null, h("strong", null, "Strength: "), m.good),
              h("p", { class: "sec__note" }, h("strong", null, "Limits: "), m.limits)))),
          h("p", { class: "sec__note" }, g.labs.how.bottom)
        ) : null)
    ),
    ])
  );

  wrap.appendChild(section("Using it", null));

  wrap.appendChild(
    disclosure("sec-strips", "Test strips", null,
      g.strips.map((s) => stripCard(s, g)))
  );

  wrap.appendChild(
    group("grp-reagents", "Reagent testing",
      "What reagents do, how to run one, and how to handle the chemicals.", [
      (
      /* "Reagents", not "Reagent testing" - the parent tile is already called
         Reagent testing, and a child repeating its parent's name tells a
         reader nothing about which of the three sections they want. */
      disclosure("sec-reagents", "Reagents",
        null,
        /* The heading is scoped to the question a reader actually asks -
           "is fentanyl in MY drugs" - rather than to reagent chemistry.
           Reference-grade fentanyl DOES react with Marquis, so the flat claim
           "no reagent detects fentanyl" is refutable, and a rule that can be
           refuted is a rule someone talks themselves out of at the wrong
           moment. This version cannot be refuted and is the same sentence
           DanceSafe publishes. The chemistry nuance lives below, collapsed,
           where it cannot read as permission. */
        callout("stop", "No reagent can tell you if fentanyl is in your drugs",
          h("p", null, g.reagentIntro.cannotDetectFentanyl)),
        reagentFilter(g.reagents),
        h("details", { class: "acc" },
          h("summary", null, h("span", null, "Why a color can be hidden")),
          h("div", { class: "acc__body" },
            h("ul", null, g.reagentIntro.masking.map((m) => h("li", null, m))),
            h("p", null, g.reagentIntro.mixtures))),
        g.reagentIntro.pureSampleNote
          ? h("details", { class: "acc" },
              h("summary", null,
                h("span", null, g.reagentIntro.pureSampleNote.q)),
              h("div", { class: "acc__body" },
                h("p", null, g.reagentIntro.pureSampleNote.a),
                h("p", null, g.reagentIntro.pureSampleNote.b),
                sourceRow(g.reagentIntro.pureSampleNote.sources)))
          : null)
    ),
      (
      disclosure("sec-procedure", "How to run a reagent test", null,
        h("ol", { class: "steps" },
          g.procedure.map((p) => h("li", null, h("h4", null, p.title), h("p", null, p.body)))))
    ),
      (
      disclosure("sec-safety", "Handling reagents safely", null,
        callout("warn", "Protect your eyes and skin", h("p", null, g.safety.ppe)),
        h("div", { class: "card" },
          h("h3", null, "If it gets on you"),
          h("ul", null, g.safety.firstAid.map((f) => h("li", null, f))),
          h("h3", null, "Storage and shelf life"),
          h("p", null, g.safety.storage),
          h("p", null, g.safety.expiry),
          h("p", null, h("strong", null, "Check it still works: "), g.safety.validate),
          h("h3", null, "Disposal"),
          h("p", null, g.safety.disposal)))
    ),
    ],
    ["Reagents", "Running a test", "Handling them safely"])
  );

  if (g.storage) {
    wrap.appendChild(
      disclosure("sec-storage", g.storage.headline, null,
        h("p", { class: "sec__note" }, g.storage.intro),
        frag(g.storage.items.map((it) =>
          h("div", { class: "card" },
            h("h3", null, it.what),
            h("p", null, h("strong", null, "Keep it: "), it.how),
            h("p", null, it.why),
            it.life ? h("p", { class: "sec__note" }, it.life) : null))),
        sourceRow(g.storage.sources))
    );
  }


  wrap.appendChild(
    disclosure("sec-companion", "Whatever the test says", { open: true },
      h("div", { class: "card" },
        h("ul", null, g.companion.map((c) => h("li", null, c)))))
  );

  const sources = SRC.render();
  if (sources) wrap.appendChild(sources);

  return wrap;
}

/* ------------------------------------------------------------- components */

/**
 * Reagent list with a substance filter.
 *
 * The useful question is almost never "what does Mandelin do" - it is "I have
 * this, what should it look like". Typing a substance narrows every reagent to
 * the rows that mention it and opens the ones that match, which turns eight
 * separate tables into one answer.
 */
function reagentFilter(reagents) {
  const cards = reagents.map((r) => ({ r, el: reagentCard(r) }));
  const list = h("div", null, cards.map((c) => c.el));

  const input = h("input", {
    class: "input", type: "search", autocomplete: "off", spellcheck: "false",
    "aria-label": "Filter reagents by drug",
    placeholder: "Filter by drug — cocaine, MDMA, heroin…",
  });
  const count = h("p", { class: "filter__count", role: "status" });
  const nomatch = h("p", { class: "nomatch", hidden: true },
    "No reagent in this guide has a published reaction for that. That is not the " +
    "same as it being absent — most reagents simply do not react with most things.");

  const apply = () => {
    const t = input.value.trim().toLowerCase();

    if (!t) {
      for (const { el } of cards) {
        el.hidden = false;
        el.open = false;
        for (const tr of el.querySelectorAll("tbody tr")) tr.hidden = false;
      }
      count.textContent = "";
      nomatch.hidden = true;
      return;
    }

    let shown = 0;
    for (const { r, el } of cards) {
      const rows = [...el.querySelectorAll("tbody tr")];
      let hits = 0;
      r.reactions.forEach((x, i) => {
        const match = x.substance.toLowerCase().includes(t);
        if (rows[i]) rows[i].hidden = !match;
        if (match) hits++;
      });
      el.hidden = hits === 0;
      el.open = hits > 0;
      if (hits) shown++;
    }

    nomatch.hidden = shown > 0;
    count.textContent = shown
      ? `${shown} reagent${shown === 1 ? "" : "s"} with a published reaction`
      : "";
  };

  input.addEventListener("input", apply);

  return frag(
    h("div", { class: "filter" },
      h("div", { class: "filter__row" }, input),
      count),
    nomatch,
    list
  );
}

function prevalenceBlock(p) {
  /* No inner section title - the heading is the disclosure summary right
     above this, and repeating it stacked the same words twice. */
  return frag(
    h("div", { class: "card" },
      h("p", null, p.why),

      /* .reagtable, the same table the reagent sections use, so the two data
         blocks on this page read as the same kind of thing. No .tablewrap and
         no .data: those carry a border, a scroll container and sticky header
         styling that made this a boxed grid sitting inside a card.

         The two-column header does NOT simply get dropped the way the reagent
         one did. "Drug / Reaction" was redundant with its own rows; "Found to
         contain fentanyl" is what the number MEANS - "85-98%" of what is a
         real question - so it becomes a single label line above the table,
         which reads on one line and survives the stacked layout. The sr-only
         caption still carries the full sentence for a screen reader. */
      h("p", { class: "sec__note" }, "Share of samples found to contain fentanyl:"),
      h("table", { class: "reagtable" },
        h("caption", { class: "sr-only" }, "How often fentanyl is found, by what the drug was sold as"),
        h("tbody", null, p.rows.map((r) =>
          h("tr", null,
            h("th", { scope: "row" }, r.what),
            h("td", null,
              // The word carries the meaning; the color only reinforces it.
              h("span", { class: `rate rate--${r.level}` }, r.rate),
              r.note ? h("span", { class: "cellnote" }, r.note) : null))))),

      h("h3", null, "Why the death statistics look different"),
      h("p", null, p.coUse),
      h("p", { class: "sec__note" }, p.regional),
      callout("info", "The point", h("p", null, p.bottomLine)),
      sourceRow(p.sources)));
}

/* The text is wrapped so a phone can put it BESIDE the strip drawing instead
   of under it. Stacked, the three cards took 568px - two thirds of the screen
   - to explain a thing that is sitting below them. Side by side they read as
   what they are: a legend. */
function resultCard(n, unit, verdict, meaning, kind) {
  return h("div", { class: `readout__card readout__card--${kind}` },
    h("div", { class: "readout__lines", "aria-hidden": "true" },
      Array.from({ length: Number(n) }, () => h("span", { class: "readout__line" }))),
    h("div", { class: "readout__body" },
      h("div", { class: "readout__n" }, `${n} ${unit}`),
      h("div", { class: `readout__verdict readout__verdict--${kind}` }, verdict),
      h("div", { class: "readout__meaning" }, meaning)));
}

/* `g` is the whole testing guide - stripCard needs the shared brand note that
   applies to every strip type, not just this one. */
function stripCard(s, g) {
  const critical = (s.limits || []).filter((l) => l.severity === "critical");

  return h("details", { class: "acc" },
    h("summary", null,
      h("span", null, s.name),
      critical.length ? badge(`${critical.length} major limit${critical.length > 1 ? "s" : ""}`, "critical") : null),
    h("div", { class: "acc__body" },
      h("p", null, h("strong", null, "Detects: "), s.detects),

      h("div", { class: "readbar" },
        h("span", null, h("strong", null, "1 line"), " = ", s.reading.positive ? "positive" : ""),
        h("span", null, h("strong", null, "2 lines"), " = negative")),

      /* Before the steps, not after. The numbers below (dip for 15 seconds,
         read at 3 minutes) are the common pattern and genuinely differ by
         manufacturer and sometimes by lot - someone who follows ours instead
         of the insert in their packet can read a strip at the wrong moment
         and get a false negative on the one question they are asking. */
      s.procedure && g?.stripBrandNote
        ? callout("warn", g.stripBrandNote.title,
            h("p", null, g.stripBrandNote.body),
            h("p", null, g.stripBrandNote.detail),
            /* The line rule is the one thing on this page that is worth a
               reader's life getting backwards, and every strip card states it
               as though it were universal. It is universal across the products
               in common use - checked against BTNX, DanceSafe, and the state
               health department instructions that ship with donated strips -
               but that is a fact about those products, not about lateral flow.
               The packet outranks us on its own strip. */
            g.stripBrandNote.lines ? h("p", null, g.stripBrandNote.lines) : null)
        : null,


      s.procedure
        ? frag(h("h4", null, "How to do it"),
            h("ol", { class: "steps steps--tight" },
              s.procedure.map((p) => h("li", null, h("p", null, p)))))
        : null,

      s.dilution ? dilutionBlock(s.dilution) : null,

      h("h4", null, "Limits you need to know"),
      (s.limits || []).map((l) =>
        h("div", { class: `limit ${l.severity === "critical" ? "limit--critical" : ""}` },
          h("h5", null, l.severity === "critical" ? h("span", { "aria-hidden": "true" }, "▲ ") : null, l.title),
          h("p", null, l.body),
          l.nuance ? h("p", { class: "limit__nuance" }, l.nuance) : null)),

      s.accuracy ? callout("info", "In real-world use", h("p", null, s.accuracy)) : null,
      sourceRow(s.sources)));
}

function dilutionBlock(d) {
  return frag(
    h("h4", null, "How much water"),
    callout("info", "Why the amount changes by drug", h("p", null, d.why)),

    h("div", { class: "tablewrap" },
      h("table", { class: "data" },
        h("caption", { class: "sr-only" }, "Substances that cause false positives, and at what concentration"),
        h("thead", null, h("tr", null,
          h("th", { scope: "col" }, "Drug"),
          h("th", { scope: "col" }, "False positive at"))),
        h("tbody", null, d.crossReact.map((c) =>
          h("tr", null,
            h("th", { scope: "row" }, c.substance),
            h("td", null, c.threshold)))))),

    callout("warn", "Published amounts disagree — by up to ten times",
      h("p", null, d.conflict),
      h("ul", null, d.guidance.map((x) => h("li", null, x)))),

    h("div", { class: "tablewrap" },
      h("table", { class: "data" },
        h("caption", { class: "sr-only" }, "Commonly published water amounts by drug form"),
        h("thead", null, h("tr", null,
          h("th", { scope: "col" }, "Form"),
          h("th", { scope: "col" }, "Commonly published amount"))),
        h("tbody", null, d.commonAmounts.map((c) =>
          h("tr", null,
            h("th", { scope: "row" }, c.form),
            h("td", null, c.amount)))))),

    h("p", { class: "sec__note" }, d.recovery)
  );
}

/* Colours the reagent bar can paint. Anything outside this renders as an empty
   band rather than a wrong one - see .reagbar in app.css. */
const KNOWN_COLORS = new Set([
  "yellow", "green", "blue", "purple", "black", "brown",
  "orange", "red", "pink", "gray", "white", "violet", "olive",
]);

function reagentCard(r) {
  return h("details", { class: `acc ${r.criticalCaveat ? "acc--flag" : ""}` },
    h("summary", null,
      h("span", null, r.name),
      r.twoPart ? badge("two-part", "neutral") : null,
      r.criticalCaveat ? badge("read the caveat", "critical") : null),
    h("div", { class: "acc__body" },
      h("p", { class: "sec__note" }, r.base),
      h("p", null, h("strong", null, "Use for: "), r.useFor),

      /* .card + .reagtable, exactly what a drug page uses for the same thing -
         not a lookalike built out of .tablewrap and .data. Those two carry a
         border, a scroll container and sticky header styling that made this
         read as a boxed data grid while the identical content on the Drugs page
         read as prose on a card. Sharing the class means sharing one rule set,
         so the two cannot drift apart again the way they just did.

         No thead: the row header IS the drug name, which is how .reagtable is
         built, and "Drug / Reaction" over two columns told a reader nothing the
         content did not. The sr-only caption still names the table. */
      h("div", { class: "card" },
        h("table", { class: "reagtable" },
          h("caption", { class: "sr-only" }, `${r.name} reagent color reactions`),
          h("tbody", null, r.reactions.map((x) =>
            h("tr", null,
              h("th", { scope: "row" }, x.substance),
              h("td", null,
                /* Same reaction bar the Drugs page uses, so a reagent looks
                   the same wherever you meet it. Most rows here are one colour
                   and render as a single band, which is correct - this table is
                   a per-drug lookup, not a timeline.

                   `keys` exists only where the prose describes an unambiguous
                   transition AND both ends map to a palette colour. Compound
                   hues ("blue-green shifting to brown-black"), either/or
                   wording ("no reaction, or light pink to deep peach") and
                   violet-to-purple (the same swatch twice) deliberately have no
                   sequence and stay one band. Inventing a second band there
                   would be inventing precision the source does not have.

                   The bar is aria-hidden; x.color - the full prose, which
                   carries nuance no bar can - is what gets read out. */
                h("span", { class: "reagrow" },
                  h("span", { class: "reagbar", "aria-hidden": "true" },
                    (x.keys || [x.key]).map((k) =>
                      h("span", { class: KNOWN_COLORS.has(k) ? `swatch--${k}` : "" }))),
                  h("span", { class: "reagrow__words" }, x.color)),
                x.note ? h("span", { class: "cellnote" }, x.note) : null)))))),

      (r.caveats || []).length
        ? frag(h("h4", null, "Watch out for"),
            r.caveats.map((c) =>
              h("div", { class: `limit ${r.criticalCaveat ? "limit--critical" : ""}` },
                h("p", null, c))))
        : null));
}

/* Citations no longer render where they are cited - they collect into one
   list at the foot of the page. This keeps every existing call site working
   while moving the output; see sourceSink in ui.js for what deliberately does
   NOT come here (destination links like "Visit the store").

   Module-scoped rather than passed down because render() rebuilds the page on
   every navigation and resets it there. */
/* Which strip is in your hand?
 *
 * The numbers on this page were "the common pattern" until they were checked
 * one product at a time, and then they were not common. Both fentanyl strips
 * in wide harm reduction use say dip for 15 seconds and read one line as
 * positive - and then:
 *
 *   BTNX       5 mL of water per 10 mg    read at 5 minutes    dark blue end
 *   DanceSafe  1 mL of water per 10 mg    read at 3 minutes    yellow end
 *
 * Five times the water. Somebody following the wrong one dilutes their sample
 * to a fifth of the intended concentration, which pushes a real positive
 * toward a negative - wrong in the direction that gets people killed - and
 * then reads it two minutes late as well.
 *
 * .card + .reagtable, which is what a block of facts about one thing looks
 * like everywhere else on this page: the reagent reactions, the fentanyl
 * prevalence figures, the tool comparison. It was a stack of bold-label
 * paragraphs, which was a fourth shape for the same job.
 *
 * Session-only, like everything else here: a select whose value nothing
 * writes down.
 */
function brandPicker(brands) {
  const items = brands?.items || [];
  if (!items.length) return null;

  const label = (b) => `${b.name} — ${b.strip}`;
  const body = h("div", { class: "brandcard" });

  const paint = (b) => {
    clear(body);
    const row = (k, v) => (v
      ? h("tr", null, h("th", { scope: "row" }, k), h("td", null, v))
      : null);
    body.appendChild(frag(
      b.maker ? h("p", { class: "sec__note" }, b.maker) : null,
      h("div", { class: "card" },
        h("table", { class: "reagtable" },
          h("caption", { class: "sr-only" }, `${label(b)} — how to run and read it`),
          h("tbody", null,
            row("Sample", b.sample),
            row("Water", b.water),
            row("Cooker residue", b.residue),
            row("Dip", b.dip),
            row("Do not dip past", b.dipLimit),
            row("Wait", b.wait),
            row("Positive", b.positive),
            row("Negative", b.negative),
            row("Invalid", b.invalid)))),
      b.onlyFor ? callout("stop", "Only for fentanyl", h("p", null, b.onlyFor)) : null,
      b.blindSpot ? h("p", { class: "sec__note" }, b.blindSpot) : null,
      sourceRow(b.sources),
    ));
  };

  paint(items[0]);

  const sel = h("select", { class: "input", id: "brandpick" },
    items.map((b, i) => h("option", { value: String(i) }, label(b))));
  sel.addEventListener("change", () => paint(items[Number(sel.value)] || items[0]));

  return frag(
    h("h3", null, brands.headline),
    brands.intro ? h("p", { class: "sec__note" }, brands.intro) : null,
    h("div", { class: "mixslot" }, h("label", { for: "brandpick" }, "Brand"), sel),
    body,
    brands.notInterchangeable
      ? callout("warn", brands.notInterchangeable.title,
          h("p", null, brands.notInterchangeable.body),
          sourceRow([brands.notInterchangeable.source]))
      : null,
    brands.gap ? h("p", { class: "sec__note" }, brands.gap) : null,
  );
}

let SRC = sourceSink();

function sourceRow(sources) {
  return SRC.add(sources);
}
