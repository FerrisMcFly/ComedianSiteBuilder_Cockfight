import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JSDOM } from "jsdom";
const opened = [];
after(() => opened.forEach((w) => w.close()));

const out = mkdtempSync(join(tmpdir(), "ct-embed-"));
execFileSync("node", ["tools/build.mjs", "platform"], { env: { ...process.env, OUT_DIR: out } });
const embed = readFileSync(join(out, "embed.js"), "utf8");
const future = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };  // local date, like the sites use

test("someone's own website shows their live shows, episodes and a fan sign-up from one snippet", async () => {
  const calls = [];
  const page = `<!doctype html><html><body><h1>My Squarespace site</h1>
    <div id="a" data-comictable="shows"></div><div id="b" data-comictable="episodes" data-limit="1"></div><div id="c" data-comictable="fans"></div>
    <script data-site="lev-fer" data-accent="#ff3b6b">${embed.replace(/<\/script/g, "<\\/script")}</script></body></html>`;
  const dom = new JSDOM(page, { runScripts: "dangerously", url: "https://levs-own-site.example/", beforeParse(w) {
    w.fetch = async (u, o = {}) => {
      const t = u.split("/rest/v1/")[1].split("?")[0]; calls.push(t);
      const data = {
        sites: [{ id: "lev-fer", name: "Lev Fer", features: { shows: true, fans: true } }],
        hosts: [{ id: "lev-fer-lev", name: "Lev Fer" }],
        "rpc/site_shows": [{ id: "s", host: "lev-fer-lev", date: future(4), time: "9:30 PM", venue: "Comedy Cellar", city: "New York, NY", url: "https://t/s", status: "on_sale" }],
        episodes: [{ num: 3, title: "Third", posted: "2026-10-20" }, { num: 2, title: "Second", posted: "2026-10-13" }]
      };
      return { ok: true, status: 200, text: async () => JSON.stringify(data[t] || []) };
    };
  } });
  opened.push(dom.window);
  await new Promise((r) => setTimeout(r, 150));
  const d = dom.window.document;
  assert.match(d.getElementById("a").textContent, /Comedy Cellar.*Tickets/);
  assert.equal(d.querySelector("#a a.ct-btn").href, "https://t/s");
  assert.match(d.getElementById("b").textContent, /3\. Third/);
  assert.doesNotMatch(d.getElementById("b").textContent, /Second/);
  assert.ok(d.querySelector("#c form"), "fan sign-up shows when the fan list is on");
  assert.match(d.getElementById("a").textContent, /Powered by ComicTable/);
  assert.ok(calls.every((c) => c), "talks to the database directly");
});
