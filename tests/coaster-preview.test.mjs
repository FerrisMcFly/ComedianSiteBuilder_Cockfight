// comictable.com/<comic> link previews: the Coaster page with that comic's name, bio and photo in <head>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import handler, { withPreview } from "../netlify/functions/coaster.mjs";
const page = readFileSync(new URL("../platform/home/coaster.html", import.meta.url), "utf8");

const fake = (comics, ok = true) => async (u) => String(u).endsWith("/coaster.html") ? { text: async () => page }
  : { ok, json: async () => comics };

test("a shared Coaster link shows the comic's name, bio and photo", async () => {
  const r = await handler(new Request("https://comictable.com/lev-fer"), { fetch: fake([{ id: "lev-fer", name: "Lev Fer", short_bio: "Funny & <loud>.", photo_url: "https://p/lev.jpg" }]) });
  const h = await r.text();
  assert.equal(r.status, 200);
  assert.match(h, /<title>Lev Fer · ComicTable<\/title>/);
  assert.match(h, /<meta property="og:title" content="Lev Fer">/);
  assert.match(h, /<meta property="og:description" content="Funny &amp; &lt;loud&gt;\.">/);
  assert.match(h, /<meta property="og:image" content="https:\/\/p\/lev\.jpg">/);
  assert.match(h, /<link rel="canonical" href="https:\/\/comictable\.com\/lev-fer">/);
});

test("no photo: the ComicTable preview image; unknown name: 404; database down: the page still loads", async () => {
  assert.match(withPreview(page, { id: "x", name: "X" }, "https://comictable.com"), /og:image" content="https:\/\/comictable\.com\/brand\/og-image\.png"/);
  assert.equal((await handler(new Request("https://comictable.com/nobody"), { fetch: fake([]) })).status, 404);
  const down = await handler(new Request("https://comictable.com/lev-fer"), { fetch: fake([], false) });
  assert.equal(down.status, 200);
  assert.doesNotMatch(await down.text(), /og:title/);
});
