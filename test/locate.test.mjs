import { readFileSync } from "node:fs";
import { findCountyFips } from "../site/js/locate.js";
const shapes = JSON.parse(readFileSync(new URL("../data/county-shapes.json", import.meta.url),"utf8"));
const counties = JSON.parse(readFileSync(new URL("../data/counties.json", import.meta.url),"utf8"));
const byFips = new Map(counties.counties.map(c=>[c.fips,c]));
const cases = [
  ["Chattanooga TN", 35.0456, -85.3097, "47065"],
  ["Portland OR",    45.5152,-122.6784, "41051"],
  ["Manhattan NY",   40.7831, -73.9712, "36061"],
  ["New Orleans LA", 29.9511, -90.0715, "22071"],
  ["Anchorage AK",   61.2181,-149.9003, "02020"],
  ["Honolulu HI",    21.3069,-157.8583, "15003"],
  ["Denver CO",      39.7392,-104.9903, "08031"],
  ["Miami FL",       25.7617, -80.1918, "12086"],
  ["Pacific Ocean",  30.0000,-140.0000, null],
];
let pass=0, fail=0;
const t0=Date.now();
for (const [name,lat,lng,want] of cases){
  const got = findCountyFips(shapes, lat, lng);
  const label = got ? `${got} ${byFips.get(got)?.name||"?"}, ${byFips.get(got)?.state||"?"}` : "null";
  if (got===want){ console.log(`  ok   ${name} -> ${label}`); pass++; }
  else { console.log(`  FAIL ${name} -> ${label} (want ${want})`); fail++; }
}
console.log(`\n${pass} passed, ${fail} failed  |  ${Date.now()-t0}ms total`);
process.exit(fail?1:0);
