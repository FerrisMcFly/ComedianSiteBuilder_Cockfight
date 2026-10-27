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
  assert.match(readFileSync(join(out, "_redirects"), "utf8"), /\/admin\s+https:\/\/comictable\.com\/admin/);
  assert.ok(!existsSync(join(out, "site.json")));
  assert.equal(cfg(out).SITE_ID, "cockfight");
  assert.equal(cfg(out).LOGIN_DOMAIN, "comictable.com");
});

test("the ComicTable admin build has the admin at / and every site's theme", () => {
  const out = build("platform");
  assert.match(readFileSync(join(out, "index.html"), "utf8"), /ComicTable/);
  assert.match(readFileSync(join(out, "admin.html"), "utf8"), /Log in to update your site/);
  assert.ok(existsSync(join(out, "themes/cockfight.json")));
  assert.equal(cfg(out).PLATFORM, true);
  assert.equal(cfg(out).SITE_ID, undefined);
  assert.match(readFileSync(join(out, "_headers"), "utf8"), /noindex/);
});

test("an unknown site fails the build loudly", () => {
  assert.throws(() => build("nobody-here"));
});
