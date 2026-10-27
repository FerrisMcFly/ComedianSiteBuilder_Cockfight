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
    sites: [{ id: "cockfight", name: "Cockfight", domain: "cockfightpodcast.com", features: { shows: true, podcast: true, videos: true, merch: true, forum: true, chat: true }, profile: {}, theme: {}, community: {} }],
    admins: [{ user_id: "u1", site_id: "cockfight" }], platform_admins: [{ user_id: "u1" }],
    hosts: [{ id: "colum", site_id: "cockfight", name: "Colum Tyrrell", sort: 0 }, { id: "lev", site_id: "cockfight", name: "Lev Fer", sort: 1 }, { id: "tristan", site_id: "cockfight", name: "Tristan Bowling", sort: 2 }],
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
const THEME_JSON = JSON.parse(readFileSync(new URL("../site/theme.json", import.meta.url), "utf8"));
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const btn = (d, re, scope = d) => [...scope.querySelectorAll("button")].find((b) => re.test(b.textContent));
const set = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };

test("home shows a greeting, stats and to-dos", async () => {
  const { d } = await open();
  assert.match(d.querySelector("h1").textContent, /ferris/);
  assert.equal(d.querySelectorAll(".nav-btn").length, 14);
  assert.deepEqual([...d.querySelectorAll(".nav-group")].map((g) => g.textContent).filter(Boolean), ["Content", "Community", "Site extras"]);
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
  set(w, d.getElementById("newPersonName"), "Sam Guest");
  d.querySelector("main form").dispatchEvent(new w.Event("submit", { cancelable: true })); await wait(60);
  const sam = db.hosts.find((x) => x.name === "Sam Guest");
  assert.ok(sam); assert.equal(sam.site_id, "cockfight"); assert.equal(sam.sort, 3); assert.match(sam.id, /^cockfight-sam/);
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
