import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { STAY_LIMIT_NIGHTS, chosen, countNights, isLongDrive, milestones, phaseAt, prepare, stateAt, togetherAt } from '../js/data.js';
import { clock, fmtMoment, hoursOf } from '../js/format.js';
import { cumulative, distanceKm, partial, pointAt } from '../js/geo.js';
import { HOW_LABEL, describeState } from '../js/text.js';

const raw = JSON.parse(readFileSync(new URL('../data/frankrike-2027.json', import.meta.url), 'utf8'));
const data = prepare(raw);
// own car from Sweden / flight and rental car, for the Alps, Normandy, the Atlantic coast and Languedoc
const [alpsOwn, alpsFly, normOwn, normFly, atlOwn, atlFly, langOwn, langFly] = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map((id) => data.scenarios.find((s) => s.id === id));
const ownCar = [alpsOwn, normOwn, atlOwn, langOwn];
const flyRent = [alpsFly, normFly, atlFly, langFly];

test('four routes, each in two variants', () => {
  assert.deepEqual(data.routes.map((r) => [r.number, r.id]), [[1, 'alperna'], [2, 'normandie'], [3, 'atlantkusten'], [4, 'languedoc']]);
  assert.deepEqual(data.routes.map((r) => r.title), ['Franska Alperna', 'Normandie, Bretagne och Loire', 'Atlantkusten och Pyrenéerna', 'Rivieran, Provence och Languedoc']);
  for (const r of data.routes) {
    assert.deepEqual(Object.keys(r.variants).sort(), ['fly_rent', 'own_car'], r.id);
    for (const sc of Object.values(r.variants)) assert.equal(sc.number, r.number, sc.id);
  }
  assert.deepEqual(data.scenarios.map((s) => s.hours / 24), [17, 9, 15, 9, 18, 9, 18, 9]);
  assert.equal(raw.recommendation, undefined);
});

test('the chosen variant per route', () => {
  assert.deepEqual(chosen(data, {}).map((s) => s.id), ['s1', 's3', 's5', 's7']);
  assert.deepEqual(chosen(data, { alperna: 'fly_rent', languedoc: 'fly_rent' }).map((s) => s.id), ['s2', 's3', 's5', 's8']);
});

test('both variants of a route visit the same stops together', () => {
  const stops = {
    alperna: ['barcelonnette', 'briancon', 'val_disere', 'chamonix', 'annecy'],
    normandie: ['honfleur', 'bayeux', 'saint_malo', 'vannes', 'amboise'],
    atlantkusten: ['bordeaux', 'arcachon', 'biarritz', 'pau'],
    languedoc: ['moustiers', 'gordes', 'arles', 'faugeres', 'beziers'],
  };
  for (const r of data.routes) {
    for (const sc of Object.values(r.variants)) {
      for (const id of stops[r.id]) {
        const place = sc.places.get(id);
        assert.ok(place?.nights.A > 0 && place.nights.B > 0, `${sc.id} spends a night with both couples in ${id}`);
      }
    }
  }
});

test('A drives the own car from Sweden, or everyone flies and rents one car', () => {
  for (const sc of ownCar) {
    assert.equal(sc.raw.variant, 'own_car');
    assert.deepEqual(sc.raw.vehicles.map((v) => v.kind), ['own_car'], sc.id);
    assert.equal(sc.kpis.byParty.A.flights, 0, sc.id);
    assert.ok(sc.kpis.byParty.A.carKm > 5000, `${sc.id}: ${sc.kpis.byParty.A.carKm} km`);
    assert.equal(sc.raw.party_initial_location_ids.A, 'stockholm');
  }
  for (const sc of flyRent) {
    assert.equal(sc.raw.variant, 'fly_rent');
    assert.deepEqual(sc.raw.vehicles.map((v) => v.kind), ['rental_car'], sc.id);
    assert.equal(sc.kpis.byParty.A.flights, 2, sc.id);
    assert.ok(sc.kpis.byParty.A.carKm < 1300, `${sc.id}: ${sc.kpis.byParty.A.carKm} km`);
    assert.ok(sc.kpis.days <= 9, sc.id);
  }
  // one shared car in every variant
  for (const sc of data.scenarios) {
    assert.equal(sc.kpis.cars, 1, sc.id);
    assert.equal(sc.routes.length, sc.raw.legs.length, sc.id);
  }
});

test('A never drives the own car through Paris', () => {
  for (const sc of ownCar) {
    for (const l of sc.raw.legs) {
      assert.ok(![l.from_location_id, l.to_location_id, ...l.via_location_ids].includes('paris') || l.mode === 'train', `${sc.id} ${l.id}`);
    }
  }
});

test('time formatting', () => {
  assert.equal(clock(108.5), '12:30');
  assert.equal(fmtMoment(hoursOf(5, 9)), 'Dag 5 · 09:00');
  assert.equal(fmtMoment(456, 456), 'Dag 19 · slut');
});

test('nights are the midnights strictly inside a stay', () => {
  assert.equal(countNights(0, 9), 0);
  assert.equal(countNights(18, 33), 1);
  assert.equal(countNights(181.5, 297), 5);
  assert.equal(countNights(24, 48), 0);
  assert.equal(countNights(474, 480), 0);
});

test('partial paths and interpolation', () => {
  const path = [[0, 0], [0, 10], [10, 10]];
  const cum = cumulative(path);
  assert.deepEqual(pointAt(path, cum, 0), [0, 0]);
  assert.deepEqual(pointAt(path, cum, 1), [10, 10]);
  assert.equal(partial(path, cum, 0.25).length, 2);
  assert.ok(Math.abs(distanceKm([0, 0], [0, 1]) - 111.19) < 0.1);
  const [lat, lng] = pointAt([[50, 0], [50, 10]], cumulative([[50, 0], [50, 10]]), 0.5);
  assert.ok(Math.abs(lat - 50) < 1e-9 && Math.abs(lng - 5) < 1e-9);
});

test('positions are valid at every half hour, and joined whenever the couples are together', () => {
  for (const sc of data.scenarios) {
    for (let t = 0; t <= sc.hours; t += 0.5) {
      const [a, b] = ['A', 'B'].map((id) => stateAt(sc, id, t));
      for (const { latlng } of [a, b]) {
        assert.ok(latlng.every(Number.isFinite), `${sc.id} t=${t}`);
        assert.ok(latlng[0] > 42 && latlng[0] < 60 && latlng[1] > -3 && latlng[1] < 19, `${sc.id} t=${t} ${latlng}`);
      }
      if (togetherAt(sc, t)) {
        assert.ok(distanceKm(a.latlng, b.latlng) < 0.5, `${sc.id} t=${t}: together but ${distanceKm(a.latlng, b.latlng).toFixed(1)} km apart`);
      }
    }
  }
});

test('together intervals cover the whole shared period without gaps', () => {
  for (const sc of data.scenarios) {
    const { start_hour, end_hour } = sc.raw.shared_period;
    assert.equal(sc.together[0].t0, start_hour, sc.id);
    assert.equal(sc.together.at(-1).t1, end_hour, sc.id);
    sc.together.forEach((x, i) => i && assert.equal(x.t0, sc.together[i - 1].t1, `${sc.id} gap before ${x.t0}`));
    assert.equal(togetherAt(sc, start_hour - 0.5), null);
    assert.equal(togetherAt(sc, end_hour + 0.5), null);
    assert.ok(sc.together.every((x) => x.how !== 'convoy'), sc.id);
  }
});

test('couples start and end at one of their homes, B in Paris or Nice', () => {
  for (const sc of data.scenarios) {
    for (const id of ['A', 'B']) {
      assert.equal(stateAt(sc, id, 0).home, true, `${sc.id} ${id} start`);
      assert.equal(stateAt(sc, id, sc.hours).home, true, `${sc.id} ${id} end`);
    }
  }
  // by own car B starts in the Nice apartment in the Alps and ends in the Paris one; flying, B ends where B started
  assert.deepEqual([stateAt(alpsOwn, 'B', 0).loc.id, stateAt(alpsOwn, 'B', alpsOwn.hours).loc.id], ['nice', 'paris']);
  assert.deepEqual([stateAt(alpsFly, 'B', 0).loc.id, stateAt(alpsFly, 'B', alpsFly.hours).loc.id], ['nice', 'nice']);
  assert.deepEqual([stateAt(atlOwn, 'B', 0).loc.id, stateAt(atlOwn, 'B', atlOwn.hours).loc.id], ['paris', 'paris']);
});

test('headline numbers come from the data', () => {
  const total = (xs) => xs.reduce((a, b) => a + b, 0);
  const down = [615, 510, 500, 335, 385, 470]; // Stockholm to Nice
  assert.equal(alpsOwn.kpis.fleetKm, total(down) + total([170, 110, 150, 150, 95]) + total([400, 335, 500, 510, 615]));
  assert.equal(alpsFly.kpis.fleetKm, total([170, 110, 150, 150, 95, 470]));
  assert.equal(normFly.kpis.fleetKm, total([200, 115, 180, 190, 345, 230]));
  assert.equal(atlFly.kpis.fleetKm, total([65, 190, 115, 200]));
  assert.equal(langFly.kpis.fleetKm, total([175, 115, 85, 150, 45, 440]));
  // the whole drive is A's: B only rides in the shared stretch
  assert.deepEqual(alpsOwn.kpis.byParty.B, { carKm: 675, flights: 0, trains: 1 });
  assert.deepEqual(alpsFly.kpis.byParty.B, { carKm: alpsFly.kpis.fleetKm, flights: 0, trains: 0 });
  assert.equal(alpsOwn.kpis.byParty.A.carKm, alpsOwn.kpis.fleetKm);
});

test('about a week together, no stop longer than two nights, no driving day well over 60 mil', () => {
  for (const sc of data.scenarios) {
    const { loc, nights } = sc.kpis.longestStay;
    assert.ok(nights <= STAY_LIMIT_NIGHTS, `${sc.id}: ${nights} nights in ${loc.id}`);
    assert.ok(!isLongDrive(sc.kpis.longest.distance_km), `${sc.id}: ${sc.kpis.longest.id} is ${sc.kpis.longest.distance_km} km`);
    assert.ok(sc.kpis.sharedDays >= 6 && sc.kpis.sharedDays <= 8, `${sc.id}: ${sc.kpis.sharedDays} days together`);
  }
  const nights = (sc, ids) => ids.map((id) => sc.places.get(id).nights.A);
  assert.deepEqual(nights(alpsOwn, ['nice', 'barcelonnette', 'briancon', 'val_disere', 'chamonix', 'annecy']), [1, 1, 1, 1, 2, 1]);
  assert.deepEqual(nights(alpsFly, ['nice', 'barcelonnette', 'briancon', 'val_disere', 'chamonix', 'annecy']), [2, 1, 1, 1, 2, 1]);
  assert.deepEqual(nights(normOwn, ['rouen', 'honfleur', 'bayeux', 'saint_malo', 'vannes', 'amboise']), [1, 1, 2, 1, 1, 1]);
  assert.deepEqual(nights(atlOwn, ['bordeaux', 'arcachon', 'biarritz', 'pau']), [2, 1, 2, 2]);
  assert.deepEqual(nights(langOwn, ['nice', 'moustiers', 'gordes', 'arles', 'faugeres', 'beziers']), [1, 1, 1, 1, 1, 2]);
});

test('wine is a bonus on the Languedoc route only', () => {
  for (const sc of data.scenarios) {
    const pickup = sc.raw.events.find((e) => e.kind === 'wine_pickup');
    if (![langOwn, langFly].includes(sc)) {
      assert.equal(sc.raw.wine_plan, null, sc.id);
      assert.equal(pickup, undefined, sc.id);
      assert.equal(sc.kpis.wineNights, 0, sc.id);
    }
  }
  assert.equal(langOwn.raw.wine_plan.transport_method, 'own_car_self_transport');
  assert.equal(langFly.raw.wine_plan.transport_method, 'checked_baggage_or_seller_arranged_shipping');
  for (const sc of [langOwn, langFly]) {
    const pickup = sc.raw.events.find((e) => e.kind === 'wine_pickup');
    assert.equal(pickup.location_id, 'beziers');
    assert.equal(pickup.day, sc.raw.wine_plan.purchase_day);
    assert.equal(sc.raw.wine_plan.vehicle_id, sc.raw.vehicles[0].id);
    assert.equal(sc.kpis.wineNights, 3); // Faugères once and Béziers twice
  }
});

test('status wording', () => {
  assert.equal(describeState(langOwn, 'A', 0).text, 'Hemma i Stockholm');
  assert.equal(describeState(langOwn, 'A', 12).text, 'Kör Stockholm → Malmö');
  assert.equal(describeState(langOwn, 'B', 12).text, 'Hemma i Nice');
  assert.equal(describeState(langFly, 'A', 12).text, 'Flyger Stockholm → Nice');
  assert.equal(describeState(normFly, 'A', 12).text, 'Flyger Stockholm → Paris');
  assert.equal(describeState(alpsOwn, 'B', hoursOf(13, 10)).text, 'Åker tåg Annecy → Paris');
  assert.equal(describeState(alpsOwn, 'B', alpsOwn.hours - 1).text, 'Hemma i Paris');
  assert.equal(describeState(langOwn, 'A', hoursOf(12)).text, 'I Béziers');
  assert.equal(describeState(langOwn, 'A', hoursOf(12)).sub, '2 nätter');
  assert.equal(HOW_LABEL[togetherAt(langFly, hoursOf(3, 12))], 'Reser tillsammans');
});

test('phases and milestones', () => {
  assert.equal(phaseAt(langOwn, hoursOf(7, 12)).title, 'Gorges du Verdon');
  assert.equal(phaseAt(langOwn, hoursOf(12)).title, 'Béziers och vin');
  assert.equal(phaseAt(langOwn, langOwn.hours).title, 'Hem');
  for (const sc of data.scenarios) {
    const days = sc.raw.phases.flatMap((p) => Array.from({ length: p.end_day_inclusive - p.start_day + 1 }, (_, i) => p.start_day + i));
    assert.deepEqual(days, Array.from({ length: sc.hours / 24 }, (_, i) => i + 1), `${sc.id} phases cover every day once`);
  }
  const marks = milestones(alpsOwn);
  assert.equal(marks[0], 0);
  assert.equal(marks.at(-1), alpsOwn.hours);
  assert.deepEqual(marks, [...marks].sort((x, y) => x - y));
  assert.equal(new Set(marks).size, marks.length);
});
