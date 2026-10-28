// The QR-code sign-up page (platform/home/join.html): one screen, email + city, optional "where did we meet".
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const opened = [];
after(() => opened.forEach((w) => w.close()));
const sdk = readFileSync(new URL("../platform/sdk/csb.js", import.meta.url), "utf8");
const page = (cfg) => readFileSync(new URL("../platform/home/join.html", import.meta.url), "utf8")
  .replace('<script src="/config.js"></script>', "<script>window.COMICTABLE_CONFIG=" + JSON.stringify(cfg) + "</script>")
  .replace('<script src="/sdk/csb.js"></script>', () => "<script>" + sdk.replace(/<\/script/g, "<\\/script") + "</script>");
const SHOW = "11111111-2222-3333-4444-555555555555";
const data = { sites: [{ name: "Lev Fer", domain: "levfer.gay", features: { fans: true }, theme: { accent: "#123456" }, profile: {} }],
  hosts: [{ name: "Lev Fer", title: "Comedian", photo_url: "https://p/lev.jpg" }],
  shows: [{ venue: "St Louis Funny Bone", city: "St. Louis, MO", date: "2026-11-19" }],
  places: [{ id: 7, name: "St. Louis", state: "MO", country: "US", population: 300000 }] };
async function open(url, cfg, d = data) {
  const posts = [], gets = [];
  const dom = new JSDOM(page(cfg), { runScripts: "dangerously", url, beforeParse(w) {
    w.fetch = async (u, o = {}) => { const t = u.split("/rest/v1/")[1].split("?")[0];
      if (o.method === "POST") { posts.push([t, JSON.parse(o.body)]); return { ok: true, status: 200, text: async () => JSON.stringify("joined") }; }
      gets.push(u); return { ok: true, status: 200, text: async () => JSON.stringify(d[t] || []) }; };
  } });
  opened.push(dom.window); await new Promise((r) => setTimeout(r, 80));
  return { w: dom.window, d: dom.window.document, posts, gets };
}
const db = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "k" };

test("on a comic's own domain: their photo, name and color; a show's code fills in where you met", async () => {
  const { d } = await open("https://levfer.gay/join?show=" + SHOW, { ...db, SITE_ID: "lev-fer" });
  assert.equal(d.getElementById("name").textContent, "Lev Fer");
  assert.equal(d.getElementById("photo").getAttribute("src"), "https://p/lev.jpg");
  assert.equal(d.documentElement.style.getPropertyValue("--accent"), "#123456");
  assert.match(d.getElementById("headline").textContent, /Lev's in your town/);
  assert.match(d.getElementById("lede").textContent, /Thanks for coming out to St Louis Funny Bone/);
  assert.equal(d.getElementById("met").value, "St Louis Funny Bone · Nov 19");
});

test("on comictable.com/join/<site>, and sign-up sends where you met and that it came from a QR code", async () => {
  const { w, d, posts, gets } = await open("https://comictable.com/join/lev-fer", { ...db, PLATFORM: true });
  assert.ok(gets.some((u) => u.includes("sites?") && u.includes("id=eq.lev-fer")));
  d.getElementById("email").value = "fan@x.com";
  const city = d.getElementById("city"); city.value = "st l"; city.dispatchEvent(new w.Event("input"));
  await new Promise((r) => setTimeout(r, 300));
  d.querySelector("#places button").click();
  d.getElementById("met").value = "The airport";
  d.getElementById("form").dispatchEvent(new w.Event("submit", { cancelable: true })); await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(posts.find((p) => p[0] === "rpc/join_fans")[1], { p_site: "lev-fer", p_email: "fan@x.com", p_place: 7, p_radius: 50, p_met: "The airport", p_source: "qr" });
  assert.ok(!d.getElementById("done").hidden);
  assert.match(d.getElementById("doneLine").textContent, /when Lev Fer plays near St\. Louis, MO/);
});

test("where you met is optional, and a site with the fan list off says so", async () => {
  let { w, d, posts } = await open("https://levfer.gay/join", { ...db, SITE_ID: "lev-fer" });
  d.getElementById("email").value = "fan@x.com";
  const city = d.getElementById("city"); city.value = "st l"; city.dispatchEvent(new w.Event("input"));
  await new Promise((r) => setTimeout(r, 300)); d.querySelector("#places button").click();
  d.getElementById("form").dispatchEvent(new w.Event("submit", { cancelable: true })); await new Promise((r) => setTimeout(r, 50));
  assert.ok(!("p_met" in posts.find((p) => p[0] === "rpc/join_fans")[1]));
  ({ d } = await open("https://levfer.gay/join", { ...db, SITE_ID: "lev-fer" }, { ...data, sites: [{ ...data.sites[0], features: {} }] }));
  assert.match(d.body.textContent, /isn't taking sign-ups right now/);
});
