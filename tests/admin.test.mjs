import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { after } from "node:test";
const opened = [];
after(() => opened.forEach((w) => w.close()));

const html = readFileSync(new URL("../platform/admin.html", import.meta.url), "utf8")
  .replace(/<script src="https:\/\/cdn[^>]*><\/script>/, "").replace('<script src="config.js"></script>', '<script>window.COCKFIGHT_CONFIG={SUPABASE_URL:"https://x.supabase.co",SUPABASE_ANON_KEY:"k"}</script>');

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
      eq(k, v) { f.push((r) => r[k] === v); return b; }, neq(k, v) { f.push((r) => r[k] !== v); return b; },
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
  const client = { auth: { getSession: async () => ({ data: { session: { access_token: "tok", user: { id: "u1", email: "ferris@x.com" } } } }), signOut: async () => {}, onAuthStateChange() {} },
    rpc: async (name, args) => name === "site_shows" ? { data: JSON.parse(JSON.stringify(db.shows.filter((x) => x.site_id === args.p_site))), error: null }
      : name === "site_videos" ? { data: JSON.parse(JSON.stringify(db.videos.filter((x) => x.site_id === args.p_site))), error: null }
      : name === "comic_shows" ? { data: JSON.parse(JSON.stringify(db.shows.filter((x) => x.date >= fri.slice(0, 4) + "-01-03").filter((x) => x.comic_id === args.p_comic || (x.host && (db.hosts.find((h) => h.id === x.host) || {}).comic_id === args.p_comic)).map((x) => ({ ...x, site_name: "Cockfight", event: false })))), error: null }
      : name === "fans_near_shows" ? { data: db.shows.filter((x) => x.date >= fri).map((x) => ({ show_id: x.id, fans: (db.fans || []).length })), error: null }
      : name === "fans_near_show" ? { data: JSON.parse(JSON.stringify(db.fans || [])), error: null }
      : name === "create_site" ? (db.sites.push({ id: args.p_id, name: args.p_name, domain: args.p_domain, features: {}, created_at: "2026-10-27" }), db.admins.push({ user_id: "u1", site_id: args.p_id, role: "owner" }), { data: null, error: null })
      : name === "venue_slots" && args.v === "v1" ? { data: [{ dow: 5, show_time: "7:30 PM", uses: 3 }, { dow: 5, show_time: "10:00 PM", uses: 2 }], error: null } : { data: [], error: null },
    from, storage: { from: () => ({}) } };
  return { db, client };
}

async function open(hash = "", prep, theme = THEME_JSON) {
  const { db, client } = makeDb();
  if (prep) prep(db);
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://cockfightpodcast.com/admin.html" + hash, beforeParse(w) {
    w.supabase = { createClient: () => client }; w.fetch = async (u) => (/theme\.json/.test(u) && theme ? { ok: true, json: async () => theme } : { ok: false, json: async () => ({}) }); w.matchMedia = () => ({ matches: true }); w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
  } });
  opened.push(dom.window);
  await new Promise((r) => setTimeout(r, 80));
  return { w: dom.window, d: dom.window.document, db };
}
const THEME_JSON = JSON.parse(readFileSync(new URL("../sites/cockfight/theme.json", import.meta.url), "utf8"));
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const btn = (d, re, scope = d) => [...scope.querySelectorAll("button")].find((b) => re.test(b.textContent));
const set = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };

test("home shows a greeting, stats and to-dos", async () => {
  const { d } = await open();
  assert.match(d.querySelector("h1").textContent, /ferris/);
  assert.equal(d.querySelectorAll(".nav-btn").length, 15);
  assert.deepEqual([...d.querySelectorAll(".nav-group")].map((g) => g.textContent).filter(Boolean), ["Content", "Community", "Site extras", "ComicTable"]);
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
  w.location.hash = "settings"; await wait();
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
  assert.match(d.querySelector("h1").textContent, /Design settings/); assert.match(d.querySelector(".page-head .sub").textContent, /90s Cantina/);
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

test("people cards say Save changes, not the person's name", async () => {
  const { d } = await open("#people");
  const labels = [...d.querySelectorAll(".people form button[type=submit]")].map((b) => b.textContent);
  assert.deepEqual([...new Set(labels)], ["Save changes"]);
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
  const { d } = await open("", null, null);
  const labels = [...d.querySelectorAll(".nav-btn")].map((b) => b.textContent);
  assert.ok(!labels.some((l) => /Announcements|Links|Design settings/.test(l)), labels.join(","));
  assert.ok(labels.some((l) => /Profile/.test(l)) && labels.some((l) => /Settings/.test(l)));
  assert.doesNotMatch(d.querySelector("main").textContent, /Post an announcement/);
  const only = await open("", null, { extras: ["links"] });
  const l2 = [...only.d.querySelectorAll(".nav-btn")].map((b) => b.textContent);
  assert.ok(l2.some((l) => /Links/.test(l)) && !l2.some((l) => /Announcements|Design settings/.test(l)), l2.join(","));
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
  const { w, d, db } = await open("#sites");
  await wait(60);
  assert.match(d.querySelector("main").textContent, /Sites \(1\)/);
  assert.match(d.querySelector("main").textContent, /○ Podcast or YouTube connected/);
  set(w, d.getElementById("nsName"), "Jane Doe");
  assert.equal(d.getElementById("nsId").value, "jane-doe");
  set(w, d.getElementById("nsDomain"), "https://www.JaneDoeComedy.com/");
  d.getElementById("nsF_forum").checked = true;
  btn(d, /^Create site$/).click(); await wait(120);
  const site = db.sites.find((x) => x.id === "jane-doe");
  assert.equal(site.domain, "janedoecomedy.com");
  assert.equal(site.features.forum, true); assert.equal(site.features.chat, false);
  assert.equal(d.querySelector(".brand").textContent, "Jane Doe");
  assert.equal(w.location.hash, "#people");
  assert.ok(d.querySelector("select[aria-label=Site]"), "site switcher appears once you have two sites");
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
  const addJane = (db) => db.sites.push({ id: "jane", name: "Jane Doe", features: { shows: true } });
  const sup = await open("", addJane);
  assert.deepEqual([...sup.d.querySelectorAll("select[aria-label=Site] option")].map((o) => o.textContent).sort(), ["Cockfight", "Jane Doe"]);
  const comic = await open("", (db) => { addJane(db); db.platform_admins = []; });
  assert.equal(comic.d.querySelector("select[aria-label=Site]"), null, "a comic on one site gets no site switcher");
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

test("a comic with their own login gets a Me page: their sites, all their dates, one profile", async () => {
  const { w, d, db } = await open("#me", (db) => {
    db.comics.find((c) => c.id === "lev-fer").user_id = "u1";
    db.sites.push({ id: "lev-fer", name: "Lev Fer", domain: "levfer.com", features: { shows: true } });
    db.hosts.push({ id: "lev-fer-lev", site_id: "lev-fer", comic_id: "lev-fer", name: "Lev Fer", sort: 0 });
    db.shows.push({ id: "s5", site_id: "lev-fer", host: "lev-fer-lev", comic_id: "lev-fer", date: fri, time: "9:00 PM", venue: "Comedy Cellar", city: "New York, NY", url: "https://t/cc" });
  });
  await wait(80);
  const main = d.querySelector("main");
  assert.ok([...d.querySelectorAll(".nav-btn")].some((b) => /Me/.test(b.textContent)));
  assert.match(main.textContent, /Your sites.*Cockfight.*Lev Fer.*levfer\.com/s);
  assert.match(main.textContent, /Your upcoming dates \(1\).*Comedy Cellar/s);
  // editing here edits the comic, not one site's copy
  const card = main.querySelector("form.card");
  card.querySelector("textarea").value = "Lev's own words";
  card.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(80);
  assert.equal(db.comics.find((c) => c.id === "lev-fer").bio, "Lev's own words");
  // nobody without a comic login sees Me
  const other = await open("");
  assert.ok(![...other.d.querySelectorAll(".nav-btn")].some((b) => /^👤/.test(b.textContent.trim())));
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
