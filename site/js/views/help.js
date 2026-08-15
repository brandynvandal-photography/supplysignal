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

  wrap.appendChild(h("h1", null, "Emergency"));
  { const n = englishOnlyNotice(); if (n) wrap.appendChild(n); }


  wrap.appendChild(
    /* Instruction only. This used to spend four of its six lines on Good
       Samaritan caveats and close by telling the reader to go read a collapsed
       law section "before you decide what that means for you" - i.e. to pause
       the 911 decision. The nuance is real and still lives in "911 and the
       law", one tap away in the jump nav. It does not belong inside the
       instruction. */
    /* The same opener every other tab uses, in the urgent color. It was a
       filled "stop" callout, which is right for a warning interrupting a page
       but wrong for the thing a page opens with - this tab IS the emergency,
       so the panel was shouting the same volume as its own contents and
       nothing stood out. The red left rule and wash keep the signal; the shape
       matches Alerts, Support, Test and About. */
    h("div", { class: "intro intro--urgent" },
      h("h2", null, "If someone is overdosing right now"),
      h("p", null, "Call 911. Give naloxone if you have it. Stay with them."),
      h("p", null,
        "You do not have to say what they took — only that someone is not breathing."),
      /* The most important action on the site was prose. The nearest tel: link
         sat below the fold, in a list. Two taps now: SOS, then this.
         The cost is real - a full-width red button raises the odds of an
         accidental dial. An accidental 911 call is recoverable. A missed one
         is not. */
      h("a", { class: "callbtn", href: "tel:911" }, "Call 911"))
  );

  /* The jump nav renders AFTER the emergency opener, not before it.
     Seven chips wrap to ~200px at 375px, which pushed the Call 911 button
     below the fold on the one screen somebody opens without reading. Every
     other page keeps h1 -> jumpNav -> blurb; this page is the exception
     because its first block is an action, not an introduction. */
  wrap.appendChild(
    jumpNav([
      { id: "sec-lines", label: "Hotlines" },
      { id: "sec-response", label: "Overdose response" },
      { id: "sec-collapse", label: "Collapsed, cause unknown" },
      { id: "sec-festival", label: "At a festival" },
      { id: "sec-club", label: "At a club or bar" },
      { id: "sec-ems", label: "When help arrives" },
      { id: "sec-law", label: "911 and the law" },
      { id: "sec-police", label: "If police come" },
    ])
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

  /* The red tab covered exactly one emergency. There was no route from here to
     the heat page or the stimulant page, and heat's own copy carries a "call
     911 when they stop making sense" callout this tab never led to. Somebody
     whose friend is burning up and confused taps SOS, reads six naloxone
     steps, and leaves. Below the numbers, above the overdose steps - the
     numbers stay first. */
  wrap.appendChild(
    h("a", { class: "bigptr", href: "#/heat", "data-reveal": "sec-spot" },
      h("span", { class: "bigptr__hd" }, "If they are burning up, or confused"),
      h("span", { class: "bigptr__sub" },
        "Overheating and drinking too much water both end in the same place — "
        + "somebody who stops making sense. How to tell, and how to cool them "
        + "down with what is in the room.")));

  wrap.appendChild(
    h("a", { class: "bigptr", href: "#/stimulants", "data-reveal": "sec-helping" },
      h("span", { class: "bigptr__hd" }, "If they are panicking, or seeing things"),
      h("span", { class: "bigptr__sub" },
        "Too much of a stimulant, or days without sleep. What actually helps, "
        + "and the point where it stops being psychological and becomes "
        + "medical.")));

  /* ---- opioid overdose response, immediately after the numbers ----
     Moved above "Collapsed, cause unknown" and the festival block. The
     differential reads first if you do not know WHAT you are looking at,
     which was the old order's argument - but the overwhelmingly common
     case for this app is somebody who already knows, and making them
     scroll past two other scenarios to reach the steps is the wrong
     default for a page that opens on hotlines for exactly that reason. */
  wrap.appendChild(
    disclosure("sec-response", "Responding to an opioid overdose",
      { open: true, tone: "urgent" },
      h("ol", { class: "steps" }, STEPS.map(step)),
      callout("warn", "Naloxone does not reverse xylazine, benzodiazepines, or stimulants",
        h("p", null,
          "Xylazine (“tranq”) is not an opioid, so naloxone will not lift its sedation. " +
          "Give naloxone anyway — it reverses the fentanyl, and that is what stops " +
          "breathing. Judge it by their breathing, not whether they wake up: if " +
          "breathing improves, it worked even if they stay drowsy."),
        /* Regional prevalence used to sit here, inside the always-open overdose
           response section. Nobody doing rescue breathing needs epidemiology; it
           diluted the one instruction that matters. It lives on the xylazine
           page, properly sourced. */))
  );

  /* ---- collapsed, cause unknown ----

     This page already checks breathing before responsiveness, for
     medetomidine: alpha-2 sedatives can leave somebody impossible to wake with
     their breathing intact. The differential below arrives at the same rule
     from the other direction. Ketamine is the case that breaks the standard
     "really high versus overdosing" model, because a deep k-hole is
     unresponsive BY DEFINITION - the emergency-medicine definition of the
     dissociative state is a person whose eyes may be open and who does not
     respond, with breathing and airway reflexes preserved. So responsiveness
     cannot separate "will come out of this" from "is dying". Breathing can.
     That is the whole section; everything else is downstream of it. */
  wrap.appendChild(
    h("div", { id: "sec-collapse" },
      section("If they have collapsed and you do not know why", null,
        h("p", { class: "leadin" },
          "You will often not know what happened, and you do not need to. "
          + "One check decides what you do."),

        h("div", { class: "card" },
          h("h3", null, "Watch their breathing, not whether they answer you"),
          h("p", null,
            "Whether somebody responds is the usual test, and it fails on "
            + "ketamine: a deep k-hole means a person whose eyes may be open, "
            + "who does not react to anything, and whose breathing is "
            + "completely normal. That is the drug working, not an emergency. "
            + "Sedatives now mixed into the opioid supply do the same thing "
            + "from the other side. Breathing is the one sign that separates "
            + "somebody who will come out of this from somebody who will not.")),

        h("div", { class: "statgrid" },
          h("div", { class: "card statcard" },
            h("p", { class: "stat__n" }, "Not breathing, or gasping"),
            h("p", null,
              "Slow deep gasps that sound like snoring are not breathing — they "
              + "happen in about half of cardiac arrests and are the most "
              + "common reason one gets missed. In as many as 4 in 10 arrests "
              + "the caller was never talked through CPR because they said the "
              + "person was breathing. Start CPR. Do not put them on their "
              + "side.")),
          h("div", { class: "card statcard" },
            h("p", { class: "stat__n" }, "Slow, shallow, or going blue"),
            h("p", null,
              "Four to six breaths a minute is the classic opioid picture; "
              + "under about seven is the line harm reduction uses. Blue or "
              + "gray lips and fingertips, ashen or gray skin on darker "
              + "skin tones. On their side, naloxone, ambulance.")),
          h("div", { class: "card statcard" },
            h("p", { class: "stat__n" }, "Breathing normally"),
            h("p", null,
              "This is the group that holds a k-hole, a faint, the minutes "
              + "after a seizure, GHB, heat, too much water, a knock on the "
              + "head, low blood sugar. On their side, stay, and keep watching "
              + "the chest. It can change."))),

        h("div", { class: "card" },
          h("h3", null, "What you genuinely cannot tell apart"),
          h("p", null,
            "These pairs are not separable without a hospital, and the safe "
            + "move is the same either way."),
          h("ul", null,
            h("li", null,
              h("strong", null, "GHB and an opioid overdose. "),
              "Identical in the first ten minutes — deep unresponsiveness, "
              + "snoring, slow breathing, vomiting. Treat it as an opioid."),
            h("li", null,
              h("strong", null, "A k-hole and a mixed-depressant overdose. "),
              "Both unresponsive, both possibly with the eyes open, and "
              + "ketamine is almost always taken with something else. "
              + "Breathing decides."),
            h("li", null,
              h("strong", null, "Heat stroke and a stimulant running too hot. "),
              "Often the same person. Do not try — hot and confused means cool "
              + "them, either way."),
            h("li", null,
              h("strong", null, "Heat stroke and too much water. "),
              "Both are confusion and collapse in a hot room. This is the one "
              + "pair where guessing wrong is dangerous, so do not give plain "
              + "water to either."),
            h("li", null,
              h("strong", null, "The minutes after a seizure and being high. "),
              "Afterwards people spit, drool, wipe their nose and talk "
              + "nonsense for five to thirty minutes. It looks exactly like "
              + "intoxication."),
            h("li", null,
              h("strong", null, "A hard fall and the drugs. "),
              "Of people who were intoxicated and seemed only mildly hurt, "
              + "about 8 in 100 had a bleed on the brain, and the standard "
              + "screening rules missed a fifth to a third of them. If they "
              + "hit their head, that is an ambulance regardless."))),

        callout("info", "Right regardless of what caused it",
          h("ul", null,
            h("li", null, "On their side, unless they are gasping or hit their head."),
            h("li", null, "Never face-up if they might vomit — which is always."),
            h("li", null,
              "Nothing by mouth for anybody who is not fully awake. No water, "
              + "no food, no sugar, no more of anything."),
            h("li", null,
              "Do not hold them down, sit on them, or leave anybody face-down. "
              + "Fighting a restraint makes overheating worse."),
            h("li", null, "Do not leave, and do not let them sleep it off."),
            h("li", null, "Cool anybody who is hot and not making sense."))),

        h("div", { class: "card" },
          h("h3", null, "Naloxone when you are not sure"),
          h("p", null,
            "Give it whenever the breathing is bad and you cannot rule opioids "
            + "out — including when you think it is GHB, ketamine or alcohol. "
            + "It does nothing at all to somebody with no opioids in them; the "
            + "label on the box says so."),
          h("p", { class: "sec__note" },
            "Breathing is the target, not waking up. Somebody who breathes but "
            + "stays under is naloxone working — do not keep dosing to chase "
            + "consciousness. And waking up is the middle of this, not the "
            + "end: naloxone wears off in thirty to forty-five minutes and "
            + "most opioids last longer.")))));

  /* ---- at a festival or a big event ----
     Placed directly under the 911 instruction because it CHANGES that
     instruction, and below it because it does not replace it.

     What is deliberately NOT here: the "arms crossed in an X above your head"
     signal and the phone-torch signal. Both circulate widely and neither is
     taught by any festival, promoter, event-medical provider or crowd-safety
     standard that could be found - the only source making the X claim is a
     security shop's blog with no citation. Worse, the X already means
     something else in exactly this setting: "X-ing up" is straight-edge and
     underage drink marking, and in lifeguarding the same gesture means a
     swimmer is missing and presumed submerged. A signal only works if the
     person receiving it was trained on it, and nobody trains festival security
     on this one. Somebody standing in a crowd making an X at nobody, while
     their friend deteriorates, is the failure mode. Do not add it back without
     a real source. */
  wrap.appendChild(
    h("div", { id: "sec-festival" },
      section("At a festival or a big event", null,
        h("div", { class: "card" },
          h("h3", null, "The nearest radio beats the nearest phone"),
          h("p", null,
            "On-site medics are already inside the perimeter, and aid stations "
            + "at a well-run event are sited so nobody is more than about a "
            + "five-minute walk away. Look for a medical tent, a medic, or any "
            + "staff member with a radio — vendors and ticket staff included. "
            + "They are supposed to know where the aid stations are."),
          h("p", { class: "sec__note" },
            "Send a specific person and tell them to come back. \"Somebody call "
            + "for help\" in a crowd is how nobody does.")),
        h("div", { class: "card" },
          h("h3", null, "Near the front, the barrier crew is already looking"),
          h("p", null,
            "The staff in the pit between the barrier and the stage are there "
            + "to spot people in trouble and lift them out, and the event "
            + "safety guidance says their platform exists so they can see over "
            + "the crowd to do it. If you are anywhere near the front, they are "
            + "the closest help there is and they are already facing you.")),
        h("div", { class: "card" },
          h("h3", null, "Do both — they are not alternatives"),
          h("p", null,
            "Get staff moving and call 911. Lollapalooza tells attendees to do "
            + "both. At a small event there may be no on-site medical at all, "
            + "and then 911 is the whole answer."),
          h("p", { class: "sec__note" },
            "Note where you are before you call — the nearest numbered pole, "
            + "stage, bar or vendor. It is the difference between help arriving "
            + "and help searching.")),
        h("div", { class: "card" },
          h("h3", null, "Tell the event's medics what they took"),
          h("p", null,
            "They can treat faster when they know, and on-site care is free at "
            + "most big events where an ambulance is not. Lollapalooza, "
            + "Insomniac's festivals and Okeechobee all publish in writing that "
            + "you will not get in trouble for seeking medical help."),
          h("p", { class: "sec__note" },
            "Read that as narrowly as it is written. Most large US festivals "
            + "publish nothing like it, and several publish the opposite — "
            + "Coachella and Burning Man both say in their own rules that you "
            + "can be removed or arrested. Even where the promise exists it is "
            + "the medical team's, and on the same page Insomniac says police "
            + "work inside its events and narcotics laws are enforced.")),
        h("div", { class: "card" },
          h("h3", null, "What the promise does and does not cover"),
          h("p", null,
            "Your state's Good Samaritan law can stop the police arresting you "
            + "for what they find because you asked for help. Nothing in it "
            + "stops the festival throwing you out — those laws are written "
            + "against the state, and a ticket is a revocable license."),
          h("p", { class: "sec__note" },
            "It is also scene-limited. At Ultra in 2025 a woman died after "
            + "being taken to a medical tent; the partner who carried her in "
            + "was charged a year later, on evidence from a separate "
            + "investigation. None of which is a reason not to go and get help "
            + "— it is a reason to know what the promise is worth.")),
        h("div", { class: "card" },
          h("h3", null, "The disclosure nobody warns you about"),
          h("p", null,
            "If you are on somebody else's insurance — a parent's plan covers "
            + "you until 26 — an ambulance ride and an emergency room visit "
            + "generate an explanation of benefits, and it is mailed to "
            + "whoever holds the policy. That is the most likely way a night "
            + "like this gets disclosed, and it has nothing to do with "
            + "police."),
          h("p", { class: "sec__note" },
            "Naloxone is allowed into many festivals now, but door staff do "
            + "not always recognize it. Keep it in the pharmacy packaging.")),
        h("div", { class: "card" },
          h("h3", null, "A 911 call is a different conversation"),
          h("p", null,
            "That amnesty is the event's, not the state's. On the phone, "
            + "describe what you can see — not breathing, not waking up — give "
            + "the location, and ask for medics. Naming a drug on that call is "
            + "what brings police."),
          h("p", { class: "sec__note" },
            "Medics carry naloxone whether or not you say the word. If you are "
            + "worried they will not, you can ask them to bring it — knowing "
            + "that asking may bring police too.")))));

  /* ---- a nightclub or a bar ----
     Not the festival section with the word changed. A festival has medics
     inside the perimeter and a barrier crew whose job is spotting people; a
     club has security, and security is not medical. The failure modes are
     different enough to need their own list, and the one that kills people is
     specific to the room: an overdose in a locked stall, found late. */
  wrap.appendChild(
    h("div", { id: "sec-club" },
      section("At a club or a bar", null,
        h("div", { class: "card" },
          h("h3", null, "Security is not a medic"),
          h("p", null,
            "There is no medical tent. Door and floor staff are trained to "
            + "remove a problem from the room, and somebody unconscious can be "
            + "walked outside and left on the pavement while everyone assumes "
            + "they are drunk. If staff are moving them, go with them and stay "
            + "with them — the street outside is where being alone starts."),
          h("p", { class: "sec__note" },
            "Call 911 yourself. Do not assume the venue has, and do not wait to "
            + "find out — a license is at stake for them and nothing is at "
            + "stake for you.")),
        h("div", { class: "card" },
          h("h3", null, "The bathroom is where this happens"),
          h("p", null,
            "A locked stall, alone, is the most common way an overdose in a "
            + "venue is found too late. If somebody went in and has been quiet "
            + "a while, knock, then get staff to open it. Feeling awkward about "
            + "being wrong costs nothing; being right and late costs everything."),
          h("p", { class: "sec__note" },
            "If you use in a venue bathroom, leave the latch off and tell "
            + "somebody to check on you at a specific time.")),
        h("div", { class: "card" },
          h("h3", null, "You cannot assess anyone on the floor"),
          h("p", null,
            "It is too loud to hear breathing and too dark to see color "
            + "changing. Get to a lit, quieter place if you can do it quickly. "
            + "But if they are not breathing, that is where you are — start "
            + "rescue breaths and give naloxone there. Moving somebody first "
            + "costs the minutes that matter.")),
        h("div", { class: "card" },
          h("h3", null, "Naloxone at the door"),
          h("p", null,
            "Search staff often do not recognize it and sometimes take it. "
            + "Keeping it in the pharmacy packaging helps, and so does saying "
            + "what it is before they find it. If it is confiscated, ask "
            + "whether the venue keeps its own — many now do, and the person "
            + "on the door may not be the person who knows.")))));


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
          "Paramedics are not police. Telling them is what gets the right treatment.")))
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
        h("h3", null, "What they usually do not cover"),
        h("ul", null,
          li("Selling, sharing, or “possession with intent”.", "In many states, splitting drugs with someone can be charged as distribution."),
          li("Existing warrants.", "You can still be arrested on a warrant that already existed."),
          li("Probation and parole violations.", "Only some states protect these. If you are under supervision, check your own state’s law."),
          li("Anything else found at the scene.", "Weapons, other offenses, or a drug-induced homicide charge in states that have one."),
          li("In some states, immunity is not what you get.", "Some laws only give you a defense to raise in court after being charged.")),
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
          "Keep doing what you are doing — rescue breaths, naloxone, staying with them.")),

      h("div", { class: "card" },
        h("h3", null, "What you can do"),
        h("ul", null,
          li("You do not have to answer questions.",
            "You can stay silent about what was taken, who brought it, or where it came from — that right holds even after an arrest. Saying nothing cannot be used against you the way an answer can."),
          li("Tell the medics, not the police.",
            "What was taken, how much, and when is medical information that changes treatment. That is a different conversation from an officer’s questions."),
          li("You can decline a search out loud.",
            "Say plainly: “I do not consent to a search.” They may search anyway — never physically resist — but saying it preserves the question for a court later. Staying silent is not the same as agreeing."),
          li("Ask whether you are free to go.",
            "If they say yes, you can leave calmly. If they say no, you are being detained; you can say you want a lawyer and stop talking."),
          li("Do not run, and do not destroy anything.",
            "Both create new charges that no Good Samaritan law covers, and running from the scene leaves the person you called for."),
          li("Write it down afterward.",
            "Badge numbers, patrol car numbers, the agency, what was said, and who else was there. Do it as soon as you are somewhere safe.")),

        h("h3", null, "If you are on probation or parole"),
        h("p", null,
          "Only some states protect supervision violations, and this is where the answers " +
          "are least uniform. Worth knowing before a night when you have to decide — " +
          "not during it."),

        callout("info", "Calling is still the right call",
          h("p", null,
            "The minutes before help arrives are minutes without oxygen, and that is " +
            "where the damage happens.")),

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
          li("Coming back after a break?", "Jail, hospital, detox, treatment, or just time away — tolerance falls fast, and the amount you used before the break is enough to stop your breathing after it. The first days back are the most dangerous. Use a fraction, go slow, and do not be alone."),
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
