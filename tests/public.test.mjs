import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { after } from "node:test";
const opened = [];
after(() => opened.forEach((w) => w.close()));

const html = readFileSync(new URL("../site/index.html", import.meta.url), "utf8")
  .replace('<script src="config.js"></script>', '<script>window.COCKFIGHT_CONFIG={SITE_ID:"cockfight",SUPABASE_URL:"https://x.supabase.co",SUPABASE_ANON_KEY:"k"}</script>');
const future = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function load(data, fail) {
  const calls = [];
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://cockfightpodcast.com/", beforeParse(w) {
    w.matchMedia = () => ({ matches: false }); w.scrollTo = () => {};
    w.fetch = async (u, o = {}) => {
      calls.push((o.method || "GET") + " " + u.split("/rest/v1/")[1]);
      const t = u.split("/rest/v1/")[1].split("?")[0];
      if (fail && fail.includes(t)) return { ok: false, status: 400, text: async () => JSON.stringify({ message: "column site_id does not exist" }) };
      if (o.method === "POST") return { ok: true, status: 201, text: async () => (t === "threads" ? JSON.stringify([{ id: "th1" }]) : "") };
      return { ok: true, status: 200, text: async () => JSON.stringify(data[t] || []) };
    };
  } });
  opened.push(dom.window);
  await new Promise((r) => setTimeout(r, 120));
  return { w: dom.window, d: dom.window.document, calls };
}

const base = {
  sites: [{ id: "cockfight", features: { shows: true, podcast: true, videos: true, merch: true, forum: false } }],
  hosts: [{ id: "colum", name: "Colum Tyrrell", sort: 0 }, { id: "lev", name: "Lev Fer", sort: 1 }, { id: "cockfight-new1", name: "Guest Star", title: "Comedian", sort: 3 }],
  shows: [
    { host: "lev", date: future(10), time: "7:00 PM", city: "Boston, MA", venue: "Laugh Boston", url: "https://t/1", status: "sold_out" },
    { host: "lev", date: future(11), time: "9:30 PM", city: "Boston, MA", venue: "Laugh Boston", url: "https://t/2", status: "few_left", note: "18+" }],
  episodes: [{ num: 92, title: "Big Night Out", posted: "2026-10-29" }, { num: 91, title: "Hidden one", posted: "2026-10-22", hidden: true }],
  videos: [{ youtube_id: "AAAAAAAAAAA", title: "Crowd work", published: "2026-10-20", featured: false }, { youtube_id: "BBBBBBBBBBB", title: "Best of", published: "2026-10-01", featured: true }],
  merch: [{ name: "Rooster Tee", price: "$30", url: "https://store/tee" }],
  settings: []
};

test("reads only this site's content and respects section switches", async () => {
  const { d, calls } = await load(base);
  assert.ok(calls.filter((c) => /^GET (episodes|shows|hosts|settings|videos|merch)/.test(c)).every((c) => c.includes("site_id=eq.cockfight")), calls.join("\n"));
  const navs = [...d.querySelectorAll(".nav .btn")].filter((b) => !b.hidden).map((b) => b.textContent.trim());
  assert.ok(navs.includes("Videos") && navs.includes("Merch") && !navs.includes("Forums"), navs.join(","));
  assert.equal(d.querySelectorAll("#dishes .dish").length, 1);
  assert.match(d.querySelector("#v-lev").textContent, /SOLD OUT/);
  assert.match(d.querySelector("#v-lev").textContent, /FEW LEFT!/);
  assert.match(d.querySelector("#v-lev").textContent, /18\+/);
  assert.ok(d.getElementById("v-cockfight-new1"), "a person added in the admin gets their own page");
  const vids = [...d.querySelectorAll("#videoGrid .vcard span")].map((x) => x.textContent);
  assert.deepEqual(vids, ["⭐ Best of", "Crowd work"]);
  assert.match(d.getElementById("merchGrid").textContent, /Rooster Tee/);
});

test("forum posts carry the site", async () => {
  const data = { ...base, sites: [{ id: "cockfight", features: { forum: true } }] };
  const { w, d, calls } = await load(data);
  d.getElementById("enter").click(); await new Promise((r) => setTimeout(r, 1000));
  d.querySelector('.nav [data-view="forum"]').click(); await new Promise((r) => setTimeout(r, 120));
  [...d.querySelectorAll("#fBody button")].find((b) => /New Topic/.test(b.textContent)).click();
  d.getElementById("ntName").value = "Fan"; d.getElementById("ntTitle").value = "Hi"; d.getElementById("ntBody").value = "yo";
  d.getElementById("ntForm").dispatchEvent(new w.Event("submit", { cancelable: true })); await new Promise((r) => setTimeout(r, 120));
  assert.ok(calls.some((c) => c.startsWith("GET threads") && c.includes("site_id=eq.cockfight")));
  assert.ok(calls.filter((c) => c.startsWith("POST")).length === 2);
});

test("before the database upgrade runs, the site keeps its built-in content", async () => {
  const { d } = await load(base, ["episodes", "shows", "hosts", "settings"]);
  assert.equal(d.querySelectorAll("#dishes .dish").length, 47);
  assert.match(d.getElementById("liveNote").textContent, /Showing saved dates/);
});
