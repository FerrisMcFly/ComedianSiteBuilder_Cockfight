// Starts a custom-built front end for a comic: node tools/new-site.mjs <id> "<Name>" [--from <template>]
//   <id>        the site's id from the dashboard (ComicTable → Sites → "Set up a site for a comic", pick "Custom-built")
//   --from      start from one of the templates (sites/<template>/) instead of the plain starter
// It lands in sites/<id>/. Once pushed, it's that site's design on the shared host: comictable.com/s/<id>/ right away,
// and their own address once it points at ComicTable. See docs/CUSTOM-SITES.md.
import { cpSync, existsSync, writeFileSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const fromAt = args.indexOf("--from");
const from = fromAt >= 0 ? args.splice(fromAt, 2)[1] : "_starter";
const [id, name] = args;
const sites = process.env.SITES_DIR ? new URL("file://" + process.env.SITES_DIR.replace(/\/?$/, "/")) : new URL("../sites/", import.meta.url);
const fail = (msg) => { console.error(msg); process.exit(1); };

if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id || "") || !name)
  fail('Usage: node tools/new-site.mjs <id> "<Name>" [--from <template>]   e.g. node tools/new-site.mjs rita-ramos "Rita Ramos" --from punk-flyer');
const src = new URL(from + "/", sites), dir = new URL(id + "/", sites);
if (!existsSync(new URL("index.html", src))) fail(`There's no design called "${from}" in sites/.`);
if (existsSync(dir)) fail(`sites/${id} already exists.`);

cpSync(src, dir, { recursive: true });
// a custom site is its own design, not a template (templates are what the setup flow offers everyone)
writeFileSync(new URL("site.json", dir), JSON.stringify({ id, name, domain: "" }, null, 2) + "\n");
const theme = new URL("theme.json", dir);
if (existsSync(theme)) {
  const t = JSON.parse(readFileSync(theme, "utf8"));
  t.name = name + "'s site";
  t.description = "Custom-built for " + name + (from === "_starter" ? "." : ", started from the " + from + " template.");
  writeFileSync(theme, JSON.stringify(t, null, 2) + "\n");
}
const html = new URL("index.html", dir);
writeFileSync(html, readFileSync(html, "utf8").replace(/<title>[^<]*<\/title>/, `<title>${name.replace(/[<&]/g, "")}</title>`));
console.log(`Made sites/${id}${from === "_starter" ? "" : " from " + from}.
Preview it with their real data:  node tools/preview.mjs ${id}
Push it, and it's their site at comictable.com/s/${id}/ (and their own address once it points at ComicTable).`);
