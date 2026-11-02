// Emailing fans near a show (Step 5, item 50). Used by netlify/functions/fan-email.mjs. Sent through Resend
// (RESEND_API_KEY in Netlify; from FAN_EMAIL_FROM, default shows@comictable.com). Table: 30_fan_email.sql.
export const RADIUS_MI = 50;
export const PER_WEEK = 3;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const miles = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 7918 * Math.asin(Math.sqrt(x)); };
export const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export const niceDate = (iso) => { const d = new Date(String(iso).slice(0, 10) + "T12:00:00Z"); return isNaN(d) ? "" : DOW[d.getUTCDay()] + ", " + MON[d.getUTCMonth()] + " " + d.getUTCDate(); };
// a display name that can't break the From line
export const fromName = (n) => String(n || "ComicTable").replace(/[<>"\\\r\n,;:@]/g, "").trim().slice(0, 60) || "ComicTable";

export function fansNear(fans, venue) {
  if (!venue || venue.lat == null || venue.lng == null) return [];
  const seen = new Set();
  return fans.filter((f) => f.lat != null && f.lng != null && miles(venue.lat, venue.lng, f.lat, f.lng) <= RADIUS_MI)
    .filter((f) => { const k = String(f.email).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

// One fan's email: the comic's note, the show with a Tickets button, and a one-tap unsubscribe.
export function emailFor({ comic, show, subject, message, fan, base, from }) {
  const unsub = base + "/unsub/" + fan.token;
  const tix = show.url ? base + "/go/" + show.id + "?f=email" : "";
  const when = [niceDate(show.date), show.time].filter(Boolean).join(" · ");
  const where = [show.venue, show.city].filter(Boolean).join(", ");
  const paras = String(message).trim().split(/\n{2,}/).map((p) => '<p style="margin:0 0 14px">' + esc(p).replace(/\n/g, "<br>") + "</p>").join("");
  const html = '<!doctype html><html><body style="margin:0;background:#f4efe6;padding:24px 12px;font:16px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#1b1714">' +
    '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 24px">' +
    paras +
    '<div style="margin:22px 0 6px;padding:16px 18px;border-radius:12px;background:#13100e;color:#f3ead7">' +
    '<div style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#e66a4b;font-weight:700">' + esc(when) + "</div>" +
    '<div style="font-size:20px;font-weight:800;margin-top:4px">' + esc(show.venue || show.city || "The show") + "</div>" +
    (show.city && show.venue ? '<div style="color:#a89f92">' + esc(show.city) + "</div>" : "") +
    (tix ? '<a href="' + esc(tix) + '" style="display:inline-block;margin-top:14px;background:#e66a4b;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:999px">Get tickets</a>' : "") +
    "</div></div>" +
    '<p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#7a7065;text-align:center">You joined ' + esc(comic.name) + "'s list on ComicTable" + (fan.city ? ", near " + esc(fan.city) : "") + '. <a href="' + esc(unsub) + '" style="color:#7a7065">Unsubscribe</a></p>' +
    "</body></html>";
  const text = String(message).trim() + "\n\n" + [when, where].filter(Boolean).join("\n") + (tix ? "\nTickets: " + tix : "") +
    "\n\n—\nYou joined " + comic.name + "'s list on ComicTable. Unsubscribe: " + unsub;
  return { from, to: [fan.email], subject, html, text,
    headers: { "List-Unsubscribe": "<" + unsub + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}

// Sends through Resend, 100 at a time. Returns how many went.
export async function sendAll(emails, apiKey, batchId) {
  let sent = 0;
  for (let i = 0; i < emails.length; i += 100) {
    const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", signal: AbortSignal.timeout(20000),
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json", "Idempotency-Key": batchId + "-" + i },
      body: JSON.stringify(emails.slice(i, i + 100)) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error((b && (b.message || (b.error && b.error.message))) || "The email service said no (" + r.status + ")."); e.sent = sent; throw e; }
    sent += Array.isArray(b.data) ? b.data.length : Math.min(100, emails.length - i);
  }
  return sent;
}
