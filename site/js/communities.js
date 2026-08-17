/* "Finding your people" - the culturally-specific directory.
 *
 * Lives on Support rather than on After an overdose, because needing a
 * provider who will not make you explain yourself first is not an
 * after-an-overdose problem. It is a Tuesday problem. Filing it under an
 * overdose would have hidden it from everyone who never had one.
 *
 * Its own module because it is rendered from Support and pointed at from
 * After, and a directory that gets copy-pasted between two views is a
 * directory where one copy quietly goes stale.
 *
 * Rules that are load-bearing here, all learned from checking the sources:
 *
 *   - A DEAD NUMBER IS WORSE THAN NO NUMBER. Every entry was opened and read
 *     on the date in the file, not lifted from a directory. One widely
 *     published LGBTQ+ elder hotline turned out to have been switched off in
 *     2023 and is still listed as live across dozens of aggregators. Someone
 *     calling that number is not merely unhelped, they are unhelped at the
 *     moment they finally reached out.
 *   - WHO CAN SEND POLICE IS NOT A FOOTNOTE. For a person who uses drugs, is
 *     undocumented, is trans, or is on parole, it decides whether the number
 *     is usable at all. Where an organization publishes a policy it is quoted
 *     in their own words. Where they do not, the entry is left unmarked, and
 *     the callout at the top says plainly that unmarked means unknown.
 *   - HOURS ARE PART OF THE ENTRY. A line that closes at weekends is not a
 *     24/7 line, and someone finding that out at 2am on a Saturday has been
 *     failed by the page, not by the organization.
 *   - GAPS GET NAMED, NEVER PADDED. Where nothing national exists - trans
 *     people and substance use, Native-specific overdose support, naloxone at
 *     prison release - the page says so. Filling those with the nearest
 *     plausible organization would spend a phone call someone made while
 *     desperate.
 */

import { h, frag, callout, extLink, badge } from "./ui.js";
import * as data from "./data.js";

/** The whole section, ready to append. Returns null if the bundle is absent. */
export async function communitiesBlock({ open = false } = {}) {
  const c = await data.communities();
  if (!c?.groups?.length) return null;

  return h("details", { class: "disc", id: "sec-communities", open: open || null },
    h("summary", null, h("h2", null, c.headline)),
    h("div", { class: "disc__body" },

      /* Before any phone number: which of these can send police. */
      callout("warn", c.keyNote.title,
        h("p", null, c.keyNote.body),
        h("p", null, c.keyNote.detail)),

      frag((c.groups || []).map(groupBlock)),

      h("p", { class: "sec__note" }, c.howChecked),
      c.closing ? h("p", null, c.closing) : null,
      h("p", { class: "sec__note" }, `Checked ${c.lastVerified}.`)));
}

function groupBlock(g) {
  return h("details", { class: "acc", id: `grp-${g.id}` },
    h("summary", null,
      h("span", null, g.title),
      badge(String((g.items || []).length), "neutral")),
    h("div", { class: "acc__body" },

      frag((g.items || []).map(resourceCard)),

      /* Law sections are date-stamped and deliberately refuse to predict. */
      g.law
        ? callout("info", g.law.title,
            h("p", null, g.law.body),
            h("p", null, g.law.detail),
            g.law.checked ? h("p", { class: "sec__note" }, g.law.checked) : null,
            g.law.sources
              ? h("div", { class: "sources" },
                  g.law.sources.map((x) => extLink(x.url, x.name)))
              : null)
        : null,

      g.gap
        ? h("p", { class: "sec__note gapnote" },
            h("strong", null, "What doesn’t exist: "), g.gap)
        : null));
}

function resourceCard(it) {
  const policy =
    it.policy === "noncarceral"
      ? badge("Won’t call police unless you ask", "ok")
      : it.policy === "rescue"
        ? badge("May send police or EMS", "elevated")
        : null;

  return h("div", { class: "card rescard" },
    h("div", { class: "card__top" },
      h("h4", null, it.url ? extLink(it.url, it.name) : it.name),
      policy),

    it.what ? h("p", null, it.what) : null,

    /* The number is a tel: link and also readable as text - someone reading
       this on a laptop needs to be able to write it down. */
    it.num
      ? h("p", { class: "rescard__num" },
          it.tel ? h("a", { href: `tel:${it.tel}` }, it.num) : it.num)
      : null,

    it.hours ? h("p", { class: "card__meta" }, it.hours) : null,
    it.note ? h("p", null, it.note) : null,
    it.policyQuote ? h("p", { class: "sec__note" }, it.policyQuote) : null,
    it.caution ? h("p", { class: "sec__note rescard__caution" }, it.caution) : null);
}
