// Timeline lanes: one row per couple (stays and journeys), a "together" spine between them,
// event pins above, and a playhead you can drag. Several scenarios can share one time axis.

import { segmentAt } from './data.js';
import { clamp, dayOf, esc } from './format.js';
import { icon } from './icons.js';
import { EVENT_ICON, eventTip, legTip, partiesLabel, stayTip, togetherTip } from './text.js';
import { bindTips } from './tooltip.js';

const COMPACT_EVENTS = new Set(['meet', 'split', 'wine_pickup']);
const pct = (x) => `${(x * 100).toFixed(3)}%`;

export function createLanes(root, scenarios, { axisHours, compact = false, onScrub }) {
  const multi = scenarios.length > 1;
  root.className = `lanes ${compact ? 'lanes--compact' : 'lanes--full'}`;
  root.style.setProperty('--axis-days', axisHours / 24);
  root.innerHTML = `<div class="lanes__body">
    ${axisRow(axisHours)}
    ${scenarios.map((sc) => group(sc, axisHours, { compact, multi })).join('')}
    <div class="lanes__overlay"><div class="playhead"></div></div>
  </div>`;

  const body = root.querySelector('.lanes__body');
  const overlay = root.querySelector('.lanes__overlay');
  const playhead = root.querySelector('.playhead');
  const segEls = new Map();
  for (const sc of scenarios) {
    for (const party of sc.tracks.keys()) {
      segEls.set(`${sc.id}:${party}`, [...root.querySelectorAll(`[data-scenario="${sc.id}"] [data-party="${party}"] .seg`)]);
    }
  }
  const current = new Map();

  const timeAt = (e) => {
    const r = overlay.getBoundingClientRect();
    return Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * axisHours * 2) / 2;
  };
  let scrubbing = false;
  body.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.pin') || e.clientX < overlay.getBoundingClientRect().left) return;
    scrubbing = true;
    body.setPointerCapture(e.pointerId);
    onScrub(timeAt(e));
  });
  body.addEventListener('pointermove', (e) => scrubbing && onScrub(timeAt(e)));
  for (const type of ['pointerup', 'pointercancel']) body.addEventListener(type, () => { scrubbing = false; });
  body.addEventListener('click', (e) => {
    const pin = e.target.closest('.pin');
    if (pin) onScrub(Number(pin.dataset.t));
  });
  bindTips(body);

  function setTime(t) {
    playhead.style.left = pct(clamp(t / axisHours, 0, 1));
    playhead.dataset.label = `Dag ${dayOf(Math.min(t, axisHours - 0.01))}`;
    for (const sc of scenarios) {
      for (const party of sc.tracks.keys()) {
        const key = `${sc.id}:${party}`;
        const segs = sc.tracks.get(party);
        const idx = t > sc.hours ? -1 : segs.indexOf(segmentAt(segs, t));
        if (current.get(key) === idx) continue;
        const els = segEls.get(key);
        els[current.get(key)]?.classList.remove('is-now');
        els[idx]?.classList.add('is-now');
        current.set(key, idx);
      }
    }
  }

  return { setTime };
}

function axisRow(axisHours) {
  const days = axisHours / 24;
  const ticks = Array.from({ length: days }, (_, i) => `<span class="tick" style="left:${pct((i + 0.5) / days)}">${i + 1}</span>`).join('');
  return `<div class="lanes__row lanes__row--axis"><div class="lanes__who">Dag</div><div class="lanes__track">${ticks}</div></div>`;
}

function group(sc, axisHours, { compact, multi }) {
  const span = sc.hours / axisHours;
  const who = (inner = '') => `<div class="lanes__who">${inner}</div>`;
  const track = (inner) => `<div class="lanes__track" style="--span:${span}">${inner}</div>`;
  const lane = (party) => {
    const segs = sc.tracks.get(party);
    const label = `<span class="dot dot--${party}">${party}</span>${compact ? '' : `<span>Par ${party}</span>`}`;
    return `<div class="lanes__row lanes__row--lane" data-party="${party}">${who(label)}${track(segs.map((s, i) => segment(sc, party, s, i, segs)).join(''))}</div>`;
  };
  const events = sc.raw.events.filter((e) => !compact || COMPACT_EVENTS.has(e.kind)).map((e) => pin(sc, e)).join('');
  const spine = sc.together
    .map((x) => `<div class="spine spine--${x.how}" style="left:${pct(x.t0 / sc.hours)};width:${pct((x.t1 - x.t0) / sc.hours)}" data-tip="${esc(togetherTip(x))}"></div>`)
    .join('');
  return `<section class="lanes__group" data-scenario="${sc.id}">
    ${multi ? `<h3 class="lanes__head"><span class="num">${sc.number}</span>${esc(sc.title)}<small>${esc(sc.subtitle)}</small></h3>` : ''}
    <div class="lanes__row lanes__row--events">${who()}${track(events)}</div>
    ${lane('A')}
    <div class="lanes__row lanes__row--spine">${who()}${track(spine)}</div>
    ${lane('B')}
  </section>`;
}

function segment(sc, party, s, i, segs) {
  const pos = `left:${pct(s.start_hour / sc.hours)};width:${pct((s.end_hour - s.start_hour) / sc.hours)}`;
  if (s.kind === 'stay') {
    const loc = sc.locations.get(s.location_id);
    const home = (i === 0 || i === segs.length - 1) && s.location_id === sc.raw.party_initial_location_ids[party];
    const cls = ['seg', 'seg--stay', `is-${party}`, s.location_id === 'beziers' && 'is-wine', home && 'is-home'].filter(Boolean).join(' ');
    return `<div class="${cls}" style="${pos}" data-tip="${esc(stayTip(sc, party, s))}"><span class="seg__label">${esc(loc.short)}</span></div>`;
  }
  const leg = sc.legs.get(s.leg_id);
  return `<div class="seg seg--travel seg--${leg.mode} is-${party}" style="${pos}" data-tip="${esc(legTip(sc, leg, partiesLabel(leg.party_ids)))}">${icon(leg.mode, 13)}</div>`;
}

function pin(sc, e) {
  return `<button type="button" class="pin pin--${e.kind}" style="left:${pct(e.at_hour / sc.hours)}" data-t="${e.at_hour}" data-tip="${esc(eventTip(sc, e))}" aria-label="${esc(e.title)}">${icon(EVENT_ICON[e.kind], 12)}</button>`;
}
