# Translation — the brief

Nightlight's interface has a Spanish locale file, `data/i18n/es.json`, and
the app is built so that a **partial** translation is safe: any key a locale
leaves out falls back to US English. Spanish is not offered to readers yet
(`reviewed: false` in `site/js/i18n.js`), because nothing in it has been
checked by a second person. This file is what a translator needs.

## The rule that outranks every other

**Nothing here may be wrong.** A clinical sentence that reads well and says
something different is worse than English. So:

- Translate meaning, not words; keep the register — short sentences, one
  instruction each, the common word over the correct-but-longer one. These
  steps are read one-handed, at 3am, next to somebody who is not breathing.
- **Numbers and facts do not move**: 2–3 minutes, 30–90 minutes, one breath
  every 5 seconds, "check breathing first", 911, 988, the phone numbers.
- Do not soften or strengthen. "Give it even if you are not sure" stays that
  strong; "it does not happen often" stays that mild.
- Anything in quotation marks that is attributed to a source stays as a
  translation of the quote, marked as a translation — never paraphrased.
- If a phrase has no clean equivalent, say so in the delivery rather than
  improvise; the English will keep showing for that key until it is settled.

## Translate in this order

### 1. The Emergency tab — `sos` (about 250 words)

The six overdose steps, the opening lines, the naloxone-and-tranq caution,
and the five hotline descriptions. In `data/i18n/en-US.json` under `"sos"`;
copy the block into `es.json` and translate every value. Keys are never
translated. The reasoning behind each step is in `site/js/views/help.js` if
you need to know *why* a sentence is worded the way it is.

The hotline **names and numbers** are not in the file on purpose: they are
proper nouns and digits and stay as they are. Only the description under
each name is translated.

### 2. The rest of the interface — everything else in `en-US.json`

Already mostly in `es.json`. Six keys were added after the last pass and
fall back to English; a diff of the two files' keys shows which.

### 3. Content pages — not yet reachable by translation

The Test, Drugs, Learn and Support tabs render from the content datasets in
`data/*.json`, which have no locale mechanism yet. Until they do, a
non-English reader sees an "only in English" notice on each of those tabs.
The next block worth the mechanism is the strip-reading legend (positive /
negative / invalid, in `data/testing.json` under `brands.items`), because
"one line means positive" is the misread that gets people hurt.

## How it ships

1. Deliver `es.json` with the `sos` block filled.
2. A second Spanish reader checks it against the English, fact by fact.
3. `reviewed: true` for `es` in `site/js/i18n.js` makes Spanish selectable.
   Until then the file is loaded only if a reader has forced the locale, so
   a half-finished translation can sit in the repository without being seen.

`npm test` runs on every deploy; `test/copy.test.mjs` guards US English
spellings in the English file and will not object to Spanish text in
`es.json`.

`test/i18n.test.mjs` holds the facts. Every number in a translated `sos`
value must match the English exactly; no key may be missing from `en-US.json`;
no translated value may be the English left as it was; and a locale marked
reviewed must carry the whole `sos` block. A delivery that fails it is not
wrong to have made - it is the check working as described above.
