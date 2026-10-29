// The dashboard (comictable.com/dashboard) is kept as organized pieces in platform/app/:
//   page.html   the page itself, with /*@css*/ and /*@js*/ where the pieces go
//   css/*.css   styles, in file-name order
//   js/*.js     the app, in file-name order (00-start opens it, 99-boot closes it). They share one scope.
// tools/build.mjs and the tests put them together with adminPage().
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..", "platform", "app");
const files = (dir, ext) => readdirSync(join(app, dir)).filter((f) => f.endsWith(ext)).sort();

export function adminPage() {
  const css = files("css", ".css").map((f) => readFileSync(join(app, "css", f), "utf8")).join("");
  const js = files("js", ".js").map((f) => readFileSync(join(app, "js", f), "utf8")).join("");
  return readFileSync(join(app, "page.html"), "utf8").replace("/*@css*/\n", () => css).replace("/*@js*/\n", () => js);
}
