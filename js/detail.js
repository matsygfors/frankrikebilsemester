// One alternative in depth: big map, full timeline, and the plan, vehicles, wine and caveats beside it.

import { STAY_LIMIT_NIGHTS, milestones, phaseAt, togetherAt } from './data.js';
import { esc, fmtDec, fmtInt, fmtMoment, fmtRange, hoursOf } from './format.js';
import { icon } from './icons.js';
import { createLanes } from './lanes.js';
import { legendHTML } from './legend.js';
import { createMap } from './map-view.js';
import { HOW_LABEL, WINE_TRANSPORT, describeState, vehicleLine } from './text.js';

export function mountDetail(root, { data, store, sc, mapMode }) {
  const k = sc.kpis;
  root.innerHTML = `
    <div class="detail">
      <header class="detail__head">
        <a class="back" href="#/jamfor">${icon('left', 16)}Jämför alla</a>
        <div class="detail__title">
          <span class="num num--lg">${sc.number}</span>
          <div><h1>${esc(sc.title)}</h1><p>${esc(sc.subtitle)}</p></div>
        </div>
        <p class="detail__summary">${esc(sc.raw.summary)}</p>
        <ul class="chips">
          <li><b>${k.days}</b> dagar <small>(${k.flex.min}–${k.flex.max})</small></li>
          <li><b>${fmtDec(k.sharedDays)}</b> dygn tillsammans</li>
          <li${k.longestStay.nights > STAY_LIMIT_NIGHTS ? ' class="over"' : ''}><b>${k.longestStay.nights}</b> ${k.longestStay.nights === 1 ? 'natt' : 'nätter'} som mest på samma ort</li>
          <li><b>${fmtInt(k.fleetKm)}</b> km bil</li>
          <li><b>${fmtInt(k.driveHours)}</b> h körtid</li>
          <li><b>${k.cars}</b> ${k.cars === 1 ? 'bil' : 'bilar'}</li>
          <li><b>${k.bezierNights}</b> nätter i Béziers-trakten</li>
        </ul>
      </header>
      <div class="detail__grid">
        <div class="detail__main">
          <div class="map-wrap">
            <div class="detail__map" data-map role="img" aria-label="Karta över alternativ ${sc.number}"></div>
            <div class="map-status">
              <div data-now></div>
              <div class="now__nav">
                <button type="button" class="btn btn--icon btn--small" data-nav="-1" aria-label="Föregående stopp" title="Föregående stopp">${icon('left', 16)}</button>
                <span>Stopp</span>
                <button type="button" class="btn btn--icon btn--small" data-nav="1" aria-label="Nästa stopp" title="Nästa stopp">${icon('right', 16)}</button>
              </div>
            </div>
          </div>
          ${legendHTML()}
          <section class="panel">
            <div class="panel__head"><h2>Tidslinje</h2><p>Dra i tidslinjen eller klicka på en händelse.</p></div>
            <div data-lanes></div>
          </section>
          <div class="pair">
            ${listPanel('Avvägningar', sc.raw.tradeoffs)}
            ${listPanel('Osäkerheter', sc.raw.uncertainties)}
          </div>
        </div>
        <aside class="detail__side">
          ${phasesPanel(sc)}
          ${vehiclesPanel(sc)}
          ${winePanel(sc, data)}
          ${alternativesPanel(sc)}
        </aside>
      </div>
    </div>`;

  const page = root.querySelector('.detail');
  const map = createMap(page.querySelector('[data-map]'), sc, { mode: mapMode });
  const lanes = createLanes(page.querySelector('[data-lanes]'), [sc], {
    axisHours: sc.hours,
    onScrub: (t) => store.set({ t, playing: false }),
  });
  const nowEl = page.querySelector('[data-now]');
  const phaseEls = [...page.querySelectorAll('[data-phase]')];
  const stops = milestones(sc);
  let lastNow = '';
  let activePhase = -1;

  page.addEventListener('click', (e) => {
    const phase = e.target.closest('[data-phase]');
    if (phase) {
      store.set({ t: hoursOf(sc.raw.phases[Number(phase.dataset.phase)].start_day, 8), playing: false });
      return;
    }
    const nav = e.target.closest('[data-nav]');
    if (!nav) return;
    const { t } = store.get();
    const next = nav.dataset.nav === '1' ? stops.find((m) => m > t + 0.01) : stops.findLast((m) => m < t - 0.01);
    if (next !== undefined) store.set({ t: next, playing: false });
  });

  return {
    maxT: sc.hours,
    update(t) {
      map.update(t);
      lanes.setTime(t);
      const html = nowHTML(sc, t);
      if (html !== lastNow) {
        lastNow = html;
        nowEl.innerHTML = html;
      }
      const idx = sc.raw.phases.indexOf(phaseAt(sc, t));
      if (idx !== activePhase) {
        phaseEls[activePhase]?.classList.remove('is-active');
        phaseEls[idx]?.classList.add('is-active');
        activePhase = idx;
      }
    },
    setMapMode: (mode) => map.setFrame(mode),
    destroy() {
      map.destroy();
      root.replaceChildren();
    },
  };
}

function nowHTML(sc, t) {
  const rows = ['A', 'B']
    .map((id) => {
      const d = describeState(sc, id, t);
      return `<li><span class="dot dot--${id}">${id}</span><div><span class="status__text">${icon(d.icon, 14)}${esc(d.text)}</span>${d.sub ? `<small>${esc(d.sub)}</small>` : ''}</div></li>`;
    })
    .join('');
  const how = togetherAt(sc, t);
  return `<div class="now__time">${fmtMoment(t, sc.hours)}</div>
    <div class="now__phase">${esc(phaseAt(sc, t)?.title ?? '')}</div>
    <ul class="status status--stacked">${rows}</ul>
    <span class="chip ${how ? 'chip--together' : ''}">${how ? HOW_LABEL[how] : 'Åtskilda'}</span>`;
}

// ---- Side panels ----

const panel = (title, inner) => `<section class="panel"><div class="panel__head"><h2>${title}</h2></div>${inner}</section>`;
const listPanel = (title, items) => panel(title, `<ul class="bullets">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`);

function phasesPanel(sc) {
  const items = sc.raw.phases
    .map((p, i) => {
      const days = p.start_day === p.end_day_inclusive ? `Dag ${p.start_day}` : `Dag ${p.start_day}–${p.end_day_inclusive}`;
      return `<li><button type="button" class="phase" data-phase="${i}"><span class="phase__days">${days}</span><b>${esc(p.title)}</b><span class="phase__desc">${esc(p.description)}</span></button></li>`;
    })
    .join('');
  return panel('Dag för dag', `<ol class="phases">${items}</ol>`);
}

function vehiclesPanel(sc) {
  const items = sc.raw.distance_summary.by_vehicle
    .map((bv) => {
      const v = sc.raw.vehicles.find((x) => x.id === bv.vehicle_id);
      return `<li>
        <b>${esc(vehicleLine(sc, v))}</b>
        <span>${fmtInt(bv.intercity_km)} km mellan orter · ${fmtDec(bv.driving_hours_without_long_stops)} h körtid</span>
        <span>Lokalt ${fmtRange(bv.local_km_range)} km · totalt ${fmtRange(bv.total_km_range)} km</span>
        <small>${esc(v.notes)}</small>
      </li>`;
    })
    .join('');
  return panel('Fordon och sträckor', `<ul class="stack">${items}</ul>`);
}

function winePanel(sc, data) {
  const w = sc.raw.wine_plan;
  const rules = data.raw.wine_logistics;
  const keys = w.transport_method === 'own_car_self_transport' ? ['self_transport', 'reference_quantity', 'handling'] : ['flight', 'shipping', 'reference_quantity', 'handling'];
  return panel(
    'Vin',
    `<dl class="facts">
      <div><dt>Inköp</dt><dd>${esc(sc.locations.get(w.purchase_location_id).short)}, dag ${w.purchase_day} · Par ${w.buyer_party_id}</dd></div>
      <div><dt>Hem med</dt><dd>${esc(WINE_TRANSPORT[w.transport_method])}</dd></div>
      <div><dt>Mängd</dt><dd>${w.quantity_bottles ?? 'inte bestämd'}</dd></div>
    </dl>
    <p class="prose">${esc(w.notes)}</p>
    <details>
      <summary>Regler att kontrollera</summary>
      <ul class="bullets">${keys.map((key) => `<li>${esc(rules[key])}</li>`).join('')}</ul>
      <p class="note">Kontrollerat ${esc(rules.rules_checked_date)}. Kontrollera igen före avresa.</p>
    </details>`,
  );
}

function alternativesPanel(sc) {
  const items = sc.raw.alternative_meetings
    .map(
      (m) => `<li class="alt">
        <div class="alt__head"><b>${esc(sc.locations.get(m.location_id).short)}</b><span class="chip ${m.is_baseline ? 'chip--together' : ''}">${m.is_baseline ? 'Grundplan' : 'Kräver omplanering'}</span></div>
        <p><span>B tar sig dit:</span> ${esc(m.B_access)}</p>
        <p><span>Fördel:</span> ${esc(m.benefit)}</p>
        <p><span>Påverkan:</span> ${esc(m.schedule_impact)}</p>
      </li>`,
    )
    .join('');
  return panel('Alternativa mötesplatser', `<ul class="stack">${items}</ul>`);
}
