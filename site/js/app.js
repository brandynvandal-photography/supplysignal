/* Boot, routing, and the two controls that exist purely for reader safety:
 * Quick Exit and the no-storage default. */

import { h, clear, skeleton } from "./ui.js";
import * as data from "./data.js";
import * as i18n from "./i18n.js";
import { markVisit } from "./seen.js";
import { mountKindBar } from "./kindness.js";
const { t } = i18n;

const view = document.getElementById("view");
const navLinks = [...document.querySelectorAll(".nav a")];

/* ------------------------------------------------------------------ theme
   The only thing this app ever persists. A color preference says nothing
   about anyone, and Quick Exit wipes it along with everything else. */

const THEME_KEY = "ss.theme";
const THEMES = ["auto", "light", "dark"];

function applyTheme(t) {
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}

let theme = "auto";
try {
  const saved = localStorage.getItem(THEME_KEY);
  if (THEMES.includes(saved)) theme = saved;
} catch { /* storage blocked or disabled - fine, stay on auto */ }
applyTheme(theme);

document.getElementById("theme").addEventListener("click", (e) => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  e.currentTarget.setAttribute(
    "aria-label",
    `Color theme: ${theme}. Activate to change.`
  );
});

/* -------------------------------------------------------------- quick exit
   Wipe what we can, drop this page out of the back button, and leave. The
   browser's own history and HTTP cache are outside our reach - the Help view
   says so rather than implying a guarantee we cannot make. */

document.getElementById("exit").addEventListener("click", () => {
  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}
  try {
    if (window.caches?.keys) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
  } catch {}

  // Overwrite the current entry so Back does not land here again.
  try { history.replaceState(null, "", "#"); } catch {}
  location.replace("https://weather.com/");
});

/* ---------------------------------------------------------------- routing
   Fragments are never sent to the server, which is why every piece of
   user-selected state lives here rather than in a query string. */

const DEFAULT_DAYS = 90;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean).map(decodeURIComponent);

  // Legacy links published before the app grew sections: #/47065 and
  // #/47065/30. Keep them working - they are in RSS feeds and shared messages.
  if (/^\d{5}$/.test(parts[0] || "")) {
    return { tab: "alerts", fips: parts[0], days: Number(parts[1]) || DEFAULT_DAYS };
  }

  const tab = parts[0] || "alerts";
  if (tab === "alerts") {
    if (parts[1] === "map") return { tab, map: true, focus: /^\d{5}$/.test(parts[2] || "") ? parts[2] : null };
    return { tab, fips: /^\d{5}$/.test(parts[1] || "") ? parts[1] : null,
             days: Number(parts[2]) || DEFAULT_DAYS };
  }
  // `sub` carries a second segment, currently only #/substances/class/<slug>.
  return { tab, id: parts[1] || null, sub: parts[2] || null };
}

export function go(hash, replace = false) {
  if (location.hash === hash) return route();
  if (replace) { history.replaceState(null, "", hash); route(); }
  else location.hash = hash;
}

const VIEWS = {
  alerts:     () => import("./views/alerts.js"),
  test:       () => import("./views/test.js"),
  substances: () => import("./views/substances.js"),
  support:    () => import("./views/support.js"),
  emerging:   () => import("./views/emerging.js"),
  learn:      () => import("./views/learn.js"),
  about:      () => import("./views/about.js"),
  help:       () => import("./views/help.js"),
  /* Not a tab. Reached from Support and from the foot of Emergency - the two
     places someone is standing when the question occurs to them. The tab bar
     is already at six on a 375px screen and a seventh would truncate them all. */
  after:      () => import("./views/after.js"),
};

let token = 0;

async function route() {
  const r = parseHash();
  const tab = VIEWS[r.tab] ? r.tab : "alerts";
  const mine = ++token;

  for (const a of navLinks) {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }

  view.setAttribute("aria-busy", "true");
  clear(view).appendChild(skeleton(3));

  try {
    const mod = await VIEWS[tab]();
    if (mine !== token) return;                 // a newer navigation won
    const node = await mod.render(r, { go, data });
    if (mine !== token) return;
    clear(view).appendChild(node);
  } catch (err) {
    if (mine !== token) return;
    clear(view).appendChild(
      h("div", { class: "empty" },
        h("h3", null, t("app.loadFailed")),
        h("p", null, t("app.loadFailedHint")))
    );
    console.error(err);
  } finally {
    if (mine === token) view.setAttribute("aria-busy", "false");
  }
}

/* Focus lands on the heading of the new view, not the top of the document, so
   a screen-reader user is not re-read the header and nav on every navigation. */
function focusView() {
  const target = view.querySelector("h1, h2") || document.getElementById("main");
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

let first = true;
window.addEventListener("hashchange", async () => {
  await route();
  focusView();
});

document.getElementById("home").addEventListener("click", () => go("#/alerts"));

/* ------------------------------------------------------------------ i18n
   There is deliberately no language switcher. The locale comes from the
   device, which is already correct for almost everyone and is one less
   control on a screen that should feel calm. It also means nothing about
   language is stored - the browser already sends Accept-Language, so this
   adds no signal a server did not have. */

function applyStrings() {
  document.title = t("app.title");

  const skip = document.querySelector(".skip");
  if (skip) skip.textContent = t("app.skipToContent");

  const themeBtn = document.getElementById("theme");
  themeBtn.setAttribute("aria-label", t("app.themeToggle"));
  themeBtn.setAttribute("title", t("app.themeToggle"));

  const exitBtn = document.getElementById("exit");
  exitBtn.setAttribute("aria-label", t("app.quickExit"));

  document.querySelector(".nav").setAttribute("aria-label", t("nav.sections"));
  for (const a of navLinks) {
    const label = t(`nav.${a.dataset.tab}`);
    const ico = a.querySelector(".ico");
    clear(a);
    if (ico) a.appendChild(ico);
    /* The label is an ELEMENT, not a bare text node. A text node cannot carry
       overflow/text-overflow, so at large Dynamic Type sizes the tab bar had
       no way to truncate and blew the page width out instead. */
    a.appendChild(h("span", { class: "nav__label" }, label));
  }

  // Footer. The crisis numbers are never translated - they are dialled, not read.
  const disc = document.getElementById("foot-disclaimer");
  clear(disc).append(
    h("strong", null, t("footer.disclaimerLead")), " ", t("footer.disclaimerBody")
  );

  const crisis = document.getElementById("foot-crisis");
  clear(crisis).append(
    t("footer.emergency"), " ", h("strong", null, "911"), " · ",
    t("footer.poisonControl"), " ", h("strong", null, "1-800-222-1222"), " · ",
    t("footer.neverUseAlone"), " ", h("strong", null, "1-800-484-3731"), " · ",
    t("footer.samhsa"), " ", h("strong", null, "1-800-662-4357")
  );
}

/** Counts change with locale (digit grouping), so this re-runs on switch. */
async function renderFooterMeta() {
  const a = await data.alerts();
  const g = await data.counties();
  const n = (a.clusters || []).length;
  document.getElementById("foot-meta").textContent =
    t("footer.counties", { counties: i18n.num(g.counties.length) }) + " · " +
    t(n === 1 ? "footer.activeAlert" : "footer.activeAlerts", { count: i18n.num(n) }) + " · " +
    (a.generated
      ? t("footer.updated", { date: new Date(a.generated).toISOString().slice(0, 10) })
      : t("footer.awaitingScan"));
}

/* ------------------------------------------------------------------- boot */

(async function boot() {
  await i18n.init();
  applyStrings();

  await route();

  /* The kindness bar: rendered once, above the content, and never touched
     again. Two rules it has to keep at the top of the screen that it did not
     have to keep at the bottom:
       - It is STATIC. No rotation, no motion, no re-pick on navigation. A
         changing line at the top of the page is a ticker, and a ticker draws
         the eye of whoever else is in the room.
       - It is never on Emergency. Nothing may sit between someone and the
         overdose steps, however kind it is. */
  const kindbar = document.getElementById("kindbar");
  if (kindbar) {
    /* Mounted ONCE. Navigation toggles visibility with a class rather than
       re-rendering, so the cycle keeps its own rhythm instead of restarting
       every time someone touches a tab - a bar that reset on navigation would
       flash a new line on every screen change, which is the jumpy behaviour
       the slow fade exists to avoid. */
    const inner = document.createElement("div");
    kindbar.appendChild(inner);
    mountKindBar(inner);

    const syncKind = () => {
      // Never on Emergency: nothing sits between someone and the overdose steps.
      kindbar.classList.toggle("is-hidden", parseHash().tab === "help");
    };
    syncKind();
    window.addEventListener("hashchange", syncKind);
  }

  /* Stamp this visit only after the first render, so the screen the reader is
     looking at is still measured against their PREVIOUS visit. seen.js captures
     the old value at import time, so ordering here is belt and braces. */
  markVisit();

  /* Offline support - production only. On localhost a service worker would
     re-create the exact stale-preview problem the no-store dev server exists
     to kill (see scripts/dev-server.mjs), so it never registers there. */
  const isDev = ["localhost", "127.0.0.1"].includes(location.hostname);
  if ("serviceWorker" in navigator && !isDev) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* Offline support is an enhancement; failing to get it is not an error
         worth surfacing to someone mid-crisis. */
    });
  }
  if (first) first = false;

  await renderFooterMeta();
})();
