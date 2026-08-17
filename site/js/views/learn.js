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

import { h, frag, section, callout, extLink, disclosure, jumpNav, jumpTo } from "../ui.js";
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

  wrap.appendChild(
    jumpNav([
      { id: "sec-start", label: "Start here" },
      { id: "sec-practice", label: "Practice" },
      /* Points at the disclosure, not the section wrapper, because jumpNav
         OPENS a details on the way - landing on a collapsed section would
         look like the chip did nothing. Label matches the section heading. */
      { id: "sec-sitting", label: "Being the calm person" },
      ...e.groups.map((g) => ({ id: `sec-${g.id}`, label: g.title })),
      /* Only when the bundle actually loaded - a chip pointing at a section
         that is not on the page is worse than no chip. */
      ...(consent ? [{ id: "sec-consent", label: "Consent" },
                     { id: "sec-repair", label: "After you hurt someone" }] : []),
      { id: "sec-before", label: "Long nights and hot days" },
      { id: "sec-stimulants", label: "Staying up" },
      { id: "sec-sex", label: "Sexual health" },
      { id: "sec-heat", label: "Heat and water" },
      { id: "sec-policy", label: "The law" },
    ])
  );

  wrap.appendChild(startHere(e));

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
  wrap.appendChild(section("Free courses", null,

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
  ));

  /* After the courses, before "teach someone else". Someone who opened Learn
     to find a naloxone class should not be met by a section about hurting
     people; someone who came looking for this will use the jump chip. */
  if (consent) wrap.appendChild(consent);

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

  /* ITS OWN appendChild, and that is the fix rather than a style preference.
     This block was the SECOND argument to the call above, and appendChild takes
     one node — every argument after the first is dropped without an error. So
     whenever the beforeTheNight bundle loaded, it took the first slot and this
     entire section never rendered. Not a broken chip: a missing section, live,
     found by the chip test noticing its target did not exist. */
  wrap.appendChild(
    h("div", { id: "sec-stimulants" },
      section("Staying up, and coming down", null,
        h("a", { class: "bigptr", href: "#/stimulants" },
          h("span", { class: "bigptr__hd" }, "Staying up, and coming down"),
          h("span", { class: "bigptr__sub" },
            "Sleep loss alone will bring on psychosis-like states eventually — "
            + "the documented timeline, what it looks like, how to help, and why "
            + "sleep is the treatment.")))));

  wrap.appendChild(
    h("div", { id: "sec-sex" },
      section("Sexual health", null,
        h("a", { class: "bigptr", href: "#/sex" },
          h("span", { class: "bigptr__hd" }, "Sexual health"),
          h("span", { class: "bigptr__sub" },
            "Barriers, PrEP and PEP, emergency contraception, the mixes that put "
            + "people in the hospital, and why drink test strips mostly do not "
            + "work.")))));

  /* Heat sits on Learn as well as on Staying up, because the people it kills
     are not all at a party. Somebody in a heat wave with nowhere cool to go
     needs the same five minutes of reading and would never open a page about
     stimulants to find it. */
  wrap.appendChild(
    h("div", { id: "sec-heat" },
      section("Heat, and water", null,
        h("p", { class: "sec__note" },
          "More people die of overheating at events than of anything else."),
        h("a", { class: "bigptr", href: "#/heat" },
          h("span", { class: "bigptr__hd" }, "Heat, and water"),
          h("span", { class: "bigptr__sub" },
            "How to tell when hot has become dangerous, how to cool somebody down "
            + "with what is in the room, and why too much plain water swells "
            + "the brain of somebody who thought they were being careful.")))));

  /* Policy sits at the foot of Learn rather than in the tab bar. The bar is
     already six wide at 375px and a seventh would truncate them all - and
     someone arriving in a hurry needs Alerts and SOS, not legislation.

     It gets its own heading rather than being appended after consent. Bare,
     it sat flush under the repair block and read as a continuation of it -
     as though the law were the next thing to know about hurting someone.
     They are unrelated subjects and the page should not imply otherwise. */
  wrap.appendChild(
    h("div", { id: "sec-policy" },
      section("The law, and having a say in it", null,
        h("a", { class: "bigptr", href: "#/policy" },
          h("span", { class: "bigptr__hd" }, "Drug policy and how to weigh in"),
          h("span", { class: "bigptr__sub" },
            "What a Good Samaritan law actually protects you from and what it does not, "
            + "where test strips are legal, who funds this, and how to reach the people "
            + "who decide it.")))));

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
    h("p", { class: "sec__note" },
      `Links checked ${e.lastVerified}. Courses and prices change; the organizations are stable.`)
  );

  void go; void route;
  return wrap;
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
        h("span", { class: "nbr__sub nbr__sub--wrap" }, sub)),
      h("span", { class: "nbr__right" }, h("span", { "aria-hidden": "true" }, "›")));

  const away = (href, reveal, n, title, sub) =>
    h("a", { class: "nbr", href, ...(reveal ? { "data-reveal": reveal } : {}) },
      h("span", { class: "nbr__step", "aria-hidden": "true" }, String(n)),
      h("span", { class: "nbr__text" },
        h("span", { class: "nbr__name" }, title),
        h("span", { class: "nbr__sub nbr__sub--wrap" }, sub)),
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
      away("#/help", "sec-response", 1,
        "Respond to an opioid overdose",
        "The order matters and it changed recently — rescue breaths, naloxone, "
        + "911, recovery position."),

      away("#/help", "sec-collapse", 2,
        "When you do not know what it is",
        "Somebody is down and nobody can say what they took. What to do when "
        + "the answer has to work either way."),

      here("sec-practice", 3,
        "Practice both, now",
        "Two short exercises with nothing riding on them. Reading how to do "
        + "something and being able to do it at 3am are different."),

      hasNaloxone
        ? here("sec-naloxone", 4,
            "Get naloxone, free",
            "Courses that mail you a kit at the end, and where to get it "
            + "without one. It does nothing to somebody who has no opioids in "
            + "them, which is why it is safe to carry and safe to give.")
        : null,

      away("#/test", null, hasNaloxone ? 5 : 4,
        "What a test can and cannot tell you",
        "Strips and reagents both answer narrower questions than people expect. "
        + "Worth knowing before you rely on one.")));
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

      h("p", { class: "sec__note" }, `Links checked ${s.lastVerified}.`)));
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

  if (c.lastVerified) {
    blocks.push(h("p", { class: "sec__note" }, `Checked ${c.lastVerified}.`));
  }

  return section(c.headline, c.blurb, ...blocks);
}
