// comictable.com/press/<comic>: a comic's press kit for clubs, with no login.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const opened = [];
after(() => opened.forEach((w) => w.close()));
const html = readFileSync(new URL("../platform/home/press.html", import.meta.url), "utf8")
  .replace('<script src="/config.js"></script>', '<script>window.COMICTABLE_CONFIG={SUPABASE_URL:"https://x.supabase.co",SUPABASE_ANON_KEY:"k"}</script>');

async function load(path, data) {
  const asked = [];
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://comictable.com" + path, beforeParse(w) {
    w.fetch = async (u) => { asked.push(u); const t = u.split("/rest/v1/")[1].split("?")[0]; return { ok: true, status: 200, json: async () => data[t] || [] }; };
  } });
  opened.push(dom.window);
  await new Promise((r) => setTimeout(r, 80));
  return { d: dom.window.document, asked };
}

test("shows the comic's primary photo, the rest, bios, credits and booking, with full-size downloads", async () => {
  const { d, asked } = await load("/press/lev-fer", {
    comics: [{ id: "lev-fer", name: "Lev Fer", title: "Comedian", short_bio: "Short one.", long_bio: "Long one.", credits: "Comedy Central\nJFL", booking_contact: "Agent <book@lev.example>", instagram: "https://instagram.com/levfer" }],
    press_photos: [{ url: "https://s/press/lev-fer/1.jpg", web_url: "https://s/press/lev-fer/1-web.jpg", is_primary: true, credit: "Photo: A. Person", width: 3000, height: 4000 },
      { url: "https://s/press/lev-fer/2.jpg", is_primary: false }] });
  assert.ok(asked[0].includes("id=eq.lev-fer"));
  assert.equal(d.title, "Lev Fer · Press kit");
  assert.equal(d.querySelector("h1").textContent, "Lev Fer");
  assert.equal(d.querySelector(".primary img").getAttribute("src"), "https://s/press/lev-fer/1-web.jpg");
  assert.match(d.querySelector(".primary figcaption").textContent, /Primary.*Photo: A\. Person · 3000 × 4000/);
  assert.equal(d.querySelector(".intro a.btn.red").getAttribute("href"), "https://s/press/lev-fer/1.jpg?download=lev-fer-1.jpg");
  assert.equal(d.querySelectorAll(".ph").length, 1);
  assert.match(d.body.textContent, /Short one\..*Long one\..*Comedy Central.*JFL/s);
  assert.equal(d.querySelector('a[href^="mailto:"]').getAttribute("href"), "mailto:book@lev.example");
});

test("a comic with no press photos yet still gets their profile photo and bio", async () => {
  const { d } = await load("/press/tristan-bowling", { comics: [{ id: "tristan-bowling", name: "Tristan Bowling", bio: "Profile bio.", photo_url: "https://p/t.jpg" }] });
  assert.equal(d.querySelector(".primary img").getAttribute("src"), "https://p/t.jpg");
  assert.match(d.body.textContent, /Profile bio\./);
});

test("an unknown comic gets a plain not-found message", async () => {
  const { d } = await load("/press/nobody", { comics: [] });
  assert.match(d.body.textContent, /No press kit here/);
});
