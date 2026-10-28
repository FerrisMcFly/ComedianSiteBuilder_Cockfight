// comictable.com's front page reads which sites to show off from the database.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const opened = [];
after(() => opened.forEach((w) => w.close()));
const html = readFileSync(new URL("../platform/home/index.html", import.meta.url), "utf8")
  .replace('<script src="config.js"></script>', '<script>window.COMICTABLE_CONFIG={SUPABASE_URL:"https://x.supabase.co",SUPABASE_ANON_KEY:"k"}</script>');

async function load(data) {
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://comictable.com/", beforeParse(w) {
    w.matchMedia = () => ({ matches: true }); delete w.IntersectionObserver;
    w.fetch = async (u) => { const t = u.split("/rest/v1/")[1].split("?")[0]; if (data === "down") throw new Error("offline"); return { ok: true, status: 200, json: async () => data[t] || [] }; };
  } });
  opened.push(dom.window);
  await new Promise((r) => setTimeout(r, 80));
  return dom.window.document;
}

test("'See a site running on it' and the Running on ComicTable list follow the dashboard setting", async () => {
  const d = await load({ platform_settings: [{ featured_site: "lev-fer", showcase: [{ site: "lev-fer", blurb: "Stand-up." }, { site: "nodomain", blurb: "x" }, { site: "cockfight", blurb: "A comedy podcast." }] }],
    sites: [{ id: "lev-fer", name: "Lev Fer", domain: "levfer.gay" }, { id: "cockfight", name: "Cockfight", domain: "cockfightpodcast.com" }, { id: "nodomain", name: "No Address" }] });
  assert.equal(d.getElementById("seeOne").href, "https://levfer.gay/");
  const items = [...d.querySelectorAll("#liveList a")];
  assert.deepEqual(items.map((a) => a.querySelector("b").textContent), ["Lev Fer", "Cockfight"], "sites without a web address are skipped");
  assert.match(items[0].textContent, /Stand-up\. levfer\.gay/);
});

test("if the setting can't load, the page keeps Cockfight", async () => {
  const d = await load("down");
  assert.equal(d.getElementById("seeOne").href, "https://cockfightpodcast.com/");
  assert.match(d.getElementById("liveList").textContent, /Cockfight/);
});
