// Makes supabase/09_places.sql: towns and cities with their map position, so "fans near a show" works.
// Only needed if you want to regenerate the list. Run: npm i --no-save all-the-cities && node tools/make-places.mjs
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const cities = createRequire(import.meta.url)("all-the-cities");

const CA = { "01": "AB", "02": "BC", "03": "MB", "04": "NB", "05": "NL", "07": "NS", "08": "ON", "09": "PE", "10": "QC", "11": "SK", "12": "YT", "13": "NT", "14": "NU" };
const keep = cities.filter((c) => (c.country === "US" && c.population >= 20000) || (["CA", "GB", "IE", "AU", "NZ"].includes(c.country) && c.population >= 50000));
const rows = keep.map((c) => ({
  id: c.cityId, name: c.name, country: c.country, pop: c.population,
  state: c.country === "US" ? c.adminCode : c.country === "CA" ? CA[c.adminCode] || null : null,
  lat: c.loc.coordinates[1], lng: c.loc.coordinates[0]
}));
// what people and clubs actually call these places
const nyc = rows.find((r) => r.name === "New York City");
if (nyc) rows.push({ ...nyc, id: 900000001, name: "New York" });
const esc = (s) => s === null ? "null" : "'" + String(s).replace(/'/g, "''") + "'";
let sql = `-- Towns and cities with their map position, used to find fans near a show.
-- Run once in Supabase → SQL Editor, before 10_fans.sql. Safe to run again. (${rows.length} places)
create table if not exists places (
  id bigint primary key,
  name text not null,
  state text,
  country text not null,
  lat double precision not null,
  lng double precision not null,
  population int not null default 0
);
create index if not exists places_name on places (lower(name));
alter table places enable row level security;
drop policy if exists "public read" on places;
create policy "public read" on places for select using (true);
grant select on places to anon, authenticated;
`;
for (let i = 0; i < rows.length; i += 500) {
  sql += "insert into places (id, name, state, country, lat, lng, population) values\n" +
    rows.slice(i, i + 500).map((r) => `(${r.id},${esc(r.name)},${esc(r.state)},'${r.country}',${r.lat},${r.lng},${r.pop})`).join(",\n") +
    "\non conflict (id) do nothing;\n";
}
writeFileSync(new URL("../supabase/09_places.sql", import.meta.url), sql);
console.log(rows.length, "places");
