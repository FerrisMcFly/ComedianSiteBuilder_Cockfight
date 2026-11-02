// comictable.com/unsub/<token>: the unsubscribe link in every fan email (30_fan_email.sql).
// GET shows a button (email scanners open links, so opening it alone changes nothing). POST, from that button or from
// the mail app's own unsubscribe (List-Unsubscribe-Post), takes the address off every list it joined on ComicTable:
// every comic's list and every site's, as the privacy page promises.
import { createClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const page = (status, title, line, form) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-content:center;gap:14px;padding:24px;text-align:center;background:#13100E;color:#F3EAD7;font:16px/1.5 system-ui,sans-serif}h1{margin:0;font:900 30px/1.1 system-ui,sans-serif;text-transform:uppercase}p{margin:0;color:#A89F92;max-width:34em}button{font:700 16px system-ui,sans-serif;background:#E66A4B;color:#fff;border:0;border-radius:999px;padding:12px 22px;cursor:pointer}a{color:#E66A4B}</style></head>
<body><h1>${title}</h1><p>${line}</p>${form || ""}<p><a href="https://comictable.com/privacy">Privacy</a></p></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

export default async (req) => {
  const u = new URL(req.url);
  const token = (u.pathname.match(/\/unsub\/([^/?#]+)/) || [])[1] || u.searchParams.get("t") || "";
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!UUID.test(token) || !url || !key) return page(404, "Link not found", "This unsubscribe link doesn't work. If emails keep coming, reply to one and say stop.");
  const db = createClient(url, key, { auth: { persistSession: false } });
  // the token is on a comic's list (comic_fans) or a site's (fans)
  let email = null;
  const a = await db.from("comic_fans").select("email").eq("token", token).maybeSingle();
  if (a.data) email = a.data.email;
  else { const b = await db.from("fans").select("email").eq("token", token).maybeSingle(); if (b.data) email = b.data.email; }
  if (req.method !== "POST") {
    if (!email) return page(200, "You're off the list", "This address isn't on any list on ComicTable.");
    return page(200, "Unsubscribe?", "Stop all emails to " + email.replace(/[<>&"]/g, "") + " from comics on ComicTable.",
      `<form method="post"><button type="submit">Unsubscribe</button></form>`);
  }
  if (email) {
    // every list, any capitalization. ilike with the wildcards escaped is an exact, case-blind match.
    const exact = email.replace(/[\\%_]/g, (m) => "\\" + m);
    await db.from("comic_fans").delete().ilike("email", exact);
    await db.from("fans").delete().ilike("email", exact);
  }
  return page(200, "You're off the list", "You won't get any more emails from comics on ComicTable. If you join a list again later, you'll get emails from that comic again.");
};
