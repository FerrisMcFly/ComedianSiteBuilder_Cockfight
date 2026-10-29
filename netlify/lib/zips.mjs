// Loads every US ZIP code into the database (the zips table) the first time ComicTable's hourly job runs,
// so fans can sign up with just their ZIP. Does nothing once they're there.
import { gunzipSync } from "node:zlib";
import packed, { count } from "./zips-data.mjs";

export function zipRows() {
  return gunzipSync(Buffer.from(packed, "base64")).toString("utf8").split("\n").map((line) => {
    const [zip, lat, lng, city, state] = line.split(",");
    return { zip, lat: +lat, lng: +lng, city: city || null, state: state || null };
  });
}

export async function ensureZips(db, batch = 5000) {
  const head = await db.from("zips").select("zip", { count: "exact", head: true });
  if (head.error) return { zips: "skipped: " + head.error.message };  // the database hasn't run 25_foundation.sql yet
  if ((head.count || 0) >= count) return { zips: "ok" };
  const rows = zipRows();
  for (let i = 0; i < rows.length; i += batch) {
    const { error } = await db.from("zips").upsert(rows.slice(i, i + batch), { onConflict: "zip", ignoreDuplicates: true });
    if (error) return { zips: "error: " + error.message };
  }
  return { zips: "loaded " + rows.length };
}
