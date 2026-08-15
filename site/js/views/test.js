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
import { match as reagentMatch } from "../reagentmatch.js";

export async function render(route, ctx) {
  const go = ctx?.go || (() => {});
  const g = await data.testingGuide();
  if (!g) return empty("The testing guide could not load.", "Check your connection and try again.");

  SRC = sourceSink();          // fresh per render; see the note on sourceRow

  /* Both national bundles, fetched together. The reverse lookup needs the
     whole reagent table rather than one substance's row, and the substance
     list only to turn an id into a name a reader recognises. */
  const [REAGENT_TABLE, SUBS] = await Promise.all([
    data.reagentTable().catch(() => ({})),
    data.substances().catch(() => ({ substances: [] })),
  ]);
  const wrap = h("div");

  wrap.appendChild(h("h1", null, "Test your supply"));

  wrap.appendChild(
    /* One chip per top-level section, in page order. It had accumulated one
       per SUB-section too, which after grouping meant eleven chips, "Reagents"
       listed twice, and entries pointing inside collapsed parents. */
    jumpNav([
      { id: "sec-strips", label: "Test strips" },
      { id: "sec-prevalence", label: "What's out there" },
      { id: "sec-compare", label: "Which one to get" },
      { id: "grp-reagents", label: "Reagents" },
      { id: "sec-whatisit", label: "What could this be?" },
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
      callout("warn", "Why one line means positive",
        h("p", null, fts.reading.explain),
        h("p", null, fts.reading.faintLine)),
      /* Each type, under the reading it shares. */
      g.strips.map((s) => stripCard(s, g)))
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
    group("grp-reagents", "Reagent testing",
      "What reagents do, what a set of colors adds up to, and how to run one safely.", [
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
      /* The charts run backwards. After "Reagents" and before "how to run
         one", because somebody reaching for this has already run them. */
      disclosure("sec-whatisit", "What could this be?", null,
        reverseLookup(reagentMatch, REAGENT_TABLE, SUBS, go))
    ),
      (
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
        callout("stop", "Before you open a bottle",
          h("p", null, g.safety.ppe),
          h("p", { class: "sec__note" },
            "These are strong acids. The warning belongs here rather than in a "
            + "section of its own, because this is the moment it applies.")),

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
    ],
    /* The preview names what is inside. "Handling them safely" is gone
       because that section is gone — it is inside "Running a test" now. */
    ["Reagents", "What could this be?", "Running a test"])
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
function reverseLookup(matchFn, table, subs, go) {
  const REAGENTS = ["Marquis", "Mecke", "Mandelin", "Froehde", "Liebermann",
                    "Simons", "Ehrlich", "Hofmann", "Zimmermann", "Scott"];
  /* "gray" arrived with the DanceSafe override for MDA on Simon's. The test
     that pairs this list against the data would have caught its absence: a
     color in the file the picker does not offer is unreachable, and every
     substance carrying it silently stops being findable. */
  const COLORS = ["yellow", "orange", "red", "pink", "purple", "blue",
                  "green", "brown", "gray", "black"];
  const MAX = REAGENTS.length;

  /* SAME SHAPE AS THE COMBINATION CHECKER, deliberately.
   *
   * This started as ten fixed rows — every reagent on screen whether or not
   * anybody owned it — which is a wall, and which also implied you were
   * supposed to fill them all in. It is the same kind of tool as the drug
   * combination checker on the Drugs page: a short list of things you have,
   * added one at a time, answered underneath. So it is built the same way and
   * wears the same controls, down to the "+ Add another" button and the ×.
   *
   * Two reagents is the useful minimum and the default, because one narrows
   * almost nothing. */
  const slots = [];
  const rows = h("div", { class: "mixslots" });
  const out = h("div", { class: "revout", role: "status", "aria-live": "polite" });

  const nameOf = (id) =>
    (subs?.substances || []).find((x) => x.id === id)?.name || id;

  const addBtn = h("button", {
    type: "button", class: "btn btn--ghost btn--sm",
    onClick: () => { addSlot(); check(); },
  }, "+ Add another reagent");

  function addSlot() {
    if (slots.length >= MAX) return;
    const i = slots.length;
    /* Default each new row to a reagent not already chosen, so adding one
       never lands on a duplicate the reader then has to change. */
    const taken = new Set(slots.map((s) => s.reagent.value));
    const first = REAGENTS.find((r) => !taken.has(r)) || REAGENTS[0];

    const reagent = h("select", { class: "input", "aria-label": `Reagent ${i + 1}` },
      REAGENTS.map((r) => h("option", { value: r, selected: r === first || null }, r)));
    const result = h("select", { class: "input", "aria-label": `What reagent ${i + 1} did` },
      h("option", { value: "" }, "choose…"),
      h("option", { value: "none" }, "no reaction"),
      COLORS.map((c) => h("option", { value: c }, c)));
    reagent.addEventListener("change", check);
    result.addEventListener("change", check);

    const row = h("div", { class: "mixslot revslot" },
      h("span", { class: "pick__field" }, reagent),
      h("span", { class: "revslot__went" }, "went"),
      h("span", { class: "pick__field" }, result),
      i > 1
        ? h("button", {
            type: "button", class: "iconbtn mixslot__x",
            "aria-label": `Remove reagent ${i + 1}`,
            onClick: () => {
              const at = slots.findIndex((x) => x.reagent === reagent);
              if (at > -1) slots.splice(at, 1);
              row.remove();
              addBtn.disabled = slots.length >= MAX;
              check();
            },
          }, "×")
        : null);

    slots.push({ reagent, result });
    rows.appendChild(row);
    addBtn.disabled = slots.length >= MAX;
  }

  function check() {
    clear(out);
    /* Last one wins if the same reagent is picked twice — the alternative is
       an error message about a mistake the reader can simply correct. */
    const state = {};
    for (const { reagent, result } of slots) {
      if (result.value) state[reagent.value] = result.value;
    }

    const { consistent, ruledOut, used } = matchFn(state, table);
    if (!used) {
      out.appendChild(h("p", { class: "sec__note" },
        "Say what each one did. Two reagents narrow it far more than one."));
      return;
    }
    if (!consistent.length) {
      out.appendChild(empty("Nothing published matches that combination.",
        "That is a gap in what has been tested, not proof you have something new. "
        + "Reagent age and light both change a color, so it is also worth "
        + "checking whether one of the readings could go the other way."));
    } else {
      out.appendChild(h("p", { class: "sec__note" },
        `${consistent.length} substance${consistent.length === 1 ? "" : "s"} `
        + `consistent with ${used} reading${used === 1 ? "" : "s"}, best first.`));
      out.appendChild(h("div", { class: "list" },
        consistent.slice(0, 12).map((m) =>
          h("button", { type: "button", class: "revhit",
                        onClick: () => go(`#/substances/${m.id}`) },
            h("span", { class: "revhit__name" }, nameOf(m.id)),
            h("span", { class: "revhit__meta" },
              `${m.agrees} of ${used} match`
              + (m.unknown ? ` · ${m.unknown} not published` : ""))))));
    }
    if (ruledOut.length) {
      out.appendChild(
        h("details", { class: "acc" },
          h("summary", null,
            h("span", null, `${ruledOut.length} that do not match what is published`)),
          h("div", { class: "acc__body" },
            h("p", { class: "sec__note" },
              "Kept here rather than hidden, and deliberately not called ruled "
              + "out. One misread color should not delete the right answer, "
              + "reagent age changes what you see, and sources genuinely "
              + "disagree about faint reactions — DanceSafe records a light "
              + "pink Marquis for cocaine where the reference behind this page "
              + "records none at all. A faint reaction is exactly the kind one "
              + "chart calls a color and another calls nothing."),
            h("div", { class: "list" }, ruledOut.slice(0, 10).map((m) => {
              const bad = m.detail.find((d) => d.verdict === "disagrees");
              const doc = bad?.documented;
              const was = doc?.none && doc?.colors?.length
                ? `no reaction or ${doc.colors.join(" or ")}`
                : doc?.none ? "no reaction" : (doc?.colors || []).join(" or ");
              return h("div", { class: "revmiss" },
                h("strong", null, nameOf(m.id)),
                h("span", { class: "sec__note" },
                  ` — you saw ${bad.observed} on ${bad.reagent}; published is ${was}`));
            })))));
    }
  }

  addSlot();
  addSlot();
  check();

  return frag(
    h("p", { class: "sec__note" },
      "Ran a few reagents and want to know what they add up to? Say what each "
      + "one did. Colors are the plain ones on purpose — a spot plate under a "
      + "kitchen light is not a laboratory."),
    callout("stop", "This cannot rule out fentanyl",
      h("p", null,
        "A dose that kills is far below what any reagent shows, so no color "
        + "here and no combination of them says a sample is free of it. A "
        + "reagent also reads whatever reacts STRONGEST — a mixture shows one "
        + "color and hides the rest, and most street samples are mixtures. "
        + "What this gives you is what the result is consistent with.")),
    rows,
    h("div", { class: "mixadd" }, addBtn),
    out);
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

    callout("info", "If a stimulant tests positive",
      h("ul", null, d.guidance.slice(-1).map((x) => h("li", null, x)))),

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
    brands.intro ? h("p", { class: "sec__note" }, brands.intro) : null,
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
