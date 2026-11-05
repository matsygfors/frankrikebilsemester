// Turns data/frankrike-2027.json into what the views need: routes with geometry,
// who is where at a given time, when the two couples are together, and headline numbers.

import { clamp, sum } from './format.js';
import { cumulative, pointAt } from './geo.js';

export async function loadData(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kunde inte läsa ${url} (${res.status})`);
  return prepare(await res.json());
}

export function prepare(raw) {
  const locations = new Map(raw.locations.map((loc) => [loc.id, withNames(loc)]));
  const homes = new Map(raw.parties.map((p) => [p.id, new Set(p.available_home_location_ids)]));
  const scenarios = raw.scenarios.map((sc, i) => prepareScenario(sc, i, locations, homes));
  return { raw, locations, parties: raw.parties, scenarios };
}

// "Beaune / Bourgogne" -> short "Beaune", region "Bourgogne"; "Colombiers nära Béziers" -> "Colombiers".
function withNames(loc) {
  const [head, region = ''] = loc.name.split(' / ');
  return { ...loc, short: head.replace(/ nära .+$/, ''), region };
}

function prepareScenario(sc, index, locations, homes) {
  const routes = buildRoutes(sc);
  const [title, subtitle = ''] = sc.title.split(' – ');
  const scn = {
    id: sc.id,
    number: index + 1,
    title,
    subtitle,
    raw: sc,
    hours: sc.duration_days * 24,
    locations,
    homes,
    legs: new Map(sc.legs.map((l) => [l.id, l])),
    tracks: new Map(sc.timeline_tracks.map((t) => [t.party_id, t.segments])),
    routes,
    routeOfLeg: new Map(routes.flatMap((r) => r.legIds.map((id) => [id, r]))),
  };
  scn.together = findTogether(scn);
  scn.places = buildPlaces(scn);
  scn.waypoints = [...new Set(routes.flatMap((r) => r.via))].filter((id) => !scn.places.has(id));
  scn.kpis = buildKpis(scn);
  return scn;
}

const sameMovement = (a, b) =>
  a.from_location_id === b.from_location_id &&
  a.to_location_id === b.to_location_id &&
  a.start_hour === b.start_hour &&
  a.end_hour === b.end_hour;

/**
 * One route per movement. Two single-party legs that make the same trip at the same time
 * in different vehicles (the two-car alternatives) are merged into a "parallel" route: same line, two cars.
 */
function buildRoutes(sc) {
  const taken = new Set();
  const routes = [];
  for (const leg of sc.legs) {
    if (taken.has(leg.id)) continue;
    taken.add(leg.id);
    const twin =
      leg.party_ids.length === 1
        ? sc.legs.find((o) => !taken.has(o.id) && o.party_ids.length === 1 && o.party_ids[0] !== leg.party_ids[0] && sameMovement(o, leg))
        : null;
    if (twin) taken.add(twin.id);
    const path = leg.route_overview.coordinates.map(([lng, lat]) => [lat, lng]);
    routes.push({
      id: leg.id,
      legIds: twin ? [leg.id, twin.id] : [leg.id],
      kind: twin ? 'parallel' : leg.party_ids.length === 2 ? 'shared' : leg.party_ids[0],
      mode: leg.mode,
      partyIds: twin ? [...leg.party_ids, ...twin.party_ids] : leg.party_ids,
      from: leg.from_location_id,
      to: leg.to_location_id,
      via: leg.via_location_ids,
      start: leg.start_hour,
      end: leg.end_hour,
      path,
      cum: cumulative(path),
    });
  }
  return routes;
}

export function segmentAt(segments, t) {
  if (t <= segments[0].start_hour) return segments[0];
  return segments.find((s) => t >= s.start_hour && t < s.end_hour) ?? segments.at(-1);
}

/** Number of midnights strictly inside (start, end). */
export const countNights = (start, end) => Math.max(0, Math.ceil(end / 24) - 1 - Math.floor(start / 24));

/** The most nights the group would like to spend together in one place. */
export const STAY_LIMIT_NIGHTS = 2;

/** The longest day's drive the group is happy with: about 60 mil. */
export const DRIVE_LIMIT_KM = 600;
/** With a little margin, so that Stockholm–Malmö (61 mil) still goes. */
export const isLongDrive = (km) => km > DRIVE_LIMIT_KM * 1.05;

/**
 * Stretches where both couples are together, clipped to the scenario's shared_period:
 * 'vehicle' = same leg, 'convoy' = same trip in two vehicles, 'place' = staying in the same place.
 */
function findTogether(scn) {
  const { start_hour: from, end_hour: to } = scn.raw.shared_period;
  const a = scn.tracks.get('A');
  const b = scn.tracks.get('B');
  const cuts = [...new Set([...a, ...b].flatMap((s) => [s.start_hour, s.end_hour]).concat(from, to))]
    .filter((h) => h >= from && h <= to)
    .sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [t0, t1] = [cuts[i], cuts[i + 1]];
    const how = togetherHow(scn, segmentAt(a, t0), segmentAt(b, t0));
    if (!how) continue;
    const last = out.at(-1);
    if (last?.how === how && last.t1 === t0) last.t1 = t1;
    else out.push({ t0, t1, how });
  }
  return out;
}

function togetherHow(scn, a, b) {
  if (a.kind === 'stay' && b.kind === 'stay') return a.location_id === b.location_id ? 'place' : null;
  if (a.kind === 'travel' && b.kind === 'travel') {
    if (a.leg_id === b.leg_id) return 'vehicle';
    return sameMovement(scn.legs.get(a.leg_id), scn.legs.get(b.leg_id)) ? 'convoy' : null;
  }
  return null;
}

export const togetherAt = (scn, t) => scn.together.find((x) => t >= x.t0 && t < x.t1)?.how ?? null;

function buildPlaces(scn) {
  const places = new Map();
  for (const [party, segs] of scn.tracks) {
    segs.forEach((s, i) => {
      if (s.kind !== 'stay') return;
      if (!places.has(s.location_id)) {
        places.set(s.location_id, { id: s.location_id, loc: scn.locations.get(s.location_id), parties: new Set(), nights: {}, visits: [] });
      }
      const place = places.get(s.location_id);
      const nights = countNights(s.start_hour, s.end_hour);
      place.parties.add(party);
      place.nights[party] = (place.nights[party] ?? 0) + nights;
      place.visits.push({ party, start: s.start_hour, end: s.end_hour, nights, home: isHomeStay(scn, party, segs, i) });
    });
  }
  return places;
}

/** A party is "home" in its first and last stay when that is one of its homes (B has one in Paris and one in Nice). */
export const isHomeStay = (scn, party, segs, i) => (i === 0 || i === segs.length - 1) && scn.homes.get(party).has(segs[i].location_id);

function buildKpis(scn) {
  const { raw } = scn;
  const fleet = raw.distance_summary.fleet;
  const longest = raw.legs
    .filter((l) => l.mode === 'car')
    .reduce((best, l) => (!best || l.driving_hours > best.driving_hours ? l : best), null);
  const byParty = {};
  for (const id of scn.tracks.keys()) {
    const mine = raw.legs.filter((l) => l.party_ids.includes(id));
    byParty[id] = {
      carKm: sum(mine.filter((l) => l.mode === 'car').map((l) => l.distance_km)),
      flights: mine.filter((l) => l.mode === 'flight').length,
      trains: mine.filter((l) => l.mode === 'train').length,
    };
  }
  return {
    days: raw.duration_days,
    flex: raw.duration_flex_days,
    sharedDays: raw.shared_period.elapsed_days,
    fleetKm: fleet.intercity_km,
    totalKmRange: fleet.total_km_range,
    driveHours: fleet.driving_hours_without_long_stops,
    cars: raw.vehicles.length,
    longest,
    byParty,
    wineNights: sum([...scn.places.values()].filter((p) => inWineArea(p.loc)).map((p) => p.nights.A ?? 0)),
    longestStay: longestStayTogether(scn),
  };
}

// Béziers and the villages around it that the data lists as bases or wine areas: the wine bonus.
const inWineArea = (loc) => loc.id === 'beziers' || loc.kind === 'optional_base' || loc.kind === 'optional_wine_area';

/** The longest stretch the couples spend together in one place: where, for how many hours and nights. */
function longestStayTogether(scn) {
  const stays = scn.tracks.get('A').filter((s) => s.kind === 'stay');
  let best = null;
  for (const x of scn.together) {
    if (x.how !== 'place') continue;
    const hours = x.t1 - x.t0;
    if (best && hours <= best.hours) continue;
    const stay = stays.find((s) => s.start_hour <= x.t0 && x.t0 < s.end_hour);
    best = { loc: scn.locations.get(stay.location_id), hours, nights: countNights(x.t0, x.t1) };
  }
  return best;
}

/** Where a party is at trip time t: staying somewhere, or part-way along a route. */
export function stateAt(scn, partyId, t) {
  const segs = scn.tracks.get(partyId);
  const tt = clamp(t, 0, scn.hours);
  const seg = segmentAt(segs, tt);
  if (seg.kind === 'stay') {
    const loc = scn.locations.get(seg.location_id);
    return {
      kind: 'stay',
      seg,
      loc,
      latlng: [loc.latitude, loc.longitude],
      home: isHomeStay(scn, partyId, segs, segs.indexOf(seg)),
      nights: countNights(seg.start_hour, seg.end_hour),
    };
  }
  const leg = scn.legs.get(seg.leg_id);
  const route = scn.routeOfLeg.get(seg.leg_id);
  const f = clamp((tt - seg.start_hour) / (seg.end_hour - seg.start_hour), 0, 1);
  return {
    kind: 'travel',
    seg,
    leg,
    route,
    f,
    latlng: pointAt(route.path, route.cum, f),
    from: scn.locations.get(leg.from_location_id),
    to: scn.locations.get(leg.to_location_id),
  };
}

export function phaseAt(scn, t) {
  const day = Math.floor(clamp(t, 0, scn.hours - 0.01) / 24) + 1;
  return scn.raw.phases.find((p) => day >= p.start_day && day <= p.end_day_inclusive);
}

/** Every moment something starts or ends for either party, plus the events; for "next/previous stop". */
export function milestones(scn) {
  const times = new Set(scn.raw.events.map((e) => e.at_hour));
  for (const segs of scn.tracks.values()) for (const s of segs) times.add(s.start_hour).add(s.end_hour);
  return [...times].sort((a, b) => a - b);
}
