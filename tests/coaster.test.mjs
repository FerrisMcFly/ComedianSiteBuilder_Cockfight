// comictable.com/<comic>: a comic's Coaster, with no login.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const opened = [];
after(() => opened.forEach((w) => w.close()));
const sdk = readFileSync(new URL("../platform/sdk/csb.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../platform/home/coaster.html", import.meta.url), "utf8")
  .replace('<script src="/config.js"></script>', '<script>window.COMICTABLE_CONFIG={SUPABASE_URL:"https://x.supabase.co",SUPABASE_ANON_KEY:"k"}</script>')
  .replace('<script src="/sdk/csb.js"></script>', () => "<script>" + sdk.replace(/<\/script/g, "<\\/script") + "</script>");

async function load(path, data) {
  const asked = [];
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://comictable.com" + path, beforeParse(w) {
    w.fetch = async (u, o) => { asked.push(u + (o && o.body ? " " + o.body : "")); const t = u.split("/rest/v1/")[1].split("?")[0]; return { ok: true, status: 200, json: async () => data[t] || [] }; };
  } });
  opened.push(dom.window);
  await new Promise((r) => setTimeout(r, 80));
  return { d: dom.window.document, asked };
}
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };  // local date, like the sites use

test("a Coaster: photo, name, bio, socials, the Tape, their sites, press kit and booking, in their look", async () => {
  const { d, asked } = await load("/lev-fer", {
    comics: [{ id: "lev-fer", name: "Lev Fer", title: "Comedian", short_bio: "Short one.", photo_url: "https://p/lev.jpg", instagram: "https://instagram.com/levfer",
      socials: { threads: "https://threads.net/@levfer" }, booking_contact: "Agent <book@lev.example>", tape_url: "https://www.youtube.com/watch?v=abcdefghijk", tape_title: "Live at the Cellar", look: "spooky" }],
    hosts: [{ site_id: "lev-fer", hidden: false }, { site_id: "cockfight", hidden: false }],
    sites: [{ id: "lev-fer", name: "Lev Fer", domain: "levfer.gay" }, { id: "cockfight", name: "Cockfight", domain: "cockfightpodcast.com" }] });
  assert.ok(asked[0].includes("handle=eq.lev-fer"), "looks up the address first");
  assert.equal(d.title, "Lev Fer · ComicTable");
  assert.ok(d.body.classList.contains("look-spooky"));
  assert.deepEqual(["bg-brick", "dates-tickets", "btns-status", "soc-tiles"].map((k) => d.body.classList.contains(k)), [true, true, true, true], "the reference page by default: brick, torn tickets, status buttons, social tiles");
  assert.equal(d.querySelector("h1").textContent, "Lev Fer");
  assert.match(d.querySelector(".bio").textContent, /Short one/);
  assert.deepEqual([...d.querySelectorAll(".socials a")].map((a) => a.getAttribute("aria-label")), ["Instagram", "Threads"], "logos by default, named for screen readers");
  assert.ok(d.querySelector(".socials a svg path"), "real logos");
  assert.match(d.querySelector(".cap").textContent, /Live at the Cellar/);
  d.querySelector(".frame .play").click();
  assert.match(d.querySelector(".frame iframe").src, /youtube-nocookie\.com\/embed\/abcdefghijk/);
  const links = [...d.querySelectorAll(".links a")].map((a) => a.getAttribute("href")).filter((h) => !/privacy/.test(h));
  assert.deepEqual(links, ["https://levfer.gay", "https://cockfightpodcast.com", "mailto:book@lev.example", "/press/lev-fer"]);
  assert.match(d.querySelector(".lcard").textContent, /My website.*levfer\.gay/, "their own site says My website");
});

test("shows as tickets with a button by status, and who else is on the bill links to their Coaster", async () => {
  const { d } = await load("/lev-fer", {
    comics: [{ id: "lev-fer", name: "Lev Fer" }],
    "rpc/comic_shows": [
      { id: "s1", date: day(3), time: "20:00", venue: "Comedy Cellar", city: "New York", url: "https://tix/1", status: "on_sale" },
      { id: "s2", date: day(5), time: "9:30 PM", venue: "The Stand", city: "New York", status: "sold_out" },
      { id: "s3", date: day(6), venue: "Gone", status: "cancelled" }],
    "rpc/also_on_bill": [{ show_id: "s1", comic_id: "colum-tyrrell", name: "Colum Tyrrell", photo_url: null }] });
  const rows = d.querySelectorAll(".tix");
  assert.equal(rows.length, 2, "cancelled dates don't show");
  assert.match(rows[0].textContent, /Comedy Cellar.*New York.*8pm/);
  assert.equal(rows[0].querySelector("a.tb.live").getAttribute("href"), "https://tix/1");
  assert.equal(rows[0].querySelector("a.tb").textContent, "Tickets");
  assert.equal(rows[1].querySelector(".tb.sold").textContent, "Sold out");
  assert.match(rows[1].textContent, /9:30pm/, "a 9:30 PM show says 9:30pm");
  const other = d.querySelector(".billbar a");
  assert.equal(other.getAttribute("href"), "/colum-tyrrell");
  assert.match(other.textContent, /CTColum Tyrrell/);
  // tap the coaster: it flips to a QR code
  const coaster = d.querySelector(".coaster");
  assert.match(d.querySelector(".back").textContent, /Join Lev Fer's list.*comictable\.com\/lev-fer#join/s, "no site with a list: the QR joins the comic's own list");
  coaster.click();
  assert.ok(coaster.classList.contains("flipped"));
  assert.equal(coaster.getAttribute("aria-pressed"), "true");
});

test("the name is printed on the coaster's band; no sign-up pitch anywhere", async () => {
  const { d } = await load("/tristan-bowling", { comics: [{ id: "tristan-bowling", name: "Tristan Bowling" }] });
  assert.equal(d.querySelector(".front .ribbon b").textContent, "Tristan Bowling");
  assert.equal(d.querySelector(".front .initials").textContent, "TB");
  assert.doesNotMatch(d.querySelector("main").textContent, /Do comedy\?/, "no Do comedy? block");
  assert.ok(![...d.querySelectorAll("a")].some((a) => /Get your own Coaster/.test(a.textContent)), "no self sign-up anywhere (invite-only for now)");
  assert.ok(d.querySelector(".join .csb-signup"), "every Coaster can collect fans, even with no site");
});

test("fans join with name, email and ZIP: the site's list when there is one, otherwise the comic's own", async () => {
  async function joinOn(data) {
    const sent = [];
    const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://comictable.com/lev-fer", beforeParse(w) {
      w.fetch = async (u, o) => { const t = u.split("/rest/v1/")[1].split("?")[0]; if (o && o.body) sent.push([t, JSON.parse(o.body)]);
        const all = { comics: [{ id: "lev-fer", name: "Lev Fer" }], "rpc/join_list": "joined", "rpc/join_coaster": "joined", ...data };
        return { ok: true, status: 200, text: async () => JSON.stringify(all[t] ?? []), json: async () => all[t] ?? [] }; };
    } });
    opened.push(dom.window);
    await new Promise((r) => setTimeout(r, 80));
    const d = dom.window.document, w = dom.window;
    [...d.querySelectorAll("button")].find((b) => b.textContent === "Join my list").click();
    const form = d.querySelector(".join");
    assert.ok(!form.hidden);
    assert.equal(form.querySelector('select'), null, "no miles question");
    form.querySelector('input[name="name"]').value = "Sam";
    form.querySelector('input[type="email"]').value = "fan@x.com";
    form.querySelector('input[name="zip"]').value = "021";
    form.querySelector("form").dispatchEvent(new w.Event("submit", { cancelable: true }));
    assert.match(form.textContent, /5-digit ZIP/);
    form.querySelector('input[name="zip"]').value = "02116";
    form.querySelector("form").dispatchEvent(new w.Event("submit", { cancelable: true }));
    await new Promise((r) => setTimeout(r, 30));
    return { d, sent };
  }
  let { d, sent } = await joinOn({ hosts: [{ site_id: "lev-fer" }], sites: [{ id: "lev-fer", name: "Lev Fer", domain: "levfer.gay", features: { fans: true } }] });
  const join = sent.find((x) => x[0] === "rpc/join_list")[1];
  assert.deepEqual([join.p_site, join.p_email, join.p_name, join.p_zip], ["lev-fer", "fan@x.com", "Sam", "02116"]);
  assert.match(d.querySelector(".join").textContent, /on Lev's list/);
  assert.match(d.querySelector(".back").textContent, /Join Lev Fer's list.*levfer\.gay\/join/s, "with a fan list, the coaster's QR is the sign-up");
  ({ d, sent } = await joinOn({}));
  const own = sent.find((x) => x[0] === "rpc/join_coaster")[1];
  assert.deepEqual([own.p_comic, own.p_email, own.p_zip], ["lev-fer", "fan@x.com", "02116"]);
});

test("lots of dates: the next three, then all of them; the comic picks how many show", async () => {
  const shows = Array.from({ length: 9 }, (_, i) => ({ id: "s" + i, date: day(i + 1), venue: "Club " + i }));
  let { d } = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer" }], "rpc/comic_shows": shows });
  assert.equal(d.querySelectorAll(".tix").length, 3, "the next three");
  [...d.querySelectorAll("button")].find((b) => /All 9 dates/.test(b.textContent)).click();
  assert.equal(d.querySelectorAll(".tix").length, 9);
  ({ d } = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer", coaster: { page: { shown: "1", dates: "chalk", bg: "velvet", buttons: "outline", tiles: "plain" } } }], "rpc/comic_shows": shows }));
  assert.equal(d.querySelectorAll(".tix").length, 1);
  assert.deepEqual(["bg-velvet", "dates-chalk", "btns-outline", "soc-plain"].map((k) => d.body.classList.contains(k)), [true, true, true, true]);
});

test("an unknown name says so, and an unknown look falls back to classic", async () => {
  assert.match((await load("/nobody", {})).d.body.textContent, /No one here yet/);
  const { d } = await load("/x", { comics: [{ id: "x", name: "X", look: "neon" }] });
  assert.ok(d.body.classList.contains("look-classic"));
});

test("simple by default, with the rest under More; the comic chooses what goes where", async () => {
  const base = { id: "lev-fer", name: "Lev Fer", short_bio: "Bio here.", booking_contact: "b@x.com", tape_url: "https://www.youtube.com/watch?v=abcdefghijk", instagram: "https://instagram.com/l" };
  let { d } = await load("/lev-fer", { comics: [base] });
  const more = d.querySelector("#more");
  assert.ok(more.hidden, "More starts closed");
  assert.ok(more.querySelector(".frame") && more.querySelector(".bio"), "the Tape and bio wait under More");
  assert.ok(!more.querySelector(".socials"), "socials are up front");
  const btn = d.querySelector(".more-btn"); assert.equal(btn.textContent, "More from Lev ▾");
  btn.click(); assert.ok(!more.hidden); assert.equal(btn.getAttribute("aria-expanded"), "true");
  ({ d } = await load("/lev-fer", { comics: [{ ...base, coaster: { tape: "front", bio: "off", booking: "off", press: "off" } }] }));
  assert.ok(d.querySelector(".frame") && !d.querySelector("#more .frame"), "Tape moved up front");
  assert.ok(!d.querySelector(".bio"), "bio switched off");
  assert.ok(!d.querySelector("#more"), "nothing left under More, so no More button");
});

test("a Custom look: their board, ink and band colors, and a full-color photo; the page follows the board", async () => {
  const { d } = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer", look: "custom", coaster: { style: { pulp: "#101820", ink: "#F2AA4C", band: "#F2AA4C", photo: "color" } } }] });
  const b = d.body;
  assert.match(b.className, /look-night/, "a dark board gets a dark page");
  assert.match(b.className, /photo-color/);
  assert.equal(b.style.getPropertyValue("--pulp"), "#101820");
  assert.equal(b.style.getPropertyValue("--ring"), "#F2AA4C");
  assert.equal(b.style.getPropertyValue("--band-ink"), "#1F1F1F", "dark text on a light band");
  const bad = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer", look: "custom", coaster: { style: { pulp: "red;background:url(x)" } } }] });
  assert.equal(bad.d.body.style.getPropertyValue("--pulp"), "#F4ECDC", "only real colors get through");
});

test("comictable.com/<address> finds the comic; an old link with their id still works and shows the real address", async () => {
  const mk = (path, rows) => new JSDOM(html, { runScripts: "dangerously", url: "https://comictable.com" + path, beforeParse(w) {
    w.fetch = async (u) => { const t = u.split("/rest/v1/")[1]; const body = t.startsWith("comics?") ? rows(t) : []; return { ok: true, status: 200, json: async () => body }; };
  } });
  const lev = { id: "lev", handle: "lev-fer", name: "Lev Fer" };
  const a = mk("/lev-fer", (t) => t.includes("handle=eq.lev-fer") ? [lev] : []);
  const b = mk("/lev", (t) => t.includes("id=eq.lev") ? [lev] : []);
  opened.push(a.window, b.window);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(a.window.document.querySelector("h1").textContent, "Lev Fer");
  assert.equal(a.window.document.querySelector(".front .addr").textContent, "comictable.com/lev-fer");
  assert.equal(b.window.document.querySelector("h1").textContent, "Lev Fer");
  assert.equal(b.window.location.pathname, "/lev-fer");
});

test("the comic's order: items show up front and under More in the order they chose", async () => {
  const base = { id: "lev-fer", name: "Lev Fer", short_bio: "Bio.", instagram: "https://instagram.com/l", tape_url: "https://www.youtube.com/watch?v=abcdefghijk" };
  const { d } = await load("/lev-fer", { comics: [{ ...base, coaster: { tape: "front", bio: "front", order: ["bio", "tape", "socials"] } }] });
  const main = d.getElementById("app");
  const pos = (sel) => [...main.querySelectorAll("*")].indexOf(main.querySelector(sel));
  assert.ok(pos(".bio") < pos(".frame") && pos(".frame") < pos(".socials"), "bio, then the Tape, then socials");
});

test("socials: the comic picks logos, logo + name or names, brand colors or not, and which ones show", async () => {
  const base = { id: "lev-fer", name: "Lev Fer", instagram: "https://instagram.com/l", tiktok: "https://tiktok.com/@l", socials: { threads: "https://threads.net/@l" } };
  let { d } = await load("/lev-fer", { comics: [{ ...base, coaster: { social_style: { style: "both", hide: ["tiktok"] } } }] });
  assert.deepEqual([...d.querySelectorAll(".socials a")].map((a) => a.textContent), ["Instagram", "Threads"]);
  assert.ok(d.querySelector(".socials.both a svg"));
  ({ d } = await load("/lev-fer", { comics: [{ ...base, coaster: { social_style: { style: "names", color: "look" } } }] }));
  assert.deepEqual([...d.querySelectorAll(".socials a")].map((a) => a.textContent), ["Instagram", "TikTok", "Threads"]);
  assert.ok(!d.querySelector(".socials svg") && !d.querySelector(".socials.brand"));
});

test("the dock: tickets for the next show always in reach, plus Share", async () => {
  const day1 = new Date(); day1.setDate(day1.getDate() + 2);
  const { d } = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer" }],
    "rpc/comic_shows": [{ id: "s1", date: day(2), venue: "The Stand", url: "https://t/1", status: "on_sale" }] });
  const dock = d.querySelector(".dock");
  assert.equal(dock.querySelector("a.tab.go").textContent, "Tickets");
  assert.match(dock.querySelector("a.tab.go").getAttribute("aria-label"), /^Tickets for /);
  assert.equal(dock.querySelector("a.tab.go").getAttribute("href"), "https://t/1");
  assert.equal([...dock.querySelectorAll(".tab")].pop().getAttribute("aria-label"), "Share Lev Fer's Coaster");
});

test("wear: fresh by default; used and well loved add glass rings (well loved: drips and scuffs too), the same every visit", async () => {
  let { d } = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer" }] });
  assert.match(d.querySelector(".coaster").className, /wear-fresh/);
  assert.equal(d.querySelectorAll(".stain").length, 0);
  ({ d } = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer", coaster: { wear: "loved" } }] }));
  assert.match(d.querySelector(".coaster").className, /wear-loved/);
  assert.equal(d.querySelectorAll(".front .stain.ring").length, 2);
  assert.ok(d.querySelector(".front .stain.scuff") && d.querySelectorAll(".front .stain.drop").length === 4);
  const where = [...d.querySelectorAll(".stain.ring")].map((x) => x.style.getPropertyValue("--x")).join();
  const again = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer", coaster: { wear: "loved" } }] });
  assert.equal([...again.d.querySelectorAll(".stain.ring")].map((x) => x.style.getPropertyValue("--x")).join(), where, "same stains every visit");
});

test("live and Shorts: a LIVE badge and Watch live while one of their sites is streaming; their Shorts as an item", async () => {
  const { d } = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer", coaster: { shorts: "front" } }], hosts: [{ site_id: "lev-fer" }],
    sites: [{ id: "lev-fer", name: "Lev Fer", domain: "levfer.gay", features: {}, live: { url: "https://twitch.tv/levfer", title: "Crowd work", started_at: new Date().toISOString() } }],
    videos: [{ youtube_id: "shortshort1", title: "A short", published: "2026-10-01" }] });
  assert.match(d.querySelector(".live-badge").textContent, /LIVE · Crowd work/);
  assert.match(d.querySelector(".dock a.tab.go").textContent, /Watch live/);
  assert.equal(d.querySelectorAll(".shorts .short").length, 1);
  d.querySelector(".short").click();
  assert.match(d.querySelector(".short.playing iframe").getAttribute("src"), /embed\/shortshort1/);
});

test("link buttons: their own site first by default; the comic's order and hidden ones win", async () => {
  const sites = [{ id: "cockfight", name: "Cockfight", domain: "cockfightpodcast.com" }, { id: "lev-fer", name: "Lev Fer", domain: "levfer.gay" }];
  const base = { hosts: [{ site_id: "cockfight" }, { site_id: "lev-fer" }], sites };
  let { d } = await load("/lev-fer", { ...base, comics: [{ id: "lev-fer", name: "Lev Fer", website: "https://linktr.ee/levfer" }] });
  assert.deepEqual([...d.querySelectorAll(".lcard b")].map((b) => b.textContent), ["My website", "Cockfight", "Linktree"]);
  assert.equal(d.querySelector(".lcard.main"), null, "no button is singled out");
  ({ d } = await load("/lev-fer", { ...base, comics: [{ id: "lev-fer", name: "Lev Fer", website: "https://linktr.ee/levfer", coaster: { links: ["website", "site:lev-fer", "site:cockfight"], links_off: ["site:cockfight"] } }] }));
  assert.deepEqual([...d.querySelectorAll(".lcard b")].map((b) => b.textContent), ["Linktree", "My website"]);
});

test("the QR code on the back goes where the comic picked", async () => {
  let { d } = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer", coaster: { qr: { to: "coaster" } } }] });
  assert.match(d.querySelector(".back").textContent, /Find Lev here.*comictable\.com\/lev-fer/s);
  ({ d } = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer", coaster: { qr: { to: "link", link: "https://linktr.ee/lev" } } }] }));
  assert.match(d.querySelector(".back").textContent, /Scan me.*linktr\.ee\/lev/s);
});

test("lettering and doodles: the name in the comic's lettering, doodles in the coaster's ink", async () => {
  const { d } = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer", coaster: { letter: "western", doodles: ["crown", "mic"], doodle_color: "band" } }] });
  const name = d.querySelector(".front .ribbon b");
  assert.match(name.style.fontFamily, /Rye/);
  assert.ok(d.getElementById("font-western"), "its font loads only when it's used");
  const svg = d.querySelector(".front .doodles svg");
  assert.equal(svg.getAttribute("fill"), "var(--ring)");
  assert.equal(svg.querySelectorAll("path, rect").length >= 3, true);
});

test("the whole-show podcast player, and Shorts the comic featured or hid", async () => {
  const { d } = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer", coaster: { podcast: { name: "Cockfight", spotify: "https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk" },
    shorts: { featured: ["BBBBBBBBBBB"], hidden: ["CCCCCCCCCCC"] }, shorts_on: true } }],
    videos: [{ youtube_id: "AAAAAAAAAAA", title: "One" }, { youtube_id: "BBBBBBBBBBB", title: "Two" }, { youtube_id: "CCCCCCCCCCC", title: "Three" }] });
  assert.equal(d.querySelector(".pod iframe").getAttribute("src"), "https://open.spotify.com/embed/show/4rOoJ6Egrf8K2IrywzwOMk");
  const shorts = [...d.querySelectorAll(".short")];
  assert.deepEqual(shorts.map((b) => b.getAttribute("aria-label")), ["Play: Two", "Play: One"], "featured first, hidden gone");
  assert.ok(shorts[0].classList.contains("featured"));
});

test("the coaster photo and the name banner follow the comic's choices", async () => {
  const { d } = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer", photo_url: "https://p/lev.jpg",
    coaster: { photo: "https://p/coaster.jpg", photo_y: 40, photo_zoom: 130, print: "color", banner: { pos: "top", shape: "plain", tilt: "straight" } } }] });
  const front = d.querySelector(".front");
  const img = front.querySelector("img.portrait");
  assert.equal(img.getAttribute("src"), "https://p/coaster.jpg", "a photo just for the coaster");
  assert.equal(img.style.objectPosition, "center 40%");
  assert.equal(img.style.transform, "scale(1.3)");
  for (const k of ["banner-top", "shape-plain", "tilt-straight", "print-color"]) assert.ok(front.classList.contains(k), k);
  const none = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer", coaster: { banner: { pos: "none" } } }] });
  assert.equal(none.d.querySelector(".front .ribbon"), null, "no banner at all");
});
