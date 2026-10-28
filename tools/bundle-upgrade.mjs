// Makes the one-paste upgrade files in supabase/. Run: node tools/bundle-upgrade.mjs
// Every bundle ends with 99_rules.sql (all access rules), so running an older bundle again can't undo newer rules.
//   UPGRADE_V2_ALL.sql: every change from v1 to v2 (07–14)
//   UPGRADE_V3_ALL.sql: everything after that (15 on): home screen picks, photo uploads, press kit
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL("../supabase/", import.meta.url);
const bundles = {
  UPGRADE_V2_ALL: { title: "ComicTable v2: every database change since v1", files: ["07_more_sources", "08_create_sites", "09_places", "10_fans", "11_comics", "12_show_finder", "13_me", "14_blog", "99_rules"] },
  UPGRADE_V3_ALL: { title: "ComicTable v3: every database change since v2 (home screen, photo uploads, press kit, QR fan sign-up, more socials, comictable.com showcase, roles)", files: ["15_home_picks", "16_photo_uploads", "17_press_kit", "18_fan_signup", "19_more_socials", "20_showcase", "99_rules"] }
};
for (const [name, b] of Object.entries(bundles)) {
  let out = "-- " + b.title + " in one file. Paste it all into Supabase → SQL Editor and click Run.\n" +
    "-- Same as running " + b.files.map((f) => f.slice(0, 2)).join(", ") + " in order. Safe to run again, and safe if you already ran some of them.\n";
  for (const f of b.files) out += "\n-- ============================== " + f + ".sql ==============================\n" + readFileSync(new URL(f + ".sql", dir), "utf8");
  writeFileSync(new URL(name + ".sql", dir), out);
  console.log("Wrote " + name + ".sql from " + b.files.length + " files");
}
