import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JSDOM } from "jsdom";
const opened = [];
after(() => opened.forEach((w) => w.close()));

const out = mkdtempSync(join(tmpdir(), "ct-embed-"));
execFileSync("node", ["tools/build.mjs", "platform"], { env: { ...process.env, OUT_DIR: out } });
const embed = readFileSync(join(out, "embed.js"), "utf8");
const future = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };  // local date, like the sites use

test("someone's own website shows their live shows, episodes and a fan sign-up from one snippet", async () => {
  const calls = [];
  const page = `<!doctype html><html><body><h1>My Squarespace site</h1>
    <div id="a" data-comictable="shows"></div><div id="b" data-comictable="episodes" data-limit="1"></div><div id="c" data-comictable="fans"></div>
    <script data-site="lev-fer" data-accent="#ff3b6b">${embed.replace(/<\/script/g, "<\\/script")}</script></body></html>`;
  const dom = new JSDOM(page, { runScripts: "dangerously", url: "https://levs-own-site.example/", beforeParse(w) {
    w.fetch = async (u, o = {}) => {
      const t = u.split("/rest/v1/")[1].split("?")[0]; calls.push(t);
      const data = {
        sites: [{ id: "lev-fer", name: "Lev Fer", features: { shows: true, fans: true } }],
        hosts: [{ id: "lev-fer-lev", name: "Lev Fer" }],
        "rpc/site_shows": [{ id: "s", host: "lev-fer-lev", date: future(4), time: "9:30 PM", venue: "Comedy Cellar", city: "New York, NY", url: "https://t/s", status: "on_sale" }],
        episodes: [{ num: 3, title: "Third", posted: "2026-10-20" }, { num: 2, title: "Second", posted: "2026-10-13" }]
      };
      return { ok: true, status: 200, text: async () => JSON.stringify(data[t] || []) };
    };
  } });
  opened.push(dom.window);
  await new Promise((r) => setTimeout(r, 150));
  const d = dom.window.document;
  assert.match(d.getElementById("a").textContent, /Comedy Cellar.*Tickets/);
  assert.equal(d.querySelector("#a a.ct-btn").href, "https://t/s");
  assert.match(d.getElementById("b").textContent, /3\. Third/);
  assert.doesNotMatch(d.getElementById("b").textContent, /Second/);
  assert.ok(d.querySelector("#c form"), "fan sign-up shows when the fan list is on");
  assert.equal(d.querySelectorAll(".ct-by").length, 1, "one small credit per page");
  assert.ok(d.querySelector("#c .ct-by"), "under the last box");
  assert.ok(calls.every((c) => c), "talks to the database directly");
});

async function embedPage(body, data) {
  const page = `<!doctype html><html><body>${body}<script data-site="lev-fer" data-accent="#ff3b6b">${embed.replace(/<\/script/g, "<\\/script")}</script></body></html>`;
  const dom = new JSDOM(page, { runScripts: "dangerously", url: "https://levs-own-site.example/", beforeParse(w) {
    w.alerted = 0; w.alert = () => { w.alerted++; };
    w.fetch = async (u) => { const t = u.split("/rest/v1/")[1].split("?")[0]; return { ok: true, status: 200, text: async () => JSON.stringify(data[t] || []) }; };
  } });
  opened.push(dom.window);
  await new Promise((r) => setTimeout(r, 200));
  return dom.window;
}
const LEV = {
  sites: [{ id: "lev-fer", name: "Lev Fer", features: { shows: true, fans: true }, profile: { spotify_url: "https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk" } }],
  hosts: [{ id: "h1", name: "Lev Fer", coaster: { id: "lev-fer", handle: "lev-fer", name: "Lev Fer", title: "Comedian", bio: "New York comic.", photo_url: "https://p/lev.jpg", instagram: "https://instagram.com/levfer" } }],
  "rpc/site_shows": [
    { id: "s1", host: "h1", date: future(4), time: "9:30 PM", venue: "Comedy Cellar", city: "New York, NY", url: "https://t/s1", status: "few_left" },
    { id: "s2", host: "h1", date: future(9), venue: "<img src=x onerror=alert(1)>", city: "Boston, MA", url: "javascript:alert(1)", status: "on_sale" },
    { id: "s3", host: "h1", date: future(12), venue: "Laugh Boston", city: "Boston, MA", status: "sold_out" }],
  episodes: [{ num: 3, title: "Third", posted: "2026-10-20", show_name: "Cockfight", spotify_url: "https://open.spotify.com/episode/x" }],
  links: [{ id: "l1", label: "Tour merch", url: "https://shop.example" }, { id: "l2", label: "Bad", url: "javascript:alert(1)" }],
};

test("more widgets: the next show, their profile, socials, links, podcast player and Coaster, from one script", async () => {
  const w = await embedPage(`<div id="next" data-comictable="next"></div><div id="pro" data-comictable="profile"></div><div id="soc" data-comictable="socials"></div>
    <div id="links" data-comictable="links"></div><div id="pod" data-comictable="podcast"></div><div id="coaster" data-comictable="coaster"></div><div id="live" data-comictable="live" data-no-credit></div>`, LEV);
  const d = w.document, txt = (id) => d.getElementById(id).textContent;
  assert.match(txt("next"), /Next show.*Comedy Cellar.*A few left.*Tickets/s);
  assert.match(txt("pro"), /Lev Fer.*Comedian.*New York comic\./s);
  assert.equal(d.querySelector("#pro img").getAttribute("src"), "https://p/lev.jpg");
  assert.equal(d.querySelector("#soc a").href, "https://instagram.com/levfer");
  assert.deepEqual([...d.querySelectorAll("#links .ct-list a")].map((x) => x.textContent), ["Tour merch"], "only real web links");
  assert.equal(d.querySelector("#pod iframe").getAttribute("src"), "https://open.spotify.com/embed/show/4rOoJ6Egrf8K2IrywzwOMk");
  assert.match(txt("pod"), /Cockfight/);
  assert.equal(d.querySelector("#coaster a").href, "https://comictable.com/lev-fer");
  assert.equal(txt("live").trim(), "", "nothing while they're not live");
});

test("designer templates: their own HTML, filled in for each show, with if/unless and an empty message", async () => {
  const w = await embedPage(`<div id="gigs" data-comictable="shows">
      <template><div class="gig"><b>{venue}</b> <span>{weekday} {month} {day}</span> <a class="t" href="{tickets}" data-ct-if="tickets">Get tix</a><em data-ct-if="status">{status}</em><i data-ct-unless="tickets">no link</i></div></template>
      <p id="none" data-ct-empty>No shows</p></div>
    <div id="me" data-comictable="profile"><template><h2>{name}</h2><img src="{photo}" alt="{name}"><a href="{coaster}">My Coaster</a></template></div>
    <div id="vids" data-comictable="videos"><template><p>{title}</p></template><p id="novids" data-ct-empty>Videos soon</p></div>`, LEV);
  const d = w.document;
  const gigs = [...d.querySelectorAll("#gigs .gig")];
  assert.equal(gigs.length, 3);
  assert.match(gigs[0].textContent, /Comedy Cellar.*Get tix.*A few left/s);
  assert.equal(gigs[0].querySelector("a.t").getAttribute("href"), "https://t/s1");
  assert.equal(gigs[1].querySelector("b").textContent, "<img src=x onerror=alert(1)>", "data is text, never HTML");
  assert.equal(gigs[1].querySelector("img"), null);
  assert.equal(gigs[1].querySelector("a.t"), null, "a javascript: link is dropped");
  assert.match(gigs[1].textContent, /no link/);
  assert.match(gigs[2].textContent, /Sold out/);
  assert.equal(w.alerted, 0);
  assert.ok(d.getElementById("none").hidden, "the empty message hides when there are shows");
  assert.equal(d.querySelector("#me h2").textContent, "Lev Fer");
  assert.equal(d.querySelector("#me img").getAttribute("src"), "https://p/lev.jpg");
  assert.equal(d.querySelector("#me a").getAttribute("href"), "https://comictable.com/lev-fer");
  assert.ok(!d.getElementById("novids").hidden, "no videos: the empty message shows");
  assert.equal(d.querySelector("#me .ct-by"), null, "a designer's template gets no ComicTable credit added");
});
