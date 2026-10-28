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
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

test("a Coaster: photo, name, bio, socials, the Tape, their sites, press kit and booking, in their look", async () => {
  const { d, asked } = await load("/lev-fer", {
    comics: [{ id: "lev-fer", name: "Lev Fer", title: "Comedian", short_bio: "Short one.", photo_url: "https://p/lev.jpg", instagram: "https://instagram.com/levfer",
      socials: { threads: "https://threads.net/@levfer" }, booking_contact: "Agent <book@lev.example>", tape_url: "https://www.youtube.com/watch?v=abcdefghijk", tape_title: "Live at the Cellar", look: "spooky" }],
    hosts: [{ site_id: "lev-fer", hidden: false }, { site_id: "cockfight", hidden: false }],
    sites: [{ id: "lev-fer", name: "Lev Fer", domain: "levfer.gay" }, { id: "cockfight", name: "Cockfight", domain: "cockfightpodcast.com" }] });
  assert.ok(asked[0].includes("id=eq.lev-fer"));
  assert.equal(d.title, "Lev Fer · ComicTable");
  assert.equal(d.body.className, "look-spooky");
  assert.equal(d.querySelector("h1").textContent, "Lev Fer");
  assert.match(d.querySelector(".bio").textContent, /Short one/);
  assert.deepEqual([...d.querySelectorAll(".socials a")].map((a) => a.textContent), ["Instagram", "Threads"]);
  assert.match(d.querySelector(".cap").textContent, /Live at the Cellar/);
  d.querySelector(".frame .play").click();
  assert.match(d.querySelector(".frame iframe").src, /youtube-nocookie\.com\/embed\/abcdefghijk/);
  const links = [...d.querySelectorAll(".links a")].map((a) => a.textContent + " " + a.getAttribute("href"));
  assert.deepEqual(links, ["levfer.gay https://levfer.gay", "Cockfight https://cockfightpodcast.com", "Booking mailto:book@lev.example", "Press kit /press/lev-fer"]);
});

test("next dates with tickets, and who else is on the bill links to their Coaster", async () => {
  const { d } = await load("/lev-fer", {
    comics: [{ id: "lev-fer", name: "Lev Fer" }],
    "rpc/comic_shows": [
      { id: "s1", date: day(3), time: "20:00", venue: "Comedy Cellar", city: "New York", url: "https://tix/1", status: "on_sale" },
      { id: "s2", date: day(5), venue: "The Stand", city: "New York", status: "sold_out" },
      { id: "s3", date: day(6), venue: "Gone", status: "cancelled" }],
    "rpc/also_on_bill": [{ show_id: "s1", comic_id: "colum-tyrrell", name: "Colum Tyrrell", photo_url: null }] });
  const rows = d.querySelectorAll(".stub");
  assert.equal(rows.length, 2, "cancelled dates don't show");
  assert.match(rows[0].textContent, /Comedy Cellar.*New York · 8pm/);
  assert.equal(rows[0].querySelector("a.btn").getAttribute("href"), "https://tix/1");
  assert.match(rows[1].textContent, /Sold out/);
  const other = rows[0].querySelector(".bill a");
  assert.equal(other.getAttribute("href"), "/colum-tyrrell");
  assert.match(other.textContent, /CTColum Tyrrell/);
  // tap the coaster: it flips to a QR code
  const coaster = d.querySelector(".coaster");
  assert.match(d.querySelector(".back").textContent, /Scan for Lev's Coaster.*comictable\.com\/lev-fer/s, "no fan list: the QR goes to the Coaster");
  coaster.click();
  assert.ok(coaster.classList.contains("flipped"));
  assert.equal(coaster.getAttribute("aria-pressed"), "true");
});

test("the name is printed on the coaster's band, and the page invites other comics to get one", async () => {
  const { d } = await load("/tristan-bowling", { comics: [{ id: "tristan-bowling", name: "Tristan Bowling" }] });
  assert.equal(d.querySelector(".front .band b").textContent, "Tristan Bowling");
  assert.equal(d.querySelector(".front .initials").textContent, "TB");
  assert.equal([...d.querySelectorAll("a")].find((a) => /Get your own Coaster/.test(a.textContent)).getAttribute("href"), "/#coaster");
  assert.ok(!d.querySelector(".join"), "no fan list without a site that has one");
});

test("fans can join the comic's list from the Coaster", async () => {
  const sent = [];
  const sdk2 = sdk.replace(/<\/script/g, "<\\/script");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://comictable.com/lev-fer", beforeParse(w) {
    w.fetch = async (u, o) => { const t = u.split("/rest/v1/")[1].split("?")[0]; if (o && o.body) sent.push([t, JSON.parse(o.body)]);
      const data = { comics: [{ id: "lev-fer", name: "Lev Fer" }], hosts: [{ site_id: "lev-fer" }], sites: [{ id: "lev-fer", name: "Lev Fer", domain: "levfer.gay", features: { fans: true } }],
        places: [{ id: 7, name: "Boston", state: "MA", country: "US" }], "rpc/join_fans": "joined" };
      return { ok: true, status: 200, text: async () => JSON.stringify(data[t] ?? []), json: async () => data[t] ?? [] }; };
  } });
  opened.push(dom.window);
  await new Promise((r) => setTimeout(r, 80));
  const d = dom.window.document, w = dom.window;
  [...d.querySelectorAll("button")].find((b) => b.textContent === "Join my list").click();
  const form = d.querySelector(".join");
  assert.ok(!form.hidden);
  form.querySelector('input[type="email"]').value = "fan@x.com";
  const city = form.querySelector('input[aria-label="Your city"]'); city.value = "Bos"; city.dispatchEvent(new w.Event("input"));
  await new Promise((r) => setTimeout(r, 30));
  form.querySelector("li button").click();
  form.querySelector('button[type="submit"]').click();
  await new Promise((r) => setTimeout(r, 30));
  const join = sent.find((x) => x[0] === "rpc/join_fans")[1];
  assert.deepEqual([join.p_site, join.p_email, join.p_place, join.p_met], ["lev-fer", "fan@x.com", 7, "Coaster"]);
  assert.match(d.querySelector(".join").textContent, /on Lev's list/);
  assert.match(d.querySelector(".back").textContent, /Scan to join Lev's list.*levfer\.gay\/join/s, "with a fan list, the coaster's QR is the sign-up");
});

test("lots of dates: the next one, six more under More, then all of them", async () => {
  const shows = Array.from({ length: 9 }, (_, i) => ({ id: "s" + i, date: day(i + 1), venue: "Club " + i }));
  const { d } = await load("/lev-fer", { comics: [{ id: "lev-fer", name: "Lev Fer" }], "rpc/comic_shows": shows });
  assert.equal(d.querySelectorAll(".stub").length, 7, "the next one up front, then six under More");
  [...d.querySelectorAll("button")].find((b) => /All 8 dates/.test(b.textContent)).click();
  assert.equal(d.querySelectorAll(".stub").length, 9);
});

test("an unknown name says so, and an unknown look falls back to classic", async () => {
  assert.match((await load("/nobody", {})).d.body.textContent, /No one here yet/);
  const { d } = await load("/x", { comics: [{ id: "x", name: "X", look: "neon" }] });
  assert.equal(d.body.className, "look-classic");
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
