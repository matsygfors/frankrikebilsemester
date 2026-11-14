// Fetches Tesla Superchargers from OpenStreetMap (Overpass API) and keeps those within a few km of any route,
// so the maps can show them. Writes data/superchargers.json (OpenStreetMap data, ODbL).
// Usage: node scripts/fetch-superchargers.mjs   (needs internet; the page itself never calls Overpass)
import { readFileSync, writeFileSync } from 'node:fs';
import { mergeKnown } from './known-superchargers.mjs';

const NEAR_KM = 25;
const PARIS = { lat: 48.8566, lng: 2.3522, km: 20 }; // Superchargers in Paris are of no interest and left out
// The public servers are often overloaded; the first one that answers wins. Add another if these all fail.
const MIRRORS = ['https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const UA = 'frankrikebilsemester/0.1 (hobby trip planner; github.com/matsygfors/frankrikebilsemester)';
const root = new URL('..', import.meta.url);

const data = JSON.parse(readFileSync(new URL('data/frankrike-2027.json', root), 'utf8'));
const paths = data.scenarios.flatMap((sc) => sc.legs.filter((l) => l.mode === 'car').map((l) => l.route_overview.coordinates));

// Distance in km from a point to a polyline, on a flat map around the point (fine at this scale).
function distanceToPath(lat, lng, path) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.57;
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const [x1, y1] = [(path[i][0] - lng) * kx, (path[i][1] - lat) * ky];
    const [x2, y2] = [(path[i + 1][0] - lng) * kx, (path[i + 1][1] - lat) * ky];
    const [dx, dy] = [x2 - x1, y2 - y1];
    const t = dx || dy ? Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(x1 + t * dx, y1 + t * dy));
  }
  return best;
}

async function overpass(query) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, Accept: '*/*', 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}`, signal: AbortSignal.timeout(30000) });
      const text = await res.text();
      if (res.ok && text.startsWith('{')) return JSON.parse(text).elements;
      console.log(`  ${url}: ${res.status}, trying again`);
    } catch (err) {
      console.log(`  ${url}: ${err.message}, trying again`);
    }
    await new Promise((r) => setTimeout(r, 2000 + 1000 * attempt));
  }
  throw new Error('Overpass did not answer');
}

// Overpass copes well with small boxes: ask tile by tile (1 degree of latitude by 1.5 of longitude), but only for
// tiles that a route passes within NEAR_KM of, and filter to the corridor afterwards.
const TILE_LAT = 1;
const TILE_LNG = 1.5;
const tiles = new Set();
for (const path of paths) {
  for (let i = 0; i + 1 < path.length; i++) {
    for (let f = 0; f <= 1; f += 0.02) {
      const lng = path[i][0] + (path[i + 1][0] - path[i][0]) * f;
      const lat = path[i][1] + (path[i + 1][1] - path[i][1]) * f;
      // the tile of the point and of the points NEAR_KM north, south, east and west of it
      for (const [dLat, dLng] of [[0, 0], [NEAR_KM / 110, 0], [-NEAR_KM / 110, 0], [0, NEAR_KM / 70], [0, -NEAR_KM / 70]]) {
        tiles.add(`${Math.floor((lat + dLat) / TILE_LAT)},${Math.floor((lng + dLng) / TILE_LNG)}`);
      }
    }
  }
}
const found = new Map();
let done = 0;
// Start in Normandy, Brittany and the Loire, where route 1 and 2 go, and save after every tile, so a slow server still gives a usable file.
const centre = [48.2, 0.0];
const ordered = [...tiles].sort((x, y) => dist(x) - dist(y));
function dist(key) {
  const [i, j] = key.split(',').map(Number);
  return Math.hypot((i + 0.5) * TILE_LAT - centre[0], (j + 0.5) * TILE_LNG - centre[1]);
}
const kw = (t) => Number.parseInt(t['socket:tesla_supercharger_ccs:output'] ?? t['socket:tesla_supercharger:output'] ?? t['socket:type2_combo:output'] ?? '', 10) || null;
function save(complete = false) {
  const stations = [...found.values()]
    .map((e) => ({ lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon, t: e.tags }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && Math.hypot((s.lat - PARIS.lat) * 111, (s.lng - PARIS.lng) * 73) > PARIS.km && paths.some((p) => distanceToPath(s.lat, s.lng, p) <= NEAR_KM))
    .map(({ lat, lng, t }) => ({
      lat: Math.round(lat * 1e5) / 1e5,
      lng: Math.round(lng * 1e5) / 1e5,
      name: (t.name ?? t['addr:city'] ?? 'Supercharger').replace(/ Supercharger$/i, ''),
      city: t['addr:city'] ?? null,
      stalls: Number.parseInt(t.capacity ?? '', 10) || null,
      kw: kw(t),
    }))
    .sort((a, b) => a.lat - b.lat || a.lng - b.lng);
  const withKnown = mergeKnown(stations); // the Superchargers known from Tesla's list always belong

  writeFileSync(
    new URL('data/superchargers.json', root),
    JSON.stringify({ source: 'OpenStreetMap, Overpass API (brand=Tesla Supercharger)', license: 'ODbL', fetched: new Date().toISOString().slice(0, 10), near_km: NEAR_KM, complete, stations: withKnown }, null, 1) + '\n',
  );
}

for (const key of ordered) {
  const [i, j] = key.split(',').map(Number);
  const box = `${i * TILE_LAT},${j * TILE_LNG},${(i + 1) * TILE_LAT},${(j + 1) * TILE_LNG}`;
  const elements = await overpass(`[out:json][timeout:25];nwr["amenity"="charging_station"]["brand"="Tesla Supercharger"](${box});out center tags;`);
  for (const e of elements) found.set(`${e.type}${e.id}`, e);
  console.log(`${++done}/${tiles.size} tiles, ${found.size} Superchargers so far`);
  save();
  await new Promise((r) => setTimeout(r, 1500));
}


save(true);
console.log(`${found.size} Superchargers in the tiles; those within ${NEAR_KM} km of a route are in data/superchargers.json`);
