/* Crisis resources, overdose response, and a plain account of what this site
 * does and does not know about the person reading it. */

import {
  h, frag, section, callout, extLink, disclosure, jumpNav, englishOnlyNotice,
} from "../ui.js";

const LINES = [
  { name: "Emergency", sub: "Overdose is a medical emergency", num: "911", tel: "911" },
  { name: "Never Use Alone", sub: "Someone stays on the line and sends help if you stop responding",
    num: "1-800-484-3731", tel: "18004843731" },
  { name: "Poison Control", sub: "Free, 24/7, confidential",
    num: "1-800-222-1222", tel: "18002221222" },
  { name: "SAMHSA National Helpline", sub: "Treatment and support referrals, 24/7, free",
    num: "1-800-662-4357", tel: "18006624357" },
  { name: "988 Suicide & Crisis Lifeline", sub: "Call or text 988", num: "988", tel: "988" },
];

/* Two fields, and the split is the whole point.
 *
 * `body` is what to DO, in as few words as it can be said. `note` is the fact
 * that stops a mistake - why to give naloxone when you are not sure, why two
 * minutes of nothing is not failure, why you do not leave afterwards.
 *
 * Someone reading this is doing it one-handed next to a person who is not
 * breathing. Prose makes them hunt for the verb. Nothing was cut to shorten
 * these: every number, caveat and reason from the longer version is still
 * here, moved to the line beneath the instruction instead of buried inside a
 * paragraph with it. */
const STEPS = [
  /* Breathing is checked FIRST, before responsiveness. This is the 2025
     protocol change from Philadelphia DPH / PA DOH (HAN #794, verbatim: "the
     first step should be to check for breathing"), driven by medetomidine:
     alpha-2 sedatives now common in the supply can leave someone impossible
     to wake while their breathing is fine - and someone breathing badly needs
     naloxone no matter what they respond to. Responsiveness alone now
     misleads in both directions, so the chest is the signal, here and in
     step 5. The old order (wake-check first) survived here for months after
     the adulterant pages taught the new one - the contradiction was found by
     review, not by luck. */
  {
    title: "Check their breathing, then try to wake them",
    body: "Look at their chest. Breathing slow, stopped, or sounding like snoring or gurgling? " +
          "Act — go to the next step. Then shout their name and rub your knuckles hard on their breastbone.",
    note: "Breathing comes first: sedatives now mixed into the supply (xylazine, medetomidine) " +
          "can make someone impossible to wake even when breathing is fine. Bad breathing OR " +
          "no response — either one — treat it as an overdose.",
  },
  {
    title: "Call 911",
    body: "Say they are not breathing, or will not wake up.",
    /* PA's medetomidine protocol orders naloxone before the call; CDC's
       classic steps call first. Both are one sentence here rather than a
       silently picked winner: with naloxone already in hand, seconds of
       spray beat seconds of hold music. */
    note: "You do not have to say what they took. Naloxone already in your hand and you’re " +
          "alone? Give it first, then call. Two people — one calls while one doses.",
  },
  {
    title: "Give naloxone",
    body: "Nozzle into one nostril. Press the plunger all the way.",
    note: "Give it even if you are unsure. It only works on opioids, and it cannot harm " +
          "someone who has not taken any. No pulse? Start CPR first.",
  },
  {
    title: "Help them breathe",
    /* The nose pinch is not optional - without it the breath escapes and does
       nothing. It was missing here while the xylazine page taught it correctly
       from CDC guidance, so the main steps were the incomplete version. */
    body: "Tilt the head back, lift the chin, pinch their nose shut. One breath every 5 seconds.",
    note: "Lack of oxygen is what causes the damage.",
  },
  {
    title: "Breathing hasn’t improved in 2–3 minutes? Give another dose",
    body: "Nasal naloxone takes 2–3 minutes. Judge by their chest, not their eyes.",
    note: "One or two standard doses reverse most overdoses, fentanyl included — fentanyl is " +
          "not resistant to naloxone. Someone can keep sleeping after it has already worked; " +
          "that is the sedative, not a failed dose, and not a reason to keep dosing.",
  },
  {
    title: "Stay, and roll them on their side",
    body: "The recovery position stops them choking if they vomit.",
    note: "Naloxone wears off in 30–90 minutes and most opioids last longer, so they can " +
          "go under again. A full return is uncommon — it is still why you do not leave.",
  },
];

export async function render() {
  const wrap = h("div");

  wrap.appendChild(h("h1", null, "Get help"));
  { const n = englishOnlyNotice(); if (n) wrap.appendChild(n); }

  wrap.appendChild(
    jumpNav([
      { id: "sec-lines", label: "Hotlines" },
      { id: "sec-response", label: "Overdose response" },
      { id: "sec-ems", label: "When help arrives" },
      { id: "sec-law", label: "911 and the law" },
      { id: "sec-police", label: "If police come" },
    ])
  );

  wrap.appendChild(
    /* Instruction only. This used to spend four of its six lines on Good
       Samaritan caveats and close by telling the reader to go read a collapsed
       law section "before you decide what that means for you" - i.e. to pause
       the 911 decision. The nuance is real and still lives in "911 and the
       law", one tap away in the jump nav. It does not belong inside the
       instruction. */
    /* The same opener every other tab uses, in the urgent colour. It was a
       filled "stop" callout, which is right for a warning interrupting a page
       but wrong for the thing a page opens with - this tab IS the emergency,
       so the panel was shouting the same volume as its own contents and
       nothing stood out. The red left rule and wash keep the signal; the shape
       matches Alerts, Support, Test and About. */
    h("div", { class: "intro intro--urgent" },
      h("h2", null, "If someone is overdosing right now"),
      h("p", null, "Call 911. Give naloxone if you have it. Stay with them."),
      h("p", null,
        "You do not have to say what they took — only that someone is not breathing."))
  );


  /* ---- hotlines. Open: nobody should have to expand anything to find a
         number during an emergency. ---- */
  wrap.appendChild(
    disclosure("sec-lines", "Numbers that answer 24/7", { open: true, tone: "urgent" },
      h("div", { class: "hotline" },
        LINES.map((l) =>
          h("a", { href: `tel:${l.tel}` },
            h("span", null,
              h("span", { class: "lbl" }, l.name),
              h("span", { class: "sub" }, l.sub)),
            h("span", { class: "num" }, l.num)))))
  );

  /* ---- overdose response. Also open, for the same reason. ---- */
  wrap.appendChild(
    disclosure("sec-response", "Responding to an opioid overdose",
      { open: true, tone: "urgent" },
      h("ol", { class: "steps" }, STEPS.map(step)),
      callout("warn", "Naloxone does not reverse xylazine, benzodiazepines, or stimulants",
        h("p", null,
          "Xylazine (“tranq”) is not an opioid, so naloxone will not lift its sedation. " +
          "Give naloxone anyway — it reverses the fentanyl, and that is what stops " +
          "breathing. Watch their breathing rather than whether they wake up: if " +
          "breathing improves, the naloxone did its job even if they stay drowsy."),
        /* Regional prevalence used to sit here, inside the always-open overdose
           response section. Nobody doing rescue breathing needs epidemiology; it
           diluted the one instruction that matters. It lives on the xylazine
           page, properly sourced. */))
  );

  /* ---- what to tell EMS once they arrive ----
     Complements the Good Samaritan framing rather than contradicting it: "you
     do not have to say what they took" is about the 911 CALL, where the
     dispatcher needs breathing status, not a confession. Once medics are in
     the room, what they know changes what they do - and telling a paramedic
     is not the same disclosure as telling a dispatcher on a recorded line. */
  wrap.appendChild(
    disclosure("sec-ems", "When help arrives", null,
      h("div", { class: "card" },
        h("p", null,
          "On the call, what matters is that someone is not breathing and where you " +
          "are. Once paramedics arrive, anything you can tell them helps them treat:"),
        h("ul", null,
          li("What was taken, if you know.", "Even a guess — “sold as oxy”, “tranq dope” — changes what they watch for."),
          li("How much, and when.", "Roughly is fine."),
          li("What else was taken.", "Alcohol, benzos, and anything prescribed."),
          li("Medical conditions, if you know them.", "Heart problems, diabetes, seizures, pregnancy."),
          li("What you already did.", "How many naloxone doses, when, and whether breathing changed.")),
        h("p", { class: "sec__note" },
          "Paramedics are not police, and treating them as safe to talk to is how " +
          "the person on the floor gets the right treatment.")))
  );

  /* ---- Good Samaritan ----
     Over-reassurance here is its own harm: someone under supervision who is
     told they are "protected", and is then violated for it, is worse off than
     someone who knew the limits going in. State the gaps plainly, then say
     call anyway. */
  wrap.appendChild(
    disclosure("sec-law", "Calling 911 and the law", null,
      h("div", { class: "card" },
        h("p", null,
          "All 50 states and DC have an overdose Good Samaritan law — Wyoming was " +
          "the last, in March 2025. They generally protect someone who calls in good " +
          "faith, stays, and cooperates from charges for simple drug possession and " +
          "paraphernalia."),
        h("h3", null, "What they usually do NOT cover"),
        h("ul", null,
          li("Selling, sharing, or “possession with intent”.", "In many states, splitting drugs with someone can be charged as distribution."),
          li("Existing warrants.", "A Good Samaritan law does not stop an arrest on a warrant that already existed."),
          li("Probation and parole violations.", "Only some states protect these. If you are under supervision, this is the detail that matters most, and you should check your own state."),
          li("Anything else found at the scene.", "Weapons, other offences, or a drug-induced homicide charge in states that have one."),
          li("In some states, immunity is not what you get.", "Some laws only give you a defense to raise in court after being charged, which is not the same as not being charged.")),
        callout("info", "None of this is a reason not to call",
          h("p", null,
            "It is a reason to know the specifics where you live. Someone dies from an " +
            "overdose that nobody called about far more often than someone is prosecuted " +
            "for calling.")),
        h("p", { class: "sec__note" }, "This is information, not legal advice.")))
  );

  /* ---- police at the scene ----
     The Good Samaritan section answers "will I be charged". This answers the
     thing that actually happens in the room: officers arrive, and someone who
     is frightened has to decide what to say while a person is on the floor.
     Two rules govern how this is written.
     First, nothing here may compete with the emergency. Every item is
     something you can do WHILE care continues; none of it involves refusing
     entry, delaying medics, or moving anything.
     Second, no tactics, no scripts for getting rid of evidence, no advice
     that could be read as obstruction - that is a separate crime, it can be
     charged even where the Good Samaritan law would have protected you, and
     it is the fastest way to turn a survivable night into a case. */
  wrap.appendChild(
    disclosure("sec-police", "If police come while you are helping", null,
      callout("warn", "Care first. None of this is worth pausing for",
        h("p", null,
          "Keep doing what you are doing — rescue breaths, naloxone, staying with them. " +
          "Everything below is something you can do without stopping.")),

      h("div", { class: "card" },
        h("h3", null, "What you can do"),
        h("ul", null,
          li("You do not have to answer questions.",
            "You can stay silent about what was taken, who brought it, or where it came from — that right holds even after an arrest. Saying nothing cannot be used against you the way an answer can."),
          li("Tell the medics, not the police.",
            "What was taken, how much, and when is medical information that changes treatment. Paramedics need it. That is a different conversation from an officer’s questions."),
          li("You can decline a search out loud.",
            "Say plainly: “I do not consent to a search.” They may search anyway — never physically resist — but saying it preserves the question for a court later. Staying silent is not the same as agreeing."),
          li("Ask whether you are free to go.",
            "If they say yes, you can leave calmly. If they say no, you are being detained; you can say you want a lawyer and stop talking."),
          li("Do not run, and do not destroy anything.",
            "Both create new charges that no Good Samaritan law covers, and running from the scene leaves the person you called for."),
          li("Write it down afterward.",
            "Badge numbers, patrol car numbers, the agency, what was said, and who else was there. Do it as soon as you are somewhere safe, while it is fresh.")),

        h("h3", null, "If you are on probation or parole"),
        h("p", null,
          "This is the situation where the details of your state matter most, and where " +
          "the answers are least uniform. Only some states protect supervision violations. " +
          "Worth knowing before a night when you have to decide — not during it."),

        callout("info", "Calling is still the right call",
          h("p", null,
            "Knowing how to handle the encounter is not a reason to hesitate at the " +
            "start of one. Help arriving late is what kills people.")),

        h("div", { class: "sources" },
          extLink("https://www.aclu.org/know-your-rights/stopped-by-police",
            "ACLU — Know Your Rights: Stopped by Police"),
          extLink("https://harmreduction.org/issues/overdose-prevention/",
            "National Harm Reduction Coalition — Overdose prevention")),

        h("p", { class: "sec__note" },
          "This is information, not legal advice, and rights differ by state and " +
          "situation. A local legal aid office or public defender can tell you how " +
          "this works where you live.")))
  );

  /* Naloxone SOURCING lives on Learn; this is the one pointer to it.
     It sits at the END of the page, after every crisis section, because it is
     preparation rather than emergency - it was interrupting the run from
     overdose response to what-to-tell-EMS, which is the sequence somebody
     actually reads mid-crisis. Last is where a "next time, before it happens"
     thought belongs. */
  /* .bigptr, the same cross-page pointer Support and Learn use. These were
     underlined text links in a note-sized box, so they sat narrower than every
     disclosure above them and read as footnotes rather than as the two doors
     they are. The arrow is supplied by the class - it was being typed into the
     string, which is why it survived the previous restyle. */
  /* Straight to the naloxone section, not the top of Learn. Landing on the
     page and making somebody scan for it is the difference between a pointer
     and a signpost pointing at a building. */
  wrap.appendChild(
    h("a", { class: "bigptr", href: "#/learn", "data-reveal": "sec-naloxone" },
      h("span", { class: "bigptr__hd" }, "No naloxone yet?"),
      h("span", { class: "bigptr__sub" },
        "Where to get it free, and how to use it — worth doing before the night "
        + "you need it."))
  );

  /* Same reasoning as the naloxone pointer, and the same position: this is a
     morning-after thought, and it must never sit above the overdose steps.
     Someone reading this page while a body is failing needs the steps, not a
     link about next week. */
  wrap.appendChild(
    h("a", { class: "bigptr", href: "#/after" },
      h("span", { class: "bigptr__hd" }, "It’s over and they’re breathing"),
      h("span", { class: "bigptr__sub" },
        "What happens next — for them, and for you, because being the person "
        + "in the room costs something too."))
  );

  const support = supportBlock();
  if (support) wrap.appendChild(support);

  return wrap;
}

/* Supporting the project.
 *
 * DELIBERATELY UNCONFIGURED. Fill in DONATE below with a fiscal sponsor and
 * this renders; leave it empty and nothing appears. It is empty rather than
 * pointed at a real charity because linking one would assert an affiliation
 * that does not exist yet.
 *
 * Why a sponsor and not a payment button on this domain:
 *
 *   1. A card statement is a permanent, discoverable record tying a real name
 *      to a drug app. That is the same threat Quick Exit exists for - the
 *      person who checks the phone also sees the statement. A neutral
 *      descriptor from a health nonprofit is a safety feature, not branding.
 *      Whatever sponsor is chosen, CHECK THE STATEMENT DESCRIPTOR FIRST.
 *   2. Any embedded widget - Stripe, PayPal, Ko-fi - is a third-party request
 *      from a page about drug supply. The CSP forbids it and so does PRIVACY.md.
 *      This is a plain outbound link, never an embed, never an iframe.
 *   3. Recurring giving needs a stored identity and a subscription record,
 *      which this app will not hold. Monthly belongs on the sponsor's side.
 *
 * Tone rules: it appears once, at the bottom of Help, never as a modal, never
 * after N visits, never on a screen someone reached in an emergency. No
 * confirmshaming, no "help us keep this free".
 *
 * One more constraint worth remembering: Health Canada's data terms permit
 * NON-COMMERCIAL reproduction only. Donations to a free app keep it
 * non-commercial; a paid tier would forfeit that feed. See build-emerging.mjs.
 */
const DONATE = {
  url: "",            // sponsor's donation page, https, on their domain
  org: "",            // the name that will appear on a bank statement
};

function supportBlock() {
  if (!DONATE.url || !DONATE.org) return null;

  return disclosure("sec-support-project", "Supporting this project", null,
    h("div", { class: "card" },
      h("p", null,
        "Nightlight is free and always will be. Donations are handled by ",
        h("strong", null, DONATE.org), ", not by this site."),
      h("p", null,
        "Worth knowing before you click: this site cannot see whether you donate, " +
        "but they will see your name and payment details, and a line will appear on " +
        "your statement. It will read as ", h("strong", null, DONATE.org),
        " — not as anything about drugs. If that record would be a problem for you, " +
        "please don’t. Nothing here changes either way."),
      h("div", { class: "sources" }, extLink(DONATE.url, `Donate via ${DONATE.org}`))));
}

/* Text only.
 *
 * These steps carried hand-drawn figures until 2026-08-10, when they were
 * removed at the user's request. The originals are in .attic/od-illustrations
 * rather than deleted, along with a note on what the removal cost: the brief
 * argued a picture of the recovery position is understood faster than a
 * paragraph by someone impaired, frightened, or not reading English easily.
 * The wording below now carries that load by itself, which is why it is
 * written as an instruction first and a reason second. */
const step = (s) =>
  h("li", null,
    h("h4", null, s.title),
    h("p", { class: "step__do" }, s.body),
    s.note ? h("p", { class: "step__why" }, s.note) : null);
const li = (strong, rest) => h("li", null, h("strong", null, strong), " ", rest);

/* These three lived on the Emergency tab until 2026-08-10. Safer-use practice,
   the privacy account, and "what this site is" are preparation and reference -
   none of them is what someone needs mid-crisis, and every block on that tab
   dilutes the ones that are. Support renders them; the builders stay here so
   the copy has one home. */
export function saferUseBlock() {
  /* ---- using more safely ---- */
  return (
    disclosure("sec-safer", "If you are going to use", null,
      h("div", { class: "card" },
        // This framing used to sit in the section caption. The captions are
        // gone, and it was the only place this was said, so it moves into the
        // body rather than being lost.
        h("p", null, "None of this makes drug use safe. It lowers the odds of dying."),
        h("ul", null,
          li("Don’t use alone.", "If no one can be there, call Never Use Alone (1-800-484-3731) or use an app that will send help if you stop responding."),
          li("Start with much less than usual.", "Potency varies wildly between batches and even within one batch. A tolerance from last month does not apply to a new supply."),
          li("Coming back after a break?", "Jail, hospital, detox, treatment, or just time away — tolerance falls fast, and the amount you used before the break can kill you after it. The first days back are the most dangerous. Use a fraction, go slow, and do not be alone."),
          li("Go slow, and wait.", "Take a small amount and wait to feel it before taking more."),
          li("Keep naloxone within reach.", "Not in another room, and make sure whoever is with you knows where it is and how to use it."),
          li("Be careful mixing.", "Opioids with benzodiazepines or alcohol is especially dangerous, because all three slow breathing and the effects stack — naloxone reverses the opioid and does nothing for the rest. The combination found most often in overdose deaths today is actually fentanyl with a stimulant, which mostly reflects how many people use both."),
          li("Test what you have.", "See the Test section — it will not make anything safe, but it can tell you something you did not know."))))
  );

}

export function privacyBlock() {
  /* ---- privacy ---- */
  return (
    disclosure("sec-privacy", "What this site knows about you", null,
      h("div", { class: "card" },
        h("p", null,
          "Nothing that identifies you, and nothing about what you looked at."),
        h("ul", null,
          li("Your searches never leave your device.", "Every county, drug, and alert is already downloaded with the page, so choosing one makes no new request. The server cannot see which county or drug you picked."),
          li("No third parties.", "No analytics, no fonts, no maps, no trackers. This page contacts nothing but the server it came from."),
          li("Your location stays on your device.", "“Near me” matches your coordinates to a county in your browser. No location service is contacted."),
          /* This copy has been wrong twice, both times by lagging behind the
             code: it once claimed only a light/dark preference was kept, after
             seen.js had begun writing a timestamp. On the one page that
             promises a plain account of what the app knows, an inaccurate
             inventory is the worst possible copy. Re-read it against
             app.js/seen.js/i18n.js after touching any of them. */
          li("Nothing outlives the session.", "No account, no cookies, no record of what you searched or which counties you opened. Your light/dark choice and your language are held only until you close the tab, and the offline copy is deleted when you leave. Nothing is left on this device for next time.")),

        h("h3", null, "Quick exit"),
        h("p", null,
          "The ✕ button in the header clears everything immediately, removes this " +
          "page from your Back button, and sends you to a weather site. It is a " +
          "shortcut, not a requirement — closing the tab clears the same things on " +
          "its own, and so does simply leaving."),

        callout("warn", "What quick exit cannot do",
          h("p", null,
            "It cannot erase pages already written into your browser’s history before " +
            "you pressed it, and it cannot clear your browser’s cache. If someone else " +
            "may check this device, open this site in a private or incognito window — " +
            "that leaves no history entry at all."))))
  );

  }

export function aboutBlock() {
return (
    disclosure("sec-about", "What this site is", null,
      h("div", { class: "card" },
        h("p", null,
          "Nightlight collects what public sources — health departments, local news, " +
          "and drug-checking labs — have already published about drug supply in each " +
          "county, and puts it in one place."),
        h("p", null,
          h("strong", null, "It is not medical advice, and it is not a safety check. "),
          "Nothing here verifies a drug, clears it, or says it is safe to take. " +
          "An absence of alerts means nobody published anything — not that a supply is clean.")))
  );

}
