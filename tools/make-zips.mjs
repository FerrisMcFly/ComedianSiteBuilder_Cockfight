// Makes netlify/lib/zips-data.mjs: every US ZIP code with its map position, city and state (about 42,000).
// ComicTable's hourly job loads it into the database's zips table the first time it runs, so a fan's ZIP
// works for "fans near a show" (50 miles). Only needed to regenerate the list.
// Run: npm i --no-save zipcodes && node tools/make-zips.mjs
// Data: the zipcodes package (BSD license, Copyright (c) 2007, Dav Glass).
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { codes } = require("zipcodes/lib/codes.js");
const rows = Object.values(codes).filter((r) => r.country === "US" && /^\d{5}$/.test(r.zip) && r.latitude && r.longitude)
  .sort((a, b) => a.zip.localeCompare(b.zip))
  .map((r) => [r.zip, (+r.latitude).toFixed(3), (+r.longitude).toFixed(3), String(r.city || "").replace(/[,\n]/g, " "), r.state || ""].join(","));
const b64 = gzipSync(rows.join("\n"), { level: 9 }).toString("base64");
writeFileSync(new URL("../netlify/lib/zips-data.mjs", import.meta.url),
  "// Made by tools/make-zips.mjs: US ZIP codes as gzipped \"zip,lat,lng,city,state\" lines (" + rows.length + " ZIP codes).\n" +
  "// Data: the zipcodes package (BSD license, Copyright (c) 2007, Dav Glass).\n" +
  "export const count = " + rows.length + ";\nexport default \"" + b64 + "\";\n");
console.log("Wrote " + rows.length + " ZIP codes");
