import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const opened = [];
after(() => opened.forEach((w) => w.close()));

const sdk = readFileSync(new URL("../platform/sdk/csb.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../sites/_starter/index.html", import.meta.url), "utf8")
  .replace('<script src="config.js"></script>', '<script>window.COMICTABLE_CONFIG={SITE_ID:"lev-fer",SUPABASE_URL:"https://x.supabase.co",SUPABASE_ANON_KEY:"k"}</script>')
  .replace('<script src="sdk/csb.js"></script>', () => "<script>" + sdk.replace(/<\/script/g, "<\\/script") + "</script>");
const future = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };  // local date, like the sites use

async function load(data, hash = "") {
  const posts = [];
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://levfer.com/" + hash, beforeParse(w) {
    w.scrollTo = () => {};
    w.fetch = async (u, o = {}) => {
      const t = u.split("/rest/v1/")[1].split("?")[0];
      if (o.method === "POST") { posts.push([t, JSON.parse(o.body)]); const out = t === "rpc/site_shows" ? data.shows : t === "rpc/site_videos" ? data.videos || [] : t === "rpc/join_fans" ? "joined" : null; return { ok: true, status: 200, text: async () => JSON.stringify(out) }; }
      if (t === "blog_posts" && u.includes("slug=eq.")) return { ok: true, status: 200, text: async () => JSON.stringify((data.blog_posts || []).filter((p) => u.includes("slug=eq." + p.slug))) };
      return { ok: true, status: 200, text: async () => JSON.stringify(data[t] || []) };
    };
  } });
  opened.push(dom.window);
  await new Promise((r) => setTimeout(r, 120));
  return { w: dom.window, d: dom.window.document, posts };
}
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const base = {
  sites: [{ id: "lev-fer", name: "Lev Fer", features: { shows: true, blog: true, fans: true, videos: true }, profile: { tagline: "Comedian. New York.", about: "Lev is a comic.", booking_email: "book@lev.com" }, theme: { accent: "#123456" } }],
  hosts: [{ id: "lev-fer-lev", name: "Lev Fer", title: "Comedian", photo_url: "https://p/lev.jpg", instagram: "https://instagram.com/lev" }],
  shows: [{ id: "a", host: "lev-fer-lev", date: future(5), time: "9:00 PM", venue: "Comedy Cellar", city: "New York, NY", url: "https://t/a", status: "on_sale" },
          { id: "b", host: "lev-fer-lev", date: future(9), time: "8:00 PM", venue: "Laugh Boston", city: "Boston, MA", status: "sold_out" }],
  blog_posts: [{ id: "p1", slug: "key-west", title: "Key West", body: "It was **hot**.", published_at: "2026-10-20T12:00:00Z" }],
  places: [{ id: 1, name: "Boston", state: "MA", country: "US", population: 600000 }]
};

test("home: name, tagline, shows with tickets, blog, fan sign-up, and the accent color from Design settings", async () => {
  const { d } = await load(base);
  assert.equal(d.querySelector("h1").textContent, "Lev Fer");
  assert.match(d.querySelector(".hero p").textContent, /Comedian\. New York\./);
  assert.equal(d.querySelectorAll(".show").length, 2);
  assert.match(d.querySelector(".show").textContent, /Comedy Cellar.*Tickets/);
  assert.match(d.querySelectorAll(".show")[1].textContent, /Sold out/);
  assert.match(d.getElementById("app").textContent, /From the blog.*Key West/s);
  assert.ok(d.querySelector(".fans"));
  assert.equal(d.documentElement.style.getPropertyValue("--accent"), "#123456");
  assert.deepEqual([...d.querySelectorAll("nav.main a")].map((a) => a.textContent), ["Home", "Shows", "Blog", "About"]);
});

test("a blog post opens on its own page", async () => {
  const { d } = await load(base, "#/blog/key-west");
  await wait();
  assert.equal(d.querySelector("article h1").textContent, "Key West");
  assert.equal(d.querySelector("article .body").innerHTML, "<p>It was <strong>hot</strong>.</p>");
});

test("fans sign up with their city", async () => {
  const { w, d, posts } = await load(base);
  const f = d.querySelector(".fans form");
  f.querySelector("input[type=email]").value = "fan@x.com";
  const city = f.querySelectorAll("input")[1]; city.value = "bos"; city.dispatchEvent(new w.Event("input"));
  await wait(300);
  f.querySelector(".picks button").click();
  f.dispatchEvent(new w.Event("submit", { cancelable: true })); await wait();
  assert.deepEqual(posts.find((p) => p[0] === "rpc/join_fans")[1], { p_site: "lev-fer", p_email: "fan@x.com", p_place: 1, p_radius: 50 });
  assert.match(f.querySelector(".msg").textContent, /You're on the list/);
});

test("about page has the bio, socials and booking", async () => {
  const { d } = await load(base, "#/about");
  assert.match(d.getElementById("app").textContent, /Lev is a comic\..*Booking/s);
  assert.equal(d.querySelector(".socials .social").title, "Instagram");
});

test("follows Design → Options: show count, compact listings, logo socials with hidden ones, sign-up spot, News", async () => {
  const data = { ...base,
    sites: [{ ...base.sites[0], theme: { home_shows: "1", shows_style: "compact", socials_style: "icons", socials_hide: ["youtube"], signup_style: "bar" } }],
    hosts: [{ ...base.hosts[0], youtube: "https://youtube.com/@lev" }],
    home_picks: [{ id: "n1", style: "card", headline: "My special is out", link: "https://youtu.be/dQw4w9WgXcQ", sort: 0 }] };
  const { d } = await load(data);
  assert.equal(d.querySelectorAll(".show").length, 1);
  assert.ok(d.querySelector(".shows.compact"));
  assert.match(d.querySelector(".block-head a").textContent, /All 2 shows/);
  assert.ok(d.querySelector("a.bar"), "the slim sign-up bar");
  assert.equal(d.querySelector(".fans"), null, "no box when the sign-up is a bar");
  assert.match(d.querySelector(".news iframe").src, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  const about = await load(data, "#/about");
  const s = [...about.d.querySelectorAll(".socials .social")];
  assert.deepEqual(s.map((a) => a.title), ["Instagram"]);
  assert.ok(s[0].querySelector("svg"));
});
