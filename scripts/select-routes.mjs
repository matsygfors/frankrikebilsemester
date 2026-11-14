// Chooses which routes the page shows. The full data (all routes, never edited by this script) lives in
// data/archive/frankrike-2027.alla-rutter.json; the page reads data/frankrike-2027.json, which this script
// writes from the archive with only the chosen routes (and only the places they use).
//
//   node scripts/select-routes.mjs paris normandie                          (what the page shows now)
//   node scripts/select-routes.mjs paris normandie alperna atlantkusten languedoc   (everything again)
//
// Run `npm run stamp` afterwards. Route ids: paris, normandie, alperna, atlantkusten, languedoc.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const archive = JSON.parse(readFileSync(new URL('data/archive/frankrike-2027.alla-rutter.json', root), 'utf8'));
const wanted = process.argv.slice(2);
const known = [...new Set(archive.scenarios.map((s) => s.route_id))];
if (!wanted.length || wanted.some((id) => !known.includes(id))) {
  console.error(`Ange rutter att visa. Finns: ${known.join(', ')}`);
  process.exit(1);
}

const out = structuredClone(archive);
out.scenarios = archive.scenarios.filter((s) => wanted.includes(s.route_id));

// keep the places that something still refers to
const used = new Set(['colombiers']);
const mark = (id) => id && used.add(id);
for (const p of out.parties) { mark(p.origin_location_id); p.available_home_location_ids.forEach(mark); }
out.wine_logistics.optional_visit_location_ids.forEach(mark);
for (const sc of out.scenarios) {
  Object.values(sc.party_initial_location_ids).forEach(mark);
  for (const l of sc.legs) [l.from_location_id, l.to_location_id, ...l.via_location_ids].forEach(mark);
  sc.events.forEach((e) => mark(e.location_id));
  sc.alternative_meetings.forEach((m) => { mark(m.location_id); mark(m.gateway_location_id); });
  if (sc.wine_plan) { mark(sc.wine_plan.purchase_location_id); mark(sc.wine_plan.destination_location_id); }
}
out.locations = out.locations.filter((l) => used.has(l.id));

writeFileSync(new URL('data/frankrike-2027.json', root), JSON.stringify(out, null, 2) + '\n');
console.log(`Visar ${wanted.join(', ')}: ${out.scenarios.length} scenarier, ${out.locations.length} platser (arkivet har ${archive.scenarios.length} och ${archive.locations.length}).`);
