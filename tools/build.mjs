// Builds one Netlify project's files into dist/.
//   SITE=platform → the ComicTable admin itself (one address where every comic logs in)
//   SITE=<id>     → that comic's own site from sites/<id>/ (Cockfight is the default)
// Run locally with: node tools/build.mjs [platform|<id>]
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv[2] || process.env.SITE || "cockfight";
const platform = JSON.parse(readFileSync(join(root, "platform", "platform.json"), "utf8"));
const out = resolve(root, process.env.OUT_DIR || "dist");
const sites = readdirSync(join(root, "sites")).filter((d) => existsSync(join(root, "sites", d, "site.json")));
const writeConfig = (dir, cfg, label) => writeFileSync(join(dir, "config.js"),
  "// Made by tools/build.mjs for " + label + ". The anon key is meant to be public; the database's security rules protect the data.\n" +
  "window.COMICTABLE_CONFIG = window.COCKFIGHT_CONFIG = " + JSON.stringify(cfg, null, 2) + ";\n");
const logins = { LOGIN_DOMAIN: platform.login_domain || "comictable.com", OLDER_LOGIN_DOMAINS: platform.older_login_domains || [] };
const db = { SUPABASE_URL: platform.supabase_url, SUPABASE_ANON_KEY: platform.supabase_anon_key };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

if (id === "platform") {
  // comictable.com: the front page at /, the admin at /admin
  cpSync(join(root, "platform", "home"), out, { recursive: true });
  cpSync(join(root, "platform", "admin.html"), join(out, "admin.html"));
  cpSync(join(root, "platform", "sdk"), join(out, "sdk"), { recursive: true });
  // Each site's front end says which extras and design settings it has; the admin reads these per site.
  mkdirSync(join(out, "themes"));
  for (const s of sites) {
    const t = join(root, "sites", s, "theme.json");
    if (existsSync(t)) cpSync(t, join(out, "themes", s + ".json"));
  }
  writeConfig(out, { PLATFORM: true, ...logins, ...db }, "the ComicTable admin");
  writeFileSync(join(out, "_headers"), "/admin*\n  X-Robots-Tag: noindex, nofollow\n");
  writeFileSync(join(out, "_redirects"), "/admin  /admin.html  200\n");
  console.log(`Built the ComicTable admin into ${out} (${sites.length} site${sites.length === 1 ? "" : "s"} known)`);
} else {
  const siteDir = join(root, "sites", id);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || id.startsWith("_") || !sites.includes(id)) {
    console.error(`No site called "${id}". Sites live in sites/<id>/ with a site.json.`);
    process.exit(1);
  }
  const site = JSON.parse(readFileSync(join(siteDir, "site.json"), "utf8"));
  cpSync(siteDir, out, { recursive: true, filter: (src) => !src.endsWith("site.json") });
  cpSync(join(root, "platform", "sdk"), join(out, "sdk"), { recursive: true });
  if (platform.admin_url) {
    // ComicTable's admin has its own home: send /admin there.
    writeFileSync(join(out, "_redirects"), `/admin  ${platform.admin_url}  302\n/admin.html  ${platform.admin_url}  302\n`);
  } else {
    cpSync(join(root, "platform", "admin.html"), join(out, "admin.html"));
  }
  writeConfig(out, { SITE_ID: site.id, SITE_NAME: site.name, ...logins, ...db }, site.name);
  console.log(`Built ${site.name} (${id}) into ${out}`);
}
