// The link-preview card (what Discord, iMessage and others show) comes from the comic's Profile.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { previewInfo, fillPreview } from "../netlify/edge-functions/link-preview.js";

const page = readFileSync(new URL("../sites/lev-fer/index.html", import.meta.url), "utf8");
const site = { name: "Lev Fer", profile: { tagline: "Stand-up comedy · New York City", about: "Test bio line.\nMore." } };

test("by default the card uses the tagline, About and the person's photo", () => {
  const out = fillPreview(page, previewInfo(site, { photo_url: "https://p/lev.jpg" }));
  assert.match(out, /<title>Lev Fer · Stand-up comedy · New York City<\/title>/);
  assert.match(out, /og:description" content="Stand-up comedy · New York City\. Test bio line\."/);
  assert.match(out, /og:image" content="https:\/\/p\/lev\.jpg"/);
});

test("what the comic types in Profile → Link preview wins", () => {
  const info = previewInfo({ ...site, profile: { ...site.profile, share_title: "LEV FER LIVE", share_text: "Tickets & clips <here>", share_image: "https://p/card.jpg" } }, { photo_url: "https://p/lev.jpg" });
  const out = fillPreview(page, info);
  assert.match(out, /og:title" content="LEV FER LIVE"/);
  assert.match(out, /og:description" content="Tickets &amp; clips &lt;here&gt;"/);
  assert.match(out, /og:image" content="https:\/\/p\/card\.jpg"/);
});

test("no picture means no empty image tag, and pages that don't opt in are untouched", () => {
  assert.doesNotMatch(fillPreview(page, previewInfo(site, {})), /og:image/);
  const plain = "<title>Cockfight</title><meta name=\"description\" content=\"x\">";
  assert.equal(fillPreview(plain, previewInfo(site, {})), plain);
});
