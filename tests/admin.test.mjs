import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { after } from "node:test";
const opened = [];
after(() => opened.forEach((w) => w.close()));

const html = readFileSync(new URL("../site/admin.html", import.meta.url), "utf8")
  .replace(/<script src="https:\/\/cdn[^>]*><\/script>/, "").replace('<script src="config.js"></script>', '<script>window.COCKFIGHT_CONFIG={SUPABASE_URL:"https://x.supabase.co",SUPABASE_ANON_KEY:"k"}</script>');

function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
const now = new Date();
const nextFri = (() => { const d = new Date(now); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); return d; })();
const fri = iso(nextFri), sat = iso(new Date(nextFri.getFullYear(), nextFri.getMonth(), nextFri.getDate() + 1));

function makeDb() {
  const db = {
    sites: [{ id: "cockfight", name: "Cockfight", domain: "cockfightpodcast.com", features: { shows: true, podcast: true, videos: true, merch: true, forum: true, chat: false } }],
    admins: [{ user_id: "u1", site_id: "cockfight" }], platform_admins: [{ user_id: "u1" }],
    hosts: [{ id: "colum", site_id: "cockfight", name: "Colum Tyrrell", sort: 0 }, { id: "lev", site_id: "cockfight", name: "Lev Fer", sort: 1 }, { id: "tristan", site_id: "cockfight", name: "Tristan Bowling", sort: 2 }],
    shows: [{ id: "s0", site_id: "cockfight", host: "lev", date: "2026-01-02", time: "7:00 PM", venue: "Laugh Boston", city: "Boston, MA", venue_id: "v1", url: "https://t/0", status: "on_sale" }],
    episodes: [{ id: "e1", site_id: "cockfight", num: 91, title: "Marathon Chainsaw", posted: "2026-10-22" }],
    videos: [], merch: [], sources: [], settings: [], threads: [], posts: [],
    venues: [{ id: "v1", name: "Laugh Boston", city: "Boston", state: "MA", status: "approved" }, { id: "v2", name: "Comedy Works Downtown", city: "Denver", state: "CO", status: "approved" }]
  };
  let n = 0;
  const from = (t) => {
    const f = []; let op = "select", payload, single = false;
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; }, single() { single = true; return b; },
      eq(k, v) { f.push((r) => r[k] === v); return b; }, lt(k, v) { f.push((r) => r[k] < v); return b; }, in(k, vs) { f.push((r) => vs.includes(r[k])); return b; },
      insert(r) { op = "insert"; payload = [].concat(r).map((x) => ({ id: "n" + (++n), ...x })); return b; },
      update(r) { op = "update"; payload = r; return b; }, upsert(r) { op = "upsert"; payload = r; return b; }, delete() { op = "delete"; return b; },
      then(res, rej) {
        const rows = db[t];
        let data = null;
        if (op === "insert") { rows.push(...payload); data = single ? payload[0] : payload; }
        else if (op === "update") rows.filter((r) => f.every((fn) => fn(r))).forEach((r) => Object.assign(r, payload));
        else if (op === "delete") db[t] = rows.filter((r) => !f.every((fn) => fn(r)));
        else if (op === "upsert") [].concat(payload).forEach((p) => { const i = rows.findIndex((r) => r.site_id === p.site_id && r.key === p.key); i >= 0 ? (rows[i] = p) : rows.push(p); });
        else data = rows.filter((r) => f.every((fn) => fn(r)));
        return Promise.resolve({ data: data ? JSON.parse(JSON.stringify(data)) : data, error: null }).then(res, rej);
      } };
    return b;
  };
  const client = { auth: { getSession: async () => ({ data: { session: { access_token: "tok", user: { id: "u1", email: "ferris@x.com" } } } }), signOut: async () => {}, onAuthStateChange() {} },
    rpc: async (name, args) => name === "venue_slots" && args.v === "v1" ? { data: [{ dow: 5, show_time: "7:30 PM", uses: 3 }, { dow: 5, show_time: "10:00 PM", uses: 2 }], error: null } : { data: [], error: null },
    from, storage: { from: () => ({}) } };
  return { db, client };
}

async function open(hash = "", prep) {
  const { db, client } = makeDb();
  if (prep) prep(db);
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://cockfightpodcast.com/admin.html" + hash, beforeParse(w) {
    w.supabase = { createClient: () => client }; w.matchMedia = () => ({ matches: true }); w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
  } });
  opened.push(dom.window);
  await new Promise((r) => setTimeout(r, 80));
  return { w: dom.window, d: dom.window.document, db };
}
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const btn = (d, re, scope = d) => [...scope.querySelectorAll("button")].find((b) => re.test(b.textContent));
const set = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };

test("home shows a greeting, stats and to-dos", async () => {
  const { d } = await open();
  assert.match(d.querySelector("h1").textContent, /ferris/);
  assert.equal(d.querySelectorAll(".nav-btn").length, 9); // every section except chat (not built yet)
  assert.match(d.body.textContent, /Connect your podcast/);
});

test("adding a weekend run: club search, calendar, learned times, pasted links", async () => {
  const { w, d, db } = await open("#shows");
  btn(d, /^Lev Fer$/).click(); await wait();
  const search = d.getElementById("clubSearch");
  set(w, search, "laugh bos"); await wait();
  const opts = [...d.querySelectorAll(".combo-item")].map((o) => o.textContent);
  assert.match(opts[0], /Laugh Boston/); assert.match(opts.at(-1), /Add “laugh bos” as a new club/);
  d.querySelector(".combo-item").click(); await wait(60);
  assert.match(d.querySelector(".picked").textContent, /Laugh Boston/);
  d.querySelector(`.day[data-date="${fri}"]`).click(); await wait();
  d.querySelector(`.day[data-date="${sat}"]`).click(); await wait();
  const times = [...d.querySelectorAll(".slot input[type=time]")].map((i) => i.value);
  assert.deepEqual(times, ["19:30", "22:00", "19:00", "21:30"]); // Fri learned from this club, Sat typical
  set(w, d.getElementById("pasteLinks"), "https://t/a\nhttps://t/b\nhttps://t/c\nhttps://t/d\nhttps://t/e");
  btn(d, /^Fill in links$/).click(); await wait();
  assert.match(d.getElementById("toast").textContent, /1 extra link was left over/);
  const save = btn(d, /^Add 4 shows for Lev$/); assert.ok(save);
  save.click(); await wait(80);
  const added = db.shows.filter((s) => s.id !== "s0");
  assert.equal(added.length, 4);
  assert.deepEqual(added.map((s) => [s.date, s.time, s.url]), [[fri, "7:30 PM", "https://t/a"], [fri, "10:00 PM", "https://t/b"], [sat, "7:00 PM", "https://t/c"], [sat, "9:30 PM", "https://t/d"]]);
  assert.ok(added.every((s) => s.venue_id === "v1" && s.city === "Boston, MA" && s.host === "lev" && s.site_id === "cockfight"));
  assert.match(d.getElementById("toast").textContent, /4 shows live for Lev at Laugh Boston/);
  assert.equal(d.querySelectorAll("tbody tr:not(.month)").length, 4);
});

test("a new club can be added on the spot", async () => {
  const { w, d, db } = await open("#shows");
  set(w, d.getElementById("clubSearch"), "Big Room Austin"); await wait();
  btn(d, /as a new club/).click(); await wait();
  set(w, d.getElementById("ncCity"), "Austin"); set(w, d.getElementById("ncState"), "tx");
  btn(d, /^Save club$/).click(); await wait(60);
  const v = db.venues.find((x) => x.name === "Big Room Austin");
  assert.equal(v.state, "TX"); assert.equal(v.status, "approved"); // platform admin
  assert.match(d.querySelector(".picked").textContent, /Big Room Austin/);
});

test("pasted showtimes text fills days and times", async () => {
  const { w, d } = await open("#shows");
  const parse = w.__parseShowtimes;
  const y = now.getFullYear() + 1;
  const r = parse(`Fri Jan 8, ${y} — 7:00 PM, 9:30 PM\nSat Jan 9, ${y}\n6pm & 8:30pm\n1/10/${String(y).slice(2)} 7`);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), [{ date: `${y}-01-08`, times: ["19:00", "21:30"] }, { date: `${y}-01-09`, times: ["18:00", "20:30"] }, { date: `${y}-01-10`, times: [] }]);
});

test("status change, edit, delete and undo on the list", async () => {
  const { w, d, db } = await open("#shows", (db) => db.shows.push({ id: "s9", site_id: "cockfight", host: "colum", date: sat, time: "8:00 PM", venue: "Comedy Works Downtown", city: "Denver, CO", venue_id: "v2", url: null, status: "on_sale" }));
  const row = [...d.querySelectorAll("tbody tr")].find((tr) => /Comedy Works/.test(tr.textContent));
  const sel = row.querySelector("select.status"); sel.value = "sold_out"; sel.dispatchEvent(new w.Event("change")); await wait();
  assert.equal(db.shows.find((s) => s.id === "s9").status, "sold_out");
  btn(d, /^Delete$/, row).click(); await wait();
  assert.ok(!db.shows.find((s) => s.id === "s9"));
  d.querySelector("#toast button").click(); await wait(60);
  assert.ok(db.shows.find((s) => s.venue === "Comedy Works Downtown"));
});

test("episodes, videos, merch, settings all render", async () => {
  const { w, d, db } = await open("#podcast");
  assert.match(d.body.textContent, /Connect your podcast/);
  assert.equal(d.querySelector("details form input[type=number]").value, "92");
  w.location.hash = "videos"; await wait(); assert.match(d.body.textContent, /Connect your YouTube channel/);
  w.location.hash = "merch"; await wait(); assert.match(d.body.textContent, /Nothing for sale yet/);
  w.location.hash = "settings"; await wait();
  const merchSwitch = d.querySelector('input[aria-label="Merch"]'); merchSwitch.checked = false; merchSwitch.dispatchEvent(new w.Event("change")); await wait(40);
  assert.equal(db.sites[0].features.merch, false);
  assert.ok(![...d.querySelectorAll(".nav-btn")].some((b) => /Merch/.test(b.textContent)));
  w.location.hash = "announce"; await wait();
  d.querySelector("main textarea").value = "NEW EP!"; d.querySelector("main form").dispatchEvent(new w.Event("submit", { cancelable: true })); await wait();
  assert.deepEqual(JSON.parse(JSON.stringify(db.settings[0])), { site_id: "cockfight", key: "marquee", value: "NEW EP!" });
});
