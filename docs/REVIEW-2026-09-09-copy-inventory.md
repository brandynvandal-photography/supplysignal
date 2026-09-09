# Copy inventory — `site/js/views/*.js` — 2026-09-09

Appendix to `REVIEW-2026-09-09.md`. A line-by-line read of the fifteen view
files, the five supporting modules (`ui.js`, `app.js`, `kindness.js`,
`practice.js`, `search.js`), the locale the Emergency and Alerts screens
render through `t()`, and the two storage modules the privacy copy makes
claims about. Produced by a reading pass; the items the main review relies on
were re-verified at the cited lines, the rest is spot-checked.

## 0. How to read this

**Classes used in the inventory**

- **EDITORIAL** — app-authored; fair game. Rated *good* / *needs work* / *rewrite*.
- **CITED** — quoted or attributed to a source (a quoted policy, an FDA label, an attribution/license line, a hotline's own description). **Do not touch.**
- **DATA** — the paragraph is rendered from `data/*.json`. Those files are where the sourced clinical text lives; the slot is noted rather than rated.
- **LOCALE** — rendered from `data/i18n/en-US.json` via `t()`. Inventoried where a view renders it.
- **DEAD** — a string in the view that **never renders**. `ui.js:341-348 section(title, note, …)` does `void note`, and `ui.js:807-856 group(id, title, blurb, …)` never renders `blurb`. Every second argument to those two helpers is invisible copy. See §3.6.

Line numbers are the first line of the string. Quotes are verbatim; long ones are cut at ~200 chars with `…`.

---

## 1. Per-file inventory (with ratings inline)

### `views/about.js` (222 lines)

| Line | Class | Text | Rating / notes |
|---|---|---|---|
| 41 | EDITORIAL | "A free, open reference that collects what public sources have already published about the drug supply in each US county — and puts the harm reduction basics next to it." | good |
| 52 | EDITORIAL | "No account, no tracking, no ads, nothing to buy. While it is open it keeps working without signal, Emergency included. It clears its own cache every time it starts, on purpose, so a phone that is taken or shared does not carry a copy of what you looked at." | good. Accurate against `app.js:221-241`. Note "Emergency" — the tab the reader sees is labelled "SOS" (§3.1). |
| 76 | EDITORIAL | "Alerts: every three hours. An automated job reads health-department and local-news feeds. Most runs it finds nothing, which is normal." | good — but contradicts `en-US.json alerts.noScanBody` "Once the hourly job runs" (§3.1). |
| 78 | EDITORIAL | "Overdose data: monthly. CDC provisional counts, which lag reality by several months and are revised." | good |
| 80 | EDITORIAL | "Substance reference: weekly. Doses, durations, interactions and reagent reactions are rebuilt from their upstream sources." | good. The reader-facing name of that tab is "Drugs"; "Substance reference" is an internal name. |
| 82 | EDITORIAL | "Hand-checked directories: manually, and dated. Programs and phone numbers are verified by a person. An automated check flags dead links nightly, but a link that still loads can still be out of date." | good |
| 85 | EDITORIAL | "Every published item carries its own date. If something looks stale, it probably is — reporting on a local drug supply is patchy everywhere in the country." | good |
| 97 | EDITORIAL | "Please say so. A wrong number, a closed program, a claim that does not match what you see locally." | **needs work** — vague call to action: "say so" to whom? This section has no address or link; the only `mailto:` is in the footer/banner (`app.js:854-861`). Fix: append "Email hello@nightlight.help, or use the *Tell us* link at the top of any page." |
| 100 | EDITORIAL | "Clinical claims here are meant to carry a source you can check. If one does not, or the source does not say what we claim it says, that is a defect." | good |
| 104 | EDITORIAL | callout "Before you write to us" — "Anything you send leaves this app, and our privacy promises do not follow it. Please leave out your own use, where you are, and anything about anyone else. A report works fine anonymously — the page, the claim, and what is wrong with it is all we need." | good |
| 123 | EDITORIAL | "The organizations below do the actual work, most of them on very little money." | good |
| 143 | EDITORIAL | disclosure title "What we have got wrong" | **needs work** — British construction, and the jump chip at L32 says "What we got wrong". Fix: "What we got wrong" in both. |
| 145 | EDITORIAL | "Things this app said that were wrong, overstated or unsupported, and what it says now. Newest first. Nothing here is edited after the fact." | good |
| 154-156 | DATA | corrections entries (`e.said` / `e.wrong` / `e.now`) | from `data/corrections.json` |
| 157 | EDITORIAL | "Nothing has been logged yet." | good |
| 167 | EDITORIAL | "Nightlight reads public feeds — state and county health departments, the CDC, local news, and forensic drug-checking labs — and reorganizes what they publish by county, alongside every county that borders it." | good |
| 171 | EDITORIAL | "A supply does not stop at a county line, so a warning one county over is often the more useful one." | good |
| 176-179 | EDITORIAL | "Not medical advice. It cannot examine anyone, and it does not know your situation." / "Not a safety check. Nothing here verifies a drug or clears it. No test, and no absence of alerts, makes anything safe." / "Not a complete picture. Most changes in a local drug supply are never publicly announced. An empty county page means nobody published — not that nothing is happening." / "Not a treatment service. It points at services other people run; it does not provide care." | good — one of four phrasings of the same disclaimer (§3.3). |
| 183 | EDITORIAL | "People who use drugs, the people who love them, and the outreach workers who sit with both. Nothing here is conditional on wanting to stop." | good — exemplary voice. |
| 210 | EDITORIAL | "Everything is fetched when the site is built and shipped as part of the page. Your browser never contacts any of these — that is what keeps a lookup private." | good (the packaged app does refresh alerts from Nightlight's own server at boot, `app.js:1384`, but never from these sources, so the promise holds). |
| 216-217 | CITED | `r.license`, `r.note` — attribution/license lines from `substances.attribution` and `emerging.sources` | do not touch |

### `views/after.js` (191 lines)

| Line | Class | Text | Rating / notes |
|---|---|---|---|
| 37 | DATA | h1 `d.headline` | |
| 42 | EDITORIAL | "This page didn't load with this copy of the app." / "Try reloading." | good — but one of two empty-state families (§3.1). |
| 68 | EDITORIAL | bigptr "Finding your people" — "Support for LGBTQIA+ and trans people, Black, Native and Latino communities, survivors, pregnant people, veterans and others — on the Support page." | good |
| 82 | EDITORIAL | checkedLine tail: "The risk figures come from published studies and do not change quickly; the links can." | good |
| 97-176 | DATA | window / watch / risk / brain / feelings / closing / anger / items / grief — all from `data/after.json` | the file header's denominator rule lives with the data |

### `views/alerts.js` (1244 lines)

| Line | Class | Text | Rating / notes |
|---|---|---|---|
| 73 | EDITORIAL | welcome "You're in the right place." / "Alerts for your county, how to test, what mixes badly, and where to get help — free, no account. Nothing you look up here leaves this device." | good |
| 86, 104-105 | LOCALE | `alerts.heading` "What's showing up near you"; `alerts.startTitle` "Not sure where to start?"; `alerts.startSub` "Six questions people arrive with — if someone is overdosing right now, where to get naloxone free, what happens if you call 911." | good (straight apostrophe in "What's" where the rest of the app uses curly — trivial) |
| 127 | LOCALE | `alerts.noScanTitle` "No scan has run yet." / `noScanBody` "Once the hourly job runs, alerts will appear here. Until then this page has nothing to report — which is not the same as nothing happening." | **needs work** — "hourly" vs About's "every three hours". |
| 159 | LOCALE | `alerts.dataUpdated` "Alerts data updated {date}" | good |
| 238 | EDITORIAL | section title "Newly detected elsewhere in the US" | one of five names for two feeds (§3.1) |
| 239 | **DEAD** | `${n} compound(s) in the last 12 months` | never renders |
| 243 | EDITORIAL | "N substances a federal lab found in submitted samples for the first time. The finest location this data has is a coast — none of it says whether any of these has reached your county." | **needs work** — "finest location" is odd; near-duplicate of `emerging.js:147`. Fix: "The most specific location this data has is a coast — …" |
| 274 | EDITORIAL | button "More alerts" (routes to the page titled "Published alerts") | **needs work** — label does not match destination. Fix: "All published alerts". |
| 310 | EDITORIAL | class-row note: `places · month range` | fine |
| 352 | EDITORIAL | "Not classified by the program" | good |
| 478 | EDITORIAL | status "Still loading smaller towns…" | good |
| 511 | EDITORIAL | "This browser can't share location. Search by name instead." | good |
| 549 | EDITORIAL | "iOS will ask twice — once for the app, then once for the page. The second one says "localhost": that is this app, not a website." | good |
| 550 | EDITORIAL | "Asking your browser for a location…" | good |
| 568 | EDITORIAL | "Location stays off — that is a fine choice. If you meant to allow it, the "localhost" box was this app: iOS remembers a No, so it has to be turned back on in Settings › Nightlight › Location. Searching by name works just as well." | good (long for a status line, ~230 chars, but every clause earns its place) |
| 569 | EDITORIAL | "No problem — location stays off. Search by city or county name instead." | good |
| 571 | EDITORIAL | "Location is taking too long. Try again, or search by name." | good |
| 572 | EDITORIAL | "Your device couldn't work out where it is — location services may be switched off. Search by city or county name instead." | **needs work** — "work out" and "switched off" are British. Fix: "Your device couldn't figure out where it is — location services may be turned off. Search by city or county name instead." |
| 577 | EDITORIAL | "Matching coordinates to a county on this device…" | good |
| 586 | EDITORIAL | "That location isn't inside a US county. Search by name instead." | good |
| 589 | EDITORIAL | "Found X, ST. Your coordinates stayed on this device." | good |
| 592 | EDITORIAL | "Couldn't load the map data. Search by name instead." | good |
| 605 | EDITORIAL | "That county code isn't one we have." / "Search by name instead." | good |
| 656 | EDITORIAL | "The map didn't load. " + Reload | good |
| 698 | **DEAD** | `${mine.length} in the last ${labelFor(win)}` under "In {county}" | never renders — the county page shows **no counts** at all |
| 724 | **DEAD** | `${statewide.length} in the last …` | never renders |
| 726 | EDITORIAL | "Issued for the whole state, not for X specifically." | good |
| 739 | **DEAD** | `${nbrs.length} border ${c.name}` | never renders |
| 741 | EDITORIAL | "Supply moves across county lines. Nearest first." | good |
| 765 | **DEAD** | `${near.length} in counties bordering …` | never renders |
| 779 | **DEAD** | `${labs.length} lab result(s)` | never renders |
| 783 | EDITORIAL | "What labs found in samples people submitted from this area. Samples are self-selected, not a survey — they show what is possible, not how common." | good |
| 787 | EDITORIAL | "We have no public lab results for this area. Most of the country has no public drug-checking coverage — no result here does not mean nothing is circulating." | good |
| 799 | EDITORIAL | row "Published alerts" / "Drugs showing up elsewhere, not local" | good |
| 810 | **DEAD** | "From national drug-checking data" | never renders |
| 846/849 | EDITORIAL | "Link copied" / "Copy link" | fine |
| 870 | LOCALE | `alerts.print` "Print this county" | fine |
| 886 | EDITORIAL | print sheet: "X, ST — printed from URL on DATE. No published alert does not mean a safe supply; most changes in a local supply are never announced." | good |
| 889-892 | EDITORIAL | "If someone is overdosing right now" / "Call 911. Give naloxone if you have it. Stay with them. You do not have to say what they took — only that someone is not breathing." | good — deliberate verbatim copy of `sos.introBody/introNote` for the hand-out |
| 895 | EDITORIAL | "Numbers that answer 24/7" | good |
| 899 | EDITORIAL | "Information, not medical advice. Nothing you look up on the site leaves your device. nightlight.help" | good |
| 919 | EDITORIAL | "There is/are N alert(s) in bordering counties — see below." | good |
| 929 | EDITORIAL | callout "We haven't got to X yet" / "Working through every county in the country takes weeks. This is a gap in what we have looked at, not something we found about the supply here." / "The counties next door are worth a look, and so is anything your local health department puts out." | **needs work** — "haven't got to" is British; "takes weeks" vs `map.noAlertsBody` "over about a week". Fix title: "We haven't checked X yet". |
| 939 | EDITORIAL | callout "Nobody has published anything for X in the last N" / "That does not mean the supply here is safe. Most changes in a local drug supply are never announced by anyone, and the reporting that does happen runs weeks behind. Read this as "no information", not "no risk"." | good — but it re-authors `en-US.json alerts.notHereTitle/Body` in different words (§3.7) |
| 973 | EDITORIAL | "N alert(s) published in the last N days in X and bordering counties." | good |
| 1029-1033 | LOCALE | `alerts.everywhereTitle` "National alerts"; `everywhereCount` "{count} published anywhere in the country in the last {window}."; `everywhereIntro` "Every alert published anywhere in the country, newest and most serious first." | good |
| 1058 | EDITORIAL | "N more published in the last 12 months" | good |
| 1064-1066 | LOCALE | `everywhereNoneTitle` "Nothing published anywhere in the last {window}" / `everywhereNoneBody` "That says what has been published, not what is going around. …" / `everywhereNoneScanned` "We have looked at {count} counties recently, out of 3,231. Most of the country has not been looked at at all." | good; "looked at at all" is clumsy → "Most of the country has not been scanned yet." |
| 1095 | LOCALE | `everywhereSeeAll` "See all {count}" | fine |
| 1135 | EDITORIAL | "N sources reported this" | fine |
| 1168 | EDITORIAL | "N people live here." | good |
| 1172 | EDITORIAL | "Overdose deaths here" / "Not published for this county. Counts between 1 and 9 are withheld to protect privacy, so no number is not the same as no deaths." | good |
| 1191 | EDITORIAL | "Up from / Down from / About the same as N the year before (pct%)" | good |
| 1208 | EDITORIAL | "in the 12 months to DATE, in COUNTY" | **needs work** — "12 months to" is British; US: "in the 12 months ending DATE". |
| 1211 | EDITORIAL | "R per 100,000 — N people live here (YYYY count)" | good |
| 1223 | EDITORIAL | "Provisional CDC counts: months behind, and the count climbs as cases close, so the newest number is almost always low. They count where it happened, not where the person lived." | good — no link to the CDC dataset anywhere on the card (§3.4) |
| 1228 | EDITORIAL | "Small numbers move a lot on chance alone — treat one year against one year as a hint, not a trend." | good |
| 1240 | EDITORIAL | "No deaths recorded here does not mean no risk here. Someone from this county who died in a hospital elsewhere is counted there, and the supply does not stop at the county line — the bordering counties below are part of your picture." | good |

### `views/donate.js` (159 lines)

| Line | Class | Text | Rating / notes |
|---|---|---|---|
| 45 | EDITORIAL | "The organizations whose published work this app is mostly built out of — reagent charts, test strip guidance, syringe access, naloxone by mail." | good |
| 53 | EDITORIAL | "Cited on the support and community pages: peer groups, clinics, and organizations serving people this app's other sources tend to leave out." | good |
| 61 | EDITORIAL | "Cited where this app explains what the law actually says, or where a figure came from a study rather than an agency." | good ("actually" is filler) |
| 83 | EDITORIAL | "The dose ranges, the combination warnings, the reagent colors, the naloxone steps — almost none of it was produced here. It was published by the organizations below, and this app collects it and puts it in one place. If any of it has been useful, they are the ones to give to." | good |
| 88 | EDITORIAL | "Nothing on this page routes through us. Every link goes straight to the organization's own donation page, with tracking parameters removed. Nightlight takes no money, from you or from them." | good |
| 96 | EDITORIAL | callout "This list has not loaded" / "It needs a connection the first time. Everything else on this site keeps working without one." | **rewrite** — second sentence is false on a cold open (About L52 says the cache is cleared at every start). Fix: "It needs a connection. Try again once you have one." |
| 108 | EDITORIAL | callout "This is a list of sources, not a ranking" / "An organization is here because this app cites its work. That is all it means: nothing here is a judgment about how well any of them spend money, and the smallest ones — a van, a table at an event — are mixed in with national bodies." | good |
| 138 | EDITORIAL | "N organizations. Every link was fetched and checked on DATE." | good |
| 158 | EDITORIAL | "· cited N times here" / "· cited once here" | fine |

### `views/emerging.js` (293 lines)

| Line | Class | Text | Rating / notes |
|---|---|---|---|
| 50 | EDITORIAL | h1 "Published alerts" / hint "Substances being identified elsewhere, often before they are documented locally." | good |
| 58 | EDITORIAL | callout "None of this is about your area" / "Everything below is **national** — from Canada's drug-testing lab and a US forensic science center. None of it tells you whether any of these have reached your county." / "It is here so that a drug is not brand new to you the first time you meet it." | **needs work** — "national" is wrong for the Canadian half when read by a US reader. Fix: "Everything below is from outside your county — Canada's national drug-testing lab and a US forensic science center. None of it tells you whether any of these have reached you." |
| 114 | EDITORIAL | "Substances Canada's national lab identified for the first time in a sample submitted to it. A first detection means a drug exists and has been confirmed somewhere — not that it is common, and not that it is here." | good |
| 113 | **DEAD** | "Canada, national" | never renders |
| 146 | **DEAD** | `${n} in the last 12 months` | never renders |
| 147 | EDITORIAL | "Compounds a federal lab identified in submitted samples for the first time. Samples are voluntarily submitted and may not be representative of the wider drug supply. The finest location this data has is a coast — it is not county-level, and it does not say whether any of these is here." | good; "finest" → "most specific"; duplicates `alerts.js:243` |
| 169 | EDITORIAL | empty "The early-warning feed didn't load with this copy of the app." / "Try reloading. If it keeps happening, this copy is incomplete." | **needs work** — "early-warning" is the page's *old* name (renamed 2026-08-26 per the comment at L45). Fix: "The published-alerts feed didn't load…" |
| 178 | EDITORIAL | "These systems watch other continents. Neither offers a feed this app could bundle, so they are links to check." | good; "Neither" hard-codes two — "None of them offers…" survives a third link |
| 184, 199-200 | CITED | `s.author`, `s.note`, `${s.author} · ${s.scope}` — Health Canada / CFSRE attribution (license condition) | do not touch |
| 258 | EDITORIAL | "The lab confirmed these exist in a sample. Nothing here has a published entry in this app, and we do not guess a class from a chemical name." | good |
| 270 | EDITORIAL | "first identified MONTH YEAR" | fine |
| 275 | DATA | `firstSentence(d.entry.description)` | from `descriptions.json` |

### `views/heat.js` (133 lines)

| Line | Class | Text | Rating / notes |
|---|---|---|---|
| 69 | EDITORIAL | "This section could not load." / "Check your connection and try again." | good |
| 126 | EDITORIAL | checkedLine tail "Where this page and common party advice disagree, it follows the clinical evidence and says so." | good |
| everything else | DATA | `data/heat.json` (spot / cool / water / prevent / risk, and the two stop callouts) | |

### `views/help.js` (860 lines) — the Emergency tab

**Rendered from the locale (`en-US.json sos.*`)** — inventoried because this is the highest-stakes copy in the app:

| Key | Class | Text | Rating / notes |
|---|---|---|---|
| sos.introTitle/Body/Note | LOCALE | "If someone is overdosing right now" / "Call 911. Give naloxone if you have it. Stay with them." / "You do not have to say what they took — only that someone is not breathing." | good |
| sos.steps[0] | LOCALE | "Look at their chest, then try to wake them" / "Is their breathing slow or stopped? Does it sound like snoring or gurgling? Then go to step 2. Shout their name. Rub your knuckles hard on their breastbone." / note "Check breathing first. Some drugs in the supply now (xylazine, medetomidine) can make a person impossible to wake up even when they are breathing fine. Bad breathing or no waking up: treat it as an overdose." | **needs work** — the branch is implicit: "Then go to step 2" reads as "after the questions", not "if yes". Fix body: "Is their breathing slow, stopped, or snoring and gurgling? If yes, go to step 2 now. If not, shout their name and rub your knuckles hard on their breastbone." |
| sos.steps[1] | LOCALE | "Call 911" / "Tell them: not breathing, or will not wake up." / "You do not have to say what they took. Alone, with naloxone in your hand? Give it first, then call. Two of you? One calls, one gives it." | good |
| sos.steps[2] | LOCALE | "Give naloxone" / "Put the nozzle in one nostril. Push the plunger all the way in." / "Give it even if you are not sure. It only works on opioids. It cannot hurt a person who has not taken any. No pulse? Do CPR first." | good |
| sos.steps[3] | LOCALE | "Help them breathe" / "Tip their head back. Lift their chin. Pinch their nose shut. Give one breath every 5 seconds." / "Going without air is what does the damage." | good |
| sos.steps[4] | LOCALE | "No better after 2–3 minutes? Give another dose" / "Naloxone in the nose takes 2–3 minutes to work. Watch their chest, not their eyes." / "One or two doses fix most overdoses, fentanyl included. Fentanyl is not immune to naloxone. They may stay asleep after it has worked. That is the other drugs, not a failed dose. Do not keep giving more." | good |
| sos.steps[5] | LOCALE | "Stay with them, and roll them on their side" / "On their side, they will not choke if they throw up." / "**Naloxone wears off in 30–90 minutes.** Most opioids last longer, so they can go under again. It does not happen often. It is still why you stay." | good — and the locale's own `_note` calls "30-90 minutes" a non-negotiable fact. **help.js L328 contradicts it** (below). |
| sos.tranqTitle/Body | LOCALE | "Naloxone doesn't work on tranq, benzos, or stimulants — give it anyway" / "Xylazine ("tranq") isn't an opioid, so naloxone won't lift its sedation. Give it anyway: it reverses the fentanyl, and the fentanyl is what stops the breathing. Watch their breathing, not whether they wake up. If the breathing gets better, it worked — even if they stay out of it." | good |
| sos.lines.* | LOCALE | "Overdose is a medical emergency" / "Someone stays on the line and sends help if you stop responding" / "Free, 24/7, confidential" / "Treatment and support referrals, 24/7, free" / "Call or text 988" | good (these describe the hotlines in the app's words, not the hotlines' own — editorial, and fine) |

**Authored in the view:**

| Line | Class | Text | Rating / notes |
|---|---|---|---|
| 153, 157 | EDITORIAL | rows "If they are burning up, or confused" / "If they are panicking, or seeing things" | good |
| 228 | EDITORIAL | disclosure title "Collapsed, cause unknown? Watch their breathing, not whether they answer" | good |
| 229 | EDITORIAL | "You will often not know what happened, and you do not need to. One check decides what you do." | good |
| 234-241 | EDITORIAL | "Why breathing is the check" — "While a person's response (or lack of) is the first test, a person in a deep k-hole may not react to anything, though their eyes may be open and their breathing completely normal. This is not an emergency and the drug working as intended. Sedatives now mixed into the opioid supply do the same thing. The person's breathing is the key indicator in these situations." | **rewrite** — (a) "This is not an emergency and the drug working as intended" is missing a verb; (b) "(or lack of)" is ungrammatical; (c) it opens by calling response "the first test" directly under a heading saying the opposite; (d) "key indicator in these situations" is abstract. Fix: "Whether someone answers you does not tell you much. A person deep in a k-hole may not react to anything — eyes open, breathing completely normal — and that is the drug working as intended, not an emergency. The sedatives now mixed into the opioid supply do the same thing. Their breathing is what tells you." |
| 245-252 | EDITORIAL | "Not breathing, or gasping" — "Slow deep gasps that sound like snoring are not breathing — they happen in about half of cardiac arrests and are the most common reason one gets missed. In as many as 4 in 10 arrests the caller was never talked through CPR because they said the person was breathing. Start CPR. Do not put them on their side." | **needs work** — two statistics and a protocol instruction with **no source anywhere in this section** (§3.4). The text itself is clear. |
| 254-259 | EDITORIAL | "Slow, shallow, or going blue" — "Four to six breaths a minute is the classic opioid picture; under about seven is the line harm reduction uses. Blue or gray lips and fingertips, ashen or gray skin on darker skin tones. On their side, naloxone, ambulance." | good text; unsourced numbers (§3.4) |
| 261-266 | EDITORIAL | "Breathing normally" — "A k-hole, fainting, minutes after a seizure, GHB, heat, too much water, a knock on the head, or low blood-sugar fall into this category. Keep the person on their side, stay, and monitor their breathing, as this could change." | good; "as this could change" → "it can change." |
| 269-272 | EDITORIAL | "What you genuinely cannot tell apart" / "These pairs are not separable without a hospital, and the safe move is the same either way." | good |
| 275 | EDITORIAL | "GHB and an opioid overdose. Identical in the first ten minutes — deep unresponsiveness, snoring, slow breathing, vomiting. Treat it as an opioid." | good |
| 279 | EDITORIAL | "A k-hole and a mixed-depressant overdose. Both unresponsive, both possibly with the eyes open, and ketamine is almost always taken with something else. Breathing decides." | good ("almost always" is an unsourced generalization) |
| 284 | EDITORIAL | "Heat stroke and a stimulant running too hot. Often the same person. Do not try — hot and confused means cool them, either way." | **needs work** — "Do not try" has no object. Fix: "Do not try to tell them apart — hot and confused means cool them down, either way." |
| 288 | EDITORIAL | "Heat stroke and too much water. Both are confusion and collapse in a hot room. This is the one pair where guessing wrong is dangerous, so do not give plain water to either." | good |
| 293 | EDITORIAL | "The minutes after a seizure and being high. Afterwards people spit, drool, wipe their nose and talk nonsense for five to thirty minutes. It looks exactly like intoxication." | good |
| 298 | EDITORIAL | "A hard fall and the drugs. Of people who were intoxicated and seemed only mildly hurt, about 8 in 100 had a bleed on the brain, and the standard screening rules missed a fifth to a third of them. If they hit their head, that is an ambulance regardless." | good text; unsourced study figures (§3.4) |
| 304-315 | EDITORIAL | callout "Regardless of what caused it": "On their side, unless they are gasping or hit their head." / "Never face-up if they might vomit — which is always." / "Nothing by mouth for anybody who is not fully awake. No water, no food, no sugar, no more of anything." / "Do not hold them down, sit on them, or leave anybody face-down. Fighting a restraint makes overheating worse." / "Do not leave, and do not let them sleep it off." / "Cool anybody who is hot and not making sense." | good |
| 318-323 | EDITORIAL | "Naloxone when you are not sure" / "Give it whenever the breathing is bad and you cannot rule opioids out — including when you think it is GHB, ketamine or alcohol. It does nothing at all to somebody with no opioids in them; the label on the box says so." | good |
| 325 | EDITORIAL | "Breathing is the target, not waking up. Somebody who breathes but stays under is naloxone working — do not keep dosing to chase consciousness. And waking up is the middle of this, not the end: **naloxone wears off in thirty to forty-five minutes** and most opioids last longer." | **rewrite the number** — contradicts `sos.steps[5]` "30–90 minutes" two screens up on the same page. Fix: "naloxone wears off in 30–90 minutes and most opioids last longer." |
| 375-381 | EDITORIAL | "The nearest radio beats the nearest phone" / "On-site medics are already inside the perimeter. Look for a medical tent, a medic, or any staff member with a radio — vendors and ticket staff included. Lollapalooza's own advice is the same: look for any festival staff member or anyone with a radio." | good; last sentence is an attributed paraphrase — leave |
| 383 | EDITORIAL | "Send a specific person, and tell them to come back. The more people there are, the less likely any one of them acts — "somebody call for help" in a crowd is how nobody does." | good (sourced to British Red Cross) |
| 391-399 | EDITORIAL/CITED | "Near the front, the barrier crew is already looking" / "The staff in the pit between the barrier and the stage are there to lift out people in distress. The UK's event safety guide says it in as many words: …" | the middle sentence paraphrases HSG195 — CITED; framing is good. Note: UK guidance applied to US events without saying so. |
| 404-409 | EDITORIAL | "Get staff moving and call 911" / "Do both. Lollapalooza's safety page says to contact any uniformed staff member or call 911 — there is no reason to pick one. At a small event there may be no on-site medical at all, and then 911 is the whole answer." | good |
| 411 | EDITORIAL | "Note where you are before you call — the nearest numbered pole, stage, bar or vendor. It is the difference between help arriving and help searching." | good |
| 417-426 | CITED + EDITORIAL | "Tell the event's medics what they took" / "They can treat faster when they know. Lollapalooza asks you to be honest with emergency personnel: "they are here to help you; NOT get you in trouble." … An ambulance usually is not free: about half of emergency ground ambulance rides for privately insured people end in an out-of-network charge." | the Lollapalooza quotation and the Insomniac/Okeechobee paraphrase are CITED — do not touch; KFF figure sourced |
| 428-435 | CITED (paraphrased policies) + EDITORIAL frame | "Read that as narrowly as it is written. It is the medical team's promise, not the law's. …" | first two sentences editorial, good; the rest attributed — leave |
| 450-456 | EDITORIAL | "What the promise does and does not cover" / "Your state's Good Samaritan law can protect you from charges for what is found because you asked for help. It does not stop the festival throwing you out. The law binds the police; your ticket is a permission the event can take back at any time. …" | **needs work** — "stop the festival throwing you out" is a British construction. Fix: "It does not stop the festival from throwing you out." |
| 458-463 | EDITORIAL (attributed reporting) | "It also only covers that night. At Ultra in 2025 a woman's partner carried her to a medical tent, and she did not survive. A year later four people were charged over the pill — the partner among them, for possession — on the strength of text messages about buying it. Go and get help anyway; just know that the protection is narrower than it sounds." | good; "Go and get help" → "Go get help" (US) |
| 470-477 | EDITORIAL | "The disclosure nobody warns you about" / "If you are on somebody else's insurance — a parent's job-based plan can cover you until you turn 26 — an ambulance ride and an emergency room visit generate an explanation of benefits, and insurers send it to the policyholder even when the care was a dependent's. It is a common way a night like this gets disclosed, and it has nothing to do with police." | good |
| 484-493 | EDITORIAL | "A 911 call is a different conversation" / "That amnesty is the event's, not the state's. On the phone, describe what you can see — not breathing, not waking up — give the location, and ask for medics. In many places police are sent to an overdose call whatever you say: in one Arizona city they were the first responder dispatched on 77% of overdose calls. Arrests at the scene are rare — 3 of 211 police-attended overdoses in one Rhode Island city — but police are usually there, so give the call what the medics need and nothing else." | good, sourced |
| 495 | EDITORIAL | "Medics carry naloxone whether or not you say the word. Intranasal naloxone for a suspected opioid overdose is in the national EMS scope of practice at every level, first responders included. If you are worried they will not have it, you can ask them to bring it." | good |
| 518-524 | EDITORIAL | "Security is not a medic" / "There is no medical tent. Door and floor staff are trained to remove a problem from the room, and somebody unconscious can be walked outside and left on the pavement while everyone assumes they are drunk. If staff are moving them, go with them and stay with them — the street outside is where being alone starts." | **needs work** — "pavement" means the road surface in US English. Fix: "left on the sidewalk". "trained to remove a problem from the room" is an unsourced generalization (§3.4). |
| 526 | EDITORIAL | "Call 911 yourself. Do not assume the venue has, and do not wait to find out — a license is at stake for them and nothing is at stake for you." | **rewrite** — "nothing is at stake for you" is contradicted by the Good Samaritan limits at L613-619 and L661-665 on the same page. Fix: "Call 911 yourself. Do not assume the venue has, and do not wait to find out — a license is at stake for them." |
| 530-535 | EDITORIAL | "The bathroom is where this happens" / "A locked stall, alone, is the most common way an overdose in a venue is found too late. If somebody went in and has been quiet a while, knock, then get staff to open it. Being wrong costs an awkward minute. Being late can cost far more." | good text; "the most common way" unsourced (§3.4) |
| 537 | EDITORIAL | "If you use in a venue bathroom, leave the latch off and tell somebody to check on you at a specific time." | good — concrete, non-judgmental |
| 540-546 | EDITORIAL | "You cannot assess anyone on the floor" / "It is too loud to hear breathing and too dark to see color changing. Get to a lit, quieter place if you can do it quickly. But if they are not breathing, that is where you are — start rescue breaths and give naloxone there. Moving somebody first costs the minutes that matter." | good |
| 548-554 | EDITORIAL | "Naloxone at the door" / "Search staff often do not recognize it and sometimes take it. Keeping it in the pharmacy packaging helps, and so does saying what it is before they find it. If it is confiscated, ask whether the venue keeps its own — many now do, and the person on the door may not be the person who knows." | good; "many now do" unsourced |
| 557 | EDITORIAL (attributed) | "For comparison, Insomniac's festival guidelines list sealed intranasal naloxone as an acceptable item to bring in." | good, sourced |
| 572 | EDITORIAL | bigptr "No naloxone yet?" / "Where to get it free, and how to use it — worth doing before the night you need it." | good |
| 588 | EDITORIAL | "On the call, what matters is that someone is not breathing and where you are. Once paramedics arrive, anything you can tell them helps them treat:" | good |
| 591-595 | EDITORIAL | "What was taken, if you know. Even a guess — "sold as oxy", "tranq dope" — changes what they watch for." / "How much, and when. Roughly is fine." / "What else was taken. Alcohol, benzos, and anything prescribed." / "Medical conditions, if you know them. Heart problems, diabetes, seizures, pregnancy." / "What you already did. How many naloxone doses, when, and whether breathing changed." | good |
| 597 | EDITORIAL | "Paramedics are not police. Telling them is what gets the right treatment." | good |
| 609 | EDITORIAL | "All 50 states and DC have an overdose Good Samaritan law — Wyoming was the last, in March 2025. They generally protect someone who calls in good faith, stays, and cooperates from charges for simple drug possession and paraphernalia." | **needs work** — a dated legal claim with **no source row in this section** (§3.4). |
| 613-619 | EDITORIAL | "What they usually do not cover": "Selling, sharing, or "possession with intent". In many states, splitting drugs with someone can be charged as distribution." / "Existing warrants. …" / "Probation and parole violations. Only some states protect these. If you are under supervision, check your own state's law." / "Anything else found at the scene. …" / "In some states, immunity is not what you get. …" | good; "check your own state's law" is a vague CTA with nowhere to go — link the Supervision page or a resource |
| 620 | EDITORIAL | callout "None of this is a reason not to call" / "It is a reason to know how it works where you live. Far more people are lost to accidents where nobody called than are ever prosecuted for calling." | good text; the comparison is unsourced (§3.4) |
| 624 | EDITORIAL | "This is information, not legal advice." | duplicated at L679 (§3.3) |
| 641 | EDITORIAL | callout "Keep helping. None of this is worth stopping for" / "Carry on with what you are doing — rescue breaths, naloxone, staying with them." | **needs work** — "Carry on" is British-flavored. Fix: "Keep doing what you are doing — rescue breaths, naloxone, staying with them." |
| 648-659 | EDITORIAL | "You do not have to answer questions. …" / "Tell the medics, not the police. …" / "You can decline a search out loud. Say plainly: "I do not consent to a search." …" / "Ask whether you are free to go. …" / "Do not run, and do not destroy anything. …" / "Write it down afterward. …" | good, sourced to ACLU |
| 661-665 | EDITORIAL | "If you are on probation or parole" / "Only some states protect supervision violations, and this is where the answers are least uniform. Worth knowing before a night when you have to decide — not during it." | good, but restates L617 |
| 667 | EDITORIAL | callout "Calling is still the right call" / "Every minute before help arrives is a minute without oxygen, and that is where the damage happens." | good |
| 679 | EDITORIAL | "This is information, not legal advice, and rights differ by state and situation. A local legal aid office or public defender can tell you how this works where you live." | good; second "not legal advice" on the page |
| 700 | EDITORIAL | bigptr "It's over and they're breathing" / "What happens next — for them, and for you, because being the person in the room costs something too." | good |
| 751-758 | EDITORIAL (unrendered — `DONATE` is empty) | "Nightlight is free and always will be. Donations are handled by ORG, not by this site." / … | good; dormant |
| 791 | EDITORIAL | "None of this makes drug use safe. It lowers the odds of an accident." | good |
| 793-799 | EDITORIAL | "Don't use alone. …" / "Start with much less than usual. …" / "Coming back after a break? Jail, hospital, detox, treatment, or just time away — tolerance falls fast, and the amount you used before the break is enough to stop your breathing after it. The first days back are the most dangerous. Use a fraction, go slow, and do not be alone." / "Go slow, and wait. …" / "Keep naloxone within reach. …" / "Be careful mixing. Opioids with benzodiazepines or alcohol is especially dangerous, because all three slow breathing and the effects stack — naloxone reverses the opioid and does nothing for the rest. The combination found most often in overdose deaths today is actually fentanyl with a stimulant, which mostly reflects how many people use both." / "Test what you have. …" | good overall. "is actually fentanyl with a stimulant" — unsourced epidemiological claim on screen, and "actually" is a hedge (§3.4). |
| 810-821 | EDITORIAL | "Nothing that identifies you, and nothing about what you looked at." / "Your searches never leave your device. …" / "No third parties. …" / "Your location stays on your device. …" / "Nothing outlives the session. …" | good — checked against the code: `i18n.js:97` does write locale to `sessionStorage`, `seen.js:42` writes one timestamp to `sessionStorage`, `app.js:237-241` wipes on pagehide. Accurate. (The `app.js:783-788` comment saying "nothing about language is stored" is the stale one, not the copy.) |
| 823-834 | EDITORIAL | "Quick exit" / "The ✕ button at the top right clears everything immediately, removes this page from your Back button, and sends you to a weather site. It is a shortcut, not a requirement — closing the tab clears the same things on its own, and so does simply leaving." | **rewrite** — stale in two places. (a) It no longer goes to a weather site: `app.js:348-370` sends web readers to the app's own neutral clock page and native readers to the Heat page. (b) "removes this page from your Back button" is stated flat; `app.js:337-338` says "It is a mitigation, not a guarantee, which is why the copy no longer claims otherwise" — this copy still does. Also: "Quick exit" (h3) vs "Quick Exit" (L836) — pick one. |
| 836 | EDITORIAL | callout "What Quick Exit can't do" / "It can't erase pages your browser wrote into its history before you pressed it, and it can't clear the browser's cache. If somebody else might check this device, open this site in a private or incognito window instead — that leaves no history at all." | good |
| 851 | EDITORIAL | "Nightlight collects what public sources — health departments, local news, and drug-checking labs — have already published about drug supply in each county, and puts it in one place." | good |
| 855 | EDITORIAL | "It is not medical advice, and it is not a safety check. Nothing here verifies a drug, clears it, or says it is safe to take. An absence of alerts means nobody published anything — not that a supply is **clean**." | **needs work** — "clean" (voice rule; and the footer/About/print sheet all say "safe"). Fix: "— not that a supply is safe." |

### `views/learn.js` (625 lines)

| Line | Class | Text | Rating / notes |
|---|---|---|---|
| 37 | EDITORIAL | "The training list didn't load with this copy of the app." / "Try reloading." | good |
| 88 | EDITORIAL | moreGuide "Staying up and coming down" — "Sleep loss alone will bring on psychosis-like states eventually — the timeline, what it looks like, and why sleep is the treatment." | **needs work** — a flat clinical claim in a teaser, with "eventually" doing unsourced work. Fix: "Sleep loss alone can bring on psychosis-like states — the timeline, what it looks like, and why sleep is the treatment." |
| 91 | EDITORIAL | "Sexual health" — "Barriers, PrEP and PEP, emergency contraception, the mixes that put people in the hospital, and why drink test strips mostly do not work." | good |
| 94 | EDITORIAL | "Heat and water" — "When hot has become dangerous, how to cool somebody down with what is in the room, and why too much plain water swells the brain." | good; "When hot has become dangerous" → "When heat has become dangerous" |
| 97 | EDITORIAL | "The law and having a say in it" — "What a Good Samaritan law protects you from and what it does not, where test strips are legal, who funds this, and how to weigh in." | good |
| 100 | EDITORIAL | "After an overdose" — "What happens next for whoever it happened to, whoever was in the room, and support the usual help is not built for." | good; near-verbatim twin of `support.js:102` (§3.3) |
| 103 | EDITORIAL | "If you are being tested" — "What a positive screen actually is, how to contest one, and what they cannot make you stop taking." | good; verbatim twin of `substances.js:1605` |
| 128 | EDITORIAL | "What to do when a person near you is frightened, overwhelmed, or having a bad time on something, and nobody is quite sure whether it is an emergency." | good |
| 148-150 | DATA | `e.why.title/body/note` | education.json |
| 205 | EDITORIAL | "The person most likely to be there when you overdose is someone who uses with you, or lives with you. Training them is the one preparation that works even when you are the one who cannot act." | **needs work** — "when you overdose" presumes it. Fix: "if you overdose". |
| 212 | EDITORIAL | checkedLine "Courses and prices change; the organizations are stable." | good |
| 245 | DATA | `m.intro` (myths) | |
| 339-354 | EDITORIAL | Start-here rows "Respond to an opioid overdose" / "When you do not know what it is" / "Practice your response" / "Get free naloxone" / "What a test can and cannot tell you" | good |
| 412 | EDITORIAL | "Lines you can hand them" | good |
| 531, 537 | EDITORIAL | "What helps" / "What makes it worse" | good |
| 618 | EDITORIAL | "When someone is named" | good |
| rest | DATA | sitting.json, consent.json, harm.json, myths.json (all sourced per their headers) | |

### `views/policy.js` (220 lines)

| Line | Class | Text | Rating / notes |
|---|---|---|---|
| 79-80 | EDITORIAL | tags "Led by people who use drugs" / "Not tax-deductible" | good |
| 82-84 | EDITORIAL | "Their site" / "Donate" / "Get involved" | fine |
| 120 | EDITORIAL | checkedLine "Drug policy changes faster than this app updates — anything here without a date should be treated as unverified." | good |
| 163 | EDITORIAL | bigptr "Drug testing, probation and parole" / "What a test can and cannot see, what to do when it says something wrong, and why they cannot make you stop your medication." | good |
| 196 | EDITORIAL | callout title "These links take you off Nightlight" (+ DATA body) | good |
| rest | DATA | policy.json | |

### `views/sex.js` (120 lines)

| Line | Class | Text | Rating / notes |
|---|---|---|---|
| 42 | EDITORIAL | "This section could not load." / "Check your connection and try again." | good |
| 92 | EDITORIAL | callout "These are specific pairs, not a blanket warning about mixing" / "Each one below has a documented reason behind it." | good |
| 106 | EDITORIAL | bigptr "Heat and water" / "Spotting heat stroke when they are still sweating, cooling somebody down with what is in the room, and how much water is too much." | good |
| 113 | EDITORIAL | checkedLine "Guidance and access rules change — anything here without a date should be treated as unverified." | good |
| rest | DATA | sex.json | |

### `views/stimulants.js` (114 lines)

| Line | Class | Text | Rating / notes |
|---|---|---|---|
| 42 | EDITORIAL | empty state (same as sex.js) | good |
| 82 | EDITORIAL | callout title "If this is you, right now" (+ DATA body) | good |
| 97 | EDITORIAL | bigptr "Heat and water" / "Overheating is the most likely way this becomes an emergency, and the fastest. Spotting it, cooling them down with what is in the room, and why giving them water to drink can be the wrong move." | **needs work** — "the most likely way" is an unsourced comparative in a teaser. Fix: "Overheating is the fastest way this becomes an emergency. Spotting it, cooling them down with what is in the room, and why giving them water can be the wrong move." |
| 107 | EDITORIAL | checkedLine "Where the evidence is thin or contested, this page says so." | good |
| rest | DATA | stimulants.json | |

### `views/substances.js` (1877 lines)

| Line | Class | Text | Rating / notes |
|---|---|---|---|
| 78 | EDITORIAL | "The drug reference didn't load with this copy of the app." / "Try reloading. If it keeps happening, this copy is incomplete." | good |
| 126 | EDITORIAL | placeholder "Search a drug — fentanyl, xylazine, MDMA…" | good |
| 164 | EDITORIAL | "No match." / "Try another name, or browse by class." | good |
| 175 | **DEAD** | `${n} with published data` | never renders |
| 249 | **DEAD** | group blurb "Prescribed medication and health conditions both change what a combination does." | never renders |
| 328, 336 | DATA | `m.close`, `m.scope` (market.json) | |
| 413 | EDITORIAL | callout fallback title "Found in the supply — not sold as itself" (+ DATA `s.summary`) | good |
| 422 | EDITORIAL | "If someone is overdosing" (+ DATA naloxone block) | good |
| 489 | EDITORIAL | "Numbers describe where and when they were measured, and the supply changes faster than the reporting does." | good |
| 506 | EDITORIAL | "That isn't a class we list." / "Go back to Drugs to browse the classes." | good |
| 550-553 | EDITORIAL | "No match in this class." / "Clear the filter, or search the Drugs screen to look across all classes." | good |
| 568 | EDITORIAL | "Some drugs belong to more than one class. Effects vary by person, dose, and what a drug is actually mixed with." | good |
| 684 | EDITORIAL | callout "You picked the same category twice" / "Taking more raises the dose. Redosing before the first amount has fully come up is a common way people take far more than they meant to." | good |
| 729 | EDITORIAL | "N pairs checked. There is no data anywhere on how three or more drugs behave together, so this is the worst single pair — treat it as a floor, not the whole picture." | **needs work** — "no data anywhere" is an absolute the app cannot back (the comment says "no free validated source"). Fix: "There is no published data on how three or more drugs behave together, so…" |
| 742-750 | EDITORIAL | callout "N of these slow your breathing down" / "X, Y all suppress breathing, and the effects stack. Together they are more dangerous than any pair above shows — the pair view only rates two at a time." / "Naloxone reverses the opioid. It does nothing for alcohol, benzodiazepines, GHB or pregabalin — so breathing can stay suppressed after a reversal that otherwise worked." | good for ≥3 drugs; renders for 2 as well (main review, Fix-now #2) |
| 770 | EDITORIAL | "No information is not the same as no risk. Treat an unknown combination as risky: take much less than usual, wait, and do not be alone." | good |
| 799 | EDITORIAL | section "Is this combination dangerous?" (chip at L116 says "Is this mix dangerous?") | **needs work** — same target, two wordings; pick "mix" or "combination" |
| 809 | EDITORIAL | "Categories, not brands. Fentanyl, heroin, oxycodone and methadone are all opioids; Xanax, Valium and etizolam are all benzodiazepines." | good |
| 829 | EDITORIAL | "Not in the chart, but worth knowing" (+ DATA `s.note`, sourced) | good |
| 847 | CITED | TripSit status definitions (`d.definition`) | do not touch |
| 880 | EDITORIAL | "Not found." / "That drug isn't in the dataset." | good |
| 912 | EDITORIAL | "Also called: …" | good |
| 952 | EDITORIAL | figcaption "2D structure from PubChem CID N. Hydrogens on carbon are not drawn." | good |
| 974 | EDITORIAL | callout title "This gets sold under a name that isn't its own" (+ DATA) | good |
| 998, 1009 | DATA | `s.description` (descriptions.json), `s.supply` | |
| 1041 | EDITORIAL | "Nobody has published a checked description of what X does, so there is not one here — we won't guess. What is on record is the family it belongs to: …" | good |
| 1047 | EDITORIAL | "The dose, duration and interaction data below comes from PsychonautWiki and TripSit and is sourced at the foot of the page." | good |
| 1211 | EDITORIAL | "Some of these are whole drug classes, so they cover things this page does not name individually." | good |
| 1231 | EDITORIAL | section "Mixing with other drugs"; callouts "Dangerous" / "Unsafe" | good |
| 1255-1258 | EDITORIAL (paraphrase of TripSit) | "Caution" / "Not usually physically harmful, but they can produce undesirable effects — discomfort, or overstimulation. Care is worth taking." | good; the comment says it is "in the source's own words" — if so, treat as CITED |
| 1276 | EDITORIAL | "Uncertain: …" | fine |
| 1283 | EDITORIAL | callout "Nobody has published interaction data for this one" / "That is a hole in what has been published, not a finding that it mixes safely. Anything you combine it with is an unknown." | good |
| 1295-1300 | CITED | "FDA Boxed Warning" / "The FDA's strongest warning, quoted from the drug label." + `warn.text.slice(0, 1400)` | do not touch the text — but see §3.8: the quoted label is **truncated at 1,400 chars with "…"** |
| 1364-1368 | EDITORIAL + CITED | callout "A reagent can't tell you what this is" / "Reagent colors were worked out on powders and crystals. DanceSafe says it plainly: plant matter and fungi are difficult, if not impossible, to test with at-home tools." | first sentence editorial (good); the DanceSafe clause is attributed — leave |
| 1380 | EDITORIAL | "That goes double for mushrooms. Nothing you can buy identifies a species: ordinary supermarket mushrooms produce the same color as psilocybin ones, and so does death cap. A color is not an identification, and no color does not mean it is **clean**." | **needs work** — "clean" (voice rule); the death-cap and supermarket-mushroom claims have no source row in the view (§3.4). |
| 1385 | EDITORIAL | "The blue that stands for THC in the cannabis reagent has been recorded coming from ordinary thyme and oregano, and no spot test detects synthetic cannabinoids at all." | good text; unsourced in the view |
| 1389 | EDITORIAL | "A lab service is the only way to identify this material or measure its strength." | good |
| 1393 | EDITORIAL | bigptr "Where to send it" / "Mail-in labs, what each method can actually identify, and what it costs." | good |
| 1460-1474 | EDITORIAL | callout "This reads the main drug. It can't see what else is in there" / "These are the colors you get from this drug on its own. If the expected reaction doesn't show up, that tells you a lot — walk away. …" / "A reagent cannot find fentanyl mixed into something else. …" | good; two flags: "walk away" is a directive the page cannot know is right — Test's own "Keeping the kit working" section says an expired reagent also gives no reaction (§3.5); "Fentanyl strips" is the only place that term is used (§3.1) |
| 1475 | EDITORIAL | "Expected reagent reactions" | good |
| 1538 | **DEAD** | "Ranges reported by PsychonautWiki — not a recommendation" | **never renders** — the dose section's "not a recommendation" line is invisible (§3.6) |
| 1539 | EDITORIAL | callout "Nothing off the street comes measured" / "These ranges assume a pure drug that is what it says it is. What you have may be a different drug, a different strength, or mixed unevenly through the batch. Start well below the low end." | good |
| 1543 | EDITORIAL | disclosure "Reported Dosage Ranges" | **needs work** — Title Case; every other heading in the app is sentence case. Fix: "Reported dose ranges". |
| 1552 | EDITORIAL | "How long it lasts" | good |
| 1598 | **DEAD** | "On a urine test — a different question from how long the effects last" | never renders |
| 1600-1602 | DATA | `detect.urine/note/perDrugNote` | |
| 1603 | EDITORIAL | bigptr "If you are being tested" / (twin of learn.js:103) | good |
| 1616 | EDITORIAL label + derived value | "Addiction potential: " + `s.addiction` (PsychonautWiki-derived, CC BY-SA) | label is the app's; under a heading that says "Tolerance and dependence" the row says "Addiction" — §3.1; the value carries "abuse" (main review, Fix-now #4) |
| 1620 | EDITORIAL | "Tolerance dropping is a leading cause of overdose accidents. After any break — jail, hospital, treatment, illness — a previously normal amount can cause one." | good; "a leading cause" unsourced in view |
| 1641 | EDITORIAL | "DrugsData is an archive of laboratory-tested samples. It stopped accepting new samples in April 2024, so it shows what was circulating up to then." | good |
| 1716-1732 | CITED | attribution block (PsychonautWiki CC BY-SA, TripSit, UNC) — license condition | do not touch |
| 1749 | EDITORIAL | "On prescribed medication?" | good |
| 1758 | EDITORIAL | badge "Well documented" / confidence | good |
| 1763 | DATA | `it.claim` (rx.json, per-claim sourced) | |
| 1766 | EDITORIAL | callout title "Where the honest answer is "nobody knows"" (+ DATA `d.unresolved`) | good |
| 1768 | EDITORIAL | checkedLine "Never stop a prescribed medication over anything on this page — talk to whoever prescribes it." | good |
| 1846 | DATA | `d.notCovered` | |
| 1872 | EDITORIAL | "Pick anything that applies. Nothing you select here is saved — not on this device, not anywhere." | good — verified against `lensPicks` (module-scoped, never stored) |

### `views/supervision.js` (180 lines)

| Line | Class | Text | Rating / notes |
|---|---|---|---|
| 44 | EDITORIAL | empty state | good |
| 71 | EDITORIAL | intro "What this page does not cover" / "Nothing here is about beating a test. It is about what a test can and cannot see, and what the law already entitles you to." | good |
| 173 | EDITORIAL | checkedLine "Testing rules and state supervision law both change — anything here without a date should be treated as unverified." | good |
| rest | DATA | supervision.json | |

### `views/support.js` (644 lines)

| Line | Class | Text | Rating / notes |
|---|---|---|---|
| 30 | EDITORIAL | empty state | good |
| 61-67 | DATA | the letter (`g.framing`, `g.underneath`) | |
| 102 | EDITORIAL | bigptr "After an overdose" / "What happens next for whoever it happened to, whoever was in the room, and support for people the usual help isn't built for." | good; twin of learn.js:100 |
| 112 | **DEAD** | group blurb "Treatment, peer support, and what to do about cost." | never renders |
| 133 | **DEAD** | group blurb "No decisions required." | never renders — and it is the single best line on the page for the "not stopping" reader (§3.6) |
| 204 | EDITORIAL | "Being verified. This section appears once every link and phone number has been confirmed." | good |
| 219, 312 | EDITORIAL | "How to start: " / "On medication? " | good |
| 223 | EDITORIAL | callout title "What the research actually found" (+ DATA) | good |
| 305 | EDITORIAL | callout title "Worth knowing before you walk in" (+ DATA `p.medicationNote`) | good |
| 297 | EDITORIAL | "Someone to talk to now" | good |
| 265-278 | CITED/DATA | hotline rows: `l.name`, `l.who`, `l.hours`, `l.dispatch` — the line's own description | do not touch |
| 328, 335 | EDITORIAL | "Treatments with evidence behind them" / "Support for specific experiences" | good |
| 367-388 | EDITORIAL | "Free" / "Peer-run and grassroots" / "Directories — find something near you" / "Paid" | good |
| 393 | EDITORIAL | callout title "Check your own state first" (+ DATA `s.legalNote`) | good |
| 394 | EDITORIAL | checkedLine "These change often — especially test strip programs, since federal grant money can no longer buy them." | **needs work** — a dated policy fact stated flat with no date or source in this view. Fix: "…especially test strip programs since the April 2026 federal funding change — see Policy." |
| 432 | EDITORIAL | "Choose your state…" | fine |
| 442 | EDITORIAL | callout "We could not confirm this one either way" / "We could not find a statewide mail program here that we could verify. The national finder above still covers you, and a local syringe service program is usually the quickest route." | good |
| 461 | EDITORIAL | "What your state offers" | good |
| 497-513 | EDITORIAL | "Getting your supply checked" / "Mail-in and national" / "State and city programs" / "Community and grassroots" / "Find something closer" / "Is this legal where you live?" (+ DATA `d.legality.text`, sourced) | good; "Is this legal where you live?" vs test.js:454 "Is this legal where you are?" |
| 488-490 | DATA | `e.access`, `e.anon`, `e.caveat` (checking.json) | |
| 518 | EDITORIAL | checkedLine "Every link above checked alive" / "Programs change fast — if one is gone, the locators are the fallback." | good |
| 577 | EDITORIAL | "All states (N with a program)" | good |
| 589 | EDITORIAL | `N in STATE. Anything under "Mail-in and national" above is open to you as well.` | good; straight quotes where the app uses curly |
| 620-634 | EDITORIAL | "What helps" / "What backfires" / "Support for you" | good |
| 641 | EDITORIAL | checkedLine "Nothing here is a technique for getting someone to do something — it is how to stay close enough to matter." | good — exemplary |

### `views/test.js` (1208 lines)

| Line | Class | Text | Rating / notes |
|---|---|---|---|
| 24 | EDITORIAL | "The testing guide could not load." / "Check your connection and try again." | good |
| 30 | EDITORIAL | h1 "Test your supply" | good |
| 69-70 | DATA | `g.framing.headline`, `ruleInRuleOut` | |
| 87, 296 | EDITORIAL | section labels "Testing" / "Before you buy" | good |
| 116-117 | DATA | `fts.reading.explain`, `faintLine` | |
| 133 | **DEAD** | group blurb "What reagents show, and how to run one safely." | never renders (the comment at L129-131 believes a screen reader hears it — it does not) |
| 153, 180, 192 | EDITORIAL | "How to run a reagent test" / "Why" / "Walk me through it" | good |
| 195-204 | EDITORIAL labels + DATA | "If it gets on you" / "Disposal" / "Keeping the kit working" / "Check it still works: " | good |
| 219 | EDITORIAL | "Every reagent in the color tables has a card here now. Where a card and the sheet that came with your kit disagree, your sheet is the one that describes the bottle you are holding." | **needs work** — "here now" is changelog language. Fix: drop "now". |
| 224 | EDITORIAL | "Why a color can be hidden" (+ DATA) | good |
| 286 | EDITORIAL | "Whatever the test says" (+ DATA `g.companion`) | good |
| 319-326 | EDITORIAL | "What testing can and cannot tell you" / "What testing can do" / "What it cannot do" (+ DATA bullets) | good |
| 348 | EDITORIAL | group "Which one to get" | good |
| 349 | **DEAD** | "Which test answers which question, where to buy, and what it costs." | never renders |
| 377-387 | EDITORIAL | sr caption "What each test finds, what it misses, and how much a negative result is worth"; "Finds: " / "Misses: " / "A negative is worth: " / "different question" | good |
| 402, 414-418, 433-447 | DATA | compare note, storefronts, buying items, legal | |
| 450 | EDITORIAL | checkedLine "Prices and availability checked" / "Both change." | good |
| 454 | EDITORIAL | "Is this legal where you are?" (+ DATA) | good |
| 463, 470 | EDITORIAL | "Getting a lab to confirm it" / callout title "DrugsData has stopped taking samples" (+ DATA) | good |
| 483-484 | EDITORIAL | "Strength: " / "Limits: " | good |
| 499 | EDITORIAL | tile flag "Most sold in **shops** test a person, not a drug" | **needs work** — "shops" is British; this is the one sentence visible on the closed tile. Fix: "Most sold in stores test a person, not a drug". |
| 513-516, 523-529 | DATA | trap, storage | |
| 548, 555 | EDITORIAL titles + DATA bodies | "No reagent will tell you whether fentanyl is in there" / "Before you open the bottle" | good |
| 575 | EDITORIAL | placeholder "Filter by drug — cocaine, MDMA, heroin…" | good |
| 580 | EDITORIAL | "No reagent in this guide has a published reaction for that. That is not the same as it being absent — most reagents simply do not react with most things." | good |
| 613 | EDITORIAL | "N reagent(s) with a published reaction" | good |
| 633, 658-659 | DATA | prevalence `p.why`, `p.coUse`, `p.regional` | |
| 646-648 | EDITORIAL | "Share of samples found to contain fentanyl:" / caption "How often fentanyl is found, by what the drug was sold as" | good |
| 657 | EDITORIAL | "Why the death statistics look different" | good |
| 691-725 | EDITORIAL labels + DATA | "N major limit(s)" / "Detects: " / "Limits" / "Major limit: " / "How well it does in real life" | good |
| 731-732 | EDITORIAL | "How much water" / callout title "Why the amount is different for each drug" (+ DATA) | good |
| 739 | EDITORIAL | "Which drugs read positive when the water is too little" | **needs work** — awkward. Fix: "Which drugs read positive when there is too little water". |
| 746-751 | EDITORIAL | "Substances that cause false positives, and at what concentration" / "Drug" / "False positive at" | good |
| 761 | EDITORIAL | callout title "If you were testing a stimulant and it came back positive" (+ DATA) | good |
| 782-789 | EDITORIAL | "How much water to use" / "What you have" / "Water" | good |
| 794-797 | DATA | `d.amountsNote`, `d.recovery` | |
| 840-844 | EDITORIAL + DATA | badges "two-part" / "read the caveat"; `r.base`; "Use for: " | good |
| 850 | EDITORIAL (from reagentnames.js) | "How to run it: " | good |
| 905 | EDITORIAL | "Watch out for" (+ DATA caveats) | good |
| 956 | DATA-derived | wait condition sentence | |
| 997-1042 | EDITORIAL | clock: "Out at T — read at T." / "Read it now — M:SS past" / "M:SS since you took it out" / "Hold it in for the count." / "Take it out" / "I took it out — start the wait" / "Start the N-second dip" / "Time it" | good |
| 1094-1111 | DATA | `b.maker`, `b.positive/negative/invalid`, "Sample/Water/Dip/Do not dip past/Wait" rows | verdict words POSITIVE/NEGATIVE/INVALID are the app's, all-caps by design |
| 1150 | EDITORIAL title + DATA | "Cocaine can read positive on a 1.0 strip" | good |
| 1170-1200 | DATA | `brands.headline/notListed/lotsTitle/lots/notInterchangeable/gap` | |
| 1178-1181 | EDITORIAL | "Which strip" / "What you are testing" | good |

### Supporting modules (skimmed for strings)

| File:line | Class | Text | Rating / notes |
|---|---|---|---|
| ui.js:73 | EDITORIAL | title "Link removed: unsupported address" | good |
| ui.js:98-113 | EDITORIAL | relTime "just now/today/yesterday/N days ago/N months ago/N years ago" | good |
| ui.js:275-327 | EDITORIAL | "Walk me through it" / "Step N of M" / "Back" / "Next" / "Show all steps" | good |
| ui.js:468 | LOCALE | sr prefixes `callout.stop` "Warning" / `callout.warn` "Caution" | good |
| ui.js:643 | EDITORIAL | "Jump to" | good |
| ui.js:701-703 | LOCALE | "Some of this page is only in English" / "The clinical guidance below has not been translated yet. Nothing has been left out of the English version." / "The crisis lines in the footer answer in Spanish as well as English." | good; the Spanish claim is unverified in code for Never Use Alone (§3.4) |
| ui.js:770/797 | EDITORIAL | "Where this data comes from" | good |
| app.js:681-688 | LOCALE | "This section could not load." / "Check your connection and try again." / "Try again" | good |
| app.js:755 | EDITORIAL | "If you are not sure what to look for" | good |
| app.js:921 | EDITORIAL | aria "Back to top" | good |
| app.js:1740 | EDITORIAL | "Nothing matched. Try a drug name, its street name, or what you are trying to find out." | good |
| app.js:860 (`app.earlyBody`) | LOCALE | "Some of this may be wrong. Every clinical claim is checked against a source prior to you seeing it, but we still may have made mistakes. If you see anything wrong, especially something that could hurt someone, please reach out:" | **needs work** — "prior to you seeing it" is stilted. Fix: "…is checked against a source before it reaches you, but we still make mistakes." |
| app.js:866 (`footer.privacy`) | LOCALE | "We do not save or sell any of your data. ✕ clears this device and overwrites the back button. A private window is the only way to leave no trace, as we cannot erase your browser history." | **needs work** — "clears this device" overclaims (it clears what this site stored); "overwrites the back button" is jargon. Fix: "Nothing you do here is saved or sold. The ✕ clears what this site stored and walks the Back button past it. Only a private window leaves no trace — we cannot erase your browser's own history." |
| app.js:813 (`app.quickExit`) | LOCALE | aria "Leave now — clears what is on this device, overwrites the back button, and leaves this site" | same overclaim |
| app.js:870-871 (`footer.disclaimer*`) | LOCALE | "This is information, not medical advice." / "Nightlight reports what public sources published. It does not verify, advise, or clear any drug as safe. No test, and no absence of alerts, makes a supply safe." | good — this is the canonical phrasing the others should match |
| kindness.js:38-51 | EDITORIAL | 14 lines | good — the one that skirts the file's own rule 5 ("say it out loud first") is "You are loved."; the rest are spoken-register. Shown only on Support and After. |
| practice.js:102 | EDITORIAL | "Not quite — and this is the one worth getting wrong here." | good |
| practice.js:113, 160, 170, 193, 207 | EDITORIAL | "Next strip" / "Start over" / "Go through it again" / "Situation N of M" / "Worth thinking about" / "Not this one" / "Next situation" / "Finish" | good |
| practice.js:245 | EDITORIAL | "Checked DATE." (plain text) | fine; every other page uses the `checkedLine` badge — minor inconsistency |
| search.js:87-98 | EDITORIAL | result-kind labels "Emergency / Alerts / Test / Drugs / Learn / Support / Policy / Supervision / Sex / Staying up / Heat / After / About / Start here" | good; "Emergency" vs tab "SOS" (§3.1) |
| search.js:161, 171, 242, 248 | EDITORIAL | "Also called "X"" / "Did you mean this?" | good |

---

## 2. Rating summary

Of roughly 210 editorial paragraphs and body-length strings, about 180 rate **good** — the voice is unusually consistent: second person, non-judgmental, concrete, uncontracted in instructions, and "no information ≠ no risk" is said the same way everywhere it appears. The "needs work" and "rewrite" items are all listed inline above; the ones that matter are ranked in §4. No moralizing language was found in app-authored text ("abuse" arrives in the PsychonautWiki-derived `addiction` field — see the main review). No scare tactics. The reading level is right for the audience except in `help.js:236-241`.

---

## 3. Cross-cutting findings

### 3.1 Terminology and naming

- **naloxone** — used consistently (58 uses); "Narcan" never appears in reader-facing text. Good.
- **overdose** — consistent; "poisoning" never used. Good.
- **test strip / fentanyl test strip / fentanyl strips** — "test strip(s)" dominates; "Fentanyl strips" appears once (`substances.js:1473`). Trivial; align to "fentanyl test strips" there.
- **The Emergency tab has three names.** The tab bar says **SOS** (`nav.help`), the page h1 says **Emergency** (`sos.title`), search results say **Emergency** (`search.js:88`), and prose refers to "Emergency" (`about.js:53`). A reader told to "go to Emergency" looks for a tab that says SOS. Pick one phrasing for prose — e.g. "the SOS tab" — or write "Emergency (SOS)".
- **The lab-detection feed has five names.** "Published alerts" (emerging h1; county-page row), "Early warning" (`emerging.js:169` empty state; code names), "Newly detected elsewhere in the US" (`alerts.js:238`), "Newly detected in US samples" (`emerging.js:145`), and "National alerts" (`alerts.everywhereTitle`, which is actually the health-department list). Settle two names — one for health-department alerts, one for lab first-detections — and fix `emerging.js:169` and `alerts.js:274 "More alerts"`.
- **"Is this mix dangerous?"** (chip, `substances.js:116`) vs **"Is this combination dangerous?"** (heading, L799). Same target.
- **"911 and the law"** (chip, `help.js:130`) vs **"Calling 911 and the law"** (heading L606, and the cross-reference at L456).
- **"Is this legal where you are?"** (`test.js:454`) vs **"Is this legal where you live?"** (`support.js:513`).
- **"Quick exit"** (`help.js:823`) vs **"Quick Exit"** (`help.js:836`, app copy).
- **"Tolerance and dependence"** (heading, `substances.js:1614`) vs **"Addiction potential:"** (row label, L1616) — the label is the app's own even though the value is PsychonautWiki-derived.
- **"clean"** — used twice for a supply/sample (`help.js:857`, `substances.js:1385`); everywhere else, including the footer, it is "safe". Voice rule and consistency both say change it.
- **Scan cadence** — "every three hours" (`about.js:76`) vs "the hourly job" (`alerts.noScanBody`); full sweep "takes weeks" (`alerts.js:931`) vs "over about a week" (`map.noAlertsBody`).
- **Naloxone duration** — "30–90 minutes" (`sos.steps[5]`, flagged non-negotiable in the locale) vs "thirty to forty-five minutes" (`help.js:328`). Same page.
- **Empty states come in two families**: "…didn't load with this copy of the app. / Try reloading." (after, learn, emerging, substances) and "This section could not load. / Check your connection and try again." (heat, policy, sex, stimulants, supervision, support, test, app.js). Both fine; pick one.
- **Contractions** — instructions are uncontracted ("do not", "cannot") and the warm register is contracted (welcome, kindness, "It's over and they're breathing"). That split is right. The outliers are the empty states ("didn't", "isn't", "can't") and "we won't guess" (`substances.js:1042`) — fine, but decide on purpose.

### 3.2 Heading capitalization and punctuation

- Sentence case is the house style and holds everywhere except **"Reported Dosage Ranges"** (`substances.js:1543`). ("FDA Boxed Warning" is a proper noun; POSITIVE/NEGATIVE/INVALID are deliberate.)
- Callout summaries are unpunctuated clauses ("Keep helping. None of this is worth stopping for") — consistent, fine.
- Quote marks are curly throughout except `support.js:589` ("Mail-in and national") and `alerts.heading` ("What's").
- `practice.js:245` renders "Checked DATE." as plain text where every other page uses the `checkedLine` badge.

### 3.3 Where disclaimers repeat

- **"This is information, not legal advice."** — twice on the Emergency page (`help.js:624` and `679`), in adjacent sections.
- **"Not medical advice / no test or absence of alerts makes a supply safe"** — four phrasings: footer (`footer.disclaimerBody`, canonical), `about.js:176-177`, `help.js:855-857` (with "clean"), `alerts.js:886-887` and `899` (print). Reuse the footer sentence verbatim.
- **"Only some states protect supervision violations"** — `help.js:617` and again at `help.js:663`.
- **"anything here without a date should be treated as unverified"** — policy, sex, supervision checkedLines. Deliberate template; fine.
- **Pointer twins** (not disclaimers, but copy maintained in two places): `learn.js:100` ≈ `support.js:102`; `learn.js:103` = `substances.js:1605`; `alerts.js:243` ≈ `emerging.js:147`.
- **Privacy promise** said in five places (welcome card, privacyBlock, About intro, footer, print sheet) with compatible wording — acceptable by design (the comment at `alerts.js:113-121` records the decision).

### 3.4 Claims with no source in the same view

The house rule (`help.js:355-358`) is "Never re-add a claim here without one." These are the reader-facing sentences that state a number, a study finding, a legal fact, or a comparative, with no source row in the section that renders them:

| Where | Claim |
|---|---|
| `help.js:228-329` (whole "Collapsed, cause unknown" section — **zero sources**) | "about half of cardiac arrests"; "as many as 4 in 10 arrests the caller was never talked through CPR"; "Four to six breaths a minute… under about seven is the line harm reduction uses"; "about 8 in 100 had a bleed on the brain… missed a fifth to a third"; "naloxone wears off in thirty to forty-five minutes"; "the label on the box says so"; and the protocol instruction "Start CPR. Do not put them on their side." |
| `help.js:609` | "All 50 states and DC have an overdose Good Samaritan law — Wyoming was the last, in March 2025." |
| `help.js:615` | "In many states, splitting drugs with someone can be charged as distribution." |
| `help.js:622` | "Far more people are lost to accidents where nobody called than are ever prosecuted for calling." |
| `help.js:520, 531, 553` | "Door and floor staff are trained to remove a problem from the room"; "A locked stall, alone, is the most common way…"; "many now do" |
| `help.js:798` | "The combination found most often in overdose deaths today is actually fentanyl with a stimulant" |
| `substances.js:1380-1387` | death cap / supermarket mushrooms / thyme and oregano / "no spot test detects synthetic cannabinoids" (the build script read these at source, but the reader cannot) |
| `substances.js:1620` | "Tolerance dropping is a leading cause of overdose accidents." |
| `alerts.js:1223` | the mortality card cites "Provisional CDC counts" but links nowhere |
| `support.js:395` | "federal grant money can no longer buy them" |
| `learn.js:88`, `stimulants.js:99` | "Sleep loss alone will bring on psychosis-like states eventually"; "Overheating is the most likely way this becomes an emergency" |
| `content.lines` (ui.js:703) | "The crisis lines in the footer answer in Spanish as well as English." (true for 911, Poison Control, SAMHSA; unverified in-repo for Never Use Alone) |

### 3.5 Instructions the app cannot verify are safe

- `substances.js:1463` — "If the expected reaction doesn't show up, that tells you a lot — **walk away**." The Test page's own "Keeping the kit working" card says a dead or expired reagent also fails to react; a missing color can be the bottle, not the bag. Suggest: "…that tells you a lot — do not assume it is what it was sold as."
- `help.js:527` — "nothing is at stake for you" when calling 911 from a venue, contradicted by the Good Samaritan limits further down the same page.
- `help.js:831` — the Quick Exit promises ("removes this page from your Back button", "sends you to a weather site") are not what the code does or can guarantee.
- `footer.privacy` / `app.quickExit` — "clears this device" is broader than what happens.
- `donate.js:97` — "Everything else on this site keeps working without one" is untrue on a cold open.

### 3.6 Dead copy — strings that never render

`ui.js section()` voids its `note` argument and `group()` never renders `blurb`. Every one of these was authored for the reader and none of them appears:

| Where | Invisible text |
|---|---|
| `substances.js:1538` | **"Ranges reported by PsychonautWiki — not a recommendation"** |
| `support.js:133` | **"No decisions required."** |
| `support.js:112` | "Treatment, peer support, and what to do about cost." |
| `substances.js:1598` | "On a urine test — a different question from how long the effects last" |
| `substances.js:249` | "Prescribed medication and health conditions both change what a combination does." |
| `substances.js:175` | "N with published data" |
| `test.js:133` | "What reagents show, and how to run one safely." |
| `test.js:349` | "Which test answers which question, where to buy, and what it costs." |
| `alerts.js:698, 724, 739, 765, 779` | all five county-page counts ("N in the last 90 days", "N border X", "N lab results") — the county page shows **no counts** |
| `alerts.js:239, 810` | "N compounds in the last 12 months"; "From national drug-checking data" |
| `emerging.js:113, 146` | "Canada, national"; "N in the last 12 months" |

Either render the slot (the two bolded ones earn it) or delete the strings so nobody edits copy that no reader sees. Note `test.js:129-131`'s comment believes the blurb reaches screen readers; it does not.

### 3.7 Locale drift

`alerts.js` hand-codes English for strings that already exist in `en-US.json` under different wording: `notHereTitle/Body` (vs L939-943), `locateDenied/Timeout/Failed` (vs L568-573), `unknownCounty*`, `borderingIntro`, `inCounty`, `countInWindow`, `nearbySub`, `copyLink/linkCopied`, `labResult`, `sourcesReported`, `sessionTitle/Body`, `locationPrivacy*`. The file's own comment (`alerts.js:125-126`) records the pattern. Consequences: a translator translates the JSON and the app shows English anyway; and the JSON preserves stale claims ("sends you to a weather site" in `sessionBody`; "works out your county" in `locationPrivacyBody`). Either route those strings through `t()` or delete the orphaned keys.

### 3.8 Fidelity of cited text

`substances.js:1300` truncates the quoted FDA boxed warning at 1,400 characters and appends "…". A boxed warning cut mid-sentence under a label that says "quoted from the drug label" is the one place the app abridges a citation. Render it whole inside a disclosure, or cut at a sentence boundary and say "excerpt".

### 3.9 Accuracy against the code (privacy copy)

- `help.js:812-821` — **accurate** (`i18n.js:97` and `seen.js:42` write to `sessionStorage`; `app.js:237-241` wipes on pagehide; boot sweep at L232).
- `help.js:831-834` — **stale**: web goes to the app's own `/w` clock page, native to the Heat page (`app.js:307-370`); the Back-button removal is best-effort (`app.js:328-338`).
- `en-US.json footer.privacy`, `app.quickExit`, `alerts.sessionBody` — same overclaims.
- `about.js:52-55` — accurate.
- `donate.js:97-98` — inaccurate on cold open.

### 3.10 US English

Reader-facing British spellings/idioms found (comments are full of them — "colour", "labelled", "neighbour" — but those are not shipped): `about.js:143` "What we have got wrong"; `alerts.js:572` "work out… switched off"; `alerts.js:929` "We haven't got to"; `alerts.js:1208` "12 months to"; `help.js:453` "stop the festival throwing you out"; `help.js:462` "Go and get help"; `help.js:522` "pavement"; `help.js:642` "Carry on"; `test.js:499` "shops". Spelling proper is already US ("color", "gray", "license", "recognize", "organizations", "center", "judgment").

---

## 4. Top 15 wording fixes, ranked by impact

1. **`help.js:328`** — "naloxone wears off in thirty to forty-five minutes" contradicts "30–90 minutes" in `sos.steps[5]` on the same page; the locale calls that figure non-negotiable. → "naloxone wears off in 30–90 minutes".
2. **`help.js:236-241`** — "Why breathing is the check" has a missing verb, "(or lack of)", and opens by calling response "the first test" under a heading that says the opposite. Rewrite (text in §1).
3. **`help.js:831-834`** (+ `footer.privacy`, `app.quickExit`, `alerts.sessionBody`) — Quick Exit copy is stale ("weather site") and overclaims (Back button, "clears this device") on the page whose job is an accurate privacy inventory.
4. **`substances.js:1538`** — "Ranges reported by PsychonautWiki — not a recommendation" never renders. Put "not a recommendation" in the callout title or the disclosure summary.
5. **`help.js:857` and `substances.js:1385`** — "clean" → "safe" (voice rule; matches the footer).
6. **`help.js:228-329`** — the "Collapsed, cause unknown" section carries six numeric clinical claims and a CPR instruction with no source row, beside a festival section that was just retro-sourced under a "never without one" rule.
7. **`help.js:609`** — "All 50 states and DC… Wyoming was the last, in March 2025" — dated legal claim, no source, no link to Policy.
8. **`help.js:526-528`** — cut "and nothing is at stake for you"; the page's own Good Samaritan section says otherwise.
9. **`donate.js:97-98`** — "Everything else on this site keeps working without one" is false on a cold open. → "It needs a connection. Try again once you have one."
10. **`test.js:499`** — "Most sold in shops…" → "in stores". It is the only sentence a reader sees on the closed "Which one to get" tile.
11. **US English pass** — `about.js:143` (and match the chip at L32), `alerts.js:572-573`, `alerts.js:929`, `alerts.js:1208`, `help.js:453`, `help.js:462`, `help.js:522`, `help.js:642`.
12. **`support.js:133`** — "No decisions required." is the best line on the Support page for the reader who is not stopping, and it never renders; render it (or move it into the group's first card).
13. **Feed naming** — reconcile "Published alerts" / "Early warning" / "Newly detected elsewhere in the US" / "Newly detected in US samples" / "National alerts"; fix `emerging.js:169` and `alerts.js:274`.
14. **`help.js:285`** — "Do not try — hot and confused means cool them, either way." → "Do not try to tell them apart — hot and confused means cool them down, either way."
15. **`about.js:97`** — "Please say so" with no address on the page. Add the mailto or point at the "Tell us" banner link.

Runners-up, in file order: `app.earlyBody` "prior to you seeing it"; `alerts.js:243`/`emerging.js:150` "finest location"; `alerts.everywhereNoneScanned` "looked at at all"; `emerging.js:60` "national — from Canada's"; `learn.js:88` "will bring on… eventually"; `learn.js:205` "when you overdose" → "if"; `stimulants.js:99` "the most likely way"; `substances.js:729` "no data anywhere"; `substances.js:1463` "walk away"; `substances.js:1543` title case; `support.js:395` undated funding claim; `test.js:219` "here now"; `test.js:739` "when the water is too little"; the "hourly" vs "every three hours" cadence.
