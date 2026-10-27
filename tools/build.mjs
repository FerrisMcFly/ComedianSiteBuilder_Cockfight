// Builds one comic's site into dist/: their own front end from sites/<id>/, plus the shared
// ComicTable admin and data kit, plus a config.js that points everything at their site.
//   node tools/build.mjs              → the site named in the SITE environment variable (Netlify), or cockfight
//   node tools/build.mjs somecomic    → that site
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv[2] || process.env.SITE || "cockfight";
const siteDir = join(root, "sites", id);
if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || !existsSync(join(siteDir, "site.json"))) {
  console.error(`No site called "${id}". Sites live in sites/<id>/ with a site.json.`);
  process.exit(1);
}
const site = JSON.parse(readFileSync(join(siteDir, "site.json"), "utf8"));
const platform = JSON.parse(readFileSync(join(root, "platform", "platform.json"), "utf8"));
const out = join(root, process.env.OUT_DIR || "dist");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(siteDir, out, { recursive: true, filter: (src) => !src.endsWith("site.json") });
cpSync(join(root, "platform", "admin.html"), join(out, "admin.html"));
cpSync(join(root, "platform", "sdk"), join(out, "sdk"), { recursive: true });
const config = {
  SITE_ID: site.id,
  SITE_NAME: site.name,
  LOGIN_DOMAIN: site.login_domain || site.domain || "comictable.app",
  SUPABASE_URL: platform.supabase_url,
  SUPABASE_ANON_KEY: platform.supabase_anon_key
};
writeFileSync(join(out, "config.js"),
  "// Made by tools/build.mjs for " + site.name + ". The anon key is meant to be public; the database's security rules protect the data.\n" +
  "window.COMICTABLE_CONFIG = window.COCKFIGHT_CONFIG = " + JSON.stringify(config, null, 2) + ";\n");
console.log(`Built ${site.name} (${id}) into ${out}`);
