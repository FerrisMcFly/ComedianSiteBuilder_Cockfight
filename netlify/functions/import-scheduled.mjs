// Runs every hour on Netlify: imports new podcast episodes and YouTube videos.
// The ComicTable admin project (SITE=platform) imports for every site. Until it's live
// (admin_url empty in platform/platform.json), each comic's project imports its own site.
import { createClient } from "@supabase/supabase-js";
import { runSources } from "../lib/importer.mjs";
import platform from "../../platform/platform.json" with { type: "json" };

export default async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.log("Import skipped: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in Netlify."); return; }
  const site = process.env.SITE || "cockfight";
  if (site !== "platform" && platform.admin_url) { console.log("Import skipped: the ComicTable admin project handles imports."); return; }
  const db = createClient(url, key, { auth: { persistSession: false } });
  let query = db.from("sources").select("*").eq("enabled", true);
  if (site !== "platform") query = query.eq("site_id", site);
  const { data: sources, error } = await query;
  if (error) { console.error("Couldn't read sources:", error.message); return; }
  const results = await runSources(db, sources || []);
  console.log(JSON.stringify(results));
};

export const config = { schedule: "@hourly" };
