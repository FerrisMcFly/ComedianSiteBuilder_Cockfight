// Paste a ticket link and the date fills itself in: reading the event details ticket pages publish (schema.org Event).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTicketPage, privateAddress } from "../netlify/functions/ticket-info.mjs";
import handler from "../netlify/functions/ticket-info.mjs";

const ld = (o) => `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify(o)}</script></head></html>`;

test("an Eventbrite-style page: club, city, date and time as the club lists them, and on sale", () => {
  const r = parseTicketPage(ld([{ "@context": "https://schema.org", "@type": "Event", name: "Lev Fer &amp; Friends", startDate: "2026-11-06T20:00:00-05:00",
    location: { "@type": "Place", name: "The Stand NYC", address: { "@type": "PostalAddress", addressLocality: "New York", addressRegion: "NY" } },
    offers: [{ "@type": "Offer", price: "25.00", availability: "https://schema.org/InStock" }] }]), "https://www.eventbrite.com/e/123");
  assert.deepEqual([r.venue, r.city, r.date, r.time, r.status, r.source, r.found, r.title], ["The Stand NYC", "New York, NY", "2026-11-06", "8:00 PM", "on_sale", "eventbrite.com", true, "Lev Fer & Friends"]);
});

test("a @graph page with a ComedyEvent that's sold out, or a few left, or free, or cancelled", () => {
  const page = (offers, extra = {}) => ld({ "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, { "@type": ["ComedyEvent"], name: "Late show", startDate: "2026-12-31T23:30", location: { name: "Comedy Cellar" }, offers, ...extra }] });
  assert.equal(parseTicketPage(page({ availability: "SoldOut" })).status, "sold_out");
  assert.equal(parseTicketPage(page({ availability: "https://schema.org/LimitedAvailability" })).status, "few_left");
  assert.equal(parseTicketPage(page({ price: 0 })).status, "free");
  assert.equal(parseTicketPage(page({}, { eventStatus: "https://schema.org/EventCancelled" })).status, "cancelled");
  const r = parseTicketPage(page({}));
  assert.deepEqual([r.venue, r.date, r.time, r.city], ["Comedy Cellar", "2026-12-31", "11:30 PM", ""]);
});

test("a page without event details gives back what it can, and a broken block doesn't break it", () => {
  const r = parseTicketPage(`<meta property="og:title" content="Lev Fer at Laugh Boston"><script type="application/ld+json">{ not json</script>`, "https://club.example/show");
  assert.equal(r.found, false); assert.equal(r.title, "Lev Fer at Laugh Boston"); assert.equal(r.date, "");
  assert.equal(parseTicketPage(ld({ "@type": "Event", startDate: "2026-11-21" })).time, "", "no time listed: left blank");
});

test("it never reads private addresses, plain http, or for someone who isn't logged in", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.10", "172.20.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) assert.ok(privateAddress(ip), ip);
  for (const ip of ["104.16.1.1", "8.8.8.8", "2606:4700::1111"]) assert.ok(!privateAddress(ip), ip);
  process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  const real = globalThis.fetch;
  globalThis.fetch = async (u) => String(u).includes("/auth/v1/user") ? new Response(JSON.stringify({ id: "u1", email: "x@y.z", aud: "authenticated" }), { status: 200, headers: { "Content-Type": "application/json" } }) : new Response("no", { status: 500 });
  try {
    const call = (body, token = "t") => handler(new Request("https://comictable.com/.netlify/functions/ticket-info", { method: "POST", headers: token ? { authorization: "Bearer " + token } : {}, body: JSON.stringify(body) }));
    assert.equal((await call({ url: "https://www.eventbrite.com/e/1" }, "")).status, 401);
    assert.match((await (await call({ url: "http://www.eventbrite.com/e/1" })).json()).error, /https/);
    assert.match((await (await call({ url: "https://localhost/x" })).json()).error, /can't be read/);
    assert.match((await (await call({ url: "https://169.254.169.254/latest" })).json()).error, /can't be read/);
    assert.match((await (await call({ url: "not a link" })).json()).error, /doesn't look like a link/);
  } finally { globalThis.fetch = real; }
});
