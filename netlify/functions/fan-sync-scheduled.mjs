// Every 30 minutes on comictable.com: new fans go into each connected comic's Mailchimp (29_fan_sync.sql).
import { createClient } from "@supabase/supabase-js";
import { syncComic } from "../lib/fan-sync.mjs";

export default async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.log("Fan sync skipped: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in Netlify."); return; }
  if ((process.env.SITE || "") !== "platform") { console.log("Fan sync skipped: comictable.com runs it."); return; }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: rows, error } = await db.from("fan_syncs").select("*");
  if (error) { console.log("Fan sync skipped:", error.message); return; }
  const out = [];
  for (const r of rows || []) out.push(await syncComic(db, r).catch((e) => ({ comic: r.comic_id, error: e.message })));
  console.log(JSON.stringify(out));
};

export const config = { schedule: "*/30 * * * *" };
