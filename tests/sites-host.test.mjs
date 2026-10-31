// One project runs every comic's site (netlify/edge-functions/sites.js): a comic's address, or comictable.com/s/<id>/,
// gets that site's design with its own config.js. comictable.com's own pages pass straight through.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

let handler, mod, realFetch, calls;
const SITES = [
  { id: "rita-ramos", name: "Rita Ramos", domain: "ritaramoscomedy.com", theme: { way: "template", template: "starter" } },
  { id: "lev-fer", name: "Lev Fer", domain: "levfer.gay", theme: {} },
  { id: "dana", name: "Dana", domain: null, theme: { way: "template", template: "gone" } }];
const DESIGNS = { starter: "<p>starter</p><script src=\"config.js\"></script>", "lev-fer": "<p>console lobby</p>" };
before(async () => {
  realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    const url = new URL(String(u)); calls.push(url.pathname + url.search);
    if (url.pathname === "/ct-config.json") return new Response(JSON.stringify({ SUPABASE_URL: "https://db.test", SUPABASE_ANON_KEY: "anon", LOGIN_DOMAIN: "comictable.com" }));
    if (url.pathname === "/rest/v1/sites") {
      const id = url.searchParams.get("id"), dom = url.searchParams.get("domain");
      const rows = SITES.filter((s) => id ? "eq." + s.id === id : dom && s.domain && dom.slice(4, -1).split(",").includes(s.domain));
      return new Response(JSON.stringify(rows));
    }
    const d = url.pathname.match(/^\/designs\/(.+)\.html$/);
    if (d) return DESIGNS[d[1]] ? new Response(DESIGNS[d[1]]) : new Response("nope", { status: 404 });
    return new Response("?", { status: 404 });
  };
  mod = await import("../netlify/edge-functions/sites.js"); handler = mod.default;
});
after(() => { globalThis.fetch = realFetch; });
const ctx = { next: async () => new Response("platform page") };
const go = async (url) => { calls = []; const r = await handler(new Request(url), ctx); return r instanceof URL ? { rewrite: r.pathname } : { status: r.status, type: r.headers.get("content-type"), loc: r.headers.get("location"), body: await r.text() }; };

test("a comic's own address gets their site, in their template, with their config", async () => {
  let r = await go("https://www.ritaramoscomedy.com/");
  assert.equal(r.status, 200); assert.match(r.body, /starter/);
  r = await go("https://ritaramoscomedy.com/config.js");
  assert.match(r.type, /javascript/); assert.match(r.body, /"SITE_ID": "rita-ramos"/); assert.match(r.body, /"SUPABASE_ANON_KEY": "anon"/);
  assert.deepEqual(await go("https://ritaramoscomedy.com/join"), { rewrite: "/join.html" });
  assert.equal((await go("https://ritaramoscomedy.com/admin")).loc, "https://comictable.com/login");
  assert.equal((await go("https://ritaramoscomedy.com/dashboard")).status, 302, "the dashboard only lives on comictable.com");
});

test("a custom-built site uses its own design; a missing template falls back to Starter", async () => {
  assert.match((await go("https://levfer.gay/")).body, /console lobby/);
  assert.deepEqual(mod.designsFor(SITES[1]), ["lev-fer", "starter"]);
  assert.deepEqual(mod.designsFor({ id: "x-y", theme: { design: "cockfight" } }), ["cockfight", "x-y", "starter"]);
  assert.match((await go("https://comictable.com/s/dana/")).body, /starter/);
});

test("comictable.com/s/<id>/ shows a site before it has an address, on previews too", async () => {
  assert.equal((await go("https://comictable.com/s/rita-ramos")).loc, "https://comictable.com/s/rita-ramos/");
  assert.match((await go("https://deploy-preview-36--comictable.netlify.app/s/rita-ramos/")).body, /starter/);
  assert.match((await go("https://comictable.com/s/rita-ramos/config.js")).body, /rita-ramos/);
  assert.deepEqual(await go("https://comictable.com/s/rita-ramos/sdk/csb.js"), { rewrite: "/sdk/csb.js" });
});

test("comictable.com's own pages pass straight through; unknown addresses say so", async () => {
  assert.equal((await go("https://comictable.com/")).body, "platform page");
  assert.equal((await go("https://comictable.com/lev-fer")).body, "platform page", "Coasters stay at comictable.com/<comic>");
  assert.equal((await go("https://deploy-preview-36--comictable.netlify.app/dashboard")).body, "platform page");
  assert.equal((await go("http://localhost:8888/")).body, "platform page");
  let r = await go("https://nobody-here.com/");
  assert.equal(r.status, 404); assert.match(r.body, /isn't set up on ComicTable yet/);
  r = await go("https://ritaramoscomedy.com/wp-admin");
  assert.equal(r.status, 404);
  assert.equal((await go("https://comictable.com/s/nobody/")).status, 404);
});

test("site lookups are cached for a minute", async () => {
  await go("https://levfer.gay/");
  await go("https://levfer.gay/config.js");
  assert.ok(!calls.some((c) => c.startsWith("/rest/v1/sites")), "the second request didn't ask the database again");
});

test("the build puts every design and the shared config on comictable.com", () => {
  const out = mkdtempSync(join(tmpdir(), "ct-"));
  execFileSync("node", ["tools/build.mjs", "platform"], { env: { ...process.env, OUT_DIR: out } });
  for (const d of ["starter", "lev-fer", "cockfight"]) assert.ok(existsSync(join(out, "designs", d + ".html")), d);
  const cfg = JSON.parse(readFileSync(join(out, "ct-config.json"), "utf8"));
  assert.ok(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  assert.doesNotMatch(JSON.stringify(cfg), /service_role/);
  assert.deepEqual(mod.config.path, "/*");
});
