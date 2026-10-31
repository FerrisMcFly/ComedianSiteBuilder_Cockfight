// Site templates (sites/<template>/ with "template": true in site.json). The founder's rule (Oct 31): flavor text is
// never baked in. Every line that isn't the comic's own data is a Design setting the comic can retype or clear, and
// a cleared line is gone from the page. These tests hold every template to it.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { JSDOM } from "jsdom";

const opened = [];
after(() => opened.forEach((w) => w.close()));
const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const sdk = read("platform/sdk/csb.js"), kit = read("platform/sdk/templates.js");
const TEMPLATES = readdirSync(new URL("sites/", root)).filter((d) => existsSync(new URL("sites/" + d + "/site.json", root)) && JSON.parse(read("sites/" + d + "/site.json")).template);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const textSettings = (tpl) => JSON.parse(read("sites/" + tpl + "/theme.json")).settings.filter((s) => s.type === "text");

async function render(tpl, theme) {
  const html = read("sites/" + tpl + "/index.html")
    .replace('<script src="config.js"></script>', '<script>window.COMICTABLE_CONFIG={SITE_ID:"lev-fer",SUPABASE_URL:"https://x.supabase.co",SUPABASE_ANON_KEY:"k"}</script>')
    .replace('<script src="sdk/csb.js"></script>', () => "<script>" + sdk.replace(/<\/script/g, "<\\/script") + "</script>")
    .replace('<script src="sdk/templates.js"></script>', () => "<script>" + kit.replace(/<\/script/g, "<\\/script") + "</script>");
  const data = {
    sites: [{ id: "lev-fer", name: "Lev Fer", features: { shows: true, videos: true, podcast: true, fans: true }, profile: { spotify_url: "https://open.spotify.com/x" }, theme: { way: "template", template: tpl, ...theme } }],
    hosts: [{ id: "h1", name: "Lev Fer", coaster: { id: "lev-fer", name: "Lev Fer", bio: "New York comic.", photo_url: "https://p/lev.jpg", instagram: "https://instagram.com/levfer" } }],
    "rpc/site_shows": [{ id: "s1", host: "h1", date: day(6), venue: "The Stand", city: "New York, NY", url: "https://tix/1", status: "on_sale" }, { id: "s2", host: "h1", date: day(9), venue: "Laugh Boston", city: "Boston, MA", status: "sold_out" }],
    episodes: [{ id: "e1", num: 1, title: "Ep", show_name: "Cockfight", spotify_url: "https://open.spotify.com/e" }],
    "rpc/site_videos": [{ youtube_id: "abcdefghijk", title: "Live at The Stand" }],
  };
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://levfer.com/", beforeParse(w) {
    w.matchMedia = () => ({ matches: false }); w.scrollTo = () => {};
    w.fetch = async (u) => { const t = u.split("/rest/v1/")[1].split("?")[0]; return { ok: true, status: 200, text: async () => JSON.stringify(data[t] || []) }; };
  } });
  opened.push(dom.window);
  for (let i = 0; i < 40 && /Loading…/.test(dom.window.document.body.textContent); i++) await new Promise((r) => setTimeout(r, 10));
  await new Promise((r) => setTimeout(r, 20));
  return dom.window.document;
}

test("there are templates, and the setup flow only offers ones that exist", () => {
  assert.ok(TEMPLATES.includes("spotlight"));
  const setup = read("platform/app/js/36-setup-site.js");
  const offered = [...setup.match(/SITE_TEMPLATES = \[(.*)\];/)[1].matchAll(/\["([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.equal(offered[0], "spotlight", "Clean Spotlight is first (founder, Oct 31)");
  for (const id of offered) assert.ok(id === "starter" || TEMPLATES.includes(id), id + " is a real template");
});

for (const tpl of TEMPLATES) {
  test(tpl + ": loads the kit, carries link-preview tags, and its words match its settings", () => {
    const html = read("sites/" + tpl + "/index.html");
    for (const s of ["config.js", "sdk/csb.js", "sdk/templates.js"]) assert.ok(html.includes('<script src="' + s + '"></script>'), s);
    assert.match(html, /data-ct="title"/);
    const W = Function("return " + html.match(/var W = (\{[\s\S]*?\});/)[1])();
    const set = textSettings(tpl);
    assert.ok(set.length, "it has words to change");
    assert.deepEqual(Object.fromEntries(set.map((s) => [s.key, s.default])), W, "theme.json defaults and the page's defaults agree");
  });

  test(tpl + ": every line is the comic's own words, and a cleared line is gone", async () => {
    const set = textSettings(tpl);
    let d = await render(tpl, Object.fromEntries(set.map((s) => [s.key, "ZZ" + s.key])));
    const text = d.body.textContent + [...d.querySelectorAll("button, input")].map((b) => b.textContent + (b.placeholder || "")).join(" ");
    for (const s of set) assert.ok(text.includes("ZZ" + s.key), s.key + " shows what the comic typed");
    assert.match(d.body.textContent, /The Stand/, "their shows are there");
    d = await render(tpl, Object.fromEntries(set.map((s) => [s.key, ""])));
    d.querySelectorAll("nav, script, style").forEach((n) => n.remove());  // the menu names the sections plainly
    const shown = d.body.textContent;
    for (const s of set) {
      const plain = s.default.replace(/\{[a-z_]+\}/g, "").trim();
      // a cleared button keeps a plain working label; everything else disappears
      if (/button/.test(s.key)) continue;
      if (plain.length > 3) assert.ok(!shown.includes(plain), s.key + " is gone when cleared");
    }
    assert.match(shown, /The Stand/, "the page still works with every line cleared");
  });
}
