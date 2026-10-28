import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { after } from "node:test";
const opened = [];
after(() => opened.forEach((w) => w.close()));

const html = readFileSync(new URL("../platform/admin.html", import.meta.url), "utf8")
  .replace(/<script src="https:\/\/cdn[^>]*><\/script>/, "").replace('<script src="config.js"></script>', '<script>window.COMICTABLE_CONFIG={SUPABASE_URL:"https://x.supabase.co",SUPABASE_ANON_KEY:"k"}</script>')
  .replace('<script src="sdk/csb.js"></script>', () => "<script>" + readFileSync(new URL("../platform/sdk/csb.js", import.meta.url), "utf8").replace(/<\/script/g, "<\\/script") + "</script>");

function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
const now = new Date();
const nextFri = (() => { const d = new Date(now); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); return d; })();
const fri = iso(nextFri), sat = iso(new Date(nextFri.getFullYear(), nextFri.getMonth(), nextFri.getDate() + 1));

function makeDb() {
  const db = {
    sites: [{ id: "cockfight", name: "Cockfight", domain: "cockfightpodcast.com", features: { shows: true, podcast: true, videos: true, merch: true, forum: true, chat: true }, profile: {}, theme: {}, community: {} }],
    admins: [{ user_id: "u1", site_id: "cockfight" }], platform_admins: [{ user_id: "u1" }],
    hosts: [{ id: "colum", site_id: "cockfight", comic_id: "colum-tyrrell", name: "Colum Tyrrell", sort: 0 }, { id: "lev", site_id: "cockfight", comic_id: "lev-fer", name: "Lev Fer", sort: 1 },
      { id: "tristan", site_id: "cockfight", comic_id: "tristan-bowling", name: "Tristan Bowling", bio: "Shared bio", sort: 2 }],
    comics: [{ id: "colum-tyrrell", name: "Colum Tyrrell" }, { id: "lev-fer", name: "Lev Fer" }, { id: "tristan-bowling", name: "Tristan Bowling", bio: "Shared bio" }, { id: "daniel-bridge-gadd", name: "Daniel Bridge-Gadd" }],
    shows: [{ id: "s0", site_id: "cockfight", host: "lev", date: "2026-01-02", time: "7:00 PM", venue: "Laugh Boston", city: "Boston, MA", venue_id: "v1", url: "https://t/0", status: "on_sale" }],
    episodes: [{ id: "e1", site_id: "cockfight", num: 91, title: "Marathon Chainsaw", posted: "2026-10-22" }],
    videos: [], merch: [], sources: [], settings: [], threads: [], posts: [], announcements: [], links: [], bans: [], mod_log: [], chat_messages: [],
    boards: [{ site_id: "cockfight", id: "general", name: "General Discusión", sort: 0 }, { site_id: "cockfight", id: "cantina", name: "Off Topic", sort: 1 }],
    venues: [{ id: "v1", name: "Laugh Boston", city: "Boston", state: "MA", status: "approved" }, { id: "v2", name: "Comedy Works Downtown", city: "Denver", state: "CO", status: "approved" }]
  };
  let n = 0;
  const from = (t) => {
    const f = []; let op = "select", payload, single = false;
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; }, single() { single = true; return b; },
      eq(k, v) { f.push((r) => r[k] === v); return b; }, neq(k, v) { f.push((r) => r[k] !== v); return b; }, not(k, op, v) { f.push((r) => op === "is" ? (r[k] ?? null) !== v : r[k] !== v); return b; },
      ilike(k, v) { const re = new RegExp("^" + v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i"); f.push((r) => re.test(r[k] || "")); return b; },
      like(k, v) { const re = new RegExp("^" + v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$"); f.push((r) => re.test(r[k] || "")); return b; }, gte(k, v) { f.push((r) => r[k] >= v); return b; }, lt(k, v) { f.push((r) => r[k] < v); return b; }, in(k, vs) { f.push((r) => vs.includes(r[k])); return b; },
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
  const client = { auth: { getSession: async () => ({ data: { session: { access_token: "tok", user: { id: "u1", email: "ferris@x.com" } } } }), signOut: async () => {}, onAuthStateChange() {},
      updateUser: async (u) => { (db.authUpdates = db.authUpdates || []).push(u); return { data: {}, error: null }; } },
    rpc: async (name, args) => ((db.rpcCalls = db.rpcCalls || []).push([name, args]), 0) || name === "site_shows" ? { data: JSON.parse(JSON.stringify(db.shows.filter((x) => x.site_id === args.p_site))), error: null }
      : name === "site_videos" ? { data: JSON.parse(JSON.stringify(db.videos.filter((x) => x.site_id === args.p_site))), error: null }
      : name === "comic_shows" ? { data: JSON.parse(JSON.stringify(db.shows.filter((x) => x.date >= fri.slice(0, 4) + "-01-03").filter((x) => x.comic_id === args.p_comic || (x.host && (db.hosts.find((h) => h.id === x.host) || {}).comic_id === args.p_comic)).map((x) => ({ ...x, site_name: "Cockfight", event: false })))), error: null }
      : name === "fans_near_shows" ? { data: db.shows.filter((x) => x.date >= fri).map((x) => ({ show_id: x.id, fans: (db.fans || []).length })), error: null }
      : name === "fans_near_show" ? { data: JSON.parse(JSON.stringify(db.fans || [])), error: null }
      : name === "create_site" ? (db.sites.push({ id: args.p_id, name: args.p_name, domain: args.p_domain, features: {}, created_at: "2026-10-27" }), db.admins.push({ user_id: "u1", site_id: args.p_id, role: "owner" }), { data: null, error: null })
      : name === "venue_slots" && args.v === "v1" ? { data: [{ dow: 5, show_time: "7:30 PM", uses: 3 }, { dow: 5, show_time: "10:00 PM", uses: 2 }], error: null } : { data: [], error: null },
    from, storage: { from: (bucket) => ({ upload: async (path) => { (db.uploads = db.uploads || []).push(bucket + "/" + path); return { error: null }; }, remove: async (paths) => { (db.removed = db.removed || []).push(...paths); return { error: null }; }, getPublicUrl: (path) => ({ data: { publicUrl: "https://s/storage/v1/object/public/" + bucket + "/" + path } }) }) } };
  return { db, client };
}

async function open(hash = "", prep, theme = THEME_JSON) {
  const { db, client } = makeDb();
  if (prep) prep(db);
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://cockfightpodcast.com/admin.html" + hash, beforeParse(w) {
    w.supabase = { createClient: () => client }; w.fetch = async (u) => (/themes\/[^/]+\.json$/.test(u) && theme ? { ok: true, json: async () => theme } : { ok: false, json: async () => ({}) }); w.matchMedia = () => ({ matches: true }); w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
  } });
  opened.push(dom.window);
  await new Promise((r) => setTimeout(r, 80));
  return { w: dom.window, d: dom.window.document, db };
}
const THEME_JSON = JSON.parse(readFileSync(new URL("../sites/cockfight/theme.json", import.meta.url), "utf8"));
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const btn = (d, re, scope = d) => [...scope.querySelectorAll("button")].find((b) => re.test(b.textContent));
// Reordering: every list drags by its grip; the keyboard (arrow keys on the grip) does the same thing
const press = (w, el, key) => el.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true }));
const set = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };

test("home shows a greeting, stats and to-dos", async () => {
  const { d } = await open("#home");
  assert.match(d.querySelector("h1").textContent, /ferris/);
  assert.equal(d.querySelectorAll(".nav-btn").length, 15);
  assert.deepEqual([...d.querySelectorAll(".nav-group")].map((g) => g.textContent).filter(Boolean), ["Booking", "Content", "Fans", "Website"]);
  assert.equal([...d.querySelectorAll(".nav-btn")].pop().dataset.sec, "settings", "Settings sits at the bottom");
  assert.match(d.querySelector(".crumbs").textContent, /ComicTable.*Cockfight/s);
  assert.ok(d.querySelector(".back-ct"), "a way back up to ComicTable");
  assert.match(d.body.textContent, /Connect your podcast/);
});

test("adding a weekend run: club search, calendar, learned times, pasted links", async () => {
  const { w, d, db } = await open("#shows");
  d.getElementById("addShowsBtn").click(); await wait();
  const panel = () => d.getElementById("runPanel");
  assert.ok(panel(), "the add-shows panel opens");
  assert.match(panel().querySelector(".steps li.on").textContent, /Club/);
  btn(d, /^Lev Fer$/, panel()).click(); await wait();
  set(w, d.getElementById("clubSearch"), "laugh bos"); await wait();
  const opts = [...d.querySelectorAll("#clubList .combo-item")].map((o) => o.textContent);
  assert.match(opts[0], /Laugh Boston/); assert.match(opts.at(-1), /Add “laugh bos” as a new club/);
  d.querySelector("#clubList .combo-item").click(); await wait(60);
  assert.match(panel().querySelector(".steps li.on").textContent, /Dates/);
  assert.match(panel().querySelector(".run-summary").textContent, /Laugh Boston.*Boston, MA.*Lev Fer/);
  assert.equal(d.getElementById("toTimes").disabled, true);
  d.querySelector(`.day[data-date="${fri}"]`).click(); await wait();
  d.querySelector(`.day[data-date="${sat}"]`).click(); await wait();
  assert.match(d.getElementById("toTimes").textContent, /4 shows/);
  d.getElementById("toTimes").click(); await wait();
  const times = [...panel().querySelectorAll(".slot input[type=time]")].map((i) => i.value);
  assert.deepEqual(times, ["19:30", "22:00", "19:00", "21:30"]); // Fri learned from this club, Sat typical
  d.getElementById("openPaste").click(); await wait();
  set(w, d.getElementById("pasteLinks"), "https://t/a\nhttps://t/b\nhttps://t/c\nhttps://t/d\nhttps://t/e");
  btn(d, /^Fill in links$/).click(); await wait();
  assert.match(d.getElementById("toast").textContent, /1 extra link was left over/);
  assert.equal(d.getElementById("saveRun").textContent, "Add 4 shows");
  d.getElementById("saveRun").click(); await wait(80);
  const added = db.shows.filter((s) => s.id !== "s0");
  assert.equal(added.length, 4);
  assert.deepEqual(added.map((s) => [s.date, s.time, s.url]), [[fri, "7:30 PM", "https://t/a"], [fri, "10:00 PM", "https://t/b"], [sat, "7:00 PM", "https://t/c"], [sat, "9:30 PM", "https://t/d"]]);
  assert.ok(added.every((s) => s.venue_id === "v1" && s.city === "Boston, MA" && s.host === "lev" && s.site_id === "cockfight"));
  assert.match(d.getElementById("toast").textContent, /4 shows live for Lev at Laugh Boston/);
  assert.equal(panel(), null, "the panel closes after saving");
  assert.equal(d.querySelectorAll("tbody tr:not(.month)").length, 4);
});

test("one pasted link is used for every show", async () => {
  const { w, d, db } = await open("#shows");
  d.getElementById("addShowsBtn").click(); await wait();
  set(w, d.getElementById("clubSearch"), "comedy works"); await wait();
  d.querySelector("#clubList .combo-item").click(); await wait(60);
  d.querySelector(`.day[data-date="${fri}"]`).click(); await wait();
  d.getElementById("toTimes").click(); await wait();
  d.getElementById("openPaste").click(); await wait();
  set(w, d.getElementById("pasteLinks"), "https://club/all-shows");
  btn(d, /^Fill in links$/).click(); await wait();
  d.getElementById("saveRun").click(); await wait(80);
  const added = db.shows.filter((s) => s.venue_id === "v2");
  assert.equal(added.length, 2); assert.ok(added.every((s) => s.url === "https://club/all-shows"));
});

test("a new club can be added on the spot", async () => {
  const { w, d, db } = await open("#shows");
  d.getElementById("addShowsBtn").click(); await wait();
  set(w, d.getElementById("clubSearch"), "Big Room Austin"); await wait();
  btn(d, /as a new club/).click(); await wait();
  set(w, d.getElementById("ncCity"), "Austin"); set(w, d.getElementById("ncState"), "tx");
  btn(d, /^Save club$/).click(); await wait(60);
  const v = db.venues.find((x) => x.name === "Big Room Austin");
  assert.equal(v.state, "TX"); assert.equal(v.status, "approved"); assert.equal(v.verified, false); assert.equal(v.created_by_site, "cockfight");
  assert.match(d.querySelector(".run-summary").textContent, /Big Room Austin/);
});

test("adding a club that's already listed suggests the existing one", async () => {
  const { w, d, db } = await open("#shows");
  d.getElementById("addShowsBtn").click(); await wait();
  set(w, d.getElementById("clubSearch"), "Comedy Works Downtown Denver CO"); await wait();
  btn(d, /as a new club/).click(); await wait();
  set(w, d.getElementById("ncName"), "comedy works downtown"); set(w, d.getElementById("ncCity"), "Denver");
  btn(d, /^Save club$/).click(); await wait();
  assert.match(d.body.textContent, /Did you mean one of these\?/);
  btn(d, /Comedy Works Downtown · Denver, CO/).click(); await wait(40);
  assert.match(d.querySelector(".run-summary").textContent, /Comedy Works Downtown/);
  assert.equal(db.venues.length, 2);
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

test("duplicate copies everything and moves the time; edit can change the club", async () => {
  const { w, d, db } = await open("#shows", (db) => db.shows.push({ id: "s7", site_id: "cockfight", host: "lev", date: sat, time: "7:00 PM", venue: "Laugh Boston", city: "Boston, MA", venue_id: "v1", url: "https://t/7", status: "few_left", note: "18+" }));
  let row = [...d.querySelectorAll("tbody tr")].find((tr) => /7:00 PM/.test(tr.textContent) && /Laugh Boston/.test(tr.textContent));
  btn(d, /^Duplicate/, row).click(); await wait();
  const copy = d.querySelector("tr.editing");
  assert.equal(copy.querySelector('input[type=time]').value, "21:00");
  assert.equal(copy.querySelector('input[type=date]').value, sat);
  btn(d, /^Add show$/, copy).click(); await wait(60);
  const made = db.shows.filter((s) => s.date === sat && s.venue === "Laugh Boston");
  assert.deepEqual(made.map((s) => s.time).sort(), ["7:00 PM", "9:00 PM"]);
  const c = made.find((s) => s.time === "9:00 PM");
  assert.equal(c.host, "lev"); assert.equal(c.venue_id, "v1"); assert.equal(c.city, "Boston, MA"); assert.equal(c.status, "few_left"); assert.equal(c.note, "18+"); assert.equal(c.url, "https://t/7"); assert.equal(c.site_id, "cockfight");
  // edit: move the late show to another club
  row = [...d.querySelectorAll("tbody tr")].find((tr) => /9:00 PM/.test(tr.textContent));
  btn(d, /^Edit$/, row).click(); await wait();
  btn(d, /^Change club$/).click(); await wait();
  set(w, d.getElementById("editClubSearch"), "comedy works"); await wait();
  d.querySelector("#editClubList .combo-item").click(); await wait();
  btn(d, /^Save$/, d.querySelector("tr.editing")).click(); await wait(60);
  const moved = db.shows.find((s) => s.time === "9:00 PM" && s.date === sat);
  assert.equal(moved.venue, "Comedy Works Downtown"); assert.equal(moved.city, "Denver, CO"); assert.equal(moved.venue_id, "v2");
});

test("episodes, videos, merch, settings all render", async () => {
  const { w, d, db } = await open("#podcast");
  assert.match(d.body.textContent, /Connect your podcast/);
  assert.equal(d.querySelector("details form input[type=number]").value, "92");
  w.location.hash = "videos"; await wait(); assert.match(d.body.textContent, /Connect your YouTube channel/);
  w.location.hash = "merch"; await wait(); assert.match(d.body.textContent, /Nothing for sale yet/);
  w.location.hash = "theme"; await wait();
  const merchSwitch = d.querySelector('input[aria-label="Merch"]'); merchSwitch.checked = false; merchSwitch.dispatchEvent(new w.Event("change")); await wait(40);
  assert.equal(db.sites[0].features.merch, false);
  assert.ok(![...d.querySelectorAll(".nav-btn")].some((b) => /Merch/.test(b.textContent)));
  w.location.hash = "announce"; await wait(60);
  set(w, d.querySelector('main input[aria-label="Announcement"]'), "NEW EP!"); d.querySelector('main input[type=checkbox]').checked = true;
  d.querySelector("main form").dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(60);
  assert.equal(db.announcements[0].text, "NEW EP!"); assert.equal(db.announcements[0].pinned, true); assert.equal(db.announcements[0].site_id, "cockfight");
});

test("profile and theme settings save to the site", async () => {
  const { w, d, db } = await open("#profile");
  set(w, d.querySelector("main input"), "The funniest podcast"); d.querySelector("main form").dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(40);
  assert.equal(db.sites[0].profile.tagline, "The funniest podcast");
  w.location.hash = "theme"; await wait(80);
  assert.match(d.querySelector("h1").textContent, /^Design$/); assert.match(d.querySelector(".page-head .sub").textContent, /90s Cantina/);
  const splash = d.querySelector('input[aria-label="Rooster splash screen"]'); splash.checked = false;
  d.querySelector('select[aria-label="Scrolling banner speed"]').value = "fast";
  d.querySelector("main form").dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(40);
  assert.equal(db.sites[0].theme.splash, false); assert.equal(db.sites[0].theme.banner_speed, "fast"); assert.equal(db.sites[0].theme.music, true);
});

test("forum: pin, lock, move, ban, boards", async () => {
  const { w, d, db } = await open("#forum", (db) => {
    db.threads.push({ id: "t1", site_id: "cockfight", board: "general", title: "Hello", author: "Troll", created_at: 1, last_at: 2, replies: 0, pinned: false, locked: false });
    db.posts.push({ id: "p1", site_id: "cockfight", thread_id: "t1", author: "Troll", body: "spam", created_at: 1, device: "dev-9" });
  });
  await wait(60);
  btn(d, /^Pin$/).click(); await wait(40);
  assert.equal(db.threads[0].pinned, true);
  btn(d, /^Lock$/).click(); await wait(40);
  assert.equal(db.threads[0].locked, true);
  const move = d.querySelector('select[aria-label="Move to board"]'); move.value = "cantina"; move.dispatchEvent(new w.Event("change")); await wait(40);
  assert.equal(db.threads[0].board, "cantina");
  btn(d, /^Posts$/).click(); await wait(60);
  btn(d, /^Ban$/).click(); await wait(20);
  d.querySelector(".newclub input[type=checkbox]").checked = true;
  btn(d, /^Ban$/, d.querySelector(".newclub")).click(); await wait(40);
  assert.equal(db.bans[0].author, "Troll"); assert.equal(db.bans[0].device, "dev-9"); assert.ok(db.bans[0].until);
  assert.ok(db.mod_log.some((l) => l.action === "ban"));
  // boards tab: add one
  btn(d, /^Boards$/).click(); await wait(40);
  set(w, d.querySelector('input[aria-label="New board name"]'), "Merch Talk");
  btn(d, /^Add board$/).click(); await wait(60);
  assert.ok(db.boards.some((b) => b.id === "merch-talk" && b.name === "Merch Talk" && b.sort === 2));
});

test("moderation saves house rules; chat can be closed", async () => {
  const { w, d, db } = await open("#moderation");
  await wait(40);
  d.querySelector('textarea[aria-label="Banned words"]').value = "badword\n  spam  \nbadword";
  d.querySelector("main form").dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(40);
  assert.deepEqual(JSON.parse(JSON.stringify(db.sites[0].community.banned_words)), ["badword", "spam"]);
  w.location.hash = "chat"; await wait(80);
  const openBox = d.querySelector('input[aria-label="Chat open"]'); openBox.checked = false; openBox.dispatchEvent(new w.Event("change")); await wait(40);
  assert.equal(db.sites[0].community.chat_open, false);
  set(w, d.querySelector('input[aria-label="Message"]'), "Hello fans"); d.querySelector("main form.btns").dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(40);
  assert.equal(db.chat_messages[0].is_mod, true); assert.equal(db.chat_messages[0].author, "Colum Tyrrell");
});

test("each person's card is their Coaster: it says Save Coaster, not the person's name", async () => {
  const { d } = await open("#people");
  const labels = [...d.querySelectorAll(".people form button[type=submit]")].map((b) => b.textContent);
  assert.deepEqual([...new Set(labels)], ["Save Coaster"]);
});

test("several YouTube channels, each with an owner", async () => {
  const { w, d, db } = await open("#videos");
  w.fetch = async () => ({ ok: true, json: async () => ({ results: [] }) });
  set(w, d.getElementById("youtubeSrc"), "https://www.youtube.com/@cockfightpod");
  btn(d, /^Connect$/).click(); await wait(80);
  set(w, d.getElementById("youtubeSrc"), "https://www.youtube.com/@LevFerOfficial");
  d.getElementById("youtubeOwner").value = "lev";
  btn(d, /^Connect$/).click(); await wait(80);
  assert.deepEqual(db.sources.map((x) => [x.url, x.host]), [["https://www.youtube.com/@cockfightpod", null], ["https://www.youtube.com/@LevFerOfficial", "lev"]]);
  assert.match(d.body.textContent, /Add another channel/);
  assert.ok(btn(d, /^Check all now$/));
  // the same link twice is refused
  set(w, d.getElementById("youtubeSrc"), "https://www.youtube.com/@LevFerOfficial/");
  btn(d, /^Connect$/).click(); await wait(40);
  assert.match(d.body.textContent, /already connected/);
  assert.equal(db.sources.length, 2);
});

test("people: add, hide, remove", async () => {
  const { w, d, db } = await open("#people");
  btn(d, /^\+ Add a person$/).click(); await wait();
  set(w, d.getElementById("newPersonName"), "Sam Guest"); await wait(60);
  d.getElementById("createPerson").click(); await wait(80);
  const sam = db.hosts.find((x) => x.name === "Sam Guest");
  assert.ok(sam); assert.equal(sam.site_id, "cockfight"); assert.equal(sam.sort, 3); assert.match(sam.id, /^cockfight-sam/);
  assert.equal(sam.comic_id, "sam-guest"); assert.ok(db.comics.find((c) => c.id === "sam-guest"), "a new person is a new comic on ComicTable");
  let card = [...d.querySelectorAll(".people form")].find((f) => /Sam Guest/.test(f.textContent));
  btn(d, /^Hide from site$/, card).click(); await wait(60);
  assert.equal(db.hosts.find((x) => x.name === "Sam Guest").hidden, true);
  card = [...d.querySelectorAll(".people form")].find((f) => /Sam Guest/.test(f.textContent));
  btn(d, /^Remove…$/, card).click(); await wait();
  btn(d, /^Yes, remove$/).click(); await wait(60);
  assert.ok(!db.hosts.find((x) => x.name === "Sam Guest"));
});

test("team section explains when it isn't set up yet", async () => {
  const { d } = await open("#settings");
  await wait(80);
  assert.match(d.body.textContent, /Team management isn't set up yet/);
});

test("site extras only appear when the site's front end uses them", async () => {
  const { d } = await open("#home", null, null);
  const labels = [...d.querySelectorAll(".nav-btn")].map((b) => b.textContent);
  assert.ok(!labels.some((l) => /Announcements|Links|Home screen/.test(l)), labels.join(","));
  assert.ok(labels.some((l) => /About & contact/.test(l)) && labels.some((l) => /Settings/.test(l)) && labels.some((l) => /Press kit/.test(l)) && labels.some((l) => /Design/.test(l)), "Design is always there: it holds the site's sections");
  assert.doesNotMatch(d.querySelector("main").textContent, /Post an announcement/);
  const only = await open("#home", null, { extras: ["links"] });
  const l2 = [...only.d.querySelectorAll(".nav-btn")].map((b) => b.textContent);
  assert.ok(l2.some((l) => /Links/.test(l)) && !l2.some((l) => /Announcements|Home screen/.test(l)), l2.join(","));
});

test("videos can be removed, undone, and put back", async () => {
  const { w, d, db } = await open("#videos", (db) => {
    db.videos.push({ id: "v1", site_id: "cockfight", youtube_id: "AAAAAAAAAAA", title: "Keep me", published: "2026-10-20", hidden: false },
                   { id: "v2", site_id: "cockfight", youtube_id: "BBBBBBBBBBB", title: "Bad clip", published: "2026-10-21", hidden: false });
  });
  await wait(40);
  const cardOf = (t) => [...d.querySelectorAll(".vid")].find((c) => c.textContent.includes(t));
  btn(d, /^Remove$/, cardOf("Bad clip")).click(); await wait(40);
  assert.equal(db.videos.find((v) => v.id === "v2").hidden, true);
  assert.ok(!cardOf("Bad clip"), "removed videos leave the list");
  d.querySelector("#toast button").click(); await wait(40);
  assert.equal(db.videos.find((v) => v.id === "v2").hidden, false);
  btn(d, /^Remove$/, cardOf("Bad clip")).click(); await wait(40);
  btn(d, /^Removed \(1\)$/).click(); await wait(20);
  assert.ok(cardOf("Bad clip") && !cardOf("Keep me"));
  btn(d, /^Put back$/, cardOf("Bad clip")).click(); await wait(40);
  assert.equal(db.videos.find((v) => v.id === "v2").hidden, false);
});

test("platform admins can start a new comic's site and land on it ready to set up", async () => {
  const { w, d, db } = await open("#ct/sites");
  await wait(60);
  assert.match(d.querySelector("main").textContent, /Sites \(1\)/);
  assert.match(d.querySelector("main").textContent, /○ Podcast or YouTube connected/);
  set(w, d.getElementById("nsName"), "Rita Ramos");
  assert.equal(d.getElementById("nsId").value, "rita-ramos");
  set(w, d.getElementById("nsDomain"), "https://www.RitaRamosComedy.com/");
  d.getElementById("nsF_forum").checked = true;
  btn(d, /^Create site$/).click(); await wait(120);
  const site = db.sites.find((x) => x.id === "rita-ramos");
  assert.equal(site.domain, "ritaramoscomedy.com");
  assert.equal(site.features.forum, true); assert.equal(site.features.chat, false);
  assert.equal(d.querySelector(".brand").textContent, "Rita Ramos");
  assert.equal(w.location.hash, "#people");
  assert.ok(d.getElementById("sitePick"), "site switcher appears once you have two sites");
});

test("people who aren't platform admins never see All sites", async () => {
  const { d } = await open("", (db) => { db.platform_admins = []; });
  assert.ok(![...d.querySelectorAll(".nav-btn")].some((b) => /All sites/.test(b.textContent)));
});

test("fan list: who's near each show, copy their emails, find and remove fans", async () => {
  const { w, d, db } = await open("#fans", (db) => {
    db.sites[0].features.fans = true;
    db.shows.push({ id: "s9", site_id: "cockfight", host: "lev", date: fri, time: "7:30 PM", venue: "Laugh Boston", city: "Boston, MA", venue_id: "v1", status: "on_sale" });
    db.fans = [{ id: "f1", site_id: "cockfight", email: "a@x.com", city: "Boston", state: "MA", radius_mi: 50, created_at: new Date().toISOString() },
               { id: "f2", site_id: "cockfight", email: "b@x.com", city: "Cambridge", state: "MA", radius_mi: 25, created_at: "2026-01-01T00:00:00Z" }];
  });
  let copied = null;
  Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async (t) => { copied = t; } } });
  await wait(60);
  const main = d.querySelector("main");
  assert.match(main.textContent, /2fans on your list/);
  assert.match(main.textContent, /1joined this week/);
  assert.match(main.textContent, /Laugh Boston.*2 fans nearby/);
  assert.match(main.textContent, /Boston, MA · 1/);
  btn(d, /^Copy emails$/).click(); await wait(30);
  assert.equal(copied, "a@x.com, b@x.com");
  set(w, main.querySelector("input[type=search]"), "cambridge");
  assert.ok(!/a@x\.com/.test(main.querySelector(".card:last-child").textContent));
  const rm = btn(d, /^Remove$/, main.querySelector(".card:last-child"));
  rm.click(); rm.click(); await wait(30);
  assert.deepEqual(db.fans.map((f) => f.email), ["a@x.com"]);
});

test("super admins see every site, comics only their own", async () => {
  const addRita = (db) => db.sites.push({ id: "rita", name: "Rita Ramos", features: { shows: true } });
  const sup = await open("", addRita);
  sup.d.getElementById("sitePick").click(); await wait();
  assert.deepEqual([...sup.d.querySelectorAll(".sp-item b")].map((o) => o.textContent).sort(), ["Cockfight", "Rita Ramos"]);
  const comic = await open("", (db) => { addRita(db); db.platform_admins = []; });
  assert.equal(comic.d.getElementById("sitePick"), null, "a comic on one site gets no site switcher");
  assert.equal(comic.d.querySelector(".brand").textContent, "Cockfight");
});

test("people: add someone already on ComicTable, and edit a shared profile or this site's own bio", async () => {
  const { w, d, db } = await open("#people", (db) => {
    db.sites.push({ id: "apes", name: "Modern Apes", features: {} });
    db.hosts.push({ id: "apes-daniel", site_id: "apes", comic_id: "daniel-bridge-gadd", name: "Daniel Bridge-Gadd", sort: 0 });
  });
  btn(d, /^\+ Add a person$/).click(); await wait();
  set(w, d.getElementById("newPersonName"), "dani"); await wait(80);
  assert.match(d.querySelector("main").textContent, /Daniel Bridge-Gadd.*Already on ComicTable: Modern Apes/);
  btn(d, /^Add to Cockfight$/).click(); await wait(80);
  const dan = db.hosts.find((x) => x.site_id === "cockfight" && x.comic_id === "daniel-bridge-gadd");
  assert.ok(dan, "the existing comic joins this site, no duplicate made");
  assert.equal(db.comics.filter((c) => /daniel/.test(c.id)).length, 1);

  // Tristan's card: shared bio edits the comic
  let card = () => [...d.querySelectorAll(".people form")].find((f) => /Tristan Bowling/.test(f.querySelector("b").textContent));
  card().querySelector("textarea").value = "Updated everywhere";
  card().dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(80);
  assert.equal(db.comics.find((c) => c.id === "tristan-bowling").bio, "Updated everywhere");
  // a site-only bio goes on this site's row
  const c2 = card(); c2.querySelector("textarea").value = "Cockfight-only bio";
  [...c2.querySelectorAll("label.check input")][0].checked = true;
  c2.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(80);
  const t = db.hosts.find((x) => x.id === "tristan");
  assert.equal(t.bio, "Cockfight-only bio"); assert.equal(t.own_bio, true);
  assert.equal(db.comics.find((c) => c.id === "tristan-bowling").bio, "Updated everywhere");
});

test("whole-show events, and a comic's date from another site can be hidden here only", async () => {
  const { w, d, db } = await open("#shows", (db) => {
    db.site_hidden = [];
    db.sites.push({ id: "apes", name: "Modern Apes", features: {} });
    // Tristan's date added on Modern Apes shows up in Cockfight's list (the real site_shows does this)
    db.shows.push({ id: "ma1", site_id: "cockfight", host: "tristan", comic_id: "tristan-bowling", date: fri, time: "8:00 PM", venue: "Zanies", city: "Chicago, IL", status: "on_sale" });
  });
  const ma = db.shows.find((s) => s.id === "ma1"); ma.site_id = "apes"; // shown here, added there
  d.getElementById("addShowsBtn").click(); await wait();
  const panel = () => d.getElementById("runPanel");
  btn(d, /Whole show/, panel()).click(); await wait();
  set(w, d.getElementById("clubSearch"), "laugh bos"); await wait();
  d.querySelector("#clubList .combo-item").click(); await wait(60);
  d.querySelector(`.day[data-date="${sat}"]`).click(); await wait();
  d.getElementById("toTimes").click(); await wait();
  d.getElementById("saveRun").click(); await wait(80);
  const ev = db.shows.filter((s) => s.date === sat && s.venue === "Laugh Boston");
  assert.ok(ev.length >= 1);
  assert.ok(ev.every((s) => s.host === null && JSON.stringify(s.lineup) === JSON.stringify(["colum-tyrrell", "lev-fer", "tristan-bowling"])), JSON.stringify(ev));
  assert.match(d.getElementById("toast").textContent, /live for Cockfight at Laugh Boston/);
});

test("show finder: watch a page for someone, then add or ignore what it found", async () => {
  const { w, d, db } = await open("#shows", (db) => {
    db.found_shows = [{ id: "f1", site_id: "cockfight", comic_id: "lev-fer", key: "a", date: fri, time: "8:00 PM", venue: "Zanies", city: "Chicago, IL", url: "https://t/z", status: "on_sale", state: "new" },
                      { id: "f2", site_id: "cockfight", comic_id: "lev-fer", key: "b", date: sat, time: "8:00 PM", venue: "Zanies", city: "Chicago, IL", state: "new" }];
  });
  let posted = null;
  w.fetch = async (u, o) => { posted = JSON.parse(o.body); return { ok: true, json: async () => ({ results: [{ ok: true, status: "0 new to check" }] }) }; };
  await wait(60);
  const main = d.querySelector("main");
  assert.match(main.textContent, /Found 2 new shows/);
  // add one: it becomes Lev's show on this site
  const row = [...main.querySelectorAll(".switch-row")].find((r) => r.textContent.includes(shortDay(fri)));
  btn(d, /^Add$/, row).click(); await wait(80);
  const added = db.shows.find((s) => s.venue === "Zanies");
  assert.ok(added); assert.equal(added.host, "lev"); assert.equal(added.url, "https://t/z");
  assert.equal(db.found_shows.find((f) => f.id === "f1").state, "added");
  btn(d, /^Ignore$/).click(); await wait(60);
  assert.equal(db.found_shows.find((f) => f.id === "f2").state, "ignored");

  // start watching a page for Tristan, asking first
  d.getElementById("finderWho").value = "tristan";
  set(w, d.getElementById("finderUrl"), "https://club.example/calendar");
  d.getElementById("finderAdd").click(); await wait(80);
  const src = db.sources.find((x) => x.kind === "shows");
  assert.deepEqual([src.url, src.host, src.comic_id, src.auto_add, src.match_all], ["https://club.example/calendar", "tristan", "tristan-bowling", false, false]);
  assert.equal(posted.kind, "shows");
});
function shortDay(iso) { const d = new Date(iso + "T12:00:00"); return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()] + " " + d.getDate(); }

test("a comic with their own login gets Coaster and Dates in the sidebar: one Coaster, all their dates", async () => {
  const { w, d, db } = await open("#ct/me", (db) => {
    db.comics.find((c) => c.id === "lev-fer").user_id = "u1";
    db.sites.push({ id: "lev-fer", name: "Lev Fer", domain: "levfer.com", features: { shows: true } });
    db.hosts.push({ id: "lev-fer-lev", site_id: "lev-fer", comic_id: "lev-fer", name: "Lev Fer", sort: 0 });
    db.shows.push({ id: "s5", site_id: "lev-fer", host: "lev-fer-lev", comic_id: "lev-fer", date: fri, time: "9:00 PM", venue: "Comedy Cellar", city: "New York, NY", url: "https://t/cc" });
  });
  await wait(80);
  const nav = [...d.querySelectorAll(".nav-btn")].map((b) => b.textContent.trim());
  assert.ok(nav.some((t) => /Coaster$/.test(t)) && nav.some((t) => /Dates$/.test(t)), nav.join(" | "));
  let main = d.querySelector("main");
  assert.match(main.querySelector("h1").textContent, /Coaster/);
  // editing here edits the comic, not one site's copy
  const card = main.querySelector("form.card");
  card.querySelector("textarea").value = "Lev's own words";
  card.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(80);
  assert.equal(db.comics.find((c) => c.id === "lev-fer").bio, "Lev's own words");
  w.location.hash = "#ct/dates"; await wait(100);
  main = d.querySelector("main");
  assert.match(main.textContent, /Upcoming \(1\).*Comedy Cellar/s);
  // nobody without a comic login sees Coaster or Dates
  const other = await open("");
  assert.ok(![...other.d.querySelectorAll(".nav-btn")].some((b) => /Dates$/.test(b.textContent.trim())));
});

test("a Coaster with no site: the comic logs in, lands on their Coaster, and adds a date right there", async () => {
  const { w, d, db } = await open("", (db) => {
    db.platform_admins = []; db.admins = [];
    db.comics.push({ id: "solo-sam", handle: "solo-sam", name: "Solo Sam", user_id: "u1", look: "classic", coaster: {} });
  });
  await wait(100);
  assert.equal(w.location.hash, "#ct/me");
  assert.ok(d.querySelector("main form.card .looks"), "their Coaster, ready to edit");
  assert.ok(![...d.querySelectorAll(".nav-btn")].some((b) => /Your sites/.test(b.textContent)), "no sites, no Your sites");
  w.location.hash = "#ct/dates"; await wait(100);
  btn(d, /Add a date/).click(); await wait();
  const f = d.querySelector("main form.newclub");
  set(w, f.querySelector('input[aria-label="Club"]'), "Comedy Cellar");
  set(w, f.querySelector('input[aria-label="Date"]'), fri);
  set(w, f.querySelector('input[aria-label="Time"]'), "21:30");
  f.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(80);
  const added = db.shows.find((x) => x.comic_id === "solo-sam");
  assert.deepEqual([added.site_id, added.venue, added.time, added.date], [null, "Comedy Cellar", "9:30 PM", fri]);
});

test("people: give a comic their own login", async () => {
  const { w, d } = await open("#people");
  let sent = null;
  w.fetch = async (u, o) => { sent = JSON.parse(o.body); return { ok: true, json: async () => ({ ok: true }) }; };
  const card = [...d.querySelectorAll(".people form")].find((f) => /Lev Fer/.test(f.querySelector("b").textContent));
  btn(d, /Give Lev a login/, card).click(); await wait();
  const inputs = card.querySelectorAll(".newclub input");
  set(w, inputs[0], "lev"); set(w, inputs[1], "supersecret"); inputs[2].checked = true;
  btn(d, /^Create login$/, card).click(); await wait(60);
  assert.deepEqual([sent.action, sent.comic_id, sent.email, sent.role], ["link_comic", "lev-fer", "lev@comictable.com", "owner"]);
});

test("blog: write a draft, publish it, see it in the list", async () => {
  const { w, d, db } = await open("#blog", (db) => { db.sites[0].features.blog = true; db.blog_posts = []; });
  await wait(60);
  assert.match(d.querySelector("main").textContent, /No posts yet/);
  d.getElementById("newPost").click(); await wait(30);
  set(w, d.getElementById("postTitle"), "Road Story: Key West!");
  assert.equal(d.getElementById("postSlug").value, "road-story-key-west");
  d.getElementById("postBody").value = "It was **hot**.";
  d.getElementById("saveDraft").click(); await wait(60);
  assert.equal(db.blog_posts.length, 1); assert.equal(db.blog_posts[0].published, false);
  assert.match(d.querySelector("main").textContent, /Road Story: Key West!.*Draft/);
  btn(d, /^Edit$/).click(); await wait(30);
  d.getElementById("publishPost").click(); await wait(60);
  assert.equal(db.blog_posts[0].published, true);
  assert.equal(db.blog_posts[0].body, "It was **hot**.");
});

test("site finder: with 50 sites, type a few letters and press Enter; recent sites come first", async () => {
  const { w, d } = await open("#home", (db) => {
    for (let i = 1; i <= 50; i++) db.sites.push({ id: "comic-" + i, name: "Comic Number " + i, domain: "comic" + i + ".com", features: { shows: true } });
    db.sites.push({ id: "lev-fer", name: "Lev Fer", domain: "levfer.com", features: { shows: true } });
  });
  assert.match(d.querySelector(".kbd-btn").textContent, /Switch site/);
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })); await wait();
  const input = d.getElementById("sitePickerSearch");
  assert.ok(input, "⌘K opens the finder");
  assert.match(d.querySelector(".sp-group").textContent, /All sites \(52\)/);
  set(w, input, "lev"); await wait();
  assert.deepEqual([...d.querySelectorAll(".sp-item b")].map((b) => b.textContent), ["Lev Fer"]);
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await wait(120);
  assert.equal(d.querySelector(".site-pick .brand").textContent, "Lev Fer");
  // next time, Lev is under Recent... well, he's open now; switch back and check
  d.getElementById("sitePick").click(); await wait();
  set(w, d.getElementById("sitePickerSearch"), "levfer.com"); await wait();
  assert.equal(d.querySelectorAll(".sp-item").length, 1, "web addresses match too");
  d.getElementById("sitePickerSearch").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait();
  assert.equal(d.getElementById("sitePicker"), null);
  d.getElementById("sitePick").click(); await wait();
  set(w, d.getElementById("sitePickerSearch"), "cockf"); await wait();
  d.getElementById("sitePickerSearch").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await wait(120);
  d.getElementById("sitePick").click(); await wait();
  assert.equal(d.querySelector(".sp-group").textContent, "Recent");
  assert.equal(d.querySelector(".sp-item b").textContent, "Lev Fer");
});

test("your account: name, password, email, and where you have access", async () => {
  const { w, d, db } = await open("#ct/account");
  await wait(60);
  set(w, d.getElementById("acctName"), "Ferris");
  d.getElementById("acctName").form.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(60);
  assert.equal(JSON.stringify(db.authUpdates[0]), JSON.stringify({ data: { name: "Ferris" } }));
  assert.equal(d.querySelector(".acct-name").textContent, "Ferris");
  const p1 = d.getElementById("acctPass"), p2 = d.getElementById("acctPass2");
  p1.value = "newpassword1"; p2.value = "different";
  p1.form.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(30);
  assert.match(p1.form.textContent, /don't match/);
  p2.value = "newpassword1";
  p1.form.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(30);
  assert.equal(JSON.stringify(db.authUpdates.at(-1)), JSON.stringify({ password: "newpassword1" }));
  assert.match(d.querySelector("main").textContent, /ComicTable admin\..*Cockfight/s);
  assert.doesNotMatch(d.querySelector("main").textContent, /null/);
});

test("super admins land on the ComicTable overview, then open a site and come back", async () => {
  const { w, d } = await open("", (db) => { db.sites.push({ id: "lev-fer", name: "Lev Fer", domain: "levfer.gay", features: { shows: true } }); });
  await wait(80);
  assert.equal(w.location.hash, "#ct/overview");
  assert.match(d.querySelector(".ct-brand").textContent, /ComicTable/);
  assert.deepEqual([...d.querySelectorAll(".nav-btn")].map((b) => b.dataset.sec), ["overview", "sites", "comics", "clubs", "account"]);
  assert.match(d.querySelector("main").textContent, /Sites.*Cockfight.*Lev Fer/s);
  const row = [...d.querySelectorAll("main .switch-row")].find((r) => /Lev Fer/.test(r.textContent));
  btn(d, /^Open$/, row).click(); await wait(120);
  assert.equal(w.location.hash, "#home");
  assert.equal(d.querySelector(".site-pick .brand").textContent, "Lev Fer");
  d.querySelector(".back-ct").click(); w.location.hash = "#ct/overview"; await wait(80);
  assert.ok(d.querySelector(".ct-brand"));
});

test("someone on one site's team, with no comic login, goes straight to that site", async () => {
  const { w, d } = await open("", (db) => { db.platform_admins = []; });
  await wait(60);
  assert.notEqual(w.location.hash.slice(0, 4), "#ct/");
  assert.equal(d.querySelector(".back-ct"), null);
  assert.equal(d.querySelector(".brand").textContent, "Cockfight");
});

test("appearance: pick dark, light or match the computer", async () => {
  const { d } = await open("#ct/account");
  await wait(40);
  d.querySelector('[data-theme-choice="dark"]').click();
  assert.equal(d.documentElement.getAttribute("data-theme"), "dark");
  d.querySelector('[data-theme-choice="system"]').click();
  assert.equal(d.documentElement.getAttribute("data-theme"), null);
  assert.ok(d.querySelector(".nav-btn svg"), "menu uses line icons");
});

test("club database: search, edit (shows follow), merge duplicates, add", async () => {
  const { w, d, db } = await open("#ct/clubs", (db) => {
    db.venues.push({ id: "v3", name: "laugh boston", city: "boston", state: "MA", status: "approved", verified: false });
    db.shows.push({ id: "s7", site_id: "cockfight", host: "lev", date: fri, venue: "laugh boston", city: "boston, MA", venue_id: "v3" });
  });
  await wait(80);
  const main = d.querySelector("main");
  assert.match(main.textContent, /3 of 3 clubs/);
  set(w, d.getElementById("clubSearchAll"), "laugh"); await wait();
  assert.match(main.textContent, /2 of 3 clubs/);
  // edit the messy one
  const row = [...main.querySelectorAll("tbody tr")].find((r) => /laugh boston/.test(r.textContent) && /Needs a check/.test(r.textContent));
  btn(d, /^Edit$/, row).click(); await wait();
  set(w, d.getElementById("cfName"), "Laugh Boston (old)"); set(w, d.getElementById("cfCity"), "Boston");
  d.getElementById("cfName").form.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(80);
  assert.equal(db.venues.find((v) => v.id === "v3").name, "Laugh Boston (old)");
  assert.equal(db.shows.find((s) => s.id === "s7").venue, "Laugh Boston (old)", "shows at the club take the new name");
  // merge it into the real one
  const row2 = [...d.querySelectorAll("main tbody tr")].find((r) => /\(old\)/.test(r.textContent));
  btn(d, /^Edit$/, row2).click(); await wait();
  const sel = d.querySelector('select[aria-label="Merge into"]'); sel.value = "v1";
  btn(d, /^Merge$/).click(); await wait(80);
  assert.equal(db.shows.find((s) => s.id === "s7").venue_id, "v1");
  assert.ok(!db.venues.find((v) => v.id === "v3"));
  // add a new club
  d.getElementById("addClub").click(); await wait();
  set(w, d.getElementById("cfName"), "Helium"); set(w, d.getElementById("cfCity"), "Portland"); set(w, d.getElementById("cfState"), "or");
  d.getElementById("cfName").form.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(80);
  assert.ok(db.venues.find((v) => v.name === "Helium" && v.state === "OR" && v.verified));
});

test("comics: a card grid with filters; open one to add them to a site, edit, and see their dates", async () => {
  const { w, d, db } = await open("#ct/comics", (db) => { db.sites.push({ id: "apes", name: "Modern Apes", features: {} }); });
  await wait(100);
  const main = () => d.querySelector("main");
  assert.equal(main().querySelectorAll(".comic-card").length, 4);
  btn(d, /^Not on a site$/, main()).click(); await wait();
  assert.deepEqual([...main().querySelectorAll(".comic-card b")].map((b) => b.textContent), ["Daniel Bridge-Gadd"]);
  d.getElementById("addComic").click(); await wait();
  set(w, d.getElementById("newComicName"), "Sam Newcomic");
  d.getElementById("newComicName").form.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(150);
  const c = db.comics.find((x) => x.name === "Sam Newcomic");
  assert.ok(c);
  assert.match(main().textContent, /← All Coasters.*Sam Newcomic/s);
  assert.match(main().textContent, /Put them on a site first/);
  const sel = main().querySelector('select[aria-label="Add to a site"]'); sel.value = "apes";
  btn(d, /^Add$/, main()).click(); await wait(150);
  assert.ok(db.hosts.find((h) => h.site_id === "apes" && h.comic_id === c.id));
  assert.match(main().textContent, /Modern Apes/);
  const form = main().querySelector("form.card");
  form.querySelector("textarea").value = "Sam bio";
  form.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(100);
  assert.equal(db.comics.find((x) => x.id === c.id).bio, "Sam bio");
});

test("Home screen picks: add one, pin a show to the top, reorder", async () => {
  const theme = { name: "Console Lobby", extras: ["home_picks"], settings: [] };
  const { w, d, db } = await open("#picks", (db) => {
    db.home_picks = [];
    db.shows.push({ id: "s9", site_id: "cockfight", host: "lev", date: fri, time: "9:00 PM", venue: "Laugh Boston", city: "Boston, MA", url: "https://t/9", status: "on_sale" });
  }, theme);
  assert.ok([...d.querySelectorAll(".nav-btn")].some((b) => /Home screen/.test(b.textContent)));
  assert.match(d.body.textContent, /Nothing pinned yet/);
  const form = d.querySelector("form.card");
  set(w, form.querySelector('input[aria-label="Headline"]'), "New special out now");
  set(w, form.querySelector('input[aria-label="Button text"]'), "Watch");
  set(w, form.querySelector('input[aria-label="Button link"]'), "https://youtu.be/x");
  form.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(60);
  assert.deepEqual(db.home_picks.map((p) => [p.site_id, p.headline, p.button_label, p.link]), [["cockfight", "New special out now", "Watch", "https://youtu.be/x"]]);
  assert.match(d.body.textContent, /Featured.*New special out now/s);

  w.location.hash = "#shows"; await wait(80);
  const pin = btn(d, /Pin to Home screen/);
  assert.ok(pin, "upcoming shows can be pinned");
  pin.click(); await wait(60);
  const shown = db.home_picks.slice().sort((a, b) => a.sort - b.sort);
  assert.equal(shown[0].show_id, "s9", "a pinned show goes to the top");
  assert.equal(shown[0].ends_on, fri, "and comes off after the show");
  assert.match(shown[0].headline, /Laugh Boston/);

  w.location.hash = "#picks"; await wait(80);
  press(w, d.querySelector("main [data-drag] .drag-grip"), "ArrowDown"); await wait(60);
  assert.deepEqual(db.home_picks.slice().sort((a, b) => a.sort - b.sort).map((p) => p.headline)[0], "New special out now");
});

test("Design: look settings and the site's sections; home screen settings live on Home screen, not here", async () => {
  const theme = { name: "Console Lobby", extras: ["home_picks"], settings: [
    { type: "heading", label: "Home screen" },
    { key: "home", label: "Home screen sections", type: "order", options: [["me", "You", "", true], ["shows", "Next shows", "", true], ["clips", "Latest clips", "", false]] },
    { type: "heading", label: "Look" },
    { key: "menu", label: "Menu order", type: "order", options: [["shows", "Tour Dates", "", true], ["clips", "Clips", "", true]] },
    { key: "accent", label: "Highlight color", type: "color", default: "#ffb238" },
    { key: "tip_lines", label: "Your loading-screen jokes", type: "lines", default: [] }] };
  const { w, d, db } = await open("#theme", (db) => { db.home_picks = []; }, theme);
  assert.ok(![...d.querySelectorAll(".set-head h2")].some((x) => x.textContent === "Home screen"), "no home screen settings on Design");
  assert.ok(d.querySelector('input[role="switch"][aria-label="Podcast"]'), "the site's sections are switched on and off here");
  set(w, d.querySelector('textarea[aria-label="Your loading-screen jokes"]'), "One\n\n  Two  \n");
  const rows = () => [...d.querySelectorAll(".order-row")];
  assert.deepEqual(rows().map((r) => r.querySelector("b").textContent), ["Tour Dates", "Clips"]);
  press(w, rows()[1].querySelector(".drag-grip"), "ArrowUp"); await wait();
  const form = [...d.querySelectorAll("form.card")].find((f) => /Save design/.test(f.textContent));
  form.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(60);
  assert.deepEqual(JSON.parse(JSON.stringify(db.sites[0].theme.menu)).map((x) => x.key), ["clips", "shows"]);
  assert.equal(db.sites[0].theme.accent, "#ffb238");
  assert.deepEqual(JSON.parse(JSON.stringify(db.sites[0].theme.tip_lines)), ["One", "Two"]);
  assert.equal(db.sites[0].theme.home, undefined, "saving Design leaves the home screen alone");

  w.location.hash = "#picks"; await wait(80);
  const hrows = [...d.querySelectorAll(".order-row")];
  assert.deepEqual(hrows.map((r) => r.querySelector("b").textContent), ["You", "Next shows", "Latest clips"]);
  const sw = hrows[2].querySelector("input[type=checkbox]"); sw.checked = true; sw.dispatchEvent(new w.Event("change"));
  [...d.querySelectorAll("form.card")].find((f) => /Save layout/.test(f.textContent)).dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(60);
  assert.deepEqual(JSON.parse(JSON.stringify(db.sites[0].theme.home)), [{ key: "me", on: true }, { key: "shows", on: true }, { key: "clips", on: true }]);
});

test("Profile: the link preview card updates as you type and saves", async () => {
  const { w, d, db } = await open("#profile");
  const card = () => d.querySelector(".share-card").textContent;
  set(w, d.querySelectorAll("input")[0], "Stand-up comedy");
  assert.match(card(), /Cockfight · Stand-up comedy/);
  const title = [...d.querySelectorAll(".field")].find((x) => x.textContent.startsWith("Title")).querySelector("input");
  set(w, title, "COCKFIGHT LIVE");
  assert.match(card(), /COCKFIGHT LIVE/);
  d.querySelector("form.card").dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(60);
  assert.equal(db.sites[0].profile.share_title, "COCKFIGHT LIVE");
});

test("Design: every podcast the site's comics are on, each with its own switch", async () => {
  const { w, d, db } = await open("#theme", (db) => {
    db.episodes[0].show_name = "Cockfight";
    db.sites.push({ id: "modern-apes", name: "The Modern Apes Podcast", domain: "modernapes.com", features: { podcast: true } });
    db.hosts.push({ id: "ma-tristan", site_id: "modern-apes", comic_id: "tristan-bowling", name: "Tristan Bowling", sort: 0 });
  });
  await wait(120);
  const card = [...d.querySelectorAll(".card")].find((c) => /Podcasts on your site/.test(c.textContent));
  assert.match(card.textContent, /Cockfight.*Connected to this site.*The Modern Apes Podcast.*On ComicTable at modernapes\.com/s);
  const sw = card.querySelector('[aria-label="Show The Modern Apes Podcast on this site"]');
  sw.checked = false; sw.dispatchEvent(new w.Event("change")); await wait(60);
  assert.deepEqual(JSON.parse(JSON.stringify(db.sites[0].profile.podcasts_off)), ["the modern apes podcast"]);
});

test("Home screen picks: a YouTube link plays on the home screen and can use the video's thumbnail; videos pin to Home", async () => {
  const theme = { name: "Console Lobby", extras: ["home_picks"], settings: [] };
  const { w, d, db } = await open("#picks", (db) => {
    db.home_picks = [];
    db.videos = [{ id: "v1", site_id: "cockfight", youtube_id: "abcdefghijk", title: "Crowd work in Boston", url: "https://www.youtube.com/watch?v=abcdefghijk", thumbnail_url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg", published: "2026-10-01", hidden: false }];
  }, theme);
  const form = d.querySelector("form.card");
  set(w, form.querySelector('input[aria-label="Headline"]'), "New special");
  set(w, form.querySelector('input[aria-label="Button link"]'), "https://youtu.be/abcdefghijk");
  assert.match(form.textContent, /will play right on your home screen/);
  btn(d, /Use the video's thumbnail/).click(); await wait(20);
  form.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(60);
  assert.equal(db.home_picks[0].image_url, "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");

  w.location.hash = "#videos"; await wait(80);
  btn(d, /^Pin to Home$/).click(); await wait(60);
  const top = db.home_picks.slice().sort((a, b) => a.sort - b.sort)[0];
  assert.deepEqual([top.kind, top.headline, top.link, top.image_url], ["video", "Crowd work in Boston", "https://www.youtube.com/watch?v=abcdefghijk", "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"]);
});

test("press kit: per comic, with bios, credits, booking contact, approved photos and a link for clubs", async () => {
  const { w, d, db } = await open("#press", (db) => {
    db.press_photos = [
      { id: "ph1", comic_id: "colum-tyrrell", url: "https://s/storage/v1/object/public/press/colum-tyrrell/1.jpg", web_url: "https://s/storage/v1/object/public/press/colum-tyrrell/1-web.jpg", is_primary: true, sort: 0, width: 3000, height: 4000 },
      { id: "ph2", comic_id: "colum-tyrrell", url: "https://s/storage/v1/object/public/press/colum-tyrrell/2.jpg", is_primary: false, sort: 1 }];
    db.comics.find((c) => c.id === "colum-tyrrell").bio = "Colum is from Ireland and does crowd work at every show he can find.";
  });
  await wait(80);
  assert.match(d.querySelector("h1").textContent, /Press kit/);
  assert.ok(d.querySelector(".seg"), "a site with several comics picks whose kit to edit");
  assert.match(d.querySelector(".press-link").textContent, /comictable\.com\/press\/colum-tyrrell$/);
  assert.equal(d.querySelectorAll(".press-tile").length, 2);
  assert.ok(d.querySelector(".press-tile.primary"));
  btn(d, /Start from profile bio/).click();
  set(w, d.querySelector('input[aria-label="Booking contact"]'), "book@colum.example");
  set(w, d.querySelector('textarea[aria-label="Credits"]'), "Comedy Central\nJFL New Faces");
  d.querySelector('textarea[aria-label="Short bio"]').form.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(80);
  const c = db.comics.find((x) => x.id === "colum-tyrrell");
  assert.equal(c.booking_contact, "book@colum.example");
  assert.equal(c.credits, "Comedy Central\nJFL New Faces");
  assert.match(c.short_bio, /^Colum is from Ireland/);
  btn(d, /^Make primary$/).click(); await wait(80);
  assert.deepEqual(db.press_photos.filter((p) => p.is_primary).map((p) => p.id), ["ph2"], "one primary at a time");
  btn(d, /^Remove$/).click(); await wait(80);
  assert.equal(db.press_photos.length, 1);
  assert.ok((db.removed || []).length, "the files are deleted too");
  assert.ok(db.press_photos[0].is_primary, "there's always a primary photo left");
});

test("fan list: a sign-up QR code for the site and for each show, and where fans met you", async () => {
  const { w, d } = await open("#fans", (db) => {
    db.sites[0].features.fans = true;
    db.shows.push({ id: "s9", site_id: "cockfight", host: "lev", date: fri, time: "7:30 PM", venue: "Laugh Boston", city: "Boston, MA", venue_id: "v1", status: "on_sale" });
    db.fans = [{ id: "f1", site_id: "cockfight", email: "a@x.com", city: "Boston", state: "MA", radius_mi: 50, met_at: "Merch table, Boston", source: "qr", created_at: new Date().toISOString() }];
  });
  await wait(60);
  const main = d.querySelector("main");
  assert.match(main.textContent, /Sign-up QR code.*https:\/\/cockfightpodcast\.com\/join/s);
  btn(d, /^QR for this show$/).click(); await wait();
  assert.match(main.querySelector(".qr-inline").textContent, /cockfightpodcast\.com\/join\?show=s9/);
  assert.match(main.textContent, /a@x\.com\s*QR.*Met at: Merch table, Boston/s);
  set(w, main.querySelector("input[type=search]"), "merch");
  assert.match(main.querySelector(".card:last-child").textContent, /a@x\.com/);
});

test("Home screen page: every item on its own row (each link, each social, each podcast), in any order, each with a switch", async () => {
  const theme = { name: "Console Lobby", extras: ["home_picks"], settings: [{ key: "home_items", label: "Home screen", type: "home_items" }] };
  const { w, d, db } = await open("#picks", (db) => {
    db.home_picks = [];
    db.sites[0].features.fans = true;
    db.links = [{ id: "l1", site_id: "cockfight", label: "Merch", url: "https://shop.test", sort: 0 }];
    Object.assign(db.hosts[0], { photo_url: "https://p/c.jpg", instagram: "https://instagram.com/c", youtube: "https://youtube.com/@c" });
    db.episodes[0].show_name = "Cockfight";
    db.sites[0].features.podcast = true;
  }, theme);
  await wait(120);
  const form = [...d.querySelectorAll("form.card")].find((f) => /Save layout/.test(f.textContent));
  const labels = () => [...form.querySelectorAll(".order-row b")].map((b) => b.textContent);
  assert.deepEqual(labels(), ["You", "Merch", "Instagram", "YouTube", "Cockfight", "Mailing list"]);
  form.querySelector('[aria-label="Move YouTube to the top"]').click(); await wait();
  const sw = form.querySelector('[aria-label="Show Instagram"]'); sw.checked = false; sw.dispatchEvent(new w.Event("change")); await wait();
  form.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(60);
  const saved = JSON.parse(JSON.stringify(db.sites[0].theme.home_items));
  assert.deepEqual(saved.map((x) => x.key), ["social:youtube", "me", "link:l1", "social:instagram", "podcast:cockfight", "list"]);
  assert.equal(saved.find((x) => x.key === "social:instagram").on, false);
});

test("profile: more social platforms, saved to the comic so every site gets them; Home screen jumps straight to them", async () => {
  const theme = { name: "Console Lobby", extras: ["home_picks", "links"], settings: [{ key: "home_items", label: "Home screen", type: "home_items" }] };
  const { w, d, db } = await open("#picks", (db) => {
    db.home_picks = [];
    db.hosts.forEach((x) => { x.socials = {}; }); db.comics.forEach((c) => { c.socials = {}; });
  }, theme);
  await wait(80);
  btn(d, /Edit your socials/).click(); await wait(120);
  const det = d.querySelector('details[data-socials="colum"]');
  assert.ok(det && det.open, "opens the first person's Social links");
  for (const name of ["Threads", "Bluesky", "Twitch", "Spotify", "Cameo"]) assert.ok(det.querySelector(`input[aria-label="${name}"]`), name);
  set(w, det.querySelector('input[aria-label="Threads"]'), "https://www.threads.net/@colum");
  det.closest("form").dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(80);
  const c = db.comics.find((x) => x.id === "colum-tyrrell");
  assert.deepEqual(JSON.parse(JSON.stringify(c.socials)), { threads: "https://www.threads.net/@colum" });
});

test("All sites: super admins choose what comictable.com shows off", async () => {
  const { w, d, db } = await open("#ct/sites", (db) => {
    db.sites.find((x) => x.id === "cockfight").domain = "cockfightpodcast.com";
    db.sites.push({ id: "lev-fer", name: "Lev Fer", domain: "levfer.gay", features: {}, created_at: "2026-10-28" });
    db.platform_settings = [{ id: 1, featured_site: "cockfight", showcase: [{ site: "cockfight", blurb: "A comedy podcast." }] }];
  });
  await wait(80);
  assert.match(d.body.textContent, /On comictable\.com/);
  const sel = d.getElementById("scFeatured");
  assert.equal(sel.value, "cockfight");
  sel.value = "lev-fer";
  d.querySelector('input[aria-label="List Lev Fer"]').checked = true;
  set(w, d.querySelector('input[aria-label="Line about Lev Fer"]'), "Stand-up from New York.");
  btn(d, /^Save$/).click(); await wait(60);
  assert.equal(db.platform_settings[0].featured_site, "lev-fer");
  assert.equal(JSON.stringify(db.platform_settings[0].showcase), JSON.stringify([{ site: "cockfight", blurb: "A comedy podcast." }, { site: "lev-fer", blurb: "Stand-up from New York." }]));
});

test("roles: a shows-only login sees just Shows, a moderator just the forum and chat", async () => {
  const booker = await open("#home", (db) => { db.platform_admins = []; db.admins = [{ user_id: "u1", site_id: "cockfight", role: "shows" }]; db.sites.find((x) => x.id === "cockfight").features = { ...db.sites.find((x) => x.id === "cockfight").features, forum: true, chat: true }; });
  assert.deepEqual([...booker.d.querySelectorAll(".nav-btn")].map((b) => b.dataset.sec), ["shows"]);
  assert.match(booker.d.querySelector("h1").textContent, /Shows/, "they land on Shows");
  const mod = await open("#home", (db) => { db.platform_admins = []; db.admins = [{ user_id: "u1", site_id: "cockfight", role: "moderator" }]; db.sites.find((x) => x.id === "cockfight").features = { ...db.sites.find((x) => x.id === "cockfight").features, forum: true, chat: true }; });
  assert.deepEqual([...mod.d.querySelectorAll(".nav-btn")].map((b) => b.dataset.sec), ["forum", "chat", "moderation"]);
});

test("roles: ComicTable staff work on every site but can't create sites, change the front page or manage staff", async () => {
  const { d } = await open("#ct/sites", (db) => { db.platform_admins = [{ user_id: "u1", role: "staff" }]; });
  await wait(80);
  assert.doesNotMatch(d.querySelector("main").textContent, /Start a new site|On comictable\.com/);
  assert.match(d.querySelector("main").textContent, /ComicTable staff/);
  assert.equal(d.getElementById("stEmail"), null, "no Add to staff form");
});

test("Coasters: pick a look, set the Tape, choose what's up front and what's under More", async () => {
  const { w, d, db } = await open("#ct/comics", (db) => {
    Object.assign(db.comics.find((c) => c.id === "lev-fer"), { look: "classic", tape_url: null, tape_title: null, on_bills: true, coaster: {} });
  });
  await wait(80);
  [...d.querySelectorAll(".comic-card")].find((b) => /Lev Fer/.test(b.textContent)).click(); await wait(120);
  const card = d.querySelector("main form.card");
  assert.ok(card.querySelector(".looks"), "the comic's card is their Coaster");
  assert.match(card.textContent, /comictable\.com\/lev-fer/);
  btn(d, /Spooky/, card).click();
  assert.equal(card.querySelector('.looks [aria-pressed="true"]').dataset.look, "spooky");
  set(w, card.querySelector('input[aria-label="Tape link"]'), "https://youtu.be/abcdefghijk");
  set(w, card.querySelector('input[aria-label="Tape title"]'), "Live at the Cellar");
  btn(d, /^Up front$/, card.querySelector('[aria-label="The Tape"]')).click();
  btn(d, /^Off$/, card.querySelector('[aria-label="Booking"]')).click();
  card.querySelector('input[aria-label="Show who else is on the bill"]').checked = false;
  card.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(60);
  const lev = db.comics.find((c) => c.id === "lev-fer");
  assert.deepEqual([lev.look, lev.tape_url, lev.tape_title, lev.on_bills, lev.coaster.tape, lev.coaster.booking, lev.coaster.socials], ["spooky", "https://youtu.be/abcdefghijk", "Live at the Cellar", false, "front", "off", "front"]);
  // a bad Tape link doesn't save
  set(w, card.querySelector('input[aria-label="Tape link"]'), "youtube.com/whatever");
  card.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(40);
  assert.match(card.textContent, /starts with https/);
  assert.equal(db.comics.find((c) => c.id === "lev-fer").tape_url, "https://youtu.be/abcdefghijk");
});

test("Coasters: a site asks before adding a comic with their own login, and the comic says yes on Me", async () => {
  // a site owner (not ComicTable) finds Daniel, who has his own login: Ask to add, not Add
  const site = await open("#people", (db) => { db.platform_admins = []; db.admins = [{ user_id: "u1", site_id: "cockfight", role: "owner" }];
    db.comics.find((c) => c.id === "daniel-bridge-gadd").user_id = "u9"; db.coaster_requests = []; });
  await wait(60);
  btn(site.d, /Add a person/).click(); await wait();
  set(site.w, site.d.getElementById("newPersonName"), "Daniel"); await wait(80);
  const ask = btn(site.d, /^Ask to add$/);
  assert.ok(ask, "Ask to add, because he has a login");
  assert.match(site.d.body.textContent, /say yes first/);
  ask.click(); await wait(60);
  assert.deepEqual(site.db.coaster_requests.map((r) => [r.comic_id, r.site_id, r.requested_by]), [["daniel-bridge-gadd", "cockfight", "u1"]]);
  assert.ok(!site.db.hosts.some((h) => h.comic_id === "daniel-bridge-gadd"), "not added until he says yes");
  // Daniel sees it on Me
  const me = await open("#ct/me", (db) => { Object.assign(db.comics.find((c) => c.id === "daniel-bridge-gadd"), { user_id: "u1", look: "classic", coaster: {} }); db.platform_admins = [];
    db.coaster_requests = [{ id: "r1", comic_id: "daniel-bridge-gadd", site_id: "cockfight", status: "pending", created_at: "2026-10-28" }]; });
  await wait(120);
  assert.match(me.d.querySelector("main").textContent, /A site wants to add you.*Cockfight/s);
  assert.ok(me.d.querySelector("main form.card .looks"), "and his own Coaster to edit");
  btn(me.d, /^Say yes$/).click(); await wait(60);
  assert.deepEqual(JSON.parse(JSON.stringify(me.db.rpcCalls.find((c) => c[0] === "answer_coaster_request"))), ["answer_coaster_request", { p_id: "r1", p_yes: true }]);
});

test("Coasters: a lineup card says whose Coaster it uses, and can keep a photo just for this site", async () => {
  const { w, d, db } = await open("#people", (db) => {
    db.hosts.forEach((h) => Object.assign(h, { own_bio: false, own_title: false, own_photo: false }));
    db.hosts.find((h) => h.id === "colum").own_bio = true;
  });
  await wait(60);
  const cards = [...d.querySelectorAll(".people form.card")];
  const colum = cards.find((c) => /Colum/.test(c.textContent)), lev = cards.find((c) => /Lev Fer/.test(c.textContent));
  assert.match(colum.textContent, /Custom for Cockfight: bio/);
  assert.match(lev.textContent, /Using Lev's Coaster/);
  const photoBox = [...lev.querySelectorAll("label.check")].find((l) => /different photo/.test(l.textContent)).querySelector("input");
  photoBox.checked = true;
  db.hosts.find((h) => h.id === "lev").photo_url = "https://p/lev-cockfight.jpg";
  lev.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(120);
  const host = db.hosts.find((h) => h.id === "lev");
  assert.equal(host.own_photo, true, lev.querySelector(".err") && lev.querySelector(".err").textContent);
  assert.equal(host.photo_url, "https://p/lev-cockfight.jpg", "this site keeps its photo");
  assert.ok(!db.comics.find((c) => c.id === "lev-fer").photo_url, "his Coaster photo isn't touched");
});

test("Coasters: Custom colors for comics on a site; Pro is ComicTable's switch", async () => {
  const { w, d, db } = await open("#ct/comics", (db) => {
    db.comics.forEach((c) => Object.assign(c, { look: "classic", on_bills: true, coaster: {}, pro: false }));
  });
  await wait(80);
  // Daniel isn't on a site: Custom is locked
  [...d.querySelectorAll(".comic-card")].find((b) => /Daniel/.test(b.textContent)).click(); await wait(120);
  let card = d.querySelector("main form.card");
  assert.ok(card.querySelector('[data-look="custom"]').disabled);
  assert.match(card.textContent, /come with a site/);
  // ComicTable admin switches Pro on: unlocked
  const pro = card.querySelector('input[aria-label="Pro"]'); pro.checked = true; pro.dispatchEvent(new w.Event("change")); await wait(40);
  assert.equal(db.comics.find((c) => c.id === "daniel-bridge-gadd").pro, true);
  assert.ok(!card.querySelector('[data-look="custom"]').disabled);
  // Lev is on Cockfight: Custom with his own colors and a full-color photo
  btn(d, /All Coasters/).click(); await wait(80);
  [...d.querySelectorAll(".comic-card")].find((b) => /Lev Fer/.test(b.textContent)).click(); await wait(120);
  card = d.querySelector("main form.card");
  card.querySelector('[data-look="custom"]').click();
  assert.ok(!card.querySelector(".custom-look").hidden);
  set(w, card.querySelector('input[aria-label="Board color"]'), "#101010");
  btn(d, /^Full color$/, card).click();
  card.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(60);
  const lev = db.comics.find((c) => c.id === "lev-fer");
  assert.equal(lev.look, "custom");
  assert.deepEqual(JSON.parse(JSON.stringify(lev.coaster.style)), { pulp: "#101010", ink: "#1F1F1F", band: "#C4452E", photo: "color" });
  assert.equal(lev.coaster.next, "front", "what's-on-it choices are kept alongside");
});

test("Lineup: each person's card is their Coaster, with the fine-tuning on the Coaster page", async () => {
  // ComicTable staff: a link to the comic's Coaster page
  let { w, d, db } = await open("#people", (db) => { db.comics.forEach((c) => Object.assign(c, { look: "classic", coaster: {}, on_bills: true, handle: c.id })); });
  await wait(80);
  let lev = [...d.querySelectorAll(".people form.card")].find((c) => /Lev Fer/.test(c.textContent));
  assert.match(lev.querySelector(".coaster-link").textContent, /comictable\.com\/lev-fer/);
  assert.match(lev.textContent, /Only on Cockfight/);
  assert.ok(!lev.querySelector('input[aria-label="Tape link"]'), "no fine-tuning on Lineup");
  btn(d, /Coaster settings/, lev).click(); await wait(120);
  assert.equal(w.location.hash, "#ct/comics");
  assert.ok(d.querySelector('main input[aria-label="Tape link"]'), "the Coaster page has it");
  // a site's own owner, with a comic nobody has claimed: the fine-tuning is right there, folded away
  ({ w, d, db } = await open("#people", (db) => { db.platform_admins = []; db.admins = [{ user_id: "u1", site_id: "cockfight", role: "owner" }];
    db.comics.forEach((c) => Object.assign(c, { look: "classic", coaster: {}, on_bills: true, handle: c.id })); }));
  await wait(80);
  lev = [...d.querySelectorAll(".people form.card")].find((c) => /Lev Fer/.test(c.textContent));
  set(w, lev.querySelector('input[aria-label="Tape link"]'), "https://youtu.be/abcdefghijk");
  btn(d, /^Night$/, lev).click();
  lev.querySelector("textarea").value = "New bio";
  lev.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(100);
  const c = db.comics.find((x) => x.id === "lev-fer");
  assert.deepEqual([c.tape_url, c.look, c.bio], ["https://youtu.be/abcdefghijk", "night", "New bio"]);
});


test("Coaster settings: reorder what's on it (drag, or arrow keys on the grip); the order is saved", async () => {
  const { w, d, db } = await open("#ct/comics", (db) => { db.comics.forEach((c) => Object.assign(c, { look: "classic", coaster: {}, on_bills: true, handle: c.id })); });
  await wait(80);
  [...d.querySelectorAll(".comic-card")].find((b) => /Lev Fer/.test(b.textContent)).click(); await wait(120);
  const card = d.querySelector("main form.card");
  card.querySelector("details.coaster-more").open = true;
  press(w, card.querySelector('[data-drag="tape"] .drag-grip'), "ArrowUp"); await wait();
  press(w, card.querySelector('[data-drag="tape"] .drag-grip'), "ArrowUp"); await wait();
  card.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(80);
  const order = db.comics.find((c) => c.id === "lev-fer").coaster.order;
  assert.deepEqual(JSON.parse(JSON.stringify(order)).slice(0, 5), ["socials", "links", "tape", "join", "next"]);
});

test("Coaster settings: socials show as logos, logo + name or names; pick which networks show", async () => {
  const { w, d, db } = await open("#ct/comics", (db) => {
    db.comics.forEach((c) => Object.assign(c, { look: "classic", coaster: {}, on_bills: true, handle: c.id }));
    Object.assign(db.comics.find((c) => c.id === "lev-fer"), { instagram: "https://instagram.com/l", tiktok: "https://tiktok.com/@l", socials: {} });
  });
  await wait(80);
  [...d.querySelectorAll(".comic-card")].find((b) => /Lev Fer/.test(b.textContent)).click(); await wait(120);
  const card = d.querySelector("main form.card");
  btn(d, /^Logo \+ name$/, card).click();
  btn(d, /^Coaster colors$/, card).click();
  [...card.querySelectorAll(".soc-pick")].find((b) => /TikTok/.test(b.textContent)).click();
  card.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(80);
  assert.deepEqual(JSON.parse(JSON.stringify(db.comics.find((c) => c.id === "lev-fer").coaster.social_style)), { style: "both", color: "look", hide: ["tiktok"] });
});
