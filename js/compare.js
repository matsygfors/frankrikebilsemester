// "Jämför": the alternatives side by side on one shared clock.

import { DRIVE_LIMIT_KM, STAY_LIMIT_NIGHTS, isLongDrive, togetherAt } from './data.js';
import { countWord, esc, fmtDec, fmtInt, fmtRange, plural } from './format.js';
import { icon } from './icons.js';
import { createLanes } from './lanes.js';
import { legendHTML } from './legend.js';
import { createMap } from './map-view.js';
import { HOW_LABEL, WINE_TRANSPORT, describeState, legTitle, modesText, vehicleLine } from './text.js';

export function mountCompare(root, { data, store, mapMode }) {
  const { scenarios } = data;
  const maxT = Math.max(...scenarios.map((s) => s.hours));
  const tags = recommendationTags(data.raw.recommendation, scenarios);
  const count = countWord(scenarios.length);
  const Count = count[0].toUpperCase() + count.slice(1);

  root.innerHTML = `
    <section class="intro">
      <h1>${Count} sätt att ta sig till Béziers</h1>
      <p>${Count} grova upplägg för sommaren 2027. Inget är bokat: tider och körsträckor är egna uppskattningar.
         Dra i tidsreglaget högst upp (eller i tidslinjerna längre ner) för att se var Par A och Par B befinner sig i varje alternativ.</p>
    </section>
    ${legendHTML()}
    <div class="cards">${scenarios.map((sc) => card(sc, tags.get(sc.id))).join('')}</div>
    <section class="panel">
      <div class="panel__head">
        <h2>Tidslinjer sida vid sida</h2>
        <p>Samma tidsaxis för alla ${count}: hur länge man är borta, när man möts och var vinet köps.</p>
      </div>
      <div data-lanes></div>
    </section>
    <section class="panel">
      <div class="panel__head"><h2>Jämförelse i siffror</h2></div>
      ${table(scenarios, tags)}
    </section>
    <details class="panel assumptions">
      <summary>Antaganden bakom underlaget</summary>
      <ul>${data.raw.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    </details>`;

  const maps = scenarios.map((sc) => createMap(root.querySelector(`[data-map="${sc.id}"]`), sc, { compact: true, mode: mapMode }));
  const lanes = createLanes(root.querySelector('[data-lanes]'), scenarios, {
    axisHours: maxT,
    compact: true,
    onScrub: (t) => store.set({ t, playing: false }),
  });
  const statusEls = new Map(scenarios.map((sc) => [sc.id, root.querySelector(`[data-status="${sc.id}"]`)]));
  const lastStatus = new Map();

  return {
    maxT,
    update(t) {
      maps.forEach((m) => m.update(t));
      lanes.setTime(t);
      for (const sc of scenarios) {
        const html = statusHTML(sc, t);
        if (lastStatus.get(sc.id) === html) continue;
        lastStatus.set(sc.id, html);
        statusEls.get(sc.id).innerHTML = html;
      }
    },
    setMapMode: (mode) => maps.forEach((m) => m.setFrame(mode)),
    destroy() {
      maps.forEach((m) => m.destroy());
      root.replaceChildren();
    },
  };
}

function recommendationTags(rec, scenarios) {
  const tags = new Map([
    [rec.first_choice_scenario_id, 'Förstaval i underlaget'],
    [rec.if_paris_is_priority, 'Om Paris är viktigast'],
    [rec.if_nice_is_priority, 'Om Nice är viktigast'],
    [rec.if_independence_is_priority, 'Om frihet är viktigast'],
  ]);
  // The data recommends only by name; the alternatives with the least time together get a tag of their own.
  const least = Math.min(...scenarios.map((s) => s.kpis.sharedDays));
  for (const sc of scenarios) {
    if (tags.has(sc.id) || sc.kpis.sharedDays > least + 0.05) continue;
    tags.set(sc.id, sc.kpis.cars > 1 ? 'Om kort tid och frihet är viktigast' : 'Om kort tid tillsammans är viktigast');
  }
  return tags;
}

function card(sc, tag) {
  const k = sc.kpis;
  return `<article class="card scn">
    <header class="scn__head">
      <span class="num">${sc.number}</span>
      <div class="scn__titles">
        <h2><a href="#/${sc.number}">${esc(sc.title)}</a></h2>
        <p>${esc(sc.subtitle)}</p>
      </div>
      ${tag ? `<span class="chip chip--tag">${esc(tag)}</span>` : ''}
    </header>
    <p class="scn__summary">${esc(sc.raw.summary)}</p>
    <div class="scn__map" data-map="${sc.id}" role="img" aria-label="Karta över alternativ ${sc.number}"></div>
    <div class="scn__status" data-status="${sc.id}"></div>
    <dl class="kpis">
      <div><dt>Resdagar</dt><dd>${k.days}<small> (${k.flex.min}–${k.flex.max})</small></dd></div>
      <div><dt>Tillsammans</dt><dd>${fmtDec(k.sharedDays)}<small> dygn</small></dd></div>
      <div><dt>Bilkilometer</dt><dd>${fmtInt(k.fleetKm)}<small> km</small></dd></div>
      <div><dt>Körtid</dt><dd>${fmtInt(k.driveHours)}<small> h</small></dd></div>
      <div><dt>Bilar</dt><dd>${k.cars}</dd></div>
      <div><dt>Längsta kördag</dt><dd>${fmtDec(k.longest.driving_hours)}<small> h</small></dd></div>
    </dl>
    <footer class="scn__foot"><a class="btn btn--ghost" href="#/${sc.number}">Utforska alternativ ${sc.number} ${icon('arrow', 14)}</a></footer>
  </article>`;
}

function statusHTML(sc, t) {
  const rows = ['A', 'B']
    .map((id) => {
      const d = describeState(sc, id, t);
      return `<li><span class="dot dot--${id}">${id}</span><span class="status__text">${icon(d.icon, 14)}${esc(d.text)}</span>${d.sub ? `<small>${esc(d.sub)}</small>` : ''}</li>`;
    })
    .join('');
  const how = togetherAt(sc, t);
  return `<ul class="status">${rows}</ul><span class="chip ${how ? 'chip--together' : ''}">${how ? HOW_LABEL[how] : 'Åtskilda'}</span>`;
}

// ---- Comparison table ----

const bar = (value, max) => `<span class="bar" aria-hidden="true"><i style="width:${((value / max) * 100).toFixed(1)}%"></i></span>`;
const list = (items) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

function table(scenarios, tags) {
  const max = (pick) => Math.max(...scenarios.map(pick));
  const maxDays = max((s) => s.kpis.days);
  const maxKm = max((s) => s.kpis.fleetKm);
  const maxHours = max((s) => s.kpis.driveHours);
  const rows = [
    ['Passar om', (s) => esc(tags.get(s.id) ?? '–')],
    ['Resdagar', (s) => `${s.kpis.days} <small>(${s.kpis.flex.min}–${s.kpis.flex.max})</small>${bar(s.kpis.days, maxDays)}`],
    ['Tillsammans', (s) => `${fmtDec(s.kpis.sharedDays)} dygn`],
    ['Längst på samma ort', stayCell],
    ['Så reser A', (s) => esc(modesText(s, 'A'))],
    ['Så reser B', (s) => esc(modesText(s, 'B'))],
    ['Fordon', (s) => s.raw.vehicles.map((v) => esc(vehicleLine(s, v))).join('<br>')],
    ['Bilkilometer', (s) => `${fmtInt(s.kpis.fleetKm)} km<small> mellan orter, alla bilar<br>${fmtRange(s.kpis.totalKmRange)} km inkl. lokalt</small>${bar(s.kpis.fleetKm, maxKm)}`],
    ['Körtid', (s) => `${fmtInt(s.kpis.driveHours)} h<small> utan långa stopp</small>${bar(s.kpis.driveHours, maxHours)}`],
    ['Längsta kördag', longestDriveCell],
    ['Nätter i Béziers-trakten', (s) => s.kpis.bezierNights],
    ['Vin hem', (s) => esc(WINE_TRANSPORT[s.raw.wine_plan.transport_method])],
    ['Fördelar och avvägningar', (s) => list(s.raw.tradeoffs)],
    ['Osäkerheter', (s) => list(s.raw.uncertainties)],
  ];
  return `<div class="table-scroll"><table class="cmp" style="--cols:${scenarios.length}">
    <thead><tr><td></td>${scenarios.map((s) => `<th scope="col"><a href="#/${s.number}"><span class="num">${s.number}</span>${esc(s.title)}</a><small>${esc(s.subtitle)}</small></th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, cell]) => `<tr><th scope="row">${label}</th>${scenarios.map((s) => `<td>${cell(s)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

/** "7 h · 615 km" and which day, flagged when it is well over 60 mil. */
function longestDriveCell(s) {
  const l = s.kpis.longest;
  const over = isLongDrive(l.distance_km);
  return `<span class="${over ? 'over' : ''}">${fmtDec(l.driving_hours)} h · ${fmtInt(l.distance_km)} km</span><small><br>${esc(legTitle(s, l))}, dag ${l.departure_day}${over ? `<br>mer än ${DRIVE_LIMIT_KM / 10} mil` : ''}</small>`;
}

/** "4 nätter" and where, flagged when it is more than the group would like to stay in one place. */
function stayCell(s) {
  const { nights, loc } = s.kpis.longestStay;
  const over = nights > STAY_LIMIT_NIGHTS;
  return `<span class="${over ? 'over' : ''}">${plural(nights, 'natt', 'nätter')}</span><small> i ${esc(loc.short)}${over ? `<br>mer än ${STAY_LIMIT_NIGHTS}` : ''}</small>`;
}
