import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { STAY_LIMIT_NIGHTS, countNights, isLongDrive, milestones, phaseAt, prepare, stateAt, togetherAt } from '../js/data.js';
import { clock, fmtMoment, hoursOf } from '../js/format.js';
import { cumulative, distanceKm, partial, pointAt } from '../js/geo.js';
import { HOW_LABEL, describeState } from '../js/text.js';

const raw = JSON.parse(readFileSync(new URL('../data/frankrike-2027.json', import.meta.url), 'utf8'));
const data = prepare(raw);
// Alternatives are numbered by their position in the data, so look them up by id.
const [s1, s2, s3, s4, s5, s6] = ['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => data.scenarios.find((s) => s.id === id));

test('six scenarios with the expected shape, the first choice numbered 1', () => {
  assert.deepEqual(data.scenarios.map((s) => [s.number, s.id]), [[1, 's2'], [2, 's1'], [3, 's3'], [4, 's4'], [5, 's5'], [6, 's6']]);
  assert.equal(data.scenarios[0].id, raw.recommendation.first_choice_scenario_id);
  assert.deepEqual(data.scenarios.map((s) => s.hours), [20 * 24, 19 * 24, 22 * 24, 21 * 24, 9 * 24, 9 * 24]);
  assert.equal(s1.title, 'Flyg till Paris');
  assert.equal(s1.subtitle, 'Normandie och Atlanten, hem via inlandet');
});

test('two single-party legs making the same trip become one parallel route', () => {
  assert.equal(s4.raw.legs.length, 24);
  assert.equal(s4.routes.length, 18);
  assert.equal(s4.routes.filter((r) => r.kind === 'parallel').length, 6);
  for (const other of [s1, s2, s3, s5]) assert.equal(other.routes.length, other.raw.legs.length);
  // both legs resolve to the same route, so either party animates along it
  assert.equal(s4.routeOfLeg.get('s4_leg_06'), s4.routeOfLeg.get('s4_leg_09'));
  assert.equal(s6.raw.legs.length, 14);
  assert.equal(s6.routes.filter((r) => r.kind === 'parallel').length, 6);
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

test('nights in Béziers', () => {
  assert.deepEqual(data.scenarios.map((s) => s.kpis.bezierNights), [5, 4, 5, 5, 4, 4]);
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

test('only the two-car alternatives have two vehicles travelling together', () => {
  const kinds = (sc) => new Set(sc.together.map((x) => x.how));
  for (const sc of [s4, s6]) assert.ok(kinds(sc).has('convoy'), sc.id);
  for (const sc of [s1, s2, s3, s5]) assert.ok(!kinds(sc).has('convoy'), sc.id);
});

test('couples start at home and end at home', () => {
  for (const sc of data.scenarios) {
    for (const id of ['A', 'B']) {
      assert.equal(stateAt(sc, id, 0).home, true, `${sc.id} ${id} start`);
      assert.equal(stateAt(sc, id, sc.hours).home, true, `${sc.id} ${id} end`);
    }
  }
  assert.equal(stateAt(s1, 'A', 9 + 3.5).kind, 'travel');
  assert.equal(stateAt(s1, 'A', 9 + 3.5).leg.mode, 'flight');
});

test('headline numbers come from the data', () => {
  // the old totals plus the hops between the wine villages (and a shorter way out of Faugères in alternative 2)
  assert.equal(s2.kpis.fleetKm, 5630 + 35 + 40 + 60 - 10);
  assert.equal(s4.kpis.fleetKm, 7250 + 2 * (35 + 40 + 60 + 45));
  assert.equal(s4.kpis.cars, 2);
  assert.deepEqual(s2.kpis.byParty.B, { carKm: 1600 + 35 + 40 + 60 - 10, flights: 0, trains: 2 });
  assert.deepEqual(s1.kpis.byParty.A, { carKm: 2190 - 40 + 40 + 35, flights: 2, trains: 0 });
  assert.equal(s5.kpis.fleetKm, 440 + 350 + 40 + 35 + 510 + 315);
  assert.equal(s6.kpis.fleetKm, 2 * s5.kpis.fleetKm);
  assert.equal(s6.kpis.cars, 2);
});

test('no stop together lasts more than two nights, and no driving day is well over 60 mil', () => {
  for (const sc of data.scenarios) {
    const { loc, nights } = sc.kpis.longestStay;
    assert.ok(nights <= STAY_LIMIT_NIGHTS, `${sc.id}: ${nights} nights in ${loc.id}`);
    assert.ok(!isLongDrive(sc.kpis.longest.distance_km), `${sc.id}: ${sc.kpis.longest.id} is ${sc.kpis.longest.distance_km} km`);
  }
  // the wine stay is split over villages, mostly one night each and two in Béziers
  const nights = (sc, ids) => ids.map((id) => sc.places.get(id).nights.A);
  assert.deepEqual(nights(s1, ['minerve', 'saint_chinian', 'beziers']), [1, 1, 2]);
  assert.deepEqual(nights(s2, ['beziers', 'saint_chinian', 'minerve', 'faugeres']), [2, 1, 1, 1]);
  assert.deepEqual(nights(s3, ['saint_chinian', 'minerve', 'faugeres', 'beziers']), [1, 1, 1, 2]);
  assert.deepEqual(nights(s4, ['saint_chinian', 'minerve', 'faugeres', 'beziers']), [1, 1, 1, 2]);
  assert.deepEqual(nights(s5, ['faugeres', 'saint_chinian', 'beziers']), [1, 1, 2]);
  // where the wine is collected follows the way out: Faugères on the road north in alternative 2, Béziers elsewhere
  assert.equal(s2.raw.wine_plan.purchase_location_id, 'faugeres');
  assert.equal(s2.raw.events.find((e) => e.kind === 'wine_pickup').location_id, 'faugeres');
  assert.equal(s3.raw.wine_plan.purchase_location_id, 'beziers');
  // alternative 3: the 720 km day is two days, so the couples meet a day later and Nice is two nights
  assert.equal(s3.raw.events.find((e) => e.kind === 'meet').at_hour, hoursOf(6, 19));
  assert.equal(s3.raw.legs.find((l) => l.id === 's3_leg_04').to_location_id, 'mulhouse');
});

test('the short variants of Flyg till Paris share less than half the time of the long one', () => {
  for (const short of [s5, s6]) {
    assert.ok(short.kpis.sharedDays < s1.kpis.sharedDays / 2, short.id);
    assert.equal(short.kpis.bezierNights, s1.kpis.bezierNights, short.id);
  }
  assert.ok(Math.abs(s5.kpis.sharedDays - 7.58) < 0.01);
  assert.equal(s6.kpis.sharedDays, s5.kpis.sharedDays);
});

test('status wording', () => {
  assert.equal(describeState(s2, 'A', 0).text, 'Hemma i Stockholm');
  assert.equal(describeState(s2, 'A', 12).text, 'Kör Stockholm → Malmö');
  assert.equal(describeState(s2, 'B', 12).text, 'Hemma i Paris');
  assert.equal(describeState(s1, 'A', 12).text, 'Flyger Stockholm → Paris');
  assert.equal(describeState(s2, 'B', hoursOf(4, 12)).text, 'Åker tåg Paris → Strasbourg');
  assert.equal(describeState(s2, 'A', hoursOf(10)).text, 'I Béziers');
  assert.equal(describeState(s2, 'A', hoursOf(10)).sub, '2 nätter');
  assert.equal(HOW_LABEL[togetherAt(s4, hoursOf(7, 12))], 'Reser i två bilar');
  assert.equal(HOW_LABEL[togetherAt(s6, hoursOf(2, 12))], 'Reser i två bilar');
  assert.equal(HOW_LABEL[togetherAt(s5, hoursOf(2, 12))], 'Reser tillsammans');
});

test('phases and milestones', () => {
  assert.equal(phaseAt(s2, hoursOf(9)).title, 'Béziers och vin');
  assert.equal(phaseAt(s2, hoursOf(10)).title, 'Saint-Chinian');
  assert.equal(phaseAt(s2, s2.hours).title, 'Reserv och A:s hemresa');
  const marks = milestones(s2);
  assert.equal(marks[0], 0);
  assert.equal(marks.at(-1), s2.hours);
  assert.deepEqual(marks, [...marks].sort((x, y) => x - y));
  assert.equal(new Set(marks).size, marks.length);
});
