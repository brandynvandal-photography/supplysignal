/* Translation.
 *
 * US English is the default and the source of truth. Everything else is a
 * locale file under data/i18n/, so translating this needs no code change and
 * no build step - a translator edits JSON.
 *
 * Why this matters here more than on most sites: Puerto Rico's 78 municipios
 * are covered, Spanish is the first language of a large share of the people
 * this is for, and someone reading overdose response steps in a second
 * language under stress is exactly who a translation is for.
 *
 * Locale files are same-origin static JSON like everything else, so choosing a
 * language reveals nothing beyond "someone loaded the site" - see PRIVACY.md.
 */

const DEFAULT = "en-US";

/* Content-hashed locale paths, filled in by the web build and empty everywhere
   else - the same arrangement, and the same marker, as HASHED in data.js; the
   full note is there. Kept here rather than imported from data.js so this
   module stays free of imports, which is what lets the boot preload it
   alongside the others rather than behind one of them. */
const HASHED = {};
const url = (rel) => `../data/${HASHED[rel] || rel}`;

/* Add a locale here once data/i18n/<code>.json exists. `dir` drives the
   document's text direction, so an RTL translation works without CSS changes. */
/* A LOCALE IS OFFERED ONLY ONCE IT IS REVIEWED.
 *
 * data/i18n/es.json has carried "_reviewed": false and a note reading "NEEDS
 * NATIVE-SPEAKER REVIEW before this is promoted anywhere" since it was drafted
 * - and resolve() below was auto-selecting it for every device that reports
 * es-*. An unreviewed translation of a harm-reduction app was the default for
 * every Spanish-speaking reader. Found by the 2026-08-18 audit; under the
 * information-integrity rule that is a release defect, not a polish item.
 *
 * `reviewed` gates BOTH auto-selection and the language menu. The file stays
 * shipped so a reviewer can flip the flag in one place; until then Spanish
 * devices get en-US, which is accurate, rather than es, which is unverified.
 * A test asserts every listed locale's flag matches its file. */
export const LOCALES = [
  { code: "en-US", name: "English (US)", dir: "ltr", reviewed: true },
  { code: "es", name: "Español", dir: "ltr", reviewed: false },
];
export const OFFERED = LOCALES.filter((l) => l.reviewed);

const KEY = "ss.lang";

let strings = {};
let current = DEFAULT;
const listeners = new Set();

/** Resolve the best available locale: saved > browser > default. */
function resolve() {
  let saved = null;
  try { saved = sessionStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (saved && OFFERED.some((l) => l.code === saved)) return saved;

  for (const want of navigator.languages || [navigator.language || ""]) {
    if (!want) continue;
    const exact = OFFERED.find((l) => l.code.toLowerCase() === want.toLowerCase());
    if (exact) return exact.code;
    // "es-MX" should find "es".
    const base = want.split("-")[0].toLowerCase();
    const loose = OFFERED.find((l) => l.code.split("-")[0].toLowerCase() === base);
    if (loose) return loose.code;
  }
  return DEFAULT;
}

async function fetchLocale(code) {
  try {
    const r = await fetch(url(`i18n/${code}.json`), { credentials: "omit" });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch {
    return null;
  }
}

export async function init() {
  current = resolve();
  strings = (await fetchLocale(current)) || {};

  // A partial translation must never blank the interface, so anything missing
  // falls back to US English rather than showing a key.
  if (current !== DEFAULT) {
    const base = await fetchLocale(DEFAULT);
    if (base) strings = deepMerge(base, strings);
  }
  applyDocument();
  return current;
}

export async function setLocale(code) {
  if (!LOCALES.some((l) => l.code === code) || code === current) return;
  try { sessionStorage.setItem(KEY, code); } catch {}
  await init();
  for (const fn of listeners) fn(current);
}

export const locale = () => current;
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function applyDocument() {
  const meta = LOCALES.find((l) => l.code === current) || LOCALES[0];
  document.documentElement.lang = current;
  document.documentElement.dir = meta.dir;
}

function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object"
      ? deepMerge(base[k], v)
      : v;
  }
  return out;
}

/**
 * t("help.hotlines.title") — dot-path lookup with {name} interpolation.
 *
 * A missing key returns the key itself. That is deliberate: a visible
 * "help.hotlines.title" in the UI gets noticed and fixed, whereas an empty
 * string silently deletes a sentence someone needed.
 */
export function t(key, vars) {
  let v = strings;
  for (const part of key.split(".")) {
    if (v == null || typeof v !== "object") { v = null; break; }
    v = v[part];
  }
  if (typeof v !== "string") return Array.isArray(v) ? v : key;
  return vars
    ? v.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m))
    : v;
}

/** Array-valued entries (bullet lists), always an array. */
export function tList(key) {
  const v = t(key);
  return Array.isArray(v) ? v : [];
}

/** Locale-aware number formatting, so 1,824 reads correctly everywhere. */
export const num = (n) => new Intl.NumberFormat(current).format(n);
