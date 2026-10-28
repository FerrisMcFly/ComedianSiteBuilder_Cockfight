// Makes supabase/UPGRADE_V2_ALL.sql: every database change since v1 in one paste. Run: node tools/bundle-upgrade.mjs
import { readFileSync, writeFileSync } from "node:fs";
const files = ["07_more_sources", "08_create_sites", "09_places", "10_fans", "11_comics", "12_show_finder", "13_me", "14_blog"];
const dir = new URL("../supabase/", import.meta.url);
let out = "-- ComicTable v2: every database change since v1 in one file. Paste it all into Supabase → SQL Editor and click Run.\n" +
  "-- Same as running " + files.map((f) => f.slice(0, 2)).join(", ") + " in order. Safe to run again, and safe if you already ran some of them.\n";
for (const f of files) out += "\n-- ============================== " + f + ".sql ==============================\n" + readFileSync(new URL(f + ".sql", dir), "utf8");
writeFileSync(new URL("UPGRADE_V2_ALL.sql", dir), out);
console.log("Wrote UPGRADE_V2_ALL.sql from " + files.length + " files");
