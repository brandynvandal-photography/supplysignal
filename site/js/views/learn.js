/* Learn — training, not reading.
 *
 * The rest of this app tells people things. This page points at the places
 * that will actually teach them to do something: reverse an overdose, do CPR,
 * handle a wound.
 *
 * It exists as its own page because it answers a different question from
 * everything else. Emergency says what to do right now. Test says how to check
 * a substance. This says how to be someone who already knows, before the night
 * it matters.
 *
 * The naloxone group leads, and inside it End Overdose leads, because their
 * course ends with a free naloxone kit - training and supply in one step is
 * the shortest path from "I should learn this" to "there is naloxone in my
 * bag", and every extra step in that chain loses people.
 */

import { h, frag, section, callout, extLink, disclosure, jumpNav, jumpTo, checkedLine} from "../ui.js";
import * as data from "../data.js";
import { practiceBlock } from "../practice.js";

export async function render(route, { go }) {
  /* Started together, awaited later - see the note in views/substances.js.
     This page renders practice, then sitting, then the course list, and each
     block used to be the first thing that asked for its own data. */
  [data.practice(), data.sitting(), data.consent()].forEach((p) => p.catch(() => {}));

  const e = await data.education();
  const wrap = h("div");

  wrap.appendChild(h("h1", null, "Learn"));

  if (!e) {
    wrap.appendChild(
      h("div", { class: "empty" },
        h("h3", null, "The training list didn’t load with this copy of the app."),
        h("p", null, "Try reloading."))
    );
    return wrap;
  }

  const consent = await consentBlock();
  const harm = await harmBlock();
  const myths = await mythsBlock();

  /* SEVEN CHIPS, not eighteen. The strip had grown a chip per section and per
     course group and per pointer, which on a phone was three rows of chips
     before a word of content. The four cross-page pointers (Staying up,
     Sexual health, Heat, The law) are one "More guides" list now rather than
     four sections with four chips, and the course groups no longer each get
     their own. What is left is the seven top-level places on this page, in the
     order they appear. Consent and repair stay conditional on their bundle -
     a chip pointing at a section that did not render is worse than no chip. */
  wrap.appendChild(
    jumpNav([
      { id: "sec-start", label: "Start here" },
      { id: "sec-practice", label: "Practice" },
      /* Points at the disclosure, not the section wrapper, because jumpNav
         OPENS a details on the way - landing on a collapsed section would
         look like the chip did nothing. Label matches the section heading. */
      { id: "sec-sitting", label: "Being the calm person" },
      { id: "sec-courses", label: "Free courses" },
      ...(myths ? [{ id: "sec-myths", label: "Myths" }] : []),
      ...(consent ? [{ id: "sec-consent", label: "Consent" },
                     { id: "sec-repair", label: "After you hurt someone" }] : []),
      ...(e.beforeTheNight ? [{ id: "sec-before", label: "Long nights" }] : []),
    ])
  );

  wrap.appendChild(startHere(e));

  /* MORE GUIDES, one list where four pointer sections used to stand.
   *
   * Staying up, Sexual health, Heat and water and The law were each a section
   * with a single .bigptr to another page — four headings, four chips, four
   * screenfuls, for four links. They are rows in one list now, joined by After
   * an overdose and If you are being tested (which were only reachable from
   * deeper pages). Each keeps the one-line description that told a reader what
   * is on the far side, so nothing that was said is lost — it is only denser.
   * Plain cross-page links: tapping one opens Learn's target tab at its top,
   * which is the same behaviour the .bigptr pointers had. */
  wrap.appendChild(
    h("div", { id: "sec-guides" },
      section("More guides", null,
        h("div", { class: "list" },
          moreGuide("#/stimulants", "Staying up and coming down",
            "Sleep loss alone will bring on psychosis-like states eventually — "
            + "the timeline, what it looks like, and why sleep is the treatment."),
          moreGuide("#/sex", "Sexual health",
            "Barriers, PrEP and PEP, emergency contraception, the mixes that put "
            + "people in the hospital, and why drink test strips mostly do not work."),
          moreGuide("#/heat", "Heat and water",
            "When hot has become dangerous, how to cool somebody down with what "
            + "is in the room, and why too much plain water swells the brain."),
          moreGuide("#/policy", "The law and having a say in it",
            "What a Good Samaritan law protects you from and what it does not, "
            + "where test strips are legal, who funds this, and how to weigh in."),
          moreGuide("#/after", "After an overdose",
            "What happens next for whoever it happened to, whoever was in the "
            + "room, and support the usual help is not built for."),
          moreGuide("#/supervision", "If you are being tested",
            "What a positive screen actually is, how to contest one, and what "
            + "they cannot make you stop taking."))))
  );

  /* Practice first. It is free, instant, needs no signup and no shipping
     address - and someone who tries it and finds they did not know the answer
     has a reason to take the course underneath it. */
  wrap.appendChild(h("div", { id: "sec-practice" }, await practiceBlock()));

  /* Sitting gets its own section header rather than sitting flush against
     Practice, where it read as a third practice exercise. It is not one: the
     exercises are a thing you try on yourself, and this is a thing you do to
     somebody else in the room, with a hard boundary at the top about when to
     stop doing it and call an ambulance instead. Different act, different
     stakes, so it gets a heading and a line saying which is which. */
  /* Heading and intro only if the block itself loaded. They used to render
     unconditionally around the await, so a reader offline or with a missing
     bundle got "Being the calm person" and a paragraph promising help, over an
     empty span. A visibly empty section is worse than an absent one. */
  {
    const sitting = await sittingBlock();
    if (sitting) {
      wrap.appendChild(
        section("Being the calm person", null,
          h("p", { class: "sec__note" },
            "What to do when a person near you is frightened, overwhelmed, or " +
            "having a bad time on something, and nobody is quite sure whether it " +
            "is an emergency."),
          sitting)
      );
    }
  }

  /* The courses had no heading of their own, so three top-level disclosures
     floated between "Being the calm person" and the next section and read as
     belonging to it. A heading restores the page's rhythm - every other block
     here opens on one - and gives e.intro somewhere it is actually true. */
  /* Wrapped so the "Free courses" jump chip has an id to land on - section()
     renders the heading but no id, and the chip needs one. */
  wrap.appendChild(h("div", { id: "sec-courses" },
    section("Free courses", null,

    /* Does training gate naloxone? Answered up front, because the honest
       answer is "no, but" - and someone who believes they need a certificate
       to help may hesitate at the worst possible moment. */
    callout("info", e.why.title,
      h("p", null, e.why.body),
      h("p", { class: "sec__note" }, e.why.note)),

    frag(e.groups.map((g) =>
      disclosure(`sec-${g.id}`, g.title, { open: g.id === "naloxone" },
        frag(g.items.map((it) =>
          h("div", { class: "card" },
            h("h3", null, it.name),
            h("p", { class: "card__meta" },
              it.cost, it.time ? ` · ${it.time}` : null),
            h("p", null, it.what),
            h("div", { class: "sources" }, extLink(it.url, "Open"))))))))
  )));

  /* After the courses, before "teach someone else". Someone who opened Learn
     to find a naloxone class should not be met by a section about hurting
     people; someone who came looking for this will use the jump chip. */
  /* After the courses and before Consent, matching the chip order above.
     views.test.mjs checks the two agree: a chip that jumps BACKWARDS reads as
     a broken link even though it works. */
  if (myths) wrap.appendChild(myths);

  if (consent) wrap.appendChild(consent);
  /* Directly after consent and repair, because it continues them: repair
     covers the first five minutes after you hurt someone; this is what comes
     after that, and the two other seats - being hurt, and being the person
     they told. */
  if (harm) wrap.appendChild(harm);

  wrap.appendChild(
    /* Moved off the Sex page, where it sat under a heading about being out and
       directly above a pointer to the long version on Heat. It is
       before-the-night knowledge, which is what this page is for. */
    ...(e.beforeTheNight ? [h("div", { id: "sec-before" },
      section(e.beforeTheNight.headline, null,
        frag(e.beforeTheNight.items.map((x) =>
          h("div", { class: "card" },
            h("h3", null, x.t),
            h("p", null, x.d),
            x.note ? h("p", { class: "sec__note" }, x.note) : null,
            x.sources ? h("div", { class: "sources" },
              x.sources.map((z) => extLink(z.url, z.name))) : null)))))] : []));

  /* The four cross-page pointer sections that used to sit here — Staying up,
     Sexual health, Heat and water, The law — are the "More guides" list near
     the top of the page now. One dense list of destinations reads better than
     four full-width bigptr sections a reader scrolls through, and every line
     they carried is preserved there. */

  wrap.appendChild(
    /* In a card, not bare. Every other paragraph on this page sits on a
       surface, and unwrapped prose here read as a caption to the block above
       it rather than as its own point. */
    section("Teach someone else", null,
      h("div", { class: "card" },
        h("p", null,
          "The person most likely to be there when you overdose is someone who uses with " +
          "you, or lives with you. Training them is the one preparation that works even " +
          "when you are the one who cannot act.")))
  );

  wrap.appendChild(
    checkedLine("Links checked", e.lastVerified,
      "Courses and prices change; the organizations are stable.")
  );

  void go; void route;
  return wrap;
}

/* MYTHS, AND THE SOURCE THAT SAYS OTHERWISE.
 *
 * The rest of this app corrects things in passing, wherever the subject comes
 * up - a reagent cannot find fentanyl, naloxone is worth giving even with
 * xylazine in it, waking up angry is documented. Somebody who has been TOLD
 * one of these has no way to go looking for the correction, because they do
 * not know which page it lives on. This is that index.
 *
 * The shape is deliberately flat and repetitive: the belief as people say it,
 * then one or two sentences, then the source. No preamble and no argument -
 * a reader who already believes the claim is not going to read three
 * paragraphs to find out they are wrong, and the citation is what does the
 * work here rather than the prose.
 *
 * EVERY ITEM CARRIES A SOURCE and test/myths.test.mjs fails the build if one
 * does not. An uncited debunk is a competing assertion, which on this page is
 * worth less than nothing.
 *
 * Renders nothing at all if the dataset is missing, like every other
 * conditional block on this page. */
async function mythsBlock() {
  const m = await data.myths();
  if (!m?.groups?.length) return null;

  return h("div", { id: "sec-myths" },
    section("Myths", null,
      h("p", { class: "sec__note" }, m.intro),
      ...m.groups.map((g) =>
        disclosure(g.id, g.title, null,
          h("div", { class: "card" },
            g.items.map((it) =>
              h("div", { class: "mythrow" },
                h("h4", null, it.myth),
                h("p", null, it.truth),
                it.sources?.length
                  ? h("div", { class: "sources" },
                      it.sources.map((x) => extLink(x.url, x.name)))
                  : null))))),
      checkedLine("Checked", m.lastVerified)));
}

/* One row in the "More guides" list: a cross-page link with its one-line
   description kept. The app's native list row (.nbr), the same shape the
   startHere steps and the substance index use, so it reads as a tappable name
   like everything else. A plain link — tapping opens the target tab at its
   top, which is what the .bigptr pointers it replaced did. */
function moreGuide(href, title, sub) {
  return h("a", { class: "nbr", href },
    h("span", { class: "nbr__text" },
      h("span", { class: "nbr__name" }, title),
      h("span", { class: "nbr__sub nbr__sub--wrap" }, sub)),
    h("span", { class: "nbr__right" }, h("span", { "aria-hidden": "true" }, "›")));
}

/* "Start here" — a first-run walkthrough that is not a first run.
 *
 * WHY IT IS NOT A MODAL, AND WHY IT NEVER WILL BE.
 *
 * Detecting a first-time reader takes a durable flag on the device, and this
 * app writes none: sessionStorage only, for theme and locale, and app.js calls
 * localStorage.clear() at boot AND in Quick Exit. A "seen the tour" flag is
 * exactly the trace Quick Exit exists to erase. Without one, a first-run
 * overlay would fire on EVERY launch — a gate between somebody and the SOS tab,
 * every time, in an app whose first session might be the emergency.
 *
 * So it is a section on a page, in reading order, that a reader chooses. It
 * costs a hurrying reader one screen of scroll and nothing else, and it holds
 * no state at all.
 *
 * It also adds no content. Every step points at something already written; the
 * value here is only the ORDER, which is otherwise left for the reader to infer
 * from a page of parallel sections. Ordered by what is most likely to matter at
 * 3am, not by what is easiest: respond to an overdose, practise it, get the
 * drug that reverses it, then testing.
 *
 * Each row carries data-jump even when it navigates off-page, so
 * test/views.test.mjs proves the on-page targets exist. The off-page ones use
 * href + data-reveal, the same mechanism .bigptr uses, and are checked by
 * test/routes.test.mjs instead. */
function startHere(e) {
  /* An on-page step opens its section and lands on the heading, using the same
     function the jump chips use — see jumpTo() in ui.js. An off-page step is a
     real link, so it keeps middle-click and "open in new tab". */
  const here = (id, n, title, sub) =>
    h("button", { type: "button", class: "nbr", "data-jump": id,
                  onClick: () => jumpTo(id) },
      h("span", { class: "nbr__step", "aria-hidden": "true" }, String(n)),
      h("span", { class: "nbr__text" },
        h("span", { class: "nbr__name" }, title),
        /* Only when there is one. An empty span still occupies a row in the
           flex column and pushed the title off centre against the step
           number. */
        sub ? h("span", { class: "nbr__sub nbr__sub--wrap" }, sub) : null),
      h("span", { class: "nbr__right" }, h("span", { "aria-hidden": "true" }, "›")));

  const away = (href, reveal, n, title, sub) =>
    h("a", { class: "nbr", href, ...(reveal ? { "data-reveal": reveal } : {}) },
      h("span", { class: "nbr__step", "aria-hidden": "true" }, String(n)),
      h("span", { class: "nbr__text" },
        h("span", { class: "nbr__name" }, title),
        sub ? h("span", { class: "nbr__sub nbr__sub--wrap" }, sub) : null),
      h("span", { class: "nbr__right" }, h("span", { "aria-hidden": "true" }, "›")));

  /* Only if the naloxone group actually rendered. A step pointing at a section
     the education bundle did not supply is a dead row. */
  const hasNaloxone = (e.groups || []).some((g) => g.id === "naloxone");

  return h("div", { id: "sec-start" },
    section("Start here", null,
      /* sec-response and sec-collapse, checked against what Emergency actually
         RENDERS. The first draft pointed step 1 at sec-spot, which help.js
         mentions — as the target of its link to the HEAT page. Grepping a view
         for ids finds the ones it links away to as readily as the ones it
         renders, and a data-reveal at a missing id fails the way every dead
         target in this app fails: silently, landing the reader at the top of
         the page as though the row were just a plain link. */
      away("#/help", "sec-response", 1, "Respond to an opioid overdose", null),

      away("#/help", "sec-collapse", 2, "When you do not know what it is", null),

      here("sec-practice", 3, "Practice your response", null),

      hasNaloxone
        ? here("sec-naloxone", 4, "Get free naloxone", null)
        : null,

      /* Lands on "What testing can and cannot tell you", whose id is sec-limits
         now that the Test page opens on the tools and moved that section down
         under "Before you buy". Without the reveal the reader arrives at the
         top of Test and has to go find it. */
      away("#/test", "sec-limits", hasNaloxone ? 5 : 4,
        "What a test can and cannot tell you", null)));
}

/* Sitting with someone having a hard time.
 *
 * Lives on Learn rather than Emergency for the same reason the naloxone
 * sourcing does: it is a skill you want BEFORE the night you need it, and
 * Emergency must stay only what you read while a body is failing.
 *
 * The boundary between the two is the most dangerous thing on this page and
 * so it renders FIRST, as a stop callout, before a single word of technique.
 * Sitting calmly with somebody who actually needs an ambulance is exactly how
 * a survivable night becomes a death, and someone arriving here is by
 * definition already inclined to handle it themselves. */
async function sittingBlock() {
  const s = await data.sitting();
  if (!s) return h("span");

  const row = (x) => h("div", { class: "lovedrow" },
    h("h4", null, x.t), h("p", null, x.b));

  return h("details", { class: "disc", id: "sec-sitting" },
    h("summary", null, h("h2", null, s.headline)),
    h("div", { class: "disc__body" },

      /* Before anything else. */
      /* A list, not a sentence. This was six conditions chained by five
         semicolons into one 59-word paragraph - and the file's own note calls
         it the most important thing in it. Prose makes a frightened reader
         hunt for the verb; a list lets them scan for the one that matches.
         Guarded so an older bundle without `signs` still renders. */
      callout("stop", s.notThis.title,
        h("p", null, s.notThis.body),
        s.notThis.signs?.length
          ? h("ul", null, s.notThis.signs.map((t) => h("li", null, t)))
          : null,
        h("p", null, s.notThis.detail)),

      h("h3", null, s.principles.title),
      h("p", { class: "sec__note" }, s.principles.credit),
      frag(s.principles.items.map((p) =>
        h("div", { class: "card" },
          h("h4", null, p.name),
          h("p", null, p.what)))),
      h("div", { class: "sources" },
        s.principles.sources.map((x) => extLink(x.url, x.name))),

      h("h3", null, s.doing.title),
      frag(s.doing.items.map(row)),

      h("h3", null, s.dont.title),
      frag(s.dont.items.map(row)),

      h("h3", null, s.overamping.title),
      h("div", { class: "card" },
        h("p", null, s.overamping.body),
        h("p", null, h("strong", null, s.overamping.warn))),

      h("h3", null, "Lines you can hand them"),
      h("div", { class: "hotline" },
        s.lines.map((l) =>
          h("a", { href: `tel:${l.tel}` },
            h("span", null,
              h("span", { class: "lbl" }, l.name),
              h("span", { class: "sub" }, l.what)),
            h("span", { class: "num" }, l.num)))),

      h("h3", null, s.after.title),
      h("p", null, s.after.body),

      checkedLine("Links checked", s.lastVerified)));
}

/* Consent, and repairing harm you caused.
 *
 * This is the hardest register on the site to get right, and the failure mode
 * is not inaccuracy - it is sounding like a lecture. Someone who has hurt
 * another person already knows. A page that arrives to tell them they are bad
 * gets closed, and then nothing changes, which serves nobody least of all the
 * person they hurt.
 *
 * So the rules here are narrower than usual:
 *
 *   - NO MORALISING. Nothing implies that using drugs makes a person dangerous
 *     to others. The overwhelming majority of people who use drugs never harm
 *     anyone, and implying otherwise is both false and the oldest slur aimed
 *     at this audience.
 *   - HARM IS DESCRIBED CONCRETELY. "Respect people" teaches nothing. What
 *     teaches is naming the specific acts - dosing someone without telling
 *     them, pushing past a no, treating a very intoxicated person as
 *     available.
 *   - ACCOUNTABILITY WITHOUT SELF-DESTRUCTION. Shame reliably produces
 *     defensiveness and hiding rather than changed behaviour, so a page that
 *     induces it works against its own purpose. The aim is a person who can
 *     stay in the room long enough to actually repair something.
 *   - THE HARMED PERSON'S NEEDS COME FIRST, including when what they need is
 *     for the person who hurt them to stay away. An apology delivered for the
 *     apologiser's relief is another thing done TO someone.
 *
 * Renders only the parts present in the bundle, so it can ship in pieces
 * rather than waiting for all of it to be verified.
 */
async function consentBlock() {
  const c = await data.consent();
  if (!c) return null;

  const row = (x) => h("div", { class: "lovedrow" },
    h("h4", null, x.t), h("p", null, x.b));

  const src = (list) => (list?.length
    ? h("div", { class: "sources" }, list.map((x) => extLink(x.url, x.name)))
    : null);

  const blocks = [];

  if (c.consent) {
    const s = c.consent;
    blocks.push(
      disclosure("sec-consent", s.title, { open: false },
        /* The hard line first, before any nuance about gray areas. */
        s.callout
          ? callout("stop", s.callout.title, h("p", null, s.callout.body),
              s.callout.detail ? h("p", null, s.callout.detail) : null)
          : null,
        s.items ? frag(s.items.map(row)) : null,
        /* .rowbreak: the consent rows separate from EACH OTHER with a
           hairline, and then this block began with none - so "If you think
           somebody was drugged" ran straight on from the row above it as
           though it were the next item in the same list, which it is not. */
        s.after
          ? h("div", { class: "rowbreak" },
              h("h3", null, s.after.title),
              ...(s.after.body || []).map((p) => h("p", null, p)))
          : null,
        src(s.sources))
    );
  }

  if (c.repair) {
    const r = c.repair;
    blocks.push(
      disclosure("sec-repair", r.title, { open: false },

        /* DanceSafe's guidance leads, and Mingus's framework follows as the
           map. Two reasons, both from checking the sources: theirs is written
           for exactly this setting and does not moralise, and Mingus's essay
           explicitly excludes serious harm from its scope - which in a
           drug-using context is precisely the case someone may be here for.
           The scripts are quoted because a person who has just hurt somebody
           usually cannot compose a sentence. */
        r.first
          ? h("div", { class: "card" },
              h("h3", null, r.first.title),
              h("p", null, r.first.body),
              h("ul", null, (r.first.scripts || []).map((x) => h("li", null, x))),
              r.first.note ? h("p", null, r.first.note) : null)
          : null,

        /* Credited in the body, not just in a source row. This framework is
           somebody's work and the attribution is part of the content. */
        r.framework
          ? frag(
              h("h3", null, r.framework.title),
              r.framework.credit
                ? h("p", { class: "sec__note" }, r.framework.credit)
                : null,
              frag((r.framework.parts || []).map((p) =>
                h("div", { class: "card" },
                  h("h4", null, p.name),
                  h("p", null, p.what)))))
          : null,

        r.apology
          ? frag(
              h("h3", null, r.apology.title),
              r.apology.helps
                ? h("div", { class: "card" },
                    h("h4", null, "What helps"),
                    h("ul", null, r.apology.helps.map((x) => h("li", null, x))))
                : null,
              r.apology.hurts
                ? h("div", { class: "card" },
                    h("h4", null, "What makes it worse"),
                    h("ul", null, r.apology.hurts.map((x) => h("li", null, x))))
                : null)
          : null,

        /* The caution that an apology can itself be a second harm. It sits
           after the how-to on purpose: someone has to know what repair looks
           like before they can understand why doing it at the wrong moment
           lands as pressure. */
        r.caution
          ? callout("warn", r.caution.title,
              h("p", null, r.caution.body),
              r.caution.detail ? h("p", null, r.caution.detail) : null)
          : null,

        r.shame
          ? frag(h("h3", null, r.shame.title),
                 ...(r.shame.body || []).map((p) => h("p", null, p)))
          : null,

        src(r.sources))
    );
  }

  if (!blocks.length) return null;

  if (c.lastVerified) blocks.push(checkedLine("Checked", c.lastVerified));

  return section(c.headline, c.blurb, ...blocks);
}

/* HARM BETWEEN PEOPLE, from three seats.
 *
 * data/harm.json holds five sections that were researched, drafted and
 * refuted as a unit: every item's text was written only from claims a
 * researcher had read at source, and a second agent re-fetched each cited
 * source and REMOVED anything it did not support. What a reader might want
 * that no source covered was left out, and each section's notThis says so.
 * The house rule applies with extra force here: do not edit prose in that
 * file without re-reading the cited source.
 *
 * Rendered as five disclosures, all shut, in the order somebody is likely to
 * need them: the accountability piece continues "After you hurt someone"
 * directly above it; abuse comes next because it is the largest audience;
 * then the three seats of a public allegation - accused, disclosing, and the
 * friend or crew who was told - grouped under one heading so the app is
 * visibly not taking a side. Everything uses consent's own idiom (.card,
 * callout, .sources) so it reads as one section, not an annex. */
async function harmBlock() {
  const d = await data.harm();
  if (!d) return null;

  const src = (list) => (list?.length
    ? h("div", { class: "sources" }, list.map((x) => extLink(x.url, x.name)))
    : null);
  const item = (it) => h("div", { class: "card" },
    h("h4", null, it.t), h("p", null, it.d), src(it.sources));
  const body = (sec) => frag(
    sec.intro ? h("p", null, sec.intro) : null,
    sec.callout
      ? callout(sec.calloutKind || "warn", sec.callout.title, h("p", null, sec.callout.body))
      : null,
    ...(sec.groups || []).map((g) => frag(
      h("h3", null, g.title),
      ...(g.items || []).map(item))),
    /* The stated absence, closing every section: what the sources did not
       cover is named rather than left for a reader to discover as a gap. */
    sec.notThis
      ? callout("info", sec.notThis.title, h("p", null, sec.notThis.body))
      : null,
    src(sec.sources));

  const blocks = [];
  if (d.accountability) blocks.push(disclosure("sec-accountable", d.accountability.title, { open: false }, body(d.accountability)));
  if (d.abuse)          blocks.push(disclosure("sec-abuse", d.abuse.title, { open: false }, body(d.abuse)));

  /* One heading, three seats. The h3 sits outside the disclosures so the
     grouping is visible while they are shut. */
  const seats = [
    ["sec-named", d.accused], ["sec-told", d.disclosing], ["sec-bystander", d.bystander],
  ].filter(([, sec]) => sec);
  if (seats.length) {
    blocks.push(h("h3", { class: "sec__note mixsupp" }, "When someone is named"));
    for (const [id, sec] of seats) blocks.push(disclosure(id, sec.title, { open: false }, body(sec)));
  }

  if (d.lastVerified) blocks.push(checkedLine("Checked", d.lastVerified));
  if (!blocks.length) return null;
  return section("Harm between people", null, ...blocks);
}
