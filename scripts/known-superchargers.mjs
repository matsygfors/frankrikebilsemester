// Adds the known Superchargers (data/superchargers-known.json) to data/superchargers.json, unless an OpenStreetMap
// station is already within 1.5 km. Run on its own it merges into the existing file; the fetch script calls it too.
//   node scripts/known-superchargers.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const km = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 73);

export function mergeKnown(stations) {
  const known = JSON.parse(readFileSync(new URL('data/superchargers-known.json', root), 'utf8')).stations;
  const own = stations.filter((s) => s.src !== 'tesla');
  const added = known.filter((k) => !own.some((s) => km(s, k) < 1.5)).map((k) => ({ ...k, city: null, src: 'tesla' }));
  return [...own, ...added].sort((a, b) => a.lat - b.lat || a.lng - b.lng);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = new URL('data/superchargers.json', root);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  data.stations = mergeKnown(data.stations);
  writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
  console.log(`${data.stations.length} Superchargers i filen`);
}
