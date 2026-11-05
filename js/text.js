// Swedish wording for things in the data: legs, stays, events, who is doing what.

import { countNights, stateAt } from './data.js';
import { esc, fmtDec, fmtInt, fmtMoment, fmtSpan, plural } from './format.js';

export const MODE_LABEL = { car: 'Bil', flight: 'Flyg', train: 'Tåg' };
export const MODE_VERB = { car: 'Kör', flight: 'Flyger', train: 'Åker tåg' };
export const HOW_LABEL = { vehicle: 'Reser tillsammans', convoy: 'Reser i två bilar', place: 'På samma ort' };
export const EVENT_ICON = { meet: 'users', split: 'split', wine_pickup: 'wine', vehicle_pickup: 'key', vehicle_return: 'key' };
export const WINE_TRANSPORT = {
  own_car_self_transport: 'Egen bil hem',
  checked_baggage_or_seller_arranged_shipping: 'Incheckat bagage eller leverans',
};

export const partiesLabel = (ids) => `Par ${ids.join(' + ')}`;
export const legTitle = (scn, leg) => `${scn.locations.get(leg.from_location_id).short} → ${scn.locations.get(leg.to_location_id).short}`;

export function legMeta(leg) {
  const bits = [MODE_LABEL[leg.mode]];
  if (leg.distance_km) bits.push(`ca ${fmtInt(leg.distance_km)} km`);
  bits.push(leg.driving_hours ? `${fmtDec(leg.driving_hours)} h körtid` : `ca ${fmtDec(leg.planned_elapsed_hours)} h resa`);
  return bits.join(' · ');
}

export function vehicleLine(scn, v) {
  const loc = (id) => scn.locations.get(id).short;
  const what = v.kind === 'own_car' ? `Egen bil (${v.owner_party_id})` : `Hyrbil ${loc(v.pickup_location_id)}–${loc(v.return_location_id)}`;
  return `${what} · ${partiesLabel(v.party_ids)}`;
}

export function modesText(scn, party) {
  const k = scn.kpis.byParty[party];
  const bits = [];
  if (k.flights) bits.push(`Flyg ${plural(k.flights, 'resa', 'resor')}`);
  if (k.trains) bits.push(`Tåg ${plural(k.trains, 'resa', 'resor')}`);
  if (k.carKm) bits.push(`Bil ${fmtInt(k.carKm)} km`);
  return bits.join(' · ') || '–';
}

/** What a party is doing at trip time t, as { icon, text, sub }. */
export function describeState(scn, party, t) {
  const st = stateAt(scn, party, t);
  if (st.kind === 'travel') {
    const km = st.leg.distance_km ? ` · ca ${fmtInt(st.leg.distance_km)} km` : '';
    return { icon: st.leg.mode, text: `${MODE_VERB[st.leg.mode]} ${st.from.short} → ${st.to.short}`, sub: `${Math.round(st.f * 100)} % av sträckan${km}`, state: st };
  }
  if (st.home) return { icon: 'home', text: `Hemma i ${st.loc.short}`, sub: '', state: st };
  return { icon: 'pin', text: `I ${st.loc.short}`, sub: st.nights ? plural(st.nights, 'natt', 'nätter') : 'Genomresa', state: st };
}

// ---- Tooltip bodies (HTML; every dynamic value is escaped) ----

const tip = (title, ...lines) => `<b>${esc(title)}</b>${lines.filter(Boolean).map((l) => `<span>${esc(l)}</span>`).join('')}`;

export const legTip = (scn, leg, who) => tip(legTitle(scn, leg), legMeta(leg), fmtSpan(leg.start_hour, leg.end_hour), who);

export function routeTip(scn, route) {
  const leg = scn.legs.get(route.legIds[0]);
  const who = route.kind === 'parallel' ? 'Par A och B, i varsin bil' : partiesLabel(route.partyIds);
  return legTip(scn, leg, who);
}

export function stayTip(scn, party, seg) {
  const loc = scn.locations.get(seg.location_id);
  const nights = countNights(seg.start_hour, seg.end_hour);
  return tip(loc.short, loc.region, fmtSpan(seg.start_hour, seg.end_hour), nights ? plural(nights, 'natt', 'nätter') : '', `Par ${party}`);
}

export function placeTip(place) {
  const nights = Object.entries(place.nights).map(([party, n]) => `Par ${party}: ${plural(n, 'natt', 'nätter')}`);
  return tip(place.loc.short, place.loc.region, ...nights);
}

export const eventTip = (scn, e) =>
  tip(e.title, `${fmtMoment(e.at_hour)} · ${scn.locations.get(e.location_id).short}`, partiesLabel(e.party_ids));

export const togetherTip = (x) => tip(HOW_LABEL[x.how], fmtSpan(x.t0, x.t1));
