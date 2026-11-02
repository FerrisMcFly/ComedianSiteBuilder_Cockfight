// Runs every hour on Netlify: imports new podcast episodes, YouTube videos and found shows.
// Only the ComicTable project (SITE=platform) does this, for every site. Comics' projects skip it.
import { createClient } from "@supabase/supabase-js";
import { runSources } from "../lib/importer.mjs";
import { ensureZips } from "../lib/zips.mjs";

export default async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.log("Import skipped: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in Netlify."); return; }
  const site = process.env.SITE || "";
  if (site !== "platform") { console.log("Import skipped: comictable.com runs every site's imports."); return; }
  const db = createClient(url, key, { auth: { persistSession: false } });
  // the first run after 25_foundation.sql loads every US ZIP code (for fan sign-ups); after that it's a quick check
  console.log(JSON.stringify(await ensureZips(db).catch((e) => ({ zips: "error: " + e.message }))));
  let query = db.from("sources").select("*").eq("enabled", true);
  if (site !== "platform") query = query.eq("site_id", site);
  const { data: sources, error } = await query;
  if (error) { console.error("Couldn't read sources:", error.message); return; }
  const results = await runSources(db, sources || []);
  console.log(JSON.stringify(results));
};

export const config = { schedule: "@hourly" };
