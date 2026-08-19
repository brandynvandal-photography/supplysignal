/* The slot row, shared by the two tools that are built from it.
 *
 * The reagent tracker on Test and the combination checker on Drugs are the
 * same kind of control: a short list of things you have, added one at a time,
 * each row a word and a field ("I took [Opioids]", "I used [Marquis]"), a × on
 * the rows past the floor, a "+ Add another" beneath, and one off-screen
 * sentence per change for a screen reader. They were written twice, and the
 * two copies had already drifted in the details that matter for a keyboard
 * user - which row takes focus when a × is pressed, how the rows are
 * renumbered - so the shape lives here once and both tools compose it.
 *
 * Only the ROW and its bookkeeping. What a slot holds (a select of reagents,
 * a select of categories) and what the rows add up to (a verdict card, a
 * pair table) stay with each tool: that is where the two genuinely differ.
 * The strip brand picker is deliberately not on this - it has no slots, no ×
 * and no floor; it is two fixed dropdowns that happen to wear the same field.
 */

import { h, clear } from "./ui.js";

/**
 * One off-screen sentence per change. role=status, atomic, and replaced by
 * node rather than by textContent so an identical sentence entered a second
 * time is still announced - the same reading repeated is still an answer.
 * Returns the element to mount and the function that speaks through it.
 */
export function liveRegion() {
  const el = h("p", { class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const announce = (parts) => {
    const text = (parts || []).filter(Boolean).join(" ");
    clear(el);
    if (text) el.appendChild(document.createTextNode(text));
  };
  return { el, announce };
}

/**
 * Take a row out without stranding focus.
 *
 * The × sits inside the row it removes, so removing it dropped keyboard
 * focus to <body> and the next Tab started from the top of the document.
 * Focus goes to the row that takes its place, else the one before it, else
 * `fallback` (the add button) - and only when it was inside the row, so a
 * mouse user's focus is left alone.
 */
export function dropRow(row, fallback) {
  const active = document.activeElement;
  if (active && row.contains?.(active)) {
    const near = row.nextElementSibling || row.previousElementSibling;
    const target = near?.querySelector?.("select, button") || fallback;
    target?.focus?.({ preventScroll: true });
  }
  row.remove();
}

/**
 * A word and a field, as one labelled control: "I took [Opioids]".
 *
 * The visible word IS the field's accessible name - no aria-label, which
 * would replace it (WCAG 2.5.3). The row's number rides inside the label
 * off-screen, so two rows are still tellable apart by ear, and relabelRows()
 * keeps both the word and the number right as rows come and go. Same control
 * as the strip picker on Test: label, then the select wearing a disclosure
 * row, the chevron centred on it by .pick__field. Returns the <label>; the
 * caller puts it in its .mixslot, beside whatever else that row carries.
 */
export function slotLabel(word, field, n, noun) {
  return h("label", { class: "pick__row" },
    h("span", { class: "mixlabel" },
      h("span", { class: "mixlabel__word" }, word),
      h("span", { class: "sr-only mixlabel__n" }, ` ${noun} ${n}`)),
    h("span", { class: "pick__field" }, field));
}

/** The × that removes a row. `label` is its whole accessible name. */
export function removeButton(label, onClick) {
  return h("button", { type: "button", class: "iconbtn mixslot__x", "aria-label": label, onClick }, "×");
}

/**
 * Renumber and re-word the rows by position - the first row leads with
 * `first` ("I took", "I used") and the rest with `rest` ("and"), so removing
 * the first never leaves a list that opens on "and". Every label in a row is
 * touched: a reagent row carries two. The × is renumbered with its row, so
 * "Remove reagent 3" does not keep saying 3 once it is the second row.
 */
export function relabelRows(rows, first, rest, noun) {
  [...rows.children].forEach((row, i) => {
    for (const w of row.querySelectorAll?.(".mixlabel__word") || []) w.textContent = i === 0 ? first : rest;
    for (const n of row.querySelectorAll?.(".mixlabel__n") || []) n.textContent = ` ${noun} ${i + 1}`;
    for (const x of row.querySelectorAll?.(".mixslot__x") || []) x.setAttribute("aria-label", `Remove ${noun} ${i + 1}`);
  });
}
