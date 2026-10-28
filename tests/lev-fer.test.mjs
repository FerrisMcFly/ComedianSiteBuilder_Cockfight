// Lev Fer's site (sites/lev-fer): everything shown comes from ComicTable, nothing is built in.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const opened = [];
after(() => opened.forEach((w) => w.close()));

const sdk = readFileSync(new URL("../platform/sdk/csb.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../sites/lev-fer/index.html", import.meta.url), "utf8")
  .replace('<script src="config.js"></script>', '<script>window.COMICTABLE_CONFIG={SITE_ID:"lev-fer",SUPABASE_URL:"https://x.supabase.co",SUPABASE_ANON_KEY:"k"}</script>')
  .replace('<script src="sdk/csb.js"></script>', () => "<script>" + sdk.replace(/<\/script/g, "<\\/script") + "</script>");
const future = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const past = (n) => future(-n);

async function load(data, hash = "") {
  const posts = [];
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://levfer.gay/" + hash, beforeParse(w) {
    w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
    w.HTMLCanvasElement.prototype.getContext = () => null;
    w.fetch = async (u, o = {}) => {
      const t = u.split("/rest/v1/")[1].split("?")[0];
      if (o.method === "POST") { posts.push([t, JSON.parse(o.body)]); const out = t === "rpc/site_shows" ? data.shows : t === "rpc/site_videos" ? data.videos || [] : t === "rpc/join_fans" ? "joined" : t === "threads" ? [{ id: "t9" }] : null; return { ok: true, status: 200, text: async () => JSON.stringify(out) }; }
      if (t === "blog_posts" && u.includes("slug=eq.")) return { ok: true, status: 200, text: async () => JSON.stringify((data.blog_posts || []).filter((p) => u.includes("slug=eq." + p.slug))) };
      if (t === "hosts" && u.includes("comic_id=in.")) return { ok: true, status: 200, text: async () => JSON.stringify(data.other_hosts || []) };
      if (t === "sites" && u.includes("id=in.")) return { ok: true, status: 200, text: async () => JSON.stringify(data.other_sites || []) };
      if (t === "episodes" && !u.includes("site_id=eq.lev-fer")) return { ok: true, status: 200, text: async () => JSON.stringify(data.other_episodes || []) };
      return { ok: true, status: 200, text: async () => JSON.stringify(data[t] || []) };
    };
  } });
  opened.push(dom.window);
  await new Promise((r) => setTimeout(r, 120));
  return { w: dom.window, d: dom.window.document, posts };
}
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const menu = (d) => [...d.querySelectorAll("#nav a")].map((a) => a.firstChild.textContent);

const bare = { sites: [{ id: "lev-fer", name: "Lev Fer", features: {}, profile: {}, theme: {} }], hosts: [{ id: "lev-fer-lev", name: "Lev Fer" }], shows: [] };
const full = {
  sites: [{ id: "lev-fer", name: "Lev Fer", features: { shows: true, videos: true, blog: true, forum: true, chat: true, fans: true }, profile: { tagline: "Stand-up comedy · New York City", about: "Test bio.", booking_email: "book@test" }, theme: { accent: "#123456" }, community: {} }],
  hosts: [{ id: "lev-fer-lev", name: "Lev Fer", title: "Comedian", photo_url: "https://p/lev.jpg", instagram: "https://instagram.com/test" }],
  shows: [{ id: "s1", host: "lev-fer-lev", date: future(5), time: "9:00 PM", venue: "Test Club", city: "New York, NY", url: "https://t/s1", status: "on_sale" },
          { id: "s2", host: "lev-fer-lev", date: future(9), time: "8:00 PM", venue: "Other Club", city: "Boston, MA", status: "sold_out" }],
  videos: [{ youtube_id: "abcdefghijk", title: "Test clip", published: "2026-10-01" }],
  blog_posts: [{ id: "p1", slug: "first", title: "First post", body: "It was **fine**.", published_at: "2026-10-20T12:00:00Z" }],
  boards: [{ id: "general", name: "General", description: "Anything", sort: 0 }],
  places: [{ id: 1, name: "Boston", state: "MA", country: "US", population: 600000 }],
  home_picks: [
    { id: "h1", kind: "announcement", headline: "Big news", body: "Read this first.", button_label: "Go", link: "https://x/news", sort: 0 },
    { id: "h2", kind: "show", headline: "Other Club", show_id: "s2", button_label: "Get tickets", sort: 1 },
    { id: "h3", kind: "show", headline: "Gone show", show_id: "old", sort: 2 },
    { id: "h4", kind: "link", headline: "Ended", ends_on: past(1), sort: 3 }
  ]
};

test("a brand-new site shows no made-up content: empty states and only the sections it has", async () => {
  const { d } = await load(bare);
  assert.equal(d.getElementById("name").textContent, "Lev Fer");
  assert.deepEqual(menu(d), ["Home", "Tour Dates", "About"]);
  assert.match(d.getElementById("app").textContent, /Nothing here yet/);
  const shows = await load(bare, "#/shows");
  assert.match(shows.d.getElementById("app").textContent, /No dates right now/);
});

test("home shows Lev's picks in order: featured first, past and ended ones dropped, sold out carried over", async () => {
  const { d } = await load(full);
  const cards = [...d.querySelectorAll(".pick")];
  assert.deepEqual(cards.map((c) => c.querySelector("h3").textContent), ["Big news", "Other Club"]);
  assert.ok(cards[0].classList.contains("hero"));
  assert.equal(cards[0].querySelector("a.btn").getAttribute("href"), "https://x/news");
  assert.match(cards[1].textContent, /Sold out/);
  assert.equal(cards[1].querySelector("a"), null);
  assert.equal(d.documentElement.style.getPropertyValue("--amber"), "#123456");
  assert.equal(d.querySelector(".me img").getAttribute("src"), "https://p/lev.jpg", "Lev's own photo is on the home screen");
  assert.deepEqual(menu(d), ["Home", "Tour Dates", "Clips", "Blog", "Forum", "Chat Room", "Mailing List", "About", "Socials"]);
});

test("with nothing pinned, home still shows real things: photo, next shows, mailing list", async () => {
  const { d } = await load({ ...full, home_picks: [] });
  const t = d.getElementById("app").textContent;
  assert.match(t, /Lev Fer.*Next shows.*Test Club.*Get told when Lev's in your town/s);
  assert.doesNotMatch(t, /Latest clips/, "clips are off on the home screen unless Lev turns them on");
});

test("Lev arranges the home screen and the menu in Design settings", async () => {
  const theme = { accent: "#123456",
    home: [{ key: "shows", on: true }, { key: "me", on: false }, { key: "clips", on: true }],
    menu: [{ key: "about", on: true }, { key: "shows", on: true }, { key: "forum", on: false }], home_shows: "1" };
  const { d } = await load({ ...full, home_picks: [], sites: [{ ...full.sites[0], theme }] });
  const blocks = [...d.querySelectorAll(".home > .block")].map((b) => b.textContent);
  assert.match(blocks[0], /Next shows.*Test Club/s, "shows first");
  assert.doesNotMatch(blocks[0], /Other Club/, "only one show, as set");
  assert.ok(!d.querySelector(".me"), "the photo section is off");
  assert.match(blocks[1], /Latest clips.*Test clip/s, "clips turned on, second");
  assert.deepEqual(menu(d).slice(0, 3), ["Home", "About", "Tour Dates"]);
  assert.ok(!menu(d).includes("Forum"), "forum hidden from the menu");
  assert.ok(menu(d).includes("Chat Room"), "sections Lev didn't mention keep their place");
});

test("the podcast Lev co-hosts on ComicTable shows up, with its latest episode", async () => {
  const data = { ...full, home_picks: [], hosts: [{ ...full.hosts[0], comic_id: "lev-fer" }],
    other_hosts: [{ site_id: "cockfight", comic_id: "lev-fer", name: "Lev Fer" }],
    other_sites: [{ id: "cockfight", name: "Cockfight", domain: "cockfightpodcast.com", features: { podcast: true } }],
    other_episodes: [{ num: 92, title: "Test episode", url: "https://pod/92" }] };
  const { d } = await load(data); await wait(120);
  assert.match(d.getElementById("app").textContent, /Podcast.*Cockfight.*Latest: 92\. Test episode/s);
  assert.ok([...d.querySelectorAll(".lnk")].some((a) => a.getAttribute("href") === "https://pod/92"));
  assert.ok(menu(d).includes("Podcast"));
});

test("the Patreon link becomes a big button, and can be a menu item", async () => {
  const sites = [{ ...full.sites[0], profile: { ...full.sites[0].profile, support_url: "https://patreon.com/test", support_label: "Patreon" }, theme: { menu: [{ key: "support", on: true }] } }];
  const { d } = await load({ ...full, sites });
  const gold = d.querySelector(".lnk.gold");
  assert.equal(gold.getAttribute("href"), "https://patreon.com/test");
  assert.match(gold.textContent, /Patreon/);
  assert.equal(d.querySelector('#nav a[href="https://patreon.com/test"]').firstChild.textContent, "Patreon");
});

test("the defaults in the page match the design's settings file", async () => {
  const theme = JSON.parse(readFileSync(new URL("../sites/lev-fer/theme.json", import.meta.url), "utf8"));
  const page = readFileSync(new URL("../sites/lev-fer/index.html", import.meta.url), "utf8");
  for (const [key, name] of [["home", "HOME_DEFAULT"], ["menu", "MENU_DEFAULT"]]) {
    const inPage = JSON.parse(page.match(new RegExp(name + " = (\\[.*?\\]\\]);"))[1]).map(([k, on]) => [k, !!on]);
    const inTheme = theme.settings.find((s) => s.key === key).options.map((o) => [o[0], o[3] !== false]);
    assert.deepEqual(inPage, inTheme, key);
  }
});

test("tour dates, blog post, about and socials come from ComicTable", async () => {
  let { d } = await load(full, "#/shows");
  assert.equal(d.querySelectorAll(".date").length, 2);
  assert.match(d.querySelector(".date").textContent, /Test Club.*Tickets/);
  ({ d } = await load(full, "#/blog/first")); await wait();
  assert.equal(d.querySelector(".article h3").textContent, "First post");
  assert.equal(d.querySelector(".article .body").innerHTML, "<p>It was <strong>fine</strong>.</p>");
  ({ d } = await load(full, "#/about"));
  assert.match(d.getElementById("app").textContent, /Test bio\..*book@test/s);
  ({ d } = await load(full, "#/socials"));
  assert.match(d.querySelector(".net a").textContent, /Instagram/);
});

test("fans join the mailing list with their city", async () => {
  const { w, d, posts } = await load(full, "#/list");
  d.getElementById("m-email").value = "fan@x.com";
  const city = d.getElementById("m-city"); city.value = "bos"; city.dispatchEvent(new w.Event("input"));
  await wait(300);
  d.querySelector(".places button").click();
  d.querySelector("form.signup").dispatchEvent(new w.Event("submit", { cancelable: true })); await wait();
  assert.deepEqual(posts.find((p) => p[0] === "rpc/join_fans")[1], { p_site: "lev-fer", p_email: "fan@x.com", p_place: 1, p_radius: 50 });
  assert.match(d.querySelector(".msg").textContent, /You're on the list/);
});

test("a forum topic is posted to Lev's site", async () => {
  const { w, d, posts } = await load(full, "#/forum/general"); await wait();
  d.getElementById("f-name").value = "Fan"; d.getElementById("f-title").value = "Hi"; d.getElementById("f-body").value = "First!";
  d.querySelector("form.compose").dispatchEvent(new w.Event("submit", { cancelable: true })); await wait();
  const t = posts.find((p) => p[0] === "threads")[1];
  assert.deepEqual([t.site_id, t.board, t.title, t.author], ["lev-fer", "general", "Hi", "Fan"]);
});

test("Lev's own loading-screen jokes replace the built-in ones, and can be switched off", async () => {
  let { d } = await load({ ...full, sites: [{ ...full.sites[0], theme: { tip_lines: ["My own joke."] } }] }); await wait(500);
  assert.equal(d.getElementById("tip").textContent, "Tip: My own joke.");
  ({ d } = await load({ ...full, sites: [{ ...full.sites[0], theme: { tips: false } }] }));
  assert.ok(d.getElementById("tip").hidden);
});

test("a podcast connected here and also on ComicTable shows once", async () => {
  const data = { ...full, home_picks: [], hosts: [{ ...full.hosts[0], comic_id: "lev-fer" }],
    sites: [{ ...full.sites[0], features: { ...full.sites[0].features, podcast: true } }],
    episodes: [{ id: "e1", num: 91, title: "Own copy", show_name: "Cockfight", url: "https://pod/91" }],
    other_hosts: [{ site_id: "cockfight", comic_id: "lev-fer", name: "Lev Fer" }],
    other_sites: [{ id: "cockfight", name: "Cockfight", domain: "cockfightpodcast.com", features: { podcast: true } }],
    other_episodes: [{ num: 92, title: "Test episode", url: "https://pod/92" }] };
  const { d } = await load(data); await wait(120);
  const pod = [...d.querySelectorAll(".block")].find((b) => /^Podcast/.test(b.textContent));
  assert.equal(pod.querySelectorAll(".lnk").length, 1);
  assert.match(pod.textContent, /Cockfight.*91\. Own copy/s);
  assert.ok(menu(d).includes("Podcast"));
});

test("Lev picks which podcasts are on his site: one on, one off, or none", async () => {
  const base = { ...full, home_picks: [], hosts: [{ ...full.hosts[0], comic_id: "lev-fer" }],
    other_hosts: [{ site_id: "cockfight", comic_id: "lev-fer", name: "Lev Fer" }, { site_id: "other-pod", comic_id: "lev-fer", name: "Lev Fer" }],
    other_sites: [{ id: "cockfight", name: "Cockfight", domain: "cockfightpodcast.com", features: { podcast: true } }, { id: "other-pod", name: "Other Pod", domain: "otherpod.com", features: { podcast: true } }],
    other_episodes: [{ num: 5, title: "Ep", url: "https://pod/5" }] };
  const podText = (d) => ([...d.querySelectorAll(".block")].find((b) => /^Podcast/.test(b.textContent)) || { textContent: "" }).textContent;
  let { d } = await load(base); await wait(120);
  assert.match(podText(d), /Cockfight.*Other Pod/s, "both by default");
  const oneOff = { ...base, sites: [{ ...full.sites[0], profile: { podcasts_off: ["Cockfight"] } }] };
  ({ d } = await load(oneOff)); await wait(120);
  assert.doesNotMatch(podText(d), /Cockfight/); assert.match(podText(d), /Other Pod/);
  const allOff = { ...base, sites: [{ ...full.sites[0], profile: { podcasts_off: ["cockfight", "other pod"] } }] };
  ({ d } = await load(allOff)); await wait(120);
  assert.equal(podText(d), ""); assert.ok(!menu(d).includes("Podcast"));
});
