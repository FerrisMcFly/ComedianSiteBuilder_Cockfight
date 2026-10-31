// The custom-built kit (docs/CUSTOM-SITES.md): starting a design for one comic, and previewing it with real data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { route, siteFor, configJs } from "../tools/preview.mjs";

const repo = new URL("../", import.meta.url).pathname;
const newSite = (dir, ...args) => execFileSync("node", [join(repo, "tools/new-site.mjs"), ...args], { env: { ...process.env, SITES_DIR: dir }, encoding: "utf8", stdio: "pipe" });

test("new-site starts a comic's own design from the starter or any template, as a design (not a template)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ct-sites-"));
  cpSync(join(repo, "sites/_starter"), join(dir, "_starter"), { recursive: true });
  cpSync(join(repo, "sites/punk-flyer"), join(dir, "punk-flyer"), { recursive: true });
  const out = newSite(dir, "rita-ramos", "Rita Ramos", "--from", "punk-flyer");
  assert.match(out, /comictable\.com\/s\/rita-ramos\//);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "rita-ramos/site.json"), "utf8")), { id: "rita-ramos", name: "Rita Ramos", domain: "" }, "not offered to everyone as a template");
  const theme = JSON.parse(readFileSync(join(dir, "rita-ramos/theme.json"), "utf8"));
  assert.equal(theme.name, "Rita Ramos's site");
  assert.ok(theme.settings.some((s) => s.key === "photo_shape"), "keeps the template's settings");
  assert.match(readFileSync(join(dir, "rita-ramos/index.html"), "utf8"), /<title>Rita Ramos<\/title>/);
  newSite(dir, "dana-fox", "Dana Fox");
  assert.ok(existsSync(join(dir, "dana-fox/index.html")), "the plain starter works too");
  assert.throws(() => newSite(dir, "rita-ramos", "Rita Ramos"), /already exists/);
  assert.throws(() => newSite(dir, "x-y", "X", "--from", "nope"), /no design called/);
  assert.throws(() => newSite(dir, "Bad Id", "X"), /Usage/);
});

test("preview serves a design the way the shared host does, with that site's config", () => {
  assert.equal(route("lev-fer", "/"), join(repo, "sites/lev-fer/index.html"));
  assert.equal(route("lev-fer", "/sdk/templates.js"), join(repo, "platform/sdk/templates.js"));
  assert.equal(route("spotlight", "/join"), join(repo, "platform/home/join.html"));
  assert.ok(route("lev-fer", "/../../etc/passwd").startsWith(join(repo, "sites/lev-fer")), "can't reach outside the design");
  assert.equal(siteFor("lev-fer", {}).id, "lev-fer");
  assert.equal(siteFor("punk-flyer", {}).id, "", "a template needs a site's data");
  assert.equal(siteFor("punk-flyer", { SITE: "lev-fer" }).id, "lev-fer");
  const cfg = configJs("lev-fer", "Lev Fer");
  assert.match(cfg, /"SITE_ID": "lev-fer"/); assert.match(cfg, /SUPABASE_ANON_KEY/); assert.doesNotMatch(cfg, /service_role/);
});

test("the guide covers the rules every design follows", () => {
  const doc = readFileSync(join(repo, "docs/CUSTOM-SITES.md"), "utf8");
  for (const must of ["k.t(key, default)", "photo_shape", "Never invent data", "new-site.mjs", "preview.mjs", "data-ct"]) assert.ok(doc.includes(must), must);
});
