// Runs every hour on Netlify: imports new podcast episodes and YouTube videos for this project's site.
import { createClient } from "@supabase/supabase-js";
import { runSources } from "../lib/importer.mjs";

export default async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.log("Import skipped: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in Netlify."); return; }
  const db = createClient(url, key, { auth: { persistSession: false } });
  // Each comic's Netlify project imports only its own site's feeds (SITE is set per project; Cockfight is the default).
  const site = process.env.SITE || "cockfight";
  const { data: sources, error } = await db.from("sources").select("*").eq("enabled", true).eq("site_id", site);
  if (error) { console.error("Couldn't read sources:", error.message); return; }
  const results = await runSources(db, sources || []);
  console.log(JSON.stringify(results));
};

export const config = { schedule: "@hourly" };
