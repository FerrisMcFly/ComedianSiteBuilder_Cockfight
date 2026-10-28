import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const build = (arg) => { const out = mkdtempSync(join(tmpdir(), "ct-")); execFileSync("node", ["tools/build.mjs", arg], { env: { ...process.env, OUT_DIR: out } }); return out; };
const cfg = (dir) => { const w = {}; new Function("window", readFileSync(join(dir, "config.js"), "utf8"))(w); return w.COMICTABLE_CONFIG; };

test("a comic's build has their front end, the data kit and their config", () => {
  const out = build("cockfight");
  for (const f of ["index.html", "theme.json", "sdk/csb.js"]) assert.ok(existsSync(join(out, f)), f);
  assert.match(readFileSync(join(out, "_redirects"), "utf8"), /\/admin\s+https:\/\/comictable\.com\/login/);
  assert.ok(!existsSync(join(out, "site.json")));
  assert.equal(cfg(out).SITE_ID, "cockfight");
  assert.equal(cfg(out).LOGIN_DOMAIN, "comictable.com");
});

test("the ComicTable admin build has the admin at / and every site's theme", () => {
  const out = build("platform");
  assert.match(readFileSync(join(out, "index.html"), "utf8"), /ComicTable/);
  assert.match(readFileSync(join(out, "app.html"), "utf8"), /Log in to update your site/);
  const r = readFileSync(join(out, "_redirects"), "utf8");
  assert.match(r, /^\/login\s+\/app\.html\s+200$/m); assert.match(r, /^\/dashboard\s+\/app\.html\s+200$/m); assert.match(r, /^\/admin\s+\/login\s+301$/m);
  assert.ok(existsSync(join(out, "themes/cockfight.json")));
  assert.equal(cfg(out).PLATFORM, true);
  assert.equal(cfg(out).SITE_ID, undefined);
  assert.match(readFileSync(join(out, "_headers"), "utf8"), /noindex/);
});

test("an unknown site fails the build loudly", () => {
  assert.throws(() => build("nobody-here"));
});

test("the one-file database upgrade is up to date with its parts", () => {
  const before = readFileSync("supabase/UPGRADE_V2_ALL.sql", "utf8");
  execFileSync("node", ["tools/bundle-upgrade.mjs"]);
  assert.equal(readFileSync("supabase/UPGRADE_V2_ALL.sql", "utf8"), before, "run node tools/bundle-upgrade.mjs");
});

test("a project only rebuilds when its own files change", () => {
  const run = (site, files) => {
    // make a throwaway repo with two commits so the check has something to compare
    const dir = mkdtempSync(join(tmpdir(), "ct-sb-"));
    const sh = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
    sh("init", "-q"); sh("config", "user.email", "t@t"); sh("config", "user.name", "t");
    execFileSync("bash", ["-c", "mkdir -p sites/cockfight platform/home && echo a > sites/cockfight/index.html && echo a > platform/home/index.html && git add -A && git commit -qm one"], { cwd: dir });
    const from = sh("rev-parse", "HEAD").trim();
    execFileSync("bash", ["-c", files.map((f) => `mkdir -p $(dirname ${f}) && echo b >> ${f}`).join(" && ") + " && git add -A && git commit -qm two"], { cwd: dir });
    const to = sh("rev-parse", "HEAD").trim();
    try { execFileSync("node", [new URL("../tools/should-build.mjs", import.meta.url).pathname], { cwd: dir, env: { ...process.env, SITE: site, CACHED_COMMIT_REF: from, COMMIT_REF: to }, stdio: "pipe" }); return "skip"; }
    catch (e) { return "build"; }
  };
  assert.equal(run("cockfight", ["platform/home/index.html"]), "skip", "front page edits don't rebuild Cockfight");
  assert.equal(run("platform", ["platform/home/index.html"]), "build");
  assert.equal(run("cockfight", ["sites/cockfight/index.html"]), "build");
  assert.equal(run("lev-fer", ["sites/cockfight/index.html"]), "skip", "Cockfight edits don't rebuild Lev's site");
  assert.equal(run("lev-fer", ["platform/sdk/csb.js"]), "build", "the data kit is shared by every site");
});
