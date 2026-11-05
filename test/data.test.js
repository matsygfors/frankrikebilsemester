import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { STAY_LIMIT_NIGHTS, countNights, isLongDrive, milestones, phaseAt, prepare, stateAt, togetherAt } from '../js/data.js';
import { clock, fmtMoment, hoursOf } from '../js/format.js';
import { cumulative, distanceKm, partial, pointAt } from '../js/geo.js';
import { HOW_LABEL, describeState } from '../js/text.js';

const raw = JSON.parse(readFileSync(new URL('../data/frankrike-2027.json', import.meta.url), 'utf8'));
const data = prepare(raw);
const [s1, s2, s3, s4, s5, s6] = ['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => data.scenarios.find((s) => s.id === id));

test('six road trips with the expected shape', () => {
  assert.deepEqual(data.scenarios.map((s) => [s.number, s.id]), [[1, 's1'], [2, 's2'], [3, 's3'], [4, 's4'], [5, 's5'], [6, 's6']]);
  assert.deepEqual(data.scenarios.map((s) => s.hours), [18 * 24, 17 * 24, 19 * 24, 17 * 24, 9 * 24, 9 * 24]);
  assert.equal(s1.title, 'Rivieran, Provence och Languedoc');
  assert.equal(s1.subtitle, 'Nice till Béziers');
  assert.equal(raw.recommendation, undefined);
});

test('two single-party legs making the same trip become one parallel route', () => {
  for (const other of [s1, s2, s3, s4, s5]) assert.equal(other.routes.length, other.raw.legs.length);
  assert.equal(s6.raw.legs.length, 14);
  assert.equal(s6.routes.length, 8);
  assert.equal(s6.routes.filter((r) => r.kind === 'parallel').length, 6);
  // both legs resolve to the same route, so either party animates along it
  assert.equal(s6.routeOfLeg.get('s6_leg_02'), s6.routeOfLeg.get('s6_leg_03'));
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

test('the wine bonus is in the routes that end in Béziers', () => {
  assert.deepEqual(data.scenarios.map((s) => s.kpis.wineNights), [2, 0, 2, 3, 0, 0]);
  assert.deepEqual(data.scenarios.map((s) => s.raw.wine_plan?.purchase_day ?? null), [12, null, 13, 11, null, null]);
  for (const sc of [s1, s3, s4]) {
    const pickup = sc.raw.events.find((e) => e.kind === 'wine_pickup');
    assert.equal(pickup.location_id, 'beziers', sc.id);
    assert.equal(pickup.day, sc.raw.wine_plan.purchase_day, sc.id);
    assert.equal(sc.raw.wine_plan.vehicle_id, sc.raw.vehicles[0].id, sc.id);
  }
  for (const sc of [s2, s5, s6]) assert.ok(!sc.raw.events.some((e) => e.kind === 'wine_pickup'), sc.id);
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
  }
});

test('only the two-car alternative has two vehicles travelling together', () => {
  const kinds = (sc) => new Set(sc.together.map((x) => x.how));
  assert.ok(kinds(s6).has('convoy'));
  for (const sc of [s1, s2, s3, s4, s5]) assert.ok(!kinds(sc).has('convoy'), sc.id);
});

test('couples start and end at one of their homes, B in Paris or Nice', () => {
  for (const sc of data.scenarios) {
    for (const id of ['A', 'B']) {
      assert.equal(stateAt(sc, id, 0).home, true, `${sc.id} ${id} start`);
      assert.equal(stateAt(sc, id, sc.hours).home, true, `${sc.id} ${id} end`);
    }
  }
  // the Alps trip: B starts in the Paris apartment and ends in the one in Nice
  assert.equal(stateAt(s2, 'B', 0).loc.id, 'paris');
  assert.equal(stateAt(s2, 'B', s2.hours).loc.id, 'nice');
  assert.equal(stateAt(s5, 'A', 9 + 3.5).leg.mode, 'flight');
});

test('A drives the own car past Paris, and flies and rents when the trip starts there', () => {
  for (const sc of [s1, s2, s3, s4]) {
    assert.equal(sc.raw.vehicles[0].kind, 'own_car', sc.id);
    for (const l of sc.raw.legs) {
      assert.ok(![l.from_location_id, l.to_location_id, ...l.via_location_ids].includes('paris') || l.mode === 'train', `${sc.id} ${l.id} takes the car through Paris`);
    }
  }
  for (const sc of [s5, s6]) {
    assert.ok(sc.raw.vehicles.every((v) => v.kind === 'rental_car'), sc.id);
    assert.deepEqual(sc.kpis.byParty.A, { carKm: sc.kpis.fleetKm / sc.kpis.cars, flights: 2, trains: 0 }, sc.id);
  }
  assert.equal(s5.kpis.cars, 1);
  assert.equal(s6.kpis.cars, 2);
});

test('headline numbers come from the data', () => {
  const car = [615, 510, 500];
  const down = (...rest) => car.concat(rest);
  const total = (xs) => xs.reduce((a, b) => a + b, 0);
  assert.equal(s1.kpis.fleetKm, total(down(335, 385, 470)) + total([175, 115, 85, 170]) + total([330, 340, 560, 500, 510, 615]));
  assert.equal(s2.kpis.fleetKm, total(down(335, 400)) + total([95, 150, 150, 110, 170]) + total([470, 385, 335, 500, 510, 615]));
  assert.equal(s5.kpis.fleetKm, 200 + 115 + 180 + 190 + 345 + 230);
  assert.equal(s6.kpis.fleetKm, 2 * s5.kpis.fleetKm);
  assert.deepEqual(s2.kpis.byParty.B, { carKm: 95 + 150 + 150 + 110 + 170, flights: 0, trains: 1 });
  assert.deepEqual(s1.kpis.byParty.B, { carKm: 175 + 115 + 85 + 170, flights: 0, trains: 1 });
});

test('about a week together, no stop longer than two nights, no driving day well over 60 mil', () => {
  for (const sc of data.scenarios) {
    const { loc, nights } = sc.kpis.longestStay;
    assert.ok(nights <= STAY_LIMIT_NIGHTS, `${sc.id}: ${nights} nights in ${loc.id}`);
    assert.ok(!isLongDrive(sc.kpis.longest.distance_km), `${sc.id}: ${sc.kpis.longest.id} is ${sc.kpis.longest.distance_km} km`);
    assert.ok(sc.kpis.sharedDays >= 6 && sc.kpis.sharedDays <= 8, `${sc.id}: ${sc.kpis.sharedDays} days together`);
  }
  const nights = (sc, ids) => ids.map((id) => sc.places.get(id).nights.A);
  assert.deepEqual(nights(s1, ['nice', 'moustiers', 'gordes', 'arles', 'beziers']), [2, 1, 1, 1, 2]);
  assert.deepEqual(nights(s2, ['annecy', 'chamonix', 'val_disere', 'briancon', 'barcelonnette', 'nice']), [1, 1, 1, 1, 1, 2]);
  assert.deepEqual(nights(s3, ['bordeaux', 'arcachon', 'biarritz', 'carcassonne', 'beziers']), [2, 1, 2, 1, 2]);
  // Clermont-Ferrand twice for A: one night together on the way in, one alone on the way home
  assert.deepEqual(nights(s4, ['clermont', 'salers', 'millau', 'florac', 'faugeres', 'beziers']), [2, 1, 1, 1, 1, 2]);
  assert.deepEqual(nights(s5, ['honfleur', 'bayeux', 'saint_malo', 'vannes', 'amboise']), [1, 2, 1, 1, 1]);
});

test('status wording', () => {
  assert.equal(describeState(s1, 'A', 0).text, 'Hemma i Stockholm');
  assert.equal(describeState(s1, 'A', 12).text, 'Kör Stockholm → Malmö');
  assert.equal(describeState(s1, 'B', 12).text, 'Hemma i Nice');
  assert.equal(describeState(s5, 'A', 12).text, 'Flyger Stockholm → Paris');
  assert.equal(describeState(s2, 'B', 12).text, 'Hemma i Paris');
  assert.equal(describeState(s2, 'B', hoursOf(5, 12)).text, 'Åker tåg Paris → Annecy');
  assert.equal(describeState(s2, 'B', s2.hours - 1).text, 'Hemma i Nice');
  assert.equal(describeState(s1, 'A', hoursOf(12)).text, 'I Béziers');
  assert.equal(describeState(s1, 'A', hoursOf(12)).sub, '2 nätter');
  assert.equal(describeState(s1, 'A', hoursOf(9, 20)).sub, '1 natt');
  assert.equal(HOW_LABEL[togetherAt(s6, hoursOf(2, 12))], 'Reser i två bilar');
  assert.equal(HOW_LABEL[togetherAt(s5, hoursOf(2, 12))], 'Reser tillsammans');
});

test('phases and milestones', () => {
  assert.equal(phaseAt(s1, hoursOf(8, 12)).title, 'Gorges du Verdon');
  assert.equal(phaseAt(s1, hoursOf(12)).title, 'Béziers och vin');
  assert.equal(phaseAt(s1, s1.hours).title, 'Hem');
  for (const sc of data.scenarios) {
    const days = sc.raw.phases.flatMap((p) => Array.from({ length: p.end_day_inclusive - p.start_day + 1 }, (_, i) => p.start_day + i));
    assert.deepEqual(days, Array.from({ length: sc.hours / 24 }, (_, i) => i + 1), `${sc.id} phases cover every day once`);
  }
  const marks = milestones(s2);
  assert.equal(marks[0], 0);
  assert.equal(marks.at(-1), s2.hours);
  assert.deepEqual(marks, [...marks].sort((x, y) => x - y));
  assert.equal(new Set(marks).size, marks.length);
});
