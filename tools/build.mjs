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
  // the app is one page, served at /login and /dashboard
  cpSync(join(root, "platform", "admin.html"), join(out, "app.html"));
  cpSync(join(root, "platform", "sdk"), join(out, "sdk"), { recursive: true });
  // Each site's front end says which extras and design settings it has; the admin reads these per site.
  mkdirSync(join(out, "themes"));
  for (const s of sites) {
    const t = join(root, "sites", s, "theme.json");
    if (existsSync(t)) cpSync(t, join(out, "themes", s + ".json"));
  }
  writeConfig(out, { PLATFORM: true, ...logins, ...db }, "the ComicTable admin");
  // comictable.com/embed.js: the data kit plus small widgets, for comics who keep their own site
  writeFileSync(join(out, "embed.js"), "/* ComicTable embed. See https://comictable.com */\n(function () {\nvar EMBED_CFG = " + JSON.stringify(db) + ";\n" +
    readFileSync(join(root, "platform", "sdk", "csb.js"), "utf8") + "\n" + readFileSync(join(root, "platform", "embed", "widgets.js"), "utf8") + "\n})();\n");
  writeFileSync(join(out, "_headers"), ["/app.html", "/login", "/dashboard"].map((p) => p + "\n  X-Robots-Tag: noindex, nofollow\n").join("") +
    "/embed.js\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=300\n");
  writeFileSync(join(out, "_redirects"), ["/login  /app.html  200", "/dashboard  /app.html  200", "/admin  /login  301", "/admin.html  /login  301"].join("\n") + "\n");
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
    // the app is one page, served at /login and /dashboard
  cpSync(join(root, "platform", "admin.html"), join(out, "app.html"));
  }
  writeConfig(out, { SITE_ID: site.id, SITE_NAME: site.name, ...logins, ...db }, site.name);
  console.log(`Built ${site.name} (${id}) into ${out}`);
}
