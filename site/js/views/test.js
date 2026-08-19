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
import { match as reagentMatch, checkSoldAs } from "../reagentmatch.js";
import { flowFor, walk, completedBy, offChart, guide } from "../flowcheck.js";
import { reagentLabel, isBlankReading, blankColorsFor, reagentHowTo, reagentKeyForCard } from "../reagentnames.js";
import { findSubstances, synthesize } from "../substancematch.js";
import { liveRegion, dropRow, slotLabel, removeButton, relabelRows } from "../slots.js";

/* ------------------------------------------------------------ session state
 *
 * WHAT THE TRACKER REMEMBERS, AND WHERE.
 *
 * Tapping a result row leaves for the drug page, and Back re-rendered this
 * view from scratch — so three readings, the sold-as, and the chart they had
 * loaded were gone the moment somebody went to look at what they had found.
 * The same was true of switching tabs mid-test.
 *
 * So the tool's state lives HERE, in a module variable, for as long as the
 * page is open. Not in storage — sessionStorage would survive the very thing
 * this app promises nothing survives (test/privacy.test.mjs confines storage
 * to three preference modules, and what somebody is testing their drugs for is
 * the last thing that should join them). Same construction as lensPicks in
 * views/substances.js: a variable, never written down, gone when the tab is.
 *
 * Two things empty it early, because "when the tab closes" is later than the
 * reader needs:
 *   - Quick Exit. app.js dispatches "nl:panic" on the document before it
 *     clears anything else, so a search panel, this, and anything like it can
 *     wipe themselves in the same tick. The literal is app.js's PANIC; the
 *     privacy test holds the two together.
 *   - pagehide. iOS fires it when the app is backgrounded, which is the moment
 *     the app-switcher snapshot is taken and the moment a phone changes hands.
 * The shape: { soldAs, slots: [{ reagent, result }] }. The loaded flow is not
 * stored because it is a function of soldAs - flowFor() recomputes it. */
let trackerSession = null;
const forgetTracker = () => { trackerSession = null; };
document.addEventListener("nl:panic", forgetTracker);
window.addEventListener("pagehide", forgetTracker);

/* THE TRACKER'S ADDRESS. `/test#/tracker` on the web and `#/test/tracker` in
   the packaged app — routes.js turns one into the other. A substance goes
   AFTER it, in the fragment, never the path: `#/tracker/mdma` is not
   transmitted, `/tracker/mdma` would be. See routes.js for why that line is
   the whole privacy model. */
const TRACKER = "#/test/tracker";

export async function render(route, ctx) {
  const go = ctx?.go || (() => {});

  /* STARTED BEFORE THE GUIDE IS AWAITED, not after. The guide lives in the
     topics bundle, which boot already has in flight; the reagent table, the
     substance list and the flowcharts are three separate national files. Awaiting
     the guide first and only then asking for the three serialised a second
     round trip behind the first on every cold open of this tab - the page
     could not paint until the second wave landed. Kicked off here, all four
     requests are in the air together (substances.js does the same), and the
     await below mostly finds them already resolved. The reverse lookup needs
     the whole reagent table rather than one substance's row, and the
     substance list only to turn an id into a name a reader recognises. */
  const bundles = Promise.all([
    data.reagentTable().catch(() => ({})),
    data.substances().catch(() => ({ substances: [] })),
    data.reagentFlows().catch(() => ({ flows: [] })),
  ]);

  const g = await data.testingGuide();
  if (!g) return empty("The testing guide could not load.", "Check your connection and try again.");

  SRC = sourceSink();          // fresh per render; see the note on sourceRow

  const [REAGENT_TABLE, SUBS, FLOWS] = await bundles;

  /* THE TRACKER IS A SCREEN OF ITS OWN, under this tab. Branching on the
     route the way substances.js branches on a drug id: same data, same
     module, a different page. route.sub is a substance id to start the tool
     on — the drug pages link here with theirs. */
  if (route?.id === "tracker") {
    return trackerView(route.sub || null, g, { REAGENT_TABLE, SUBS, FLOWS, go });
  }

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
      { id: "sec-whatisit", label: "What could this be?" },
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
  wrap.appendChild(section("Using it", null));

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
      /* THE TOOL, FIRST, AS A DOOR. The reagent tracker used to render here,
         open, in full - the one control on this page that grew as it was used,
         sitting third under two closed rows. It has its own screen now
         (trackerView below, at /test#/tracker) where it gets the top of the
         page, a stable address for search and the drug pages, and state that
         survives leaving to read about a result. What stays here is the way
         in, under the same id the chip and test/views.test.mjs have always
         resolved to. The heading is the section's; the launcher below it is
         the same shape Learn uses to hand off to a page of its own. */
      h("div", { id: "sec-whatisit" },
        section("What could this be?", null,
          trackerLauncher()))
    ),
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
          + "color tables and the tracker, but this guide does not cover them "
          + "yet. Their readings still count. Follow the instructions that came "
          + "with your kit."),
        h("details", { class: "acc" },
          h("summary", null, h("span", null, "Why a color can be hidden")),
          h("div", { class: "acc__body" },
            h("ul", null, g.reagentIntro.masking.map((m) => h("li", null, m))),
            h("p", null, g.reagentIntro.mixtures))))
    ),
    ],
    /* The preview names what is inside, in the order it is inside. */
    ["What could this be?", "Running a test", "Reagents"],
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
          h("div", { class: "chips" },
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

/* The door from the Test page to the tracker screen. The same .bigptr Learn
   uses to hand a reader to a page of its own; the line under it is the tool's
   own opening sentence, so the launcher promises exactly what the screen
   says. */
function trackerLauncher() {
  return h("a", { class: "bigptr", href: TRACKER },
    h("span", { class: "bigptr__hd" }, "What could this be?"),
    h("span", { class: "bigptr__sub" }, TRACKER_INTRO));
}

/* The tracker's opening sentence, said once here because two places print
   it: the launcher on the Test page and the head of the tool itself. */
const TRACKER_INTRO =
  "Wanna test something? Put it into the reagent tracker to run a reagent "
  + "test. Just say what each color reaction was to each reagent. If you do "
  + "not know what the substance is, say not sure. The tracker will walk you "
  + "through the process.";

/* ---------------------------------------------------------- tracker screen
 *
 * /test#/tracker[/<substance>]. Its own page, not a seventh tab: the bar is
 * six wide at 375px and a seventh truncates every label (index.html records
 * the measurement), and the tool depends on its page - the method sits one
 * row away and the warnings above it are about reagents, not about the app.
 * A fragment sub-screen gives it what a tab would - a stable address, focus on
 * its own h1, state that survives Back (trackerSession) - at the same privacy
 * posture as a county or a drug page.
 *
 * Order: the way out, the name, the two warnings that apply to every reagent
 * test, the method one tap away, then the tool. */
function trackerView(startId, g, { REAGENT_TABLE, SUBS, FLOWS, go }) {
  /* .tracker exists for its rhythm: this screen appends its blocks directly
     (no section() wrappers), so they sat at their own card margins - 8 to
     13px apart, visibly tighter than any tab page. app.css gives the class
     the site's in-section gap. */
  const wrap = h("div", { class: "tracker" });

  /* The same ghost button a drug page wears to return to the index. A
     navigation, not history.back(): somebody who arrived from a drug page's
     reagent table should land on Test, not bounce back to the drug. */
  wrap.appendChild(
    h("button", { type: "button", class: "btn btn--ghost btn--sm", onClick: () => go("#/test") },
      h("span", { "aria-hidden": "true" }, "‹"), " Back to Test")
  );

  /* The h1 is what focusView() lands on after any navigation here, so the
     heading a screen reader hears is the tool's own name. */
  wrap.appendChild(h("h1", null, "What could this be?"));

  wrap.appendChild(reagentWarnings(g));

  /* THE METHOD, ONE TAP AWAY. On the Test page the procedure sits in the same
     tile as this tool; here it is a page away, so the row says where. A
     reader who has not run a reagent before should meet this before the
     first dropdown. */
  wrap.appendChild(
    h("a", { class: "nbr", href: "#/test", "data-reveal": "sec-procedure" },
      h("span", { class: "nbr__text" },
        h("span", { class: "nbr__name" }, "How to run a reagent test")),
      h("span", { class: "nbr__right" }, h("span", { "aria-hidden": "true" }, "›")))
  );

  wrap.appendChild(reverseLookup(reagentMatch, REAGENT_TABLE, SUBS, go, FLOWS, startId));

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
/* WHAT COULD THIS BE? The reagent charts, run backwards.
 *
 * Every other reagent surface in this app goes one way: pick a reagent, read
 * what it turns for each drug. Somebody standing over a spot plate has the
 * opposite problem — three colours and no idea what they add up to.
 *
 * The matching lives in reagentmatch.js, pure and tested, because the failure
 * that matters here is silent: quietly dropping the drug somebody actually
 * holds out of a list they are using to decide what to do. The rule that
 * prevents it is that an unpublished pair never eliminates anything.
 *
 * WHAT THIS SCREEN MUST SAY, and does, before any result:
 *   - Consistent with, never "it is". A reagent reads the STRONGEST reactant,
 *     so a mixture shows one colour and hides the rest, and most street
 *     samples are mixtures.
 *   - Nothing here rules out fentanyl. A lethal dose is far below what any
 *     reagent shows, and no combination of colours on this screen changes it.
 */
function reverseLookup(matchFn, table, subs, go, charts, startId = null) {
  /* Morris is on here because the DanceSafe charts start the cocaine and
     ketamine tests with it, and a picker that cannot express the first step of
     a chart it is checking against is broken. It sits sixth on colour-table
     coverage but first on those two flows. */
  const REAGENTS = ["Marquis", "Mecke", "Mandelin", "Froehde", "Liebermann",
                    "Simons", "Morr", "Ehrlich", "Hofmann", "Zimmermann", "Scott"];
  /* Labels come from reagentnames.js, which is the one map the whole app uses.
     This built its own out of the testing guide plus an alias for Morris, which
     worked here and left the substance pages printing "Morr" and "Simons" —
     the bug that map exists to prevent, in the one place that had not been
     given a copy of it. */
  const reagentName = reagentLabel;
  /* "gray" arrived with the DanceSafe override for MDA on Simon's. The test
     that pairs this list against the data would have caught its absence: a
     color in the file the picker does not offer is unreachable, and every
     substance carrying it silently stops being findable. */
  /* PEACH, MAGENTA AND OLIVE ARE HERE BECAUSE THE CHARTS FORK ON THEM.
   *
   * Every other entry is a plain bucket on purpose. These three look like
   * exceptions until you see what rounding them did: DanceSafe sends PEACH to
   * Morris and toward cocaine, and bright ORANGE to Liebermann and toward
   * amphetamine — two different tests, and folding them together let one
   * Marquis reading offer both routes and finish both sequences. MAGENTA is
   * heroin's Marquis and sits between the pink that opens the cocaine branch
   * and the purple nothing else claims. OLIVE is 2C-B's dark lime green.
   *
   * A color the chart forks on has to be a color the reader can say. They cost
   * nothing on the table side — reagentmatch.js maps each to the table words it
   * falls between, so picking peach still scores against all 207 substances. */
  const COLORS = ["yellow", "orange", "peach", "red", "pink", "magenta",
                  "purple", "blue", "green", "olive", "brown", "gray", "black"];
  const MAX = REAGENTS.length;
  /* What each verdict mark MEANS, for the screen reader. The ✓ ✗ · – marks are
     aria-hidden (they are the glyph half of a glyph-plus-colour signal), so
     without this the line read as a colour and a chart reference with no
     verdict. "unknown" is left to the sentence itself, which already says
     nothing is published. */
  const SR_VERDICT = {
    agrees: "Matches. ", disagrees: "Does not match. ", pending: "Not run. ", unknown: "",
  };

  /* SAME SHAPE AS THE COMBINATION CHECKER, deliberately.
   *
   * This started as ten fixed rows — every reagent on screen whether or not
   * anybody owned it — which is a wall, and which also implied you were
   * supposed to fill them all in. It is the same kind of tool as the drug
   * combination checker on the Drugs page: a short list of things you have,
   * added one at a time, answered underneath. So it is built the same way and
   * wears the same controls, down to the "+ Add another" button and the ×.
   *
   * It opens with one reagent, because most people own one bottle and a second
   * empty row reads as a requirement rather than an option. */
  const slots = [];
  const rows = h("div", { class: "mixslots revslots" });
  /* NOT A LIVE REGION. This held role="status", so every change to a select
     re-read the entire verdict tree - plan card, verdict card, every soldline,
     the count and the match list - to a screen-reader user, and re-read it
     from the top. The results render here in silence and the one-line region
     beneath says what changed. */
  const out = h("div", { class: "revout" });
  /* ONE SENTENCE PER CHANGE, verdict first - the shared region in slots.js,
     which is also the combination checker's. Off-screen, atomic, re-announced
     even when the sentence repeats. */
  const { el: live, announce } = liveRegion();

  /* The reagent table carries a handful of ids that have no substance record —
     they come straight from PsychonautWiki's colour data and were never given a
     page. Rather than let nameOf and the alias search fall through to a raw
     lowercase id, each is synthesized into a minimal record (id + display name
     + empty aliases) so it is a first-class member of the same list every
     other substance is matched and named from. synthesize() lives in
     substancematch.js, so the Drugs index and this picker agree on the name. */
  const RECLESS = ["4-bmc", "cathinone", "coca", "dox", "phentermine"];
  const haveRecord = new Set((subs?.substances || []).map((x) => x.id));
  const records = [
    ...(subs?.substances || []),
    ...RECLESS.filter((id) => !haveRecord.has(id)).map((id) => synthesize(id)),
  ];
  const nameOf = (id) =>
    records.find((x) => x.id === id)?.name || synthesize(id).name;

  /* "a Amphetamine-like substance". The article has to follow the SOUND of the
     name, and drug names are the worst case for guessing it: initialisms are
     read letter by letter, so LSD and MDMA and 2C-B all take "an" while their
     spelling starts with a consonant. So the rule is vowel-sound rather than
     vowel-letter — a leading vowel, or a leading consonant LETTER whose letter
     NAME opens with a vowel sound, which is every letter except the seven in
     the string below. */
  const NO_VOWEL_SOUND = "BCDGJKPQTUVWYZ";
  const article = (word) => {
    const w = String(word).trim();
    const c = w.charAt(0);
    const initialism = /^[A-Z0-9][A-Z0-9-]/.test(w);   // LSD, MDMA, 2C-B, 4-HO-MET
    if (!initialism) return "aeiou".includes(c.toLowerCase()) ? "an" : "a";
    /* A leading DIGIT is read as its word, and eight is the only one that opens
       on a vowel — two, four, five, twenty-five all take "a". Treating every
       digit as a vowel gave "an 2C-B-like substance". */
    if (/[0-9]/.test(c)) return c === "8" ? "an" : "a";
    return NO_VOWEL_SOUND.includes(c.toUpperCase()) ? "a" : "an";
  };
  const aLike = (id) => {
    const n = nameOf(id);
    return `${article(n)} ${n}-like substance`;
  };

  /* WHAT IT WAS SOLD AS, which is the question people actually arrive with.
   *
   * The list below answers "what could this be" against all 207 substances.
   * Nobody walks up with that question. They walk up with "I bought MDMA, is
   * this MDMA", and that is a different comparison — one substance, and the
   * answer is expected or unexpected rather than a ranked list.
   *
   * Optional, and above the reagents because it is the frame for everything
   * under it. Only substances with published reagent data are offered; the
   * rest cannot be answered either way and an option that always returns
   * "cannot say" is a dead control. */
  /* ALPRAZOLAM IS NOT IN THIS GROUP, and it was.
     A reagent kit answers almost nothing about a Xanax pill: four of its six
     published reactions are "no reaction", there is no DanceSafe flow for it,
     and the two that do react — Zimmermann blue, Morris pink-then-green —
     say "a benzodiazepine is present", not which one. That matters because
     the pill people actually want checked is a pressed one, where the risks
     are fentanyl and a novel benzo like bromazolam: no reagent sees fentanyl
     at all, and Zimmermann cannot tell bromazolam from alprazolam. Offering it
     in the prominent group pointed people at a test that cannot answer the
     question they arrived with. It is still in the full list below, with its
     real data, for anyone who wants it.

     The label is "Commonly checked" rather than "Most often tested" for the
     same reason it got questioned: the old wording asserts a frequency
     statistic, and there is no submission-count dataset behind this list. It
     is an editorial short list of what reagent kits are bought for. */
  const COMMON = ["mdma", "mda", "cocaine", "heroin", "methamphetamine",
                  "ketamine", "lsd", "fentanyl"];
  /* Table keys UNION chart ids. Mescaline is the case: DanceSafe publishes a
     three-step flow for it and PsychonautWiki has no reagent rows at all, so
     building this list from the table alone left a substance the app can
     genuinely walk somebody through unreachable in the only control that
     reaches it. */
  const withData = [...new Set([
    ...Object.keys(table || {}),
    ...(charts?.flows || []).map((f) => f.id),
  ])];
  const byName = (a, b) => nameOf(a).localeCompare(nameOf(b));
  const common = COMMON.filter((id) => withData.includes(id)).sort(byName);
  const rest = withData.filter((id) => !common.includes(id)).sort(byName);

  const withDataSet = new Set(withData);

  /* The canonical store, and the full browse list. Everything downstream reads
     soldAs.value and listens for its change event, so this select stays the
     source of truth; the chips and the alias search below are two faster ways
     to set it, not a replacement for it. */
  /* No aria-label: the select sits inside the visible "Substance" label at
     the foot of this function, and that is its name. */
  const soldAs = h("select", { class: "input" },
    h("option", { value: "" }, "Not sure or groundscore"),
    common.length
      ? h("optgroup", { label: "Commonly checked" },
          common.map((id) => h("option", { value: id }, nameOf(id))))
      : null,
    h("optgroup", { label: "Everything with published reagent data" },
      rest.map((id) => h("option", { value: id }, nameOf(id)))));

  /* Set the sold-as and drive everything a real change would. Used by the
     chips, the alias search, and rehydrate — one path so they cannot diverge. */
  const setSoldAs = (id) => {
    soldAs.value = id || "";
    soldAs.dispatchEvent(new Event("change"));
  };

  /* THE COMMON EIGHT, AS CHIPS. The names people actually arrive with, one tap
     each — the same short list the select groups under "Commonly checked", so
     nothing here is reachable that was not reachable before. Only the ones the
     reagent data can actually answer are shown. aria-pressed tracks the
     current sold-as so the chip a reader picked reads as selected. */
  const commonChips = h("div", { class: "chips" },
    common.map((id) =>
      h("button", {
        type: "button", class: "chip", "aria-pressed": "false", "data-soldas": id,
        onClick: () => setSoldAs(id),
      }, nameOf(id))));

  /* ALIAS-AWARE, AND DELIBERATELY BLIND TO THE DECEPTIVE NAMES.
   *
   * "molly" is MDMA and "tina" is meth, and a picker that only knows proper
   * names cannot be told that by somebody who only knows the street one. So
   * the search matches a substance's name and its `aliases` — the names it is
   * genuinely also called.
   *
   * It does NOT match `searchAliases`, and that exclusion is the safety rule,
   * not an oversight. Those are the MISLEADING names from name-warnings.json —
   * "tusi", "pink cocaine" — names the market uses for something that is
   * usually a different drug. On the Drugs page a searchAlias hit is safe
   * because the page it opens leads with the warning; here there is no page
   * and no warning, so loading the 2C-B chart for "tusi" would score a pink
   * powder that is typically a ketamine mix against 2C-B's colours and read a
   * match as reassurance. findSubstances is passed includeSearchAliases:false,
   * so "tusi" simply finds nothing here — which is the correct, quiet failure.
   * Only substances the reagent data can answer are offered. */
  const searchInput = h("input", {
    class: "input", type: "search", autocomplete: "off", spellcheck: "false",
    "aria-label": "Find a substance by name or street name",
    placeholder: "Or type a name — molly, tina, ket…",
  });
  const searchCount = h("p", { class: "filter__count", role: "status" });
  const searchHits = h("div", { class: "list", hidden: true });

  const runSearch = () => {
    const term = searchInput.value.trim();
    clear(searchHits);
    if (!term) {
      searchHits.hidden = true;
      searchCount.textContent = "";
      return;
    }
    const hits = findSubstances(records, term, { includeSearchAliases: false })
      .map((m) => m.s)
      .filter((s) => withDataSet.has(s.id))
      .slice(0, 12);
    searchHits.hidden = hits.length === 0;
    /* role=status count. "matches" is the neutral word — a reader who typed
       "tusi" and gets none is told plainly, not steered to a wrong page. */
    searchCount.textContent = hits.length
      ? `${hits.length} substance${hits.length === 1 ? "" : "s"} with reagent data`
      : "Nothing with published reagent data by that name.";
    for (const s of hits) {
      searchHits.appendChild(
        h("button", { type: "button", class: "nbr", onClick: () => {
            setSoldAs(s.id);
            searchInput.value = "";
            runSearch();
          } },
          h("span", { class: "nbr__text" },
            h("span", { class: "nbr__name" }, s.name),
            (s.aliases || []).length
              ? h("span", { class: "nbr__sub" }, s.aliases.slice(0, 3).join(", "))
              : null),
          h("span", { class: "nbr__right" }, h("span", { "aria-hidden": "true" }, "›"))));
    }
  };
  searchInput.addEventListener("input", runSearch);

  const addBtn = h("button", {
    type: "button", class: "btn btn--ghost btn--sm",
    onClick: () => { addSlot(); check(); },
  }, "+ Add another reagent");

  function addSlot(want) {
    if (slots.length >= MAX) return;
    const i = slots.length;
    /* Default each new row to a reagent not already chosen, so adding one
       never lands on a duplicate the reader then has to change. */
    const taken = new Set(slots.map((s) => s.reagent.value));
    const first = (want && REAGENTS.includes(want) ? want : null)
      || REAGENTS.find((r) => !taken.has(r)) || REAGENTS[0];

    /* BOTH LISTS ARE ALPHABETICAL IN THE DROPDOWN, whatever order the arrays
       are in above.
       REAGENTS is in chart-priority order and COLORS runs down the spectrum.
       Both orders are meaningful to somebody who already knows the material and
       invisible to somebody scanning eleven options for the word they want —
       and scanning is what this control is for. The arrays keep their order,
       because code elsewhere depends on it: REAGENTS[0] is the default first
       row and REAGENTS.find picks the next unused one. Only the rendering is
       sorted. */
    /* NO aria-label. Each select sits inside a <label> that a sighted reader
       sees - "I used", "it went" - and an aria-label on top of it REPLACED
       that name for a screen reader, so the spoken name ("Reagent 1") and the
       visible one never matched (WCAG 2.5.3). The number a reader needs to
       tell two rows apart goes into the label instead, off-screen, and
       relabel() keeps it right as rows come and go. */
    const reagent = h("select", { class: "input" },
      [...REAGENTS]
        .sort((a, b) => reagentName(a).localeCompare(reagentName(b)))
        .map((r) =>
          h("option", { value: r, selected: r === first || null }, reagentName(r))));
    /* Capitalised. The values stay lowercase — they are keys into the reagent
       table — but a dropdown full of lowercase words next to "Marquis" and
       "Simon's" read as unfinished text rather than as choices. */
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const result = h("select", { class: "input" },
      h("option", { value: "" }, "Choose…"),
      /* Pinned above the colours, not sorted into them. It is not a colour, and
         it is the single most common answer — a reagent that does nothing is
         the usual result for most substances. */
      h("option", { value: "none" }, "No reaction"),
      [...COLORS].sort((a, b) => a.localeCompare(b))
        .map((c) => h("option", { value: c }, cap(c))));
    /* The run instructions, at the moment of choosing. A reader met "Morris"
       here as a plain row and had no way to know it is two bottles, a double
       sample and a stir - that lived only in the guide further down. Synced on
       change so switching to Marquis clears it. */
    const howto = h("p", { class: "sec__note revhow", hidden: true });
    const syncHow = () => {
      const t = reagentHowTo(reagent.value);
      howto.textContent = t || "";
      howto.hidden = !t;
    };
    syncHow();
    reagent.addEventListener("change", () => { syncHow(); check(); });
    result.addEventListener("change", check);

    /* THE COMBINATION CHECKER'S ROW, twice - slotLabel() in slots.js, which
     * both tools build from.
     *
     * Its slot is a label carrying a word and a field: "I took [Opioids]".
     * A reagent takes two answers rather than one, so it gets two of those
     * stacked — "I used [Marquis] / it went [black]" — same label, same field,
     * same chevron, and it reads as the sentence somebody would say out loud.
     *
     * They were side by side with the word "went" between them, which is not
     * the same control: two bare fields on a line, no label, and at 393px both
     * of them too narrow to show "no reaction". */
    /* The × is a sibling of both halves, not a child of either, so it can
       centre beside the pair and take the same width off both rows. */
    const pair = (word, sel) => h("div", { class: "mixslot" }, slotLabel(word, sel, i + 1, "reagent"));
    const row = h("div", { class: "revslot" },
      pair(i === 0 ? "I used" : "and", reagent),
      pair("it went", result),
      howto,
      /* Every reagent past the first can go. The combination checker keeps two
         because a combination of one is not a combination; one reagent is a
         real question with a real answer, so the floor here is one. */
      i > 0
        ? removeButton(`Remove reagent ${i + 1}`, () => {
            const at = slots.findIndex((x) => x.reagent === reagent);
            if (at > -1) slots.splice(at, 1);
            /* The label the row wore when it was pressed, for the region -
               relabel() below renumbers what is left. */
            const was = at > -1 ? at + 1 : i + 1;
            dropRow(row, addBtn);
            relabel();
            check(`Reagent ${was} removed.`);
          })
        : null);

    slots.push({ reagent, result });
    rows.appendChild(row);
    /* After every add, not only after a removal: a row added once another
       has gone takes its number from its position, not from the count at the
       moment it was built. */
    relabel();
  }

  /* Removing the first reagent would otherwise leave the list starting on
     "and", the same way the combination checker's would. */
  /* relabelRows re-words EVERY .mixlabel__word in a row, and a reagent row
     has two - "I used"/"and" on the first and "it went" on the second. The
     second is restored after, so the shared helper stays the simple thing it
     is for the checker and the tracker's second line keeps its own word. */
  function relabel() {
    relabelRows(rows, "I used", "and", "reagent");
    for (const row of rows.children) {
      const words = row.querySelectorAll?.(".mixlabel__word") || [];
      if (words[1]) words[1].textContent = "it went";
    }
    addBtn.disabled = slots.length >= MAX;
  }

  /* SAYING WHAT IT WAS SOLD AS LOADS THE CHART'S REAGENTS.
   *
   * Otherwise the reader is guessing which bottles the test needs, and the
   * guess is wrong in a way that costs a sample: the cocaine test opens with
   * Morris and the ketamine test is Morris alone, so anybody who assumed
   * Marquis-first has used up material on a reagent the chart never asks for.
   * The chart already knows. It fills the rows in its own order, and the
   * panel above them says what each step should produce.
   *
   * Anything already answered is carried across by reagent rather than by
   * position, so changing the sold-as after entering a colour keeps it. */
  /* A NEW SUBSTANCE IS A NEW TEST, so the readings go with it.
   *
   * Results used to be carried across by reagent, on the reasoning that a
   * colour you observed is a colour you observed whatever you call the sample.
   * True of the reading and false of the test: switching from MDMA to MDA left
   * the old answers sitting under a freshly loaded chart, already scored
   * against it, so a test the reader had not run appeared to have a verdict.
   * Every reading also belongs to a specific scraping of a specific sample, and
   * "sold as" changing usually means a different bag. */
  function loadFlow(flow, id) {
    let want = (flow?.steps || []).map((s) => s.reagent).filter((r) => REAGENTS.includes(r));
    /* No chart for this one — 196 of the 207 substances. The table still knows
       which reagents have a published result for it, and those are the only
       ones that can say anything either way, so they go in the rows. Two, not
       every one of them: a wall of dropdowns is what this picker started as. */
    if (!want.length && id) {
      const have = new Set((table?.[id] || []).map((r) => r.reagent));
      want = REAGENTS.filter((r) => have.has(r)).slice(0, 2);
    }

    slots.length = 0;
    clear(rows);
    (want.length ? want : [REAGENTS[0]]).forEach((r) => addSlot(r));
    relabel();
  }

  /* THE SAME REACTION BAR THE REAGENT TABLES USE.
   *
   * Those tables answer the forward question — what does Marquis do to MDMA —
   * and they answer it with a blended band of the colors it goes through. This
   * screen was answering the same question in words alone, so "expect royal
   * blue" sat above a reagent table two sections up where royal blue was a
   * band you could hold a spot plate against. One reagent result, two
   * renderings, in the same tool.
   *
   * A step accepting several readings gets several bands, which is what the
   * bar already does for a sequence — the meaning differs (these are
   * alternatives, not a progression) and the words beside it carry that. The
   * bar is aria-hidden throughout for the same reason it is in the tables:
   * color is never the only signal, and reagent color is exactly where a
   * color-blind reader is most at risk of being failed. */
  const bar = (colors, none) => {
    const keys = [...(none ? ["none"] : []), ...(colors || [])];
    if (!keys.length) return null;
    return h("span", { class: "reagbar reagbar--inline", "aria-hidden": "true" },
      keys.map((k) => h("span", { class: KNOWN_COLORS.has(k) || k === "none" ? `swatch--${k}` : "" })));
  };
  /* NO INLINE DOTS. An 11px swatch was going in beside each observed reading,
     and in dark mode swatch--black is #26221c on a card that is nearly the
     same — it rendered as an empty outlined box directly next to the word
     "black", which reads as a broken image rather than as a color. The word
     is right there and the plan panel above carries the full bar, where
     several bands and a larger area actually make a color legible. */

  /* NO CONTEXT, SO START WITH A MARQUIS AND LET IT DECIDE.
   *
   * "Not saying / not sure" used to leave one Marquis row and nothing else,
   * which is where a ground score actually starts — and then left the reader
   * to work out on their own which bottle to open second. Chart 3 exists for
   * exactly that and answers it: peach sends you to Morris, no reaction to
   * Liebermann, black to Simon's.
   *
   * The rows follow it ONE STEP AT A TIME. Answering Marquis adds the reagent
   * the chart asks for next and nothing beyond it; answering that adds the one
   * after. Loading every reagent that is still live would be four dropdowns
   * for an orange Marquis, which is both a wall and more than the chart asks
   * for.
   *
   * Nothing already answered is removed. A row the reader filled in stays even
   * when changing the Marquis reading reroutes everything under it, because
   * deleting somebody's own observation to tidy a layout is never worth it. */
  function syncUnknown() {
    const state = {};
    for (const { reagent, result } of slots) {
      if (result.value) state[reagent.value] = result.value;
    }
    const led = guide(state, charts);

    const keep = new Set(["Marquis", ...(led?.next || [])]);
    for (const { reagent, result } of slots) if (result.value) keep.add(reagent.value);

    for (const s of [...slots]) {
      if (keep.has(s.reagent.value)) continue;
      const at = slots.indexOf(s);
      if (at > -1) slots.splice(at, 1);
      const row = rows.children[at];
      if (row) dropRow(row, addBtn);
    }
    const have = new Set(slots.map((s) => s.reagent.value));
    for (const r of led?.next || []) if (!have.has(r)) addSlot(r);
    relabel();
    return led;
  }

  /* ONE INSTRUCTION AT A TIME, and no menu.
   *
   * This offered the surviving substances as buttons that loaded their test.
   * That is asking somebody with a ground score to pick which drug they are
   * testing for — the exact question they came here unable to answer, and the
   * question chart 3 exists to take off them. Choosing wrong loads the wrong
   * sequence and reads a real result against it.
   *
   * So it just says what to run next. Each reading drops whatever it
   * contradicts, the next reagent loads itself, and it ends when a chart's
   * sequence completes. The candidates are still named, as plain text, because
   * knowing you are somewhere between cocaine and ketamine is worth having
   * mid-test — but they are information, not a control. */
  function routeCard(led) {
    const route = led.route;
    const said = route.reading === "none" ? "nothing" : route.reading;
    const names = (list) => list.map((w) => nameOf(w.id));
    const listOf = (a) => a.length > 1
      ? `${a.slice(0, -1).join(", ")} or ${a[a.length - 1]}` : a[0];

    const opener = h("p", { class: "plan__hd" },
      "Marquis went ", h("strong", null, said), ". ");

    if (!route.matched) {
      return h("div", { class: "plan" },
        h("p", { class: "plan__hd" },
          "Marquis went ", h("strong", null, said),
          ". The unknown-substance chart does not list that result."),
        h("p", { class: "sec__note" }, charts?.unknownRule || ""),
        h("p", { class: "sec__note" },
          "If you have a substance in mind, pick it above and this loads the "
          + "test for it."));
    }

    /* A chart's sequence has run out. Either one completed, in which case the
       verdict card below says so step by step, or several are still standing
       with nothing left to separate them and that is the honest end of it. */
    if (!led.next.length) {
      if (led.finished.length) return h("div", { class: "plan" }, opener);
      return h("div", { class: "plan" },
        opener,
        h("p", { class: "sec__note" },
          led.live.length
            ? `The chart runs out here with ${listOf(names(led.live))} still `
              + "open, and nothing left that separates them."
            : "Nothing on the charts follows from that combination."));
    }

    const runNext = h("p", { class: "plan__hd" },
      "Run ", h("strong", null, listOf(led.next.map(reagentName))), " next",
      led.next.length > 1
        ? " — the reading could be either branch, so both are loaded below."
        : ", loaded below.");

    /* THE FORK, DRAWN. This is the part of a flowchart that is a picture: one
       reagent, and a different color for each thing it could still be. It was
       a sentence — "Still open: Cocaine or Ketamine" — which says who is in the
       running and not the one thing that decides it. Each candidate now shows
       what it expects at the step being run, with the band beside it, so the
       spot plate can be held against the answer rather than against a memory
       of the wording. */
    const fork = led.next.flatMap((reagent) =>
      led.live.map((w) => {
        const step = w.steps.find((s) => s.reagent === reagent && s.verdict === "pending");
        return step ? { id: w.id, reagent, step } : null;
      }).filter(Boolean));

    return h("div", { class: "plan" },
      opener,
      runNext,
      fork.length
        ? h("ul", { class: "plan__steps plan__steps--fork" },
            fork.map((f) =>
              h("li", { class: "plan__step plan__step--fork" },
                h("span", { class: "plan__reagent" }, nameOf(f.id)),
                h("span", { class: "plan__says" },
                  led.next.length > 1 ? `${reagentName(f.reagent)}: ` : "",
                  f.step.says),
                f.step.read
                  ? h("span", { class: "plan__read" }, `read within ${f.step.read}`)
                  : null,
                bar(f.step.colors, f.step.none))))
        : null,
      led.live.length
        ? h("p", { class: "sec__note" },
            led.live.length === 1
              ? `Only ${names(led.live)[0]} is still on the chart from here.`
              : `Still open: ${listOf(names(led.live))}. That step is what `
                + "separates them.")
        : null);
  }

  /* WHAT THE TEST IS, now that the rows are already filled in.
   *
   * This used to instruct — "the chart runs Marquis, then Simon's" — which was
   * asking somebody to do by hand what the app knows. Choosing the substance
   * loads the chart's reagents into the rows in the chart's order, so the only
   * thing left to enter is what each one did, and this panel's job shrank to
   * saying which test got loaded and what each step should produce.
   *
   * The expected colour is kept, in DanceSafe's own wording — "royal blue",
   * not "blue" — because the reader is about to hold a real spot plate against
   * it and the chart's words are more use than the ten buckets the picker has
   * to round them into. It stays up here rather than beside each dropdown: a
   * swatch to compare against is the point of the chart, an answer printed
   * against the input field is a leading question. */
  function planCard(flow, run) {
    /* THE MARK IS THE VERDICT, not "has this been answered".
     *
     * It used to tick any step that had a value in it, so a Marquis reported
     * brown against a chart expecting black got a green check up here and a red
     * cross in the verdict card directly below — the same reading marked right
     * and wrong on one screen, twelve lines apart. Reported from the live app.
     * Agrees ticks, disagrees crosses, unanswered keeps its step number. */
    const verdicts = new Map((run?.steps || []).map((s) => [s.reagent, s.verdict]));
    const name = nameOf(flow.id);
    const multi = flow.steps.length > 1;

    return h("div", { class: "plan" },
      h("p", { class: "plan__hd" },
        "Loaded the ",
        h("strong", null, `${name} test`),
        multi
          ? ` — ${flow.steps.length} reagents, in the chart's order.`
          : " — one reagent."),
      h("ol", { class: "plan__steps" },
        flow.steps.map((s) => {
          const v = verdicts.get(s.reagent) || "pending";
          return h("li", { class: `plan__step plan__step--${v}` },
            h("span", { class: "plan__reagent" }, reagentName(s.reagent)),
            h("span", { class: "plan__says" }, `expect ${s.says}`),
            /* HOW LONG THE READING IS GOOD FOR, which the charts print under
               every sample and which changes the answer rather than decorating
               it: Morris is read over five minutes and the LSD Ehrlich's over
               thirty, while everything else is forty-five seconds. A Morris
               judged at forty-five seconds has not finished reacting. */
            s.read ? h("span", { class: "plan__read" }, `read within ${s.read}`) : null,
            bar(s.colors, s.none));
        })),
      /* Sample count is not decoration. Every reagent needs its own scraping —
         running a second on the same spot reads the first reagent's product. */
      h("p", { class: "sec__note" },
        multi
          ? `That is ${flow.steps.length} separate samples. Each reagent needs `
            + "its own, because a second drop on a spot that has already reacted "
            + "is reading the first reagent, not the drug."
          : "One sample is enough for this one."));
  }

  /* The same courtesy for the 196 substances no chart covers: the rows are
     filled with the reagents that have a published result, because those are
     the only ones that can say anything either way. Said out loud, because
     "these are what we have data on" is a weaker claim than a flowchart and
     must not be mistaken for one. */
  function tablePlanNote(id) {
    const picked = slots.map((s) => s.reagent.value);
    const have = new Set((table?.[id] || []).map((r) => r.reagent));
    if (!picked.some((r) => have.has(r))) return null;
    return h("p", { class: "plan__hd" },
      "No published flowchart covers ",
      h("strong", null, nameOf(id)),
      ", so there is no order to follow. Loaded the reagents that have a "
      + "result on record for it — say what they did, or change them.");
  }

  /* The verdict, walked step by step down the chart.
   *
   * "-LIKE SUBSTANCE", NEVER THE SUBSTANCE. A completed sequence says the
   * sample behaved the way that drug behaves. It does not say what the sample
   * is: a reagent reads whatever reacts strongest, so anything sharing the
   * reactive group reads the same and anything weaker hides behind it. Every
   * analogue of a charted drug walks the same path. "Completes the ketamine
   * test" was already careful about WHO said it — nobody claimed ketamine —
   * but it still let a reader finish the sentence "so it is ketamine".
   *
   * `found` is the guided path arriving at an answer rather than a claim being
   * checked, so it keeps the weaker frame of the two. */
  function flowCard(flow, run, state, found) {
    const name = nameOf(flow.id);
    const like = aLike(flow.id);
    const look = found
      ? { card: "advisory", badge: "ok", glyph: "✓",
          label: `Consistent with ${like}` }
      : {
        expected:   { card: "advisory", badge: "ok",       glyph: "✓",
                      label: `Consistent with ${like}` },
        ontrack:    { card: "advisory", badge: "neutral",  glyph: "›",
                      label: `So far, ${name}-like` },
        unexpected: { card: "elevated", badge: "elevated", glyph: SEV_GLYPH.elevated,
                      label: `Unexpected for ${name}` },
      }[run.status];

    const mark = { agrees: "✓", disagrees: "✗", pending: "·" };
    const line = (s) =>
      h("li", { class: `soldline soldline--${s.verdict}` },
        h("span", { class: "soldline__mark", "aria-hidden": "true" }, mark[s.verdict]),
        /* The mark is aria-hidden and its colour is the verdict, so a screen
           reader heard "Marquis went black - the chart expects black" with no
           word for whether that is the answer or the problem. Said off-screen,
           before the reading; the visible line is unchanged. */
        h("span", { class: "sr-only" }, SR_VERDICT[s.verdict]),
        h("span", null,
          s.verdict === "pending"
            ? h("span", null, `${reagentName(s.reagent)} — not run yet. `,
                h("em", null, `The chart expects ${s.says}.`))
            : h("span", null,
                `${reagentName(s.reagent)} went `,
                h("strong", null, s.observed === "none" ? "nothing" : s.observed),
                ` — the chart expects ${s.says}`)),
        /* Every line carries its own band. The plan panel above has them too
           when a substance was named, but the guided path has no plan panel at
           all, and a verdict that only describes colors in words is the one
           place on this screen where a band is most use. */
        bar(s.colors, s.none));

    /* What these readings DO complete, which for the commonest failure is not
       a vague mismatch but the next line down on the same chart. */
    const others = run.status === "unexpected"
      ? completedBy(state, charts, flow.id) : [];
    const extra = offChart(flow, state);

    return h("div", { class: `card card--${look.card}` },
      h("div", { class: "card__top" },
        h("span", { class: `badge badge--${look.badge}` },
          h("span", { "aria-hidden": "true" }, look.glyph), look.label),
        /* The chart name, when the guided path arrived here on its own. When
           the reader picked the substance themselves the meta used to say
           "testing for MDMA" - repeating the choice they made two inches up
           the screen. The verdict lines underneath name the substance in
           every sentence, so the label carried nothing. Removed. */
        found && flow.chart
          ? h("span", { class: "card__meta" }, `chart ${flow.chart.split(" ")[0]}`)
          : null),
      h("ul", { class: "soldlines" }, run.steps.map(line)),

      run.status === "ontrack"
        ? h("p", { class: "sec__note" },
            `Nothing so far contradicts ${name}, and the test is not finished. `
            + `Run ${reagentName(run.next)} on a fresh sample — that is the step `
            + "that decides it."
            + (reagentHowTo(run.next) ? " " + reagentHowTo(run.next) : ""))
        : null,

      others.length
        ? h("p", { class: "sec__note" },
            "What these readings DO complete is the published flow for ",
            h("strong", null, others.map((o) => aLike(o.id)).join(", or ")),
            ". That is the chart's own answer, not a guess from the colors.")
        : null,

      /* "at a dose that kills" is gone. The stop callout at the top of this
         tool already says reagents do not test for fentanyl; repeating the
         stakes at every result is the kind of line that stops being read. */
      h("p", { class: "sec__note" },
        run.status === "expected" || found
          ? "Expected reactions rule out red flags and do not give green "
            + "lights. This confirms what the primary substance is and is not "
            + "definitive."
          : run.status === "expected"
          ? "That is the chart's endpoint, which is worth having and is not a "
            + "purity result. A reagent reads whatever reacts strongest, so "
            + "anything else in there behaves like the majority and stays hidden."
          : run.status === "unexpected"
          ? `It did not do what ${name} is supposed to do. That is worth acting `
            + "on and it does not by itself say what you have instead — reagent "
            + "age, light and a faint reaction all move a color, and a mixture "
            + "reacts as whatever dominates."
          : "Nothing here rules out fentanyl at any step."),

      extra.length
        ? h("p", { class: "sec__note" },
            `${extra.map(reagentName).join(" and ")} `
            + `${extra.length === 1 ? "is" : "are"} not on this chart, so `
            + `${extra.length === 1 ? "it is" : "they are"} not counted above. `
            + "The list below scores every reading against all "
            + `${Object.keys(table || {}).length} substances.`)
        : null);
  }

  /* `tail` is a clause for the live region - the removal, when a × was
     pressed. Anything else that arrives here (a change event, from the
     listeners that pass check straight through) is not a clause. */
  function check(tail) {
    clear(out);
    /* Persist and reflect the current state on every pass: the module-scoped
       snapshot that survives Back, and the chip pressed-state. Both before any
       verdict is computed — they describe the inputs, not the result. */
    snapshot();
    syncChips();
    /* What the region will say: the card's exact label first, then the rest
       in the order it appears on screen. Assembled as the cards are built so
       the words are the cards' own words, never a paraphrase of them. */
    let verdict = null;
    const notes = [];
    const done = () => announce([verdict, ...notes, typeof tail === "string" ? tail : null]);

    /* With nothing said about what it is, the rows follow chart 3 from the
       Marquis reading. Done before the state is read: adding a row adds an
       empty one, so it cannot change what is about to be scored. */
    const led = soldAs.value ? null : syncUnknown();

    /* Last one wins if the same reagent is picked twice — the alternative is
       an error message about a mistake the reader can simply correct. */
    const state = {};
    for (const { reagent, result } of slots) {
      if (result.value) state[reagent.value] = result.value;
    }

    const flow = flowFor(soldAs.value, charts);
    const run = walk(flow, state);
    const { consistent, used, blanked } = matchFn(state, table);

    /* A READING THAT WAS THE BOTTLE, said out loud rather than dropped in
       silence. Pink on Morris and orange on Simon's are what those reagents
       look like unreacted, so they are not scored — but a reader who typed one
       in and saw it vanish from the count would reasonably think the app had
       ignored them. It tells them what happened and what to do about it. */
    /* The blank-bottle clause for the region, in the note's own opening
       words; pushed where the note is appended so it is heard in the order it
       is seen. */
    const blankClause = (blanked || []).length
      ? (blanked || []).map(reagentLabel).join(" and ")
        + ((blanked || []).length === 1
            ? " came back the color it already is and is not counted."
            : " came back the colors they already are and are not counted.")
      : null;
    const blankNote = (blanked || []).length
      ? h("p", { class: "sec__note" },
          (blanked || []).map(reagentLabel).join(" and "),
          (blanked || []).length === 1 ? " came back the color it already is"
                                        : " came back the colors they already are",
          " — ",
          (blanked || []).map((r) => `${reagentLabel(r)} is ${(blankColorsFor(r) || []).join("/")} when nothing reacts`)
            .join(", "),
          ". That is not a result, so it is not counted either way. A spent "
          + "bottle, too little sample, or something that will not dissolve all "
          + "look like this. Run it again on a fresh scraping.")
      : null;

    /* THE CHART, before anything has been run.
     *
     * This is the answer to "which reagents do I need", and it has to come
     * before the results rather than with them — somebody who has not started
     * yet is standing over a bag deciding what to open. */
    if (flow) {
      out.appendChild(planCard(flow, run));
      /* Before any reading, the change was the test being loaded - say so in
         the plan card's words. Once there are readings the verdict speaks. */
      if (!used) notes.push(`Loaded the ${nameOf(flow.id)} test`
        + (flow.steps.length > 1 ? ` — ${flow.steps.length} reagents, in the chart's order.` : " — one reagent."));
    } else if (soldAs.value) {
      out.appendChild(tablePlanNote(soldAs.value));
      if (!used) notes.push(`No published flowchart covers ${nameOf(soldAs.value)}. `
        + "Loaded the reagents that have a result on record for it.");
    } else if (led) {
      out.appendChild(routeCard(led));
      /* The chart's next instruction, or its end - the route card's own
         sentences, shortened to the one that tells the reader what to do. */
      const route = led.route || {};
      const said = route.reading === "none" ? "nothing" : route.reading;
      if (!route.matched) notes.push(`Marquis went ${said}. The unknown-substance chart does not list that result.`);
      else if (led.next.length) notes.push(`Run ${led.next.map(reagentName).join(" or ")} next.`);
      else if (!led.finished.length) notes.push(`Marquis went ${said}. The chart runs out here.`);
    }

    /* The guided walk landed on a chart's endpoint. Same card the sold-as path
       uses, labelled as a sequence that completed rather than as a claim that
       held — nobody claimed anything here. */
    for (const w of led?.finished || []) {
      out.appendChild(flowCard(flowFor(w.id, charts), w, state, true));
      /* The card's badge, verbatim, and first. */
      if (!verdict) verdict = `Consistent with ${aLike(w.id)}.`;
    }

    /* The "start with Marquis" line used to sit here, under the empty picker,
       which is below the controls it is instructions for. It is in the intro
       at the top of the section now, where somebody reads before touching
       anything. */
    if (!used) { done(); return; }

    /* THE CHART'S VERDICT WINS WHERE THERE IS ONE.
     *
     * checkSoldAs asks whether each colour is somewhere in that substance's
     * row. The chart asks whether this SEQUENCE is the published result, which
     * is both stricter and more useful — black on Marquis is in MDMA's row and
     * is also in MDA's, and the table cannot tell you that Simon's is what
     * separates them or that you have not run it yet. Where DanceSafe publishes
     * a flow, that is the answer; the 207-substance table underneath is the
     * broader scope, and it is where an unexpected result gets explained. */
    if (run && run.status !== "none") {
      out.appendChild(flowCard(flow, run, state));
      /* The same label flowCard puts on its badge, so what is heard is what is
         printed. */
      if (!verdict) {
        const name = nameOf(flow.id);
        verdict = {
          expected:   `Consistent with ${aLike(flow.id)}.`,
          ontrack:    `So far, ${name}-like.`,
          unexpected: `Unexpected for ${name}.`,
        }[run.status] || null;
      }
    }

    /* THE TABLE'S VERDICT, for the 196 substances no chart covers.
     *
     * Deliberately not a purity or safety result in either direction. An
     * expected reaction says the majority of what is in there behaves like the
     * thing it was sold as — it cannot see fentanyl and it cannot see a second
     * drug hiding behind a stronger one. An unexpected reaction says it did not
     * do what that is supposed to do, which is worth acting on, and does not
     * on its own name what it is instead. The list underneath does that part. */
    const sold = (!run || run.status === "none") && soldAs.value
      ? checkSoldAs(soldAs.value, state, table) : null;
    if (sold) {
      const name = nameOf(sold.id);
      const look = {
        expected:   { card: "advisory", badge: "ok",       glyph: "✓",
                      label: `Consistent with ${aLike(sold.id)}` },
        unexpected: { card: "elevated", badge: "elevated", glyph: SEV_GLYPH.elevated,
                      label: `Unexpected for ${name}` },
        partial:    { card: "advisory", badge: "neutral",  glyph: "?",
                      label: `No published answer` },
      }[sold.status];
      if (!verdict) verdict = `${look.label}.`;

      const line = (d) => {
        const doc = d.documented;
        const was = doc?.none && doc?.colors?.length
          ? `no reaction or ${doc.colors.join(" or ")}`
          : doc?.none ? "no reaction" : (doc?.colors || []).join(" or ");
        const mark = { agrees: "✓", disagrees: "✗", unknown: "–" }[d.verdict];
        return h("li", { class: `soldline soldline--${d.verdict}` },
          h("span", { class: "soldline__mark", "aria-hidden": "true" }, mark),
          /* See SR_VERDICT: the mark carries the answer to the eye only. */
          h("span", { class: "sr-only" }, SR_VERDICT[d.verdict]),
          h("span", null,
            `${reagentName(d.reagent)} went `,
            h("strong", null, d.observed === "none" ? "nothing" : d.observed),
            d.verdict === "unknown"
              ? ` — nothing published for ${name} with ${reagentName(d.reagent)}`
              : ` — published for ${name} is ${was}`,
            /* No plan panel above this one — the table has no sequence to
               print — so the published colors carry their own bar. */
            d.verdict === "unknown" ? null : bar(doc?.colors, doc?.none)));
      };

      out.appendChild(
        h("div", { class: `card card--${look.card}` },
          h("div", { class: "card__top" },
            h("span", { class: `badge badge--${look.badge}` },
              h("span", { "aria-hidden": "true" }, look.glyph), look.label)),
          h("ul", { class: "soldlines" }, sold.detail.map(line)),
          h("p", { class: "sec__note" },
            sold.status === "expected"
              ? "Expected reactions rule out red flags and do not give green "
                + "lights. This confirms what the primary substance is and is "
                + "not definitive."
              : sold.status === "unexpected"
              ? "It did not do what " + name + " is supposed to do. That is "
                + "worth acting on and it does not by itself say what you have "
                + "instead — reagent age, light and a faint reaction all move a "
                + "color, and a mixture reacts as whatever dominates."
              : "Nobody has published what " + name + " does with "
                + (sold.unknown === sold.used ? "those reagents" : "one of the reagents you ran")
                + ", so there is no expected result to compare yours against. "
                + "That is a gap in the reference, not a finding.")));
    }

    /* .nbr, the app's native list row, rather than a bespoke button.
     *
     * These were outlined pills with 8px between them sitting INSIDE .list —
     * which is itself a bordered, rounded, clipping container built for exactly
     * this. So every result was a box in a box with a gap, when .list > .nbr
     * already gives flush full-width rows, inset hairlines between them and a
     * pressed tint. Same row the substance index and the map's top list use,
     * so a result here now looks like every other tappable name in the app. */
    const hit = (m, meta) =>
      h("button", { type: "button", class: "nbr",
                    onClick: () => go(`#/substances/${m.id}`) },
        h("span", { class: "nbr__text" },
          h("span", { class: "nbr__name" }, nameOf(m.id))),
        h("span", { class: "nbr__right" },
          h("span", { class: "nbr__dist" },
            meta || (m.unknown
              ? `${m.agrees} of ${used}, ${m.unknown} untested`
              : `${m.agrees} of ${used}`)),
          h("span", { "aria-hidden": "true" }, "›")));

    /* A COMPLETED CHART IS A PUBLISHED RESULT, and the list has to say so.
     *
     * The two halves of this screen scored differently and could therefore
     * contradict each other outright. Live example: an unknown, Marquis orange,
     * Simon's clear, Froehde clear — that completes DanceSafe's amphetamine
     * sequence, and the card said so. Then a fourth reagent the chart does not
     * ask for went into the table scoring, no substance had a published result
     * for all four, and directly underneath "Completes the Amphetamine test"
     * the screen said "Nothing published matches all 4 readings."
     *
     * Both sentences were true of their own scoring and the pair of them is
     * incoherent — worse, the second reads as "inconclusive" and cancels the
     * first. The verdict card already says an off-chart reading is not counted
     * in it; the list was silently counting it and coming back empty.
     *
     * So anything a chart completes is in this list, ahead of substances that
     * merely have the right colors in their rows, and labelled for the evidence
     * it rests on. The empty state is now only reachable when no chart answered
     * at all, which is the only time it is true. */
    const chartedWalks = completedBy(state, charts);
    const inTable = new Set(consistent.map((c) => c.id));
    const chartOnly = chartedWalks.filter((w) => !inTable.has(w.id));
    const chartedIds = new Set(chartedWalks.map((w) => w.id));
    const ranked = chartedIds.size
      ? [...consistent].sort((a, b) =>
          (chartedIds.has(b.id) ? 1 : 0) - (chartedIds.has(a.id) ? 1 : 0))
      : consistent;

    const allOf = used === 1 ? "that reading" : `all ${used} readings`;
    const total = chartOnly.length + consistent.length;

    if (blankNote) { out.appendChild(blankNote); notes.push(blankClause); }

    if (!total) {
      notes.push(`Nothing published matches ${allOf}.`);
      out.appendChild(empty(
        `Nothing published matches ${allOf}.`,
        "That is a gap in what has been tested, not proof you have something new. "
        + "Reagent age and light both change a color, so check whether one of "
        + "the readings could go the other way."));
    } else {
      /* The count line, as printed. */
      notes.push(chartOnly.length && !consistent.length
        ? `${chartOnly.length === 1 ? "One substance" : `${chartOnly.length} substances`} completed a published test sequence.`
        : `${total} substance${total === 1 ? "" : "s"} match${total === 1 ? "es" : ""} ${allOf}.`);
      out.appendChild(h("p", { class: "sec__note" },
        chartOnly.length && !consistent.length
          /* The chart answered and the table cannot corroborate it, because no
             one substance has a published result for every reagent that got
             run. That is a gap in the table, not a second opinion. */
          ? `${chartOnly.length === 1 ? "One substance" : `${chartOnly.length} substances`} `
            + "completed a published test sequence. No single substance in "
            + `the ${Object.keys(table || {}).length}-substance color table has a `
            + `result on record for ${allOf}, so it has nothing to add here.`
          : `${total} substance${total === 1 ? "" : "s"} `
            + `match${total === 1 ? "es" : ""} ${allOf}.`));
      out.appendChild(h("div", { class: "list" }, [
        ...chartOnly.map((w) => hit({ id: w.id }, "matches the chart")),
        ...ranked.slice(0, 12).map((m) => hit(m)),
      ]));
      /* The paragraph that used to close this list is gone. It said a third
         time, in a longer form, what the verdict above each result already
         says: expected reactions rule out red flags rather than giving green
         lights. A caveat a reader has already met twice on one screen is a
         caveat they skim. */
    }

    /* ONE LIST, AND IT IS THE ONE THAT MATCHES EVERYTHING.
     *
     * There were three: full matches, then a disclosure for substances with an
     * untested reagent, then another for ones a reading contradicted. Each was
     * defensible on its own and together they were three answers to one
     * question, in three different registers, two of them collapsed behind
     * summaries a reader had to parse before knowing whether to open them. The
     * screen is for somebody standing over a bag, and it now says the one thing
     * it can say cleanly: here is what these readings fit, all of them.
     *
     * What was protecting against still holds and is still said, in the stop
     * callout at the top of this tool rather than in a list at the bottom: no
     * color here and no combination of them says a sample is free of fentanyl.
     * Absence from a list is not evidence, which is why the list is framed as
     * what MATCHES rather than as what it could be.
     *
     * reagentmatch.js still computes all three — the rule that an unpublished
     * pair may never eliminate a substance is the module's core and is tested
     * there. The UI simply does not render two of them. */
    done();
  }

  function onSoldAs() {
    loadFlow(flowFor(soldAs.value, charts), soldAs.value);
    check();
  }
  soldAs.addEventListener("change", onSoldAs);

  /* The chip that matches the current sold-as reads as pressed. Run on every
     change from check() below, so setting the sold-as any way — chip, search,
     select, or rehydration — keeps the row of chips honest. */
  const syncChips = () => {
    for (const b of commonChips.querySelectorAll?.(".chip") || []) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-soldas") === soldAs.value));
    }
  };

  /* SESSION SNAPSHOT, taken on every interaction. trackerSession lives at
     module scope and is wiped on Quick Exit and pagehide (see the top of this
     file), so it survives a trip to a drug page and Back but nothing more. The
     loaded flow is not stored — it is a pure function of the sold-as, which
     rehydrate replays. */
  const snapshot = () => {
    trackerSession = {
      soldAs: soldAs.value,
      slots: slots.map((s) => ({ reagent: s.reagent.value, result: s.result.value })),
    };
  };

  /* REHYDRATE, if this session already has a tracker state to come back to.
     Rebuilds the rows the reader left, reagent and reading both, so Back lands
     on exactly what they had. Returns whether it did anything. */
  const rehydrate = () => {
    const sess = trackerSession;
    if (!sess || !Array.isArray(sess.slots) || !sess.slots.length) return false;
    soldAs.value = withDataSet.has(sess.soldAs) ? sess.soldAs : "";
    slots.length = 0;
    clear(rows);
    for (const st of sess.slots) {
      addSlot(st.reagent);
      const last = slots[slots.length - 1];
      if (last && st.result) last.result.value = st.result;
    }
    relabel();
    return true;
  };

  if (rehydrate()) {
    check();
  } else if (startId && withDataSet.has(startId)) {
    /* Arrived from a drug page's "Expected reagent reactions" link. Seed the
       sold-as so the reader lands with that substance's test already loaded,
       the same as picking it from the select. */
    soldAs.value = startId;
    onSoldAs();
  } else {
    /* ONE, and the reader adds the rest. Most people own a Marquis and nothing
       else, and opening with two empty rows asks for a second bottle before it
       has answered anything with the first. One reagent narrows the list less —
       which the empty state says, and which is a better argument for adding a
       second than a blank row that looks like a requirement. */
    addSlot();
    check();
  }

  return frag(
    /* The old version opened "Ran a few reagents and want to know what they
       add up to?", which described a tool you arrived at holding results. It
       now sets the test up as well as reads it — say what it was sold as and
       the chart's reagents load in its order — so the first sentence is what
       to do, not what it is for. */
    h("p", { class: "sec__note" },
      "Wanna test something? Put it into the reagent tracker to run a reagent "
      + "test. Just say what each color reaction was to each reagent. If you do "
      + "not know what the substance is, say not sure. The tracker will walk you "
      + "through the process."),
    /* BOTH PATHS EXPLAINED BEFORE THE CONTROLS, not after them. This sentence
       sat under the empty picker, which is below the thing it is instructions
       for — a reader following it had already had to guess. */
    /* The sample rule, said where the tool is rather than only in the
       procedure section: a reader who runs three reagents off one drop is
       reading the first reagent three times, not the drug. Simon's and Morris
       are the exceptions, and they are named so the rule does not read as
       contradicting the bottle in somebody's hand. */
    h("p", { class: "sec__note" },
      h("strong", null, "NOTE:"),
      " Each reagent needs its own sample. A two-part test (Simon's, Morris) "
      + "puts both bottles on one sample. Morris also needs a double sample "
      + "and a 20-second stir."),
    /* No fentanyl callout here. It used to sit in this tool AND inside
       "Reagents", which is the same warning twice on one screen — and a
       warning a reader has already scrolled past once is a warning they skim
       the second time. It is at the top of the Reagent testing group now,
       above every section it applies to, including this one. */
    /* The frame sits above the readings, in the same control, because what it
       was sold as changes how everything under it reads. Optional — the list
       works without it, and "not saying" is the default rather than a thing
       you have to go and clear.

       Three ways in, one store: the common names as chips, a name/street-name
       search that resolves aliases, and the full select for the long tail. The
       chips and search set the same select the verdict logic reads. */
    commonChips,
    h("div", { class: "filter" },
      h("div", { class: "filter__row" }, searchInput),
      searchCount),
    searchHits,
    h("div", { class: "mixslots revslots" },
      h("div", { class: "revslot" },
        h("div", { class: "mixslot" },
          h("label", { class: "pick__row" },
            h("span", { class: "mixlabel" }, "Substance"),
            h("span", { class: "pick__field" }, soldAs))))),
    rows,
    h("div", { class: "mixadd" }, addBtn),
    out,
    live);
}

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

    /* The "commonly published amount" table is gone, and it had to go rather
       than merely being redundant: it gave one middle-ground figure per drug
       form - a teaspoon per 10 mg - which is BTNX's ratio and five times what
       the WHPM strips ask for. Printed under a control that now states each
       product's own number, it was not a second opinion, it was a wrong one.
       The "published protocols disagree by ten times" callout went with it:
       that was this page explaining why it could not tell you. It can now. */

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
      b.onlyFor ? callout("stop", "Only for fentanyl", h("p", null, b.onlyFor)) : null,
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
