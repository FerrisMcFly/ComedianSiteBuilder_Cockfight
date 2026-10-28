// Netlify asks this before building a project: "did anything this project uses change?"
// Exit 0 = nothing changed, skip the build (saves deploy credits). Exit 1 = build.
// Each project sets SITE: "platform" for comictable.com, or a comic's site id.
import { execFileSync } from "node:child_process";
const site = process.env.SITE || "cockfight";
const from = process.env.CACHED_COMMIT_REF, to = process.env.COMMIT_REF || "HEAD";
if (!from || from === to) process.exit(1); // first build, or nothing to compare: build
const watch = site === "platform"
  ? ["platform/", "netlify/", "tools/build.mjs", "package.json", "package-lock.json", "netlify.toml", "sites/"]   // the admin reads every site's theme.json
  : [`sites/${site}/`, "platform/sdk/", "platform/platform.json", "netlify/", "tools/build.mjs", "package.json", "package-lock.json", "netlify.toml"];
let changed;
try { changed = execFileSync("git", ["diff", "--name-only", from, to], { encoding: "utf8" }).split("\n").filter(Boolean); }
catch (e) { process.exit(1); } // can't tell: build to be safe
const hit = changed.filter((f) => watch.some((w) => (w.endsWith("/") ? f.startsWith(w) : f === w)));
console.log(hit.length ? `Building ${site}: ${hit.length} changed file(s), e.g. ${hit[0]}` : `Skipping ${site}: none of its files changed`);
process.exit(hit.length ? 1 : 0);
