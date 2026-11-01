// comictable.com/go/<show>: counts a Tickets tap and sends the fan on to that show's own ticket page.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SHOW = "11111111-2222-4333-8444-555555555555", NOLINK = "11111111-2222-4333-8444-666666666666";
let taps, realFetch, handler, mod, failSite;
const send = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
before(async () => {
  process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const u = new URL(typeof input === "string" ? input : input.url), method = (init.method || "GET").toUpperCase();
    const t = u.pathname.replace("/rest/v1/", "");
    if (t === "shows" && method === "GET") {
      const id = (u.searchParams.get("id") || "").replace("eq.", "");
      const rows = { [SHOW]: { id: SHOW, url: "https://tickets.example/the-stand", comic_id: "lev-fer" }, [NOLINK]: { id: NOLINK, url: "", comic_id: "lev-fer" } };
      return rows[id] ? send(200, rows[id]) : send(406, { message: "none" });
    }
    if (t === "ticket_taps" && method === "POST") { const b = JSON.parse(init.body); if (failSite && b.site_id) return send(409, { message: "violates foreign key" }); taps.push(b); return send(201); }
    return send(400, {});
  };
  mod = await import("../netlify/functions/go.mjs"); handler = mod.default;
});
after(() => { globalThis.fetch = realFetch; });
const go = (path, ua = "Mozilla/5.0 (iPhone)") => handler(new Request("https://comictable.com" + path, { headers: { "user-agent": ua } }));

test("a tap is counted and the fan goes straight to the show's ticket page", async () => {
  taps = [];
  const r = await go("/go/" + SHOW + "?f=coaster&s=lev-fer");
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "https://tickets.example/the-stand");
  assert.deepEqual(taps, [{ show_id: SHOW, comic_id: "lev-fer", source: "coaster", site_id: "lev-fer" }]);
});

test("it only ever sends people to the show's own ticket link; bad or unknown links go home", async () => {
  taps = [];
  assert.equal((await go("/go/" + NOLINK)).headers.get("location"), "https://comictable.com/");
  assert.equal((await go("/go/not-a-show")).headers.get("location"), "https://comictable.com/");
  assert.equal((await go("/go/" + SHOW + "?to=https://evil.example")).headers.get("location"), "https://tickets.example/the-stand", "no way to point it elsewhere");
  assert.equal(taps.length, 1);
  assert.equal(taps[0].source, "other");
});

test("robots and link previews aren't counted; a bad site id never stops the fan", async () => {
  taps = [];
  await go("/go/" + SHOW, "facebookexternalhit/1.1"); await go("/go/" + SHOW, "Slackbot-LinkExpanding"); await go("/go/" + SHOW, "");
  assert.equal(taps.length, 0);
  assert.ok(mod.isRobot("Twitterbot/1.0")); assert.ok(!mod.isRobot("Mozilla/5.0 (Macintosh)"));
  failSite = true;
  const r = await go("/go/" + SHOW + "?s=gone-site&f=site");
  failSite = false;
  assert.equal(r.headers.get("location"), "https://tickets.example/the-stand");
  assert.deepEqual(taps, [{ show_id: SHOW, comic_id: "lev-fer", source: "site", site_id: null }]);
});

test("Tickets links go through /go when the page knows where it lives, and straight to the ticket page otherwise", () => {
  const vm = { window: {} }; vm.window.window = vm.window;
  const sdk = readFileSync(new URL("../platform/sdk/csb.js", import.meta.url), "utf8");
  new Function("window", "globalThis", sdk)(vm.window, vm.window);
  const CSB = vm.window.CSB;
  CSB.init({ SUPABASE_URL: "https://x", SUPABASE_ANON_KEY: "k", SITE_ID: "lev-fer", GO_URL: "https://comictable.com" });
  assert.equal(CSB.tapLink(SHOW, "https://tickets.example/x"), "https://comictable.com/go/" + SHOW + "?f=site&s=lev-fer");
  assert.equal(CSB.tapLink("s1", "https://tickets.example/x"), "https://tickets.example/x", "not a real show id");
  assert.equal(CSB.tapLink(SHOW, "javascript:alert(1)"), "javascript:alert(1)", "never wrapped; each page checks links itself");
  CSB.init({ SUPABASE_URL: "https://x", SUPABASE_ANON_KEY: "k", SITE_ID: "lev-fer" });
  assert.equal(CSB.tapLink(SHOW, "https://tickets.example/x"), "https://tickets.example/x", "no /go known: straight there");
  const build = readFileSync(new URL("../tools/build.mjs", import.meta.url), "utf8");
  assert.match(build, /"\/go\/\*  \/\.netlify\/functions\/go  200"/);
  const coaster = readFileSync(new URL("../platform/home/coaster.html", import.meta.url), "utf8");
  assert.match(coaster, /href: tapUrl\(d\)/); assert.match(coaster, /href: tapUrl\(next\)/);
});
