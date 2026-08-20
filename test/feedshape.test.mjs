/**
 * Does a fetched document actually look like a feed?
 *
 * Guards the soft-200 case: several sites answer /feed with HTTP 200 and
 * text/html, serving their homepage. Before this check the pipeline parsed
 * those to zero items and reported the source as healthy, so a feed that
 * turned into a redirect went silent while still looking fine.
 *
 * Run: node test/feedshape.test.mjs
 */

import assert from "node:assert/strict";
import { looksLikeFeed } from "../src/sources/index.mjs";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
}

console.log("FEED SHAPE");

t("plain RSS 2.0 is a feed", () => {
  assert.equal(looksLikeFeed('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>'), true);
});

t("Atom is a feed", () => {
  assert.equal(looksLikeFeed('<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>x</title></feed>'), true);
});

t("RDF/RSS 1.0 is a feed", () => {
  assert.equal(looksLikeFeed('<?xml version="1.0"?><rdf:RDF xmlns="http://purl.org/rss/1.0/"><channel/></rdf:RDF>'), true);
});

t("a namespaced root is still a feed", () => {
  assert.equal(looksLikeFeed('<?xml version="1.0"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom"></atom:feed>'), true);
});

/* The real-world failure this exists for. */
t("a homepage served as /feed is NOT a feed", () => {
  assert.equal(looksLikeFeed('<!DOCTYPE html><html lang="en"><head><title>Home</title></head><body><h1>Welcome</h1></body></html>'), false);
});

t("an HTML page that merely links a feed is NOT a feed", () => {
  assert.equal(
    looksLikeFeed('<!DOCTYPE html><html><head><link rel="alternate" type="application/rss+xml" href="/rss"></head><body></body></html>'),
    false,
  );
});

t("empty and null are not feeds", () => {
  assert.equal(looksLikeFeed(""), false);
  assert.equal(looksLikeFeed(null), false);
  assert.equal(looksLikeFeed(undefined), false);
});

/* A real feed with nothing published yet is honest, not broken - it must pass
   the shape check and be allowed to contribute zero items. Clay County MO
   returns exactly this. */
t("a valid feed with no items still counts as a feed", () => {
  assert.equal(looksLikeFeed('<?xml version="1.0"?><rss version="2.0"><channel><title>Quiet</title></channel></rss>'), true);
});

/* Leading whitespace, a BOM or a long XML declaration must not hide the root. */
t("a BOM and leading whitespace do not hide the root", () => {
  assert.equal(looksLikeFeed('﻿\n\n  <?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel/></rss>'), true);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
