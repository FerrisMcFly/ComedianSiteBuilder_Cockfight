import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { after } from "node:test";
const opened = [];
after(() => opened.forEach((w) => w.close()));

const sdk = readFileSync(new URL("../platform/sdk/csb.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../sites/cockfight/index.html", import.meta.url), "utf8")
  .replace('<script src="config.js"></script>', '<script>window.COCKFIGHT_CONFIG={SITE_ID:"cockfight",SUPABASE_URL:"https://x.supabase.co",SUPABASE_ANON_KEY:"k"}</script>')
  .replace(/<script src="https:\/\/cdn[^>]*><\/script>/, "")
  .replace('<script src="sdk/csb.js"></script>', () => "<script>" + sdk.replace(/<\/script/g, "<\\/script") + "</script>");
const future = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };  // local date, like the sites use

async function load(data, fail, reject) {
  const calls = [];
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://cockfightpodcast.com/", beforeParse(w) {
    w.matchMedia = () => ({ matches: false }); w.scrollTo = () => {};
    w.fetch = async (u, o = {}) => {
      calls.push((o.method || "GET") + " " + u.split("/rest/v1/")[1]);
      const t = u.split("/rest/v1/")[1].split("?")[0];
      if (fail && fail.includes(t)) return { ok: false, status: 400, text: async () => JSON.stringify({ message: "column site_id does not exist" }) };
      if (o.method === "POST") {
        if (reject && reject[t]) return { ok: false, status: 400, text: async () => JSON.stringify({ message: reject[t] }) };
        if (t.startsWith("rpc/")) { (data.rpcCalls = data.rpcCalls || []).push([t, JSON.parse(o.body)]); const out = data.rpc && t in data.rpc ? data.rpc[t] : t === "rpc/site_shows" ? (data.shows || []) : t === "rpc/site_videos" ? (data.videos || []).filter((v) => !v.hidden) : null;
          return { ok: true, status: 200, text: async () => JSON.stringify(out) }; }
        if (t === "chat_messages") (data.chat_messages = data.chat_messages || []).push({ id: "m" + Date.now(), ...JSON.parse(o.body), created_at: new Date().toISOString() });
        return { ok: true, status: 201, text: async () => (t === "threads" ? JSON.stringify([{ id: "th1" }]) : "") };
      }
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
  assert.ok(calls.filter((c) => c.startsWith("POST") && !c.includes("rpc/")).length === 2);
});

test("before the database upgrade runs, the site keeps its built-in content", async () => {
  const { d } = await load(base, ["episodes", "shows", "hosts", "settings"]);
  assert.equal(d.querySelectorAll("#dishes .dish").length, 47);
  assert.match(d.getElementById("liveNote").textContent, /Showing saved dates/);
});

test("announcements are News now: banners in News feed the headline and the scroller, with no double copies", async () => {
  const data = { ...base,
    announcements: [{ id: "a1", text: "Moved already", sort: 1 }, { id: "a9", text: "Not moved yet", sort: 9 }],
    home_picks: [{ id: "n1", style: "banner", headline: "Episode 93 is out!", link: "https://apple/93", sort: 0, from_announcement: "a1" },
      { id: "n2", style: "banner", headline: "Live in Austin", sort: 1 }, { id: "n3", style: "card", headline: "A card, not a banner", sort: 2 },
      { id: "n4", style: "banner", headline: "Starts next year", starts_on: "2099-01-01", sort: 3 }] };
  const { d } = await load(data);
  assert.equal(d.getElementById("headlineText").textContent, "Episode 93 is out!");
  const m = d.getElementById("marqueeText").textContent;
  assert.match(m, /Episode 93 is out! ••• Live in Austin/);
  assert.match(m, /Not moved yet/, "an announcement not moved into News yet still shows");
  assert.doesNotMatch(m, /Moved already|A card|Starts next year/);
});

test("announcements, profile, links and theme settings come through", async () => {
  const data = { ...base,
    sites: [{ id: "cockfight", features: { shows: true, podcast: true, forum: true }, profile: { support_url: "https://ko-fi.com/cockfight" }, theme: { visitor_counter: false, support_banner: false, webmaster: "Ferris", banner_speed: "fast" } }],
    announcements: [{ id: "a1", text: "Live in Boston Jan 24", sort: 1, pinned: false }, { id: "a2", text: "Episode 92 is out!", link: "https://apple/92", sort: 2, pinned: true }, { id: "a3", text: "Old news", ends_on: "2020-01-01", sort: 3 }],
    links: [{ id: "l1", label: "Book us", url: "https://book", sort: 0 }] };
  const { d } = await load(data);
  assert.equal(d.getElementById("headlineText").textContent, "Episode 92 is out!");
  assert.equal(d.querySelector("#headlineText a").getAttribute("href"), "https://apple/92");
  assert.match(d.getElementById("marqueeText").textContent, /Episode 92 is out! ••• Live in Boston Jan 24/);
  assert.doesNotMatch(d.getElementById("marqueeText").textContent, /Old news/);
  assert.equal(d.getElementById("linksBox").hidden, false);
  assert.match(d.getElementById("linksBox").textContent, /Book us/);
  assert.equal(d.querySelector(".patreon-banner").hidden, true);
  assert.equal(d.getElementById("counter").parentNode.hidden, true);
  assert.equal(d.getElementById("webmaster").textContent, "Ferris");
  assert.equal(d.querySelector(".marquee span").style.animationDuration, "14s");
  assert.ok([...d.querySelectorAll("a")].some((a) => a.href === "https://ko-fi.com/cockfight"));
});

test("forum shows pinned and locked topics and the board's own error messages", async () => {
  const data = { ...base, sites: [{ id: "cockfight", features: { forum: true } }],
    boards: [{ id: "general", name: "General", sort: 0 }, { id: "news", name: "News", sort: 1, locked: true }],
    threads: [{ id: "t1", board: "general", title: "Old chat", author: "Fan", created_at: 1, last_at: 5, replies: 0 }, { id: "t2", board: "general", title: "Rules", author: "Lev Fer", created_at: 1, last_at: 2, replies: 0, pinned: true, locked: true, is_mod: true }],
    posts: [{ id: "p1", thread_id: "t2", author: "Lev Fer", body: "Be nice", created_at: 1, is_mod: true }] };
  const { w, d } = await load(data, null, { posts: "Slow down! Wait a little before posting again." });
  d.getElementById("enter").click(); await new Promise((r) => setTimeout(r, 1000));
  d.querySelector('.nav [data-view="forum"]').click(); await new Promise((r) => setTimeout(r, 150));
  const boardNames = [...d.querySelectorAll("#fBody .board-name")].map((b) => b.textContent);
  assert.deepEqual(boardNames, ["General", "News"]);
  [...d.querySelectorAll("#fBody .board-name")].find((b) => b.textContent === "General").click(); await new Promise((r) => setTimeout(r, 50));
  const rows = [...d.querySelectorAll("#fBody tr")].slice(1).map((tr) => tr.cells[0].textContent);
  assert.match(rows[0], /📌 🔒 Rules/); assert.match(rows[1], /Old chat/);
  [...d.querySelectorAll("#fBody .topic-btn")].find((b) => b.textContent === "Rules").click(); await new Promise((r) => setTimeout(r, 120));
  assert.match(d.getElementById("fBody").textContent, /★ HOST ★/);
  assert.match(d.getElementById("fBody").textContent, /This topic is locked/);
  assert.equal(d.getElementById("rpForm"), null);
  // a locked board can't be picked for a new topic
  [...d.querySelectorAll("#fBody .crumbs button")][0].click(); await new Promise((r) => setTimeout(r, 30));
  [...d.querySelectorAll("#fBody button")].find((b) => /Post New Topic/.test(b.textContent)).click(); await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([...d.getElementById("ntBoard").options].map((o) => o.value), ["general"]);
  // the database's slow-mode message reaches the fan
  d.getElementById("ntName").value = "Fan"; d.getElementById("ntTitle").value = "Hi"; d.getElementById("ntBody").value = "yo";
  d.getElementById("ntForm").dispatchEvent(new w.Event("submit", { cancelable: true })); await new Promise((r) => setTimeout(r, 120));
  assert.match(d.getElementById("fBody").textContent, /Slow down! Wait a little before posting again\./);
});

test("chat room shows messages, sends, and shows the chat's rules", async () => {
  const data = { ...base, sites: [{ id: "cockfight", features: { chat: true } }],
    chat_messages: [{ id: "m1", author: "Colum Tyrrell", body: "Welcome!", is_mod: true, created_at: new Date().toISOString() },
      { id: "m0", author: "SomeFan", body: "first!", created_at: new Date(Date.now() - 1000).toISOString() }] };
  const { w, d, calls } = await load(data);
  assert.equal(d.querySelector('.nav [data-view="chat"]').hidden, false);
  d.getElementById("enter").click(); await new Promise((r) => setTimeout(r, 1000));
  d.querySelector('.nav [data-view="chat"]').click(); await new Promise((r) => setTimeout(r, 150));
  assert.match(d.getElementById("chatLog").textContent, /HOSTColum Tyrrell: Welcome!/);
  d.getElementById("chatName").value = "TacoKing"; d.getElementById("chatMsg").value = "yo!";
  d.getElementById("chatForm").dispatchEvent(new w.Event("submit", { cancelable: true })); await new Promise((r) => setTimeout(r, 80));
  assert.ok(calls.some((c) => c.startsWith("POST chat_messages")));
  assert.equal(data.chat_messages.at(-1).author, "TacoKing"); assert.equal(data.chat_messages.at(-1).site_id, "cockfight"); assert.ok(data.chat_messages.at(-1).device);
  // hosts' messages have no Report button; fans' messages do
  await new Promise((r) => setTimeout(r, 150));
  const lines = [...d.querySelectorAll("#chatLog .ln")];
  assert.ok(!lines.find((l) => /Welcome!/.test(l.textContent)).querySelector(".ln-report"));
  assert.ok(lines.find((l) => /first!/.test(l.textContent)).querySelector(".ln-report"));
});

test("videos can be filtered by channel, and a person's videos show on their page", async () => {
  const data = { ...base,
    videos: [{ youtube_id: "AAAAAAAAAAA", title: "Show clip", published: "2026-10-20", channel: "Cockfight" }, { youtube_id: "BBBBBBBBBBB", title: "Lev set", published: "2026-10-21", channel: "Lev Fer", host: "lev" }] };
  const { d } = await load(data);
  const chips = [...d.querySelectorAll("#videoChans button")].map((b) => b.textContent);
  assert.deepEqual(chips, ["All Channels", "Cockfight", "Lev Fer"]);
  [...d.querySelectorAll("#videoChans button")].find((b) => b.textContent === "Lev Fer").click();
  assert.deepEqual([...d.querySelectorAll("#videoGrid .vcard span")].map((x) => x.textContent), ["Lev set"]);
  assert.match(d.getElementById("v-lev").textContent, /Lev's Latest Videos/);
  assert.match(d.getElementById("v-lev").textContent, /Lev set/);
  assert.doesNotMatch(d.getElementById("v-lev").textContent, /Show clip/);
});

test("fans can join the fan list with their city when the site has it on", async () => {
  const off = await load(base);
  assert.ok(off.d.getElementById("fanBox").hidden, "no sign-up box unless the fan list is on");
  const data = { ...base, sites: [{ id: "cockfight", features: { shows: true, fans: true } }],
    places: [{ id: 4930956, name: "Boston", state: "MA", country: "US", population: 600000 }], rpc: { "rpc/join_fans": "joined" } };
  const { w, d, calls } = await load(data);
  const box = d.getElementById("fanBox");
  assert.ok(!box.hidden);
  d.getElementById("fanEmail").value = "fan@x.com";
  box.dispatchEvent(new w.Event("submit", { cancelable: true })); await new Promise((r) => setTimeout(r, 30));
  assert.match(d.getElementById("fanMsg").textContent, /Pick your city/);
  const city = d.getElementById("fanCity"); city.value = "bos"; city.dispatchEvent(new w.Event("input"));
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(calls.some((c) => /^GET places\?.*name=ilike\.bos\*/.test(c)), calls.join("\n"));
  const pick = d.querySelector("#fanPicks button"); assert.equal(pick.textContent, "Boston, MA"); pick.click();
  d.getElementById("fanRadius").value = "100";
  box.dispatchEvent(new w.Event("submit", { cancelable: true })); await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(data.rpcCalls.find((c) => c[0] === "rpc/join_fans"), ["rpc/join_fans", { p_site: "cockfight", p_email: "fan@x.com", p_place: 4930956, p_radius: 100 }]);
  assert.match(d.getElementById("fanMsg").textContent, /You're on the list! We'll email you when we're near Boston, MA/);
});

test("a live show by the whole crew gets its own spot, and shows on each person's page", async () => {
  const data = { ...base, shows: [...base.shows, { id: "ev", event: true, lineup_hosts: ["colum", "lev"], date: future(12), time: "8:00 PM", city: "Chicago, IL", venue: "Cockfight LIVE at Zanies", url: "https://t/ev", status: "on_sale" }] };
  const { d } = await load(data);
  assert.match(d.getElementById("allTour").textContent, /Cockfight LIVE.*Zanies/);
  assert.match(d.getElementById("v-colum").textContent, /Zanies/);
  assert.doesNotMatch(d.getElementById("v-cockfight-new1").textContent, /Zanies/);
});

test("the home page intro comes from Profile → About when it's filled in", async () => {
  const plain = await load(base);
  assert.match(plain.d.getElementById("aboutText").textContent, /weekly comedy podcast/);
  const { d } = await load({ ...base, sites: [{ id: "cockfight", features: { shows: true }, profile: { about: "Three idiots and a microphone." } }] });
  assert.equal(d.getElementById("aboutText").textContent, "Three idiots and a microphone.");
});

test("blog posts come through the data kit, safely formatted", async () => {
  const w = { localStorage: { getItem() {}, setItem() {} } };
  const fn = new Function("window", "globalThis", sdk + "; return window.CSB;");
  const CSB = fn(w, w);
  const html = CSB.markdown("## Hi\n\n**bold** <script>x()</script> [a](https://a.com) [b](javascript:alert(1))\n\nhttps://youtu.be/dQw4w9WgXcQ");
  assert.match(html, /<h2>Hi<\/h2>/); assert.match(html, /<strong>bold<\/strong>/); assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<a href="https:\/\/a.com"/); assert.doesNotMatch(html, /href="javascript/);
  assert.match(html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
});
