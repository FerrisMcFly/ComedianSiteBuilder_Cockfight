// Starts a new comic's front end from the starter: node tools/new-site.mjs <id> "<Name>" [domain]
// The id must match the site you created in the admin (All sites → Start a new site).
import { cpSync, existsSync, writeFileSync, readFileSync } from "node:fs";
const [id, name, domain = ""] = process.argv.slice(2);
if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id || "") || !name) {
  console.error('Usage: node tools/new-site.mjs <id> "<Name>" [domain]   e.g. node tools/new-site.mjs lev-fer "Lev Fer" levfer.com');
  process.exit(1);
}
const dir = new URL(`../sites/${id}/`, import.meta.url);
if (existsSync(dir)) { console.error(`sites/${id} already exists.`); process.exit(1); }
cpSync(new URL("../sites/_starter/", import.meta.url), dir, { recursive: true });
writeFileSync(new URL("site.json", dir), JSON.stringify({ id, name, domain }, null, 2) + "\n");
const html = new URL("index.html", dir);
writeFileSync(html, readFileSync(html, "utf8").replace("<title>Comedian</title>", `<title>${name.replace(/</g, "")}</title>`));
console.log(`Made sites/${id}. Next: make it look like ${name}, then a Netlify project with SITE=${id}.`);
