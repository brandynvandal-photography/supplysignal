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
  group, sourceSink, SEV_GLYPH,
} from "../ui.js";
import * as data from "../data.js";
import { reagentLabel, isBlankReading, blankColorsFor, reagentHowTo, reagentKeyForCard } from "../reagentnames.js";
import { liveRegion, dropRow, slotLabel, removeButton, relabelRows } from "../slots.js";

export async function render(route, ctx) {
  const go = ctx?.go || (() => {});

  const g = await data.testingGuide();
  if (!g) return empty("The testing guide could not load.", "Check your connection and try again.");

  SRC = sourceSink();          // fresh per render; see the note on sourceRow

  const wrap = h("div");

  wrap.appendChild(h("h1", null, "Test your supply"));

  wrap.appendChild(
    /* One chip per top-level section, in page order. It had accumulated one
       per SUB-section too, which after grouping meant eleven chips, "Reagents"
       listed twice, and entries pointing inside collapsed parents. */
    /* IN DOM ORDER, and test/views.test.mjs now asserts it. The strip had
       been a table of contents that read top-to-bottom in a different order
       from the page - "What's out there" first while the prevalence table sat
       two screens down - so a reader who used it as a map was misled by it.
       Each chip sits exactly where its section sits. */
    jumpNav([
      { id: "sec-strips", label: "Test strips" },
      { id: "sec-companion", label: "Whatever the test says" },
      { id: "sec-prevalence", label: "What's out there" },
      /* The GROUP, not the first section inside it. The chip is labelled
         "Which one to get" and that is now the tile's own name, so pointing it
         at sec-compare landed the reader on a child with the tile's heading
         scrolled off above them. */
      { id: "grp-getting", label: "Which one to get" },
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

  /* USING IT FIRST, BUYING IT SECOND.
   *
   * The page opened on "what testing can tell you", then the prevalence
   * table, then five sections about which kit to buy - 2,226 characters of
   * reading before the first control, on a page whose first control is the
   * one that tells somebody how to read the strip in their hand. Most people
   * who open this tab already own something. So the page now opens on the
   * two tools - the strip picker and the reagent tracker - and the material a
   * reader consults BEFORE they own a kit (what is out there, what a test
   * cannot do, which one to get, how to store it) follows under its own
   * heading. Prevalence-first was a deliberate decision and is recorded as
   * one below; this is the trade against it, made with the reading cost in
   * view. */
  wrap.appendChild(section("Testing", null));

  const fts = g.strips.find((s) => s.id === "fentanyl");
  wrap.appendChild(
    /* Open, but not toned urgent. disc--urgent only paints the summary in
       --critical, which on THIS page is the colour of a positive fentanyl
       result - spending it on a default-open explainer where nothing is wrong
       made the real result cards below mean slightly less. */
    /* ONE section, not two. "Reading a test strip" and "Test strips" were
       separate top-level disclosures with the same subject: the first said how
       to read one, the second held each type with its limits and accuracy - so
       a reader had to know both existed, and the picker that decides the
       reading sat in one while the strip it describes sat in the other. */
    disclosure("sec-strips", "Test strips",
      { open: true },
      /* The verdict cards are rendered BY the picker now, from the product the
         reader chose. They used to be printed once, above it, as though the
         answer were the same for every strip - and then the section below
         quietly said it was not. Two answers to one question on one screen is
         worse than either answer alone. */
      brandPicker(g.brands),
      /* The one-line-means-positive panel is gone too. It sat directly above
         the strip diagram that shows exactly this, labelled. */
      h("p", null, fts.reading.explain),
      h("p", { class: "sec__note" }, fts.reading.faintLine),
      /* Each type, under the reading it shares. Shut: the picker above has
         already answered how to read one; each card is a type's limits and
         field accuracy, opened when that type is the one in hand. */
      g.strips.map((s) => stripCard(s, g)))
  );

  /* ---- reagents, open ----
     Reagent testing stands open. It is the part of this page that does
     something rather than explains something — a reader picks what it was
     sold as and the app walks them through DanceSafe's test for it. */
  wrap.appendChild(
    /* The blurb stays, shortened. The preview list below it is aria-hidden, so
       for a screen reader this line is the only thing between the group's name
       and its children. */
    group("grp-reagents", "Reagent testing",
      "What reagents show, and how to run one safely.", [
      (
      /* THE METHOD NEXT TO THE TOOL. This sat below the picker on the reasoning
         that anybody reaching for a reverse lookup has already run their
         reagents. That stopped being true when the picker started loading the
         test for you — it now tells somebody which reagents to open and in
         what order, which is a thing you do BEFORE you have any colors, and
         the section that says how to do it safely cannot be far from it. The
         acid warning sits on the group itself, above both. */
      /* ONE section, not two. "Handling reagents safely" was a sibling of "How
         to run a reagent test", and every word of it describes something you
         do while running one: gloves before you start, what to do if it goes
         on your skin during, disposal after. Split in two, a reader who opened
         the procedure got the steps without the acid warning, and the safety
         section read as optional reading rather than as part of the method.
         Same mistake the reading and strips sections had.

         Ordered the way it actually happens, which is also how DanceSafe
         sequences it: protect yourself, run it, clean up, and keep the kit
         alive for next time. */
      disclosure("sec-procedure", "How to run a reagent test", null,
        /* The acid warning used to open this section. It is the GROUP's
           intro now - see `opts.intro` below - so that a reader who opens the
           tracker or the reagent list without ever opening the procedure
           still meets it. The steps start at the first step. */
        h("ol", { class: "steps" },
          g.procedure.map((p) => h("li", null, h("h4", null, p.title), h("p", null, p.body)))),

        h("div", { class: "card" },
          h("h3", null, "If it gets on you"),
          h("ul", null, g.safety.firstAid.map((f) => h("li", null, f))),
          h("h3", null, "Disposal"),
          h("p", null, g.safety.disposal)),

        h("div", { class: "card" },
          h("h3", null, "Keeping the kit working"),
          h("p", null, g.safety.storage),
          h("p", null, g.safety.expiry),
          h("p", null, h("strong", null, "Check it still works: "), g.safety.validate)))
    ),
      (
      /* "Reagents", not "Reagent testing" - the parent tile is already called
         Reagent testing, and a child repeating its parent's name tells a
         reader nothing about which of the three sections they want. */
      disclosure("sec-reagents", "Reagents",
        null,
        reagentFilter(g.reagents),
        /* The picker and the colour tables know six reagents this guide does
           not teach: the table has rows for them, so readings count, but no
           source in this repo says how they are supplied or run. Said here
           rather than left for a reader to discover as a gap - and pointed at
           the one instruction sheet that is always correct for the bottle in
           their hand. */
        h("p", { class: "sec__note" },
          "Hofmann, Zimmermann, Scott, Gallic, Robadope and Folin appear in the "
          + "color tables, but this guide does not cover them yet. Their readings "
          + "still count. Follow the instructions that came with your kit."),
        h("details", { class: "acc" },
          h("summary", null, h("span", null, "Why a color can be hidden")),
          h("div", { class: "acc__body" },
            h("ul", null, g.reagentIntro.masking.map((m) => h("li", null, m))),
            h("p", null, g.reagentIntro.mixtures))))
    ),
    ],
    /* The preview names what is inside, in the order it is inside. */
    ["How to run a reagent test", "Reagents"],
    {
      open: true,
      /* THE GROUP'S WARNINGS, not the first child's.
       *
       * Both of these apply to reagent testing as a whole, so they sit on
       * reagent testing, above every section they qualify - a reader who
       * opens the procedure, the reagent list or the tracker meets them
       * either way.
       *
       * The fentanyl heading is scoped to the question a reader actually asks
       * — "is fentanyl in MY drugs" — rather than to reagent chemistry.
       * Reference-grade fentanyl DOES react with Marquis, so the flat claim
       * "no reagent detects fentanyl" is refutable, and a rule that can be
       * refuted is a rule somebody talks themselves out of at the wrong
       * moment. This version cannot be refuted. It went missing from the page
       * for a while: a comment here said it had moved into "What testing can
       * and cannot tell you", and it had not - it was simply gone. Back, in
       * the words it had, above everything it is about.
       *
       * The chemistry nuance sits directly under it, collapsed, because "but
       * it reacts with pure fentanyl, doesn't it?" is the first thing a reader
       * who knows any chemistry thinks — and answering it anywhere else looks
       * like the app avoiding the question.
       *
       * The acid warning follows. It opened "How to run a reagent test" and
       * was therefore only met by somebody who opened that row; the bottle is
       * the same bottle whichever section you came for. The same two render
       * at the head of the tracker screen - reagentWarnings() - so neither
       * surface can drift from the other. */
      intro: frag(
        reagentWarnings(g),
        g.reagentIntro.pureSampleNote
          ? h("details", { class: "acc" },
              h("summary", null,
                h("span", null, g.reagentIntro.pureSampleNote.q)),
              h("div", { class: "acc__body" },
                h("p", null, g.reagentIntro.pureSampleNote.a),
                h("p", null, g.reagentIntro.pureSampleNote.b),
                sourceRow(g.reagentIntro.pureSampleNote.sources)))
          : null),
    })
  );

  /* Directly under the tools, open, because it is what to do with whatever
     they said. It closed the page; somebody who had just got a result had to
     scroll past buying advice to find the four lines that apply to every
     result. */
  wrap.appendChild(
    disclosure("sec-companion", "Whatever the test says", { open: true },
      h("div", { class: "card" },
        h("ul", null, g.companion.map((c) => h("li", null, c)))))
  );

  /* The page had no section headings at all, so eight top-level disclosures
     floated in a row and nothing told a reader where one idea ended and the
     next began. Two headings now, in the order the questions actually arrive
     for somebody holding a kit: how do I use it, and then everything a reader
     wants before they own one. */
  wrap.appendChild(section("Before you buy", null));

  /* ---- what is actually out there ----
     Deliberately specific. "Fentanyl is in everything" is falsifiable against
     a reader's own experience, and once it fails they discount the warnings
     that are true. Real numbers hold up and are a better argument for
     testing than alarm is. */
  /* The prevalence table was the page's center of gravity - the claims audit
     made visible, answering the question people actually arrive with - and it
     led the page, open, for that reason. It still opens this half of the page
     and it is still open; what moved above it is the pair of tools a reader
     who already owns a kit came for. */
  if (g.prevalence) {
    wrap.appendChild(
      disclosure("sec-prevalence", g.prevalence.headline, { open: true },
        prevalenceBlock(g.prevalence))
    );
  }

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

  /* A GROUP TILE, not a bare heading over five disclosures.
   *
   * It was flattened for a good reason once - it had been a section wrapping a
   * single tile, a heading over one child with the two names disagreeing - and
   * flattening it fixed that and created a different problem. Test now carries
   * 42 disclosures and twelve top-level ones, and runs twelve screens with
   * every single one shut. Five of those twelve are these, and they answer one
   * question between them: which test, where to buy it, whether it is legal,
   * and how to get a lab. A reader who has already got their kit scrolls past
   * five separate closed boxes to reach the part about using it.
   *
   * As a tile they are one box with their names listed on it, which is the
   * same shape "Reagent testing" already uses above - so the page reads as
   * a few things to choose between rather than twelve. Not open by default:
   * unlike reagent testing, this is the section somebody is done with once
   * they own a kit. */
  wrap.appendChild(
    group("grp-getting", "Which one to get",
      "Which test answers which question, where to buy, and what it costs.", [
      /* The at-a-glance comparison leads: someone deciding WHICH test to use
         cannot answer that from four separate sections read in sequence - the
         differences only become visible side by side. */
      g.compare ? (
        disclosure("sec-compare", g.compare.headline, null,

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
          /* The trap callout that opened this section is the GROUP's intro
             now - see `opts.intro` below. It was two taps deep: open the tile,
             open this row, and only then learn that most of what is sold as a
             fentanyl test strip tests a person. */
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
          h("div", { class: "chips chips--links" },
            g.labs.options.map((o) => extLink(o.url, o.name, "btn btn--ghost btn--sm"))),
          callout("warn", "DrugsData has stopped taking samples", h("p", null, g.labs.note))),

        /* What the machines are. "Send it to a lab" is advice people are given
           constantly without ever being told what a lab does differently -
           and the difference (FTIR reads the bulk, GC-MS finds the traces) is
           exactly what explains why a strip and a lab answer different
           questions, and why services run both. */
        g.labs.how ? frag(
          h("h3", null, g.labs.how.title),
          frag(g.labs.how.methods.map((m) =>
            h("div", { class: "card" },
              h("h4", null, m.name),
              h("p", null, m.what),
              h("p", null, h("strong", null, "Strength: "), m.good),
              h("p", { class: "sec__note" }, h("strong", null, "Limits: "), m.limits)))),
          h("p", { class: "sec__note" }, g.labs.how.bottom)
        ) : null)
    ),
    ],
    /* The preview names what is inside, so the tile says what it holds without
       being opened - same as the reagent tile above. */
    ["Which test tells you what", "Buying one", "Legality", "Labs"],
    {
      /* THE TRAP, ON THE TILE. "Most fentanyl test strips sold in stores test
         a person, not a drug" is the fact that stops a $10 mistake, and it
         sat inside "Buying it over the counter", inside this tile - two taps
         from anyone who opened "Which one to get" to find out which one to
         get. As the group's intro it is the first thing inside the tile,
         above every row, whichever one the reader came for.

         The "How to tell them apart:" lead is gone from the code because the
         data's own sentence already opens with those words - it rendered
         "How to tell them apart: How to tell them apart: a substance-checking
         kit…". The text is untouched; only the doubled prefix is. */
      intro: g.buying?.trap
        ? callout("stop", g.buying.trap.title,
            h("p", null, g.buying.trap.body),
            h("p", null, g.buying.trap.tell),
            h("p", { class: "sec__note" }, g.buying.trap.examples))
        : null,
    })
  );

  if (g.storage) {
    wrap.appendChild(
      disclosure("sec-storage", g.storage.headline, null,
        frag(g.storage.items.map((it) =>
          h("div", { class: "card" },
            h("h3", null, it.what),
            h("p", null, h("strong", null, "Keep it: "), it.how),
            h("p", null, it.why),
            it.life ? h("p", { class: "sec__note" }, it.life) : null))),
        sourceRow(g.storage.sources))
    );
  }

  const sources = SRC.render();
  if (sources) wrap.appendChild(sources);

  return wrap;
}

/* The two warnings every reagent surface opens with. One function, two
   callers - the group intro on the Test page and the head of the tracker
   screen - so the words and the order cannot drift between them. Both are
   stop callouts: they do not fold, because they carry the two things that
   get somebody hurt at a spot plate. */
function reagentWarnings(g) {
  return frag(
    callout("stop", "No reagent will tell you whether fentanyl is in there",
      h("p", null, g.reagentIntro.cannotDetectFentanyl)),
    /* The warning, and only the warning. A second line used to explain why
       the warning was placed here rather than in a section of its own —
       editorial reasoning about the app's own structure, printed at
       somebody about to open a bottle of concentrated acid. That belongs
       in a commit message, which is where it is now. */
    callout("stop", "Before you open the bottle",
      h("p", null, g.safety.ppe)));
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
      /* "What that means for you" is gone. The table above it is the argument,
         and a coloured box restating the argument underneath is the third time
         a reader meets it on one screen. */
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
      /* An h3, not a span: the card's name is a heading in the page's outline
         and a screen reader's heading list reaches it. app.css resets it to
         the summary's own type so nothing visible changes. */
      h("h3", null, s.name),
      critical.length ? badge(`${critical.length} major limit${critical.length > 1 ? "s" : ""}`, "critical") : null),
    h("div", { class: "acc__body" },
      h("p", null, h("strong", null, "Detects: "), s.detects),

      /* THREE BLOCKS REMOVED HERE, all of them now said better upstairs.
         - The 1-line/2-line bar: the picker prints the verdict cards for the
           product the reader actually picked, in that product's own wording.
         - The "read the instructions that came with your strips" callout: its
           whole message was that the numbers below are a common pattern and
           yours may differ. The numbers below are gone, and the picker shows
           the real ones. Its one surviving fact - that brands differ, and
           sometimes lots within a brand - now runs once under the picker
           rather than once per strip.
         - "How to do it": the steps duplicated Sample, Water, Dip and Wait for
           exactly the two strips the picker covers, which are the only two
           that had steps at all.
         What stays here is what the picker does not know: what this type
         detects, where it fails, and how it performs in the field. */

      s.dilution ? dilutionBlock(s.dilution) : null,

      h("h4", null, "Limits"),
      (s.limits || []).map((l) =>
        h("div", { class: `limit ${l.severity === "critical" ? "limit--critical" : ""}` },
          /* "Major limit:" is said, not only glyphed and coloured - the ▲ is
             aria-hidden and the red is a border, so a screen reader heard a
             critical limit as any other h5. Off-screen, inside the heading. */
          h("h5", null,
            l.severity === "critical" ? h("span", { "aria-hidden": "true" }, `${SEV_GLYPH.critical} `) : null,
            l.severity === "critical" ? h("span", { class: "sr-only" }, "Major limit: ") : null,
            l.title),
          h("p", null, l.body),
          l.nuance ? h("p", { class: "limit__nuance" }, l.nuance) : null)),

      s.accuracy ? callout("info", "How well it does in real life", h("p", null, s.accuracy)) : null,
      sourceRow(s.sources)));
}

function dilutionBlock(d) {
  return frag(
    h("h4", null, "How much water"),
    callout("info", "Why the amount is different for each drug", h("p", null, d.why)),

    /* Two tables, and they answer different questions - which is why each says
       so in a heading now. This one is which substances read positive when the
       solution is too strong; the one below is how much water to use. Before
       the second table came back there was only one, so the section heading was
       enough. */
    h("h5", { class: "lbl" }, "Which drugs read positive when the water is too little"),
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

    /* A paragraph, not a list. This held a <ul> with exactly one <li> - a
       lone bullet is a list that never happened, and its 22px indent set the
       text off the title's left edge, crowding the fold's border for no
       meaning (removed on request, 2026-08-19). */
    callout("info", "If you were testing a stimulant and it came back positive",
      ...d.guidance.slice(-1).map((x) => h("p", null, x))),

    /* THE AMOUNTS TABLE IS BACK, 2026-08-19, and the reason it left is the
       reason it returned.
       
       It was pulled because a teaspoon per 10 mg was BTNX's ratio while the
       WHPM strips DanceSafe sells asked for five times less water, so one
       printed figure was not a second opinion, it was a wrong one for half of
       readers. In October 2025 DanceSafe retired its own "50 mg per teaspoon"
       method for 10 mg per teaspoon and stated it had aligned its steps with
       other brands - "the science inside the strips may differ, but how you use
       them stays the same". Checked at source on 2026-08-19: their published
       table now runs 10 mg -> 5 mL up to 1 g -> 500 mL, doubling for MDMA and
       meth, which is what this data carries.
       
       So the figures agree with the one brand-neutral standard that exists,
       and the fallback above them is unchanged and still does the real work:
       follow the instructions in your own kit, and when in doubt use more
       water. CDC's current fentanyl page was checked the same day and gives no
       volume at all, so it is no longer cited as a dissenting number. */
    h("h5", { class: "lbl" }, "How much water to use"),
    h("div", { class: "tablewrap" },
      h("table", { class: "data" },
        h("caption", { class: "sr-only" }, "How much water to use for each amount and form"),
        h("thead", null, h("tr", null,
          h("th", { scope: "col" }, "What you have"),
          h("th", { scope: "col" }, "Water"))),
        h("tbody", null, d.commonAmounts.map((c) =>
          h("tr", null,
            h("th", { scope: "row" }, c.form),
            h("td", null, c.amount)))))),
    d.amountsNote ? h("p", { class: "sec__note" }, d.amountsNote) : null,
    d.amountsSource ? sourceRow([d.amountsSource]) : null,

    h("p", { class: "sec__note" }, d.recovery)
  );
}

/* Colours the reagent bar can paint. Anything outside this renders as an empty
   band rather than a wrong one - see .reagbar in app.css. */
const KNOWN_COLORS = new Set([
  "yellow", "green", "blue", "purple", "black", "brown",
  "orange", "red", "pink", "gray", "white", "violet", "olive",
  /* The three the DanceSafe charts fork on. Without a swatch class the band
     renders as an empty slot, which is worse than a rounded color. */
  "peach", "magenta",
]);

function reagentCard(r) {
  return h("details", { class: `acc ${r.criticalCaveat ? "acc--flag" : ""}` },
    h("summary", null,
      h("h3", null, r.name),                    // see stripCard
      r.twoPart ? badge("two-part", "neutral") : null,
      r.criticalCaveat ? badge("read the caveat", "critical") : null),
    h("div", { class: "acc__body" },
      h("p", { class: "sec__note" }, r.base),
      h("p", null, h("strong", null, "Use for: "), r.useFor),
      /* The run instructions, up front rather than buried in the caveats -
         reported for Morris, whose stir lived at the foot of the card while
         the tracker said nothing at all. Same map the tracker uses. */
      reagentHowTo(reagentKeyForCard(r.id))
        ? h("p", null, h("strong", null, "How to run it: "),
            reagentHowTo(reagentKeyForCard(r.id)))
        : null,

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
        /* --fixed, because these tables are read as a SET. Every reagent card
           renders its own table, and an auto-width first column sizes itself
           to that card's longest drug name — so the color bars started at a
           different x in every card and a filtered list read as a stack of
           unrelated blocks. A fixed name column lines them all up. */
        h("table", { class: "reagtable reagtable--fixed" },
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
                /* Same as the strip limits: the red rule says "major" to the
                   eye, so it is said to the ear as well. */
                h("p", null,
                  r.criticalCaveat ? h("span", { class: "sr-only" }, "Major limit: ") : null,
                  c))))
        : null));
}

/* Citations no longer render where they are cited - they collect into one
   list at the foot of the page. This keeps every existing call site working
   while moving the output; see sourceSink in ui.js for what deliberately does
   NOT come here (destination links like "Visit the store").

   Module-scoped rather than passed down because render() rebuilds the page on
   every navigation and resets it there. */
/* Reading a strip IS this control. It is not a section beside one.
 *
 * The page used to state one reading for all strips and then, much further
 * down and two collapsed disclosures deep, admit that the numbers differ by
 * product. They differ by a lot:
 *
 *   BTNX   5 mL per 10 mg   read at 5 min   and stimulants false-positive on it
 *   WHPM   1 mL per 10 mg   read at 3 min   and they do not, at that strength
 *
 * Five times the water, two minutes apart. Somebody following the wrong sheet
 * dilutes to a fifth of the intended concentration, which pushes a real
 * positive toward a negative, and then reads it late as well.
 *
 * SECOND AXIS: what is being tested. On a BTNX strip a stimulant has to be
 * made MORE dilute than an opioid, because high concentrations of meth, MDMA,
 * cocaine and common cuts make it read positive when no fentanyl is there -
 * the opposite of the instinct to use less water so nothing is missed. The
 * WHPM strips were built around that problem and tested clean at 10 mg/mL.
 * The answer therefore depends on BOTH dropdowns, which is why neither of
 * them is a footnote under a fixed set of numbers.
 *
 * Session-only: two selects whose values nothing writes down.
 */
function brandPicker(brands) {
  const items = brands?.items || [];
  if (!items.length) return null;

  const label = (b) => `${b.name} — ${b.strip}`;
  const out = h("div", { class: "brandcard" });

  const drugSel = h("select", { class: "input", id: "drugpick" });
  const brandSel = h("select", { class: "input", id: "brandpick" },
    items.map((b, i) => h("option", { value: String(i) }, label(b))));

  const current = () => items[Number(brandSel.value) || 0] || items[0];

  /* The drug list belongs to the product, because a strip that cannot be
     fooled by meth does not need the entry warning about it. Rebuilt, and the
     reader's choice kept when the new product offers the same one. */
  const fillDrugs = () => {
    const keys = Object.keys(current().byDrug || {});
    const keep = drugSel.value;
    clear(drugSel);
    for (const k of keys) {
      drugSel.appendChild(h("option", { value: k }, current().byDrug[k].label));
    }
    if (keys.includes(keep)) drugSel.value = keep;
  };

  const paint = () => {
    const b = current();
    const d = (b.byDrug || {})[drugSel.value] || {};
    clear(out);

    const row = (k, v) => (v
      ? h("tr", null, h("th", { scope: "row" }, k), h("td", null, v))
      : null);

    out.appendChild(frag(
      b.maker ? h("p", { class: "sec__note" }, b.maker) : null,

      /* The verdict cards, driven by the product rather than printed once for
         all of them. This is the whole point of the control. */
      h("div", { class: "readout" },
        resultCard("1", "line", "POSITIVE", b.positive, "critical"),
        resultCard("2", "lines", "NEGATIVE", b.negative, "neutral"),
        resultCard("0", "lines", "INVALID", b.invalid, "neutral")),

      h("div", { class: "card" },
        h("table", { class: "reagtable" },
          h("caption", { class: "sr-only" }, `${label(b)} — how to run and read it`),
          h("tbody", null,
            row("Sample", b.sample),
            row("Water", d.water || b.water),
            row("Dip", b.dip),
            row("Do not dip past", b.dipLimit),
            row("Wait", b.wait)))),

      d.note ? h("p", { class: "sec__note" }, d.note) : null,
      d.sources ? sourceRow(d.sources) : null,
      /* "ONLY FOR FENTANYL" WAS WRONG TWICE OVER, and the second one is the
         reason to check a date on a source.
         
         The one brand carrying this is BTNX's XYLAZINE strip, so the heading
         read as "this strip only detects fentanyl" - false in the direction
         that matters, since a reader could take it to mean a xylazine strip
         does not test for xylazine.
         
         And the claim under it had gone stale. It came from a Washington State
         DOH poster dated September 2023, which says in a red box to use these
         on fentanyl only because they false-positive on cocaine. What was
         actually happening, per the NIST evaluation in Drug Testing and
         Analysis two months later, is that among 77 compounds the strips
         cross-react with exactly one - lidocaine, which is a standard cocaine
         cut. BTNX now ships a 2.0 strip it says has no lidocaine
         cross-reactivity. So the restriction was never "fentanyl", it was
         "not lidocaine", and on a current strip the maker says it is gone.
         
         The heading names the actual risk and the body keeps the version
         distinction and the hedge, because the 2.0 claim is the manufacturer's
         and has not been independently published - the same hedge the strip's
         own limits section already carries. */
      b.onlyFor ? callout("stop", "Cocaine can read positive on a 1.0 strip", h("p", null, b.onlyFor)) : null,
      b.blindSpot ? h("p", { class: "sec__note" }, b.blindSpot) : null,
      sourceRow(b.sources),
    ));
  };

  brandSel.addEventListener("change", () => { fillDrugs(); paint(); });
  drugSel.addEventListener("change", paint);
  fillDrugs();
  paint();

  return frag(
    /* The picker's own heading, and a search anchor. "Which strip do you
       have?" is what somebody searching "BTNX" or a brand name is looking
       for, and it had no heading to land on - the section title is "Test
       strips" and this control sat under it unlabelled. An h3 gives the
       search index (build-search.mjs indexes brands.headline) a heading whose
       visible text matches, so a brand-name result lands on the picker rather
       than the top of the page. Kept a stable id for reveal() and the views
       test. */
    h("h3", { id: "sec-brands" }, brands.headline),
    /* .pick, not .mixslot. The combination checker's slot puts its label
       BESIDE the select, which works there because "A" and "B" are one
       character. "Strip" and "Testing" took 101px of a 375px screen and left
       the select 277px wide starting at x=150 - 52px of every option ran off
       the right edge of the phone. Label above, select full width. */
    h("div", { class: "pick" },
      h("div", { class: "pick__row" },
        h("label", { for: "brandpick" }, "Which strip"),
        h("div", { class: "pick__field" }, brandSel)),
      h("div", { class: "pick__row" },
        h("label", { for: "drugpick" }, "What you are testing"),
        h("div", { class: "pick__field" }, drugSel))),
    /* Four vendors in that list, two manufacturers behind them. Chasing
       storefronts is the wrong axis - the MAKER determines the numbers, and a
       reader holding an unlisted brand does not need us to have enumerated
       their shop, they need to know to look for the maker on the packet. This
       is the line that makes the control answer for products it does not
       name, without a single invented figure. */
    brands.notListed ? h("p", { class: "sec__note" }, brands.notListed) : null,
    out,
    /* Once, not once per strip. What survives from the old per-card callout is
       the part the picker cannot cover: a brand can change between LOTS, so
       even the right row is not a substitute for the paper in the packet. */
    brands.lots ? callout("warn", brands.lotsTitle, h("p", null, brands.lots)) : null,
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
