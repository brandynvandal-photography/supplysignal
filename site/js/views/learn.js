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

import { h, frag, section, callout, extLink, disclosure, jumpNav } from "../ui.js";
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
      { id: "sec-stimulants", label: "Staying up" },
      { id: "sec-sex", label: "Sex and being out" },
      { id: "sec-policy", label: "The law" },
    ])
  );

  wrap.appendChild(
    h("p", { class: "sec__note" },
      "Things worth knowing before the night you need them — a few minutes of " +
      "practice, how to sit with someone having a hard time, free courses, and " +
      "how to handle consent and repair when substances are in the room.")
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
            "The exercises above are for you. This is for somebody else — what to " +
            "do when a person near you is frightened, overwhelmed, or having a bad " +
            "time on something, and nobody is quite sure whether it is an emergency."),
          sitting)
      );
    }
  }

  /* The courses had no heading of their own, so three top-level disclosures
     floated between "Being the calm person" and the next section and read as
     belonging to it. A heading restores the page's rhythm - every other block
     here opens on one - and gives e.intro somewhere it is actually true. */
  wrap.appendChild(section("Free courses", null,
    h("p", { class: "sec__note" }, e.intro),

    /* Does training gate naloxone? Answered up front, because the honest
       answer is "no, but" - and someone who believes they need a certificate
       to help may hesitate at the worst possible moment. */
    callout("info", e.why.title,
      h("p", null, e.why.body),
      h("p", { class: "sec__note" }, e.why.note)),

    frag(e.groups.map((g) =>
      disclosure(`sec-${g.id}`, g.title, { open: g.id === "naloxone" },
        h("p", { class: "sec__note" }, g.blurb),
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
    h("div", { id: "sec-stimulants" },
      section("Staying up, and losing the thread", null,
        h("p", { class: "sec__note" },
          "What days without sleep do on their own, what stimulant psychosis "
          + "looks like, and how to help somebody in it."),
        h("a", { class: "bigptr", href: "#/stimulants" },
          h("span", { class: "bigptr__hd" }, "Staying up, and losing the thread"),
          h("span", { class: "bigptr__sub" },
            "Sleep loss alone will do this eventually — the timeline is "
            + "documented, and sleep is the treatment.")))));

  wrap.appendChild(
    h("div", { id: "sec-sex" },
      section("Sex, and being out", null,
        h("p", { class: "sec__note" },
          "Barriers, PrEP and PEP, emergency contraception, and the mixes that "
          + "actually put people in the hospital."),
        h("a", { class: "bigptr", href: "#/sex" },
          h("span", { class: "bigptr__hd" }, "Sex, and being out"),
          h("span", { class: "bigptr__sub" },
            "Including an honest answer about drink test strips, which mostly "
            + "do not work.")))));

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
        h("p", { class: "sec__note" },
          "What the rules actually are where you are, who writes them, and how "
          + "people change them."),
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
          "you, or lives with you. Training one other person doubles the chance that " +
          "somebody in the room knows what to do — and it is the one preparation that " +
          "works even when you are the one who cannot act.")))
  );

  wrap.appendChild(
    h("p", { class: "sec__note" },
      `Links checked ${e.lastVerified}. Courses and prices change; the organizations are stable.`)
  );

  void go; void route;
  return wrap;
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
      h("p", { class: "sec__note" }, s.intro),

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
        s.intro ? h("p", { class: "sec__note" }, s.intro) : null,
        /* The hard line first, before any nuance about gray areas. */
        s.callout
          ? callout("stop", s.callout.title, h("p", null, s.callout.body),
              s.callout.detail ? h("p", null, s.callout.detail) : null)
          : null,
        s.items ? frag(s.items.map(row)) : null,
        s.after
          ? frag(h("h3", null, s.after.title),
                 ...(s.after.body || []).map((p) => h("p", null, p)))
          : null,
        src(s.sources))
    );
  }

  if (c.repair) {
    const r = c.repair;
    blocks.push(
      disclosure("sec-repair", r.title, { open: false },
        r.intro ? h("p", { class: "sec__note" }, r.intro) : null,

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
