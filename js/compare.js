// "Jämför": one card per route with a switch for how A travels. Timelines, the numbers and the
// assumptions are folded away until asked for.

import { DRIVE_LIMIT_KM, ROUND_LIMIT_KM, STAY_LIMIT_NIGHTS, chosen, isLongDrive, isLongRoundDay, togetherAt } from './data.js';
import { countWord, esc, fmtDec, fmtInt, fmtRange, plural } from './format.js';
import { icon } from './icons.js';
import { createLanes } from './lanes.js';
import { legendHTML } from './legend.js';
import { createMap } from './map-view.js';
import { HOW_LABEL, VARIANT_LABEL, WINE_TRANSPORT, describeState, legTitle, modesText, vehicleLine } from './text.js';
import { allSwitchHTML, bindSwitches } from './variant.js';

/** A panel that is closed until opened. */
export const fold = (title, inner, open = false) =>
  `<details class="panel fold"${open ? ' open' : ''}><summary>${title}</summary><div class="fold__body">${inner}</div></details>`;

export function mountCompare(root, { data, store, mapMode }) {
  let selection = store.get().variants;
  let scenarios = chosen(data, selection);
  const count = countWord(data.routes.length);
  const Heading = count[0].toUpperCase() + count.slice(1);

  // Both variants of every route are drawn up front and only shown or hidden, so switching is instant.
  root.innerHTML = `
    <section class="intro">
      <h1>${Heading} roadtrips i Frankrike</h1>
      <p>Varje rutt går att göra på två sätt med samma stopp: A kör egen bil från Sverige, eller alla flyger och hyr en bil. Inget är bokat: tider och körsträckor är egna uppskattningar.
         Dra i tidsreglaget högst upp för att se var Par A och Par B befinner sig.</p>
      <div class="intro__all" data-all>${allSwitchHTML(data, selection)}</div>
    </section>
    <div class="cards">${data.scenarios.map((sc) => card(sc)).join('')}</div>
    ${fold('Tidslinjer sida vid sida', '<p class="fold__hint">Samma tidsaxel för alla: hur länge man är borta, när man möts och var vinet köps.</p><div data-lanes></div>')}
    ${fold('Jämförelse i siffror', '<div data-table></div>')}
    ${fold('Teckenförklaring', legendHTML())}
    ${fold('Antaganden bakom underlaget', `<ul class="bullets">${data.raw.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`)}`;

  bindSwitches(root, data, store);
  const maps = new Map();
  const statusEls = new Map(data.scenarios.map((sc) => [sc.id, root.querySelector(`[data-status="${sc.id}"]`)]));
  const lastStatus = new Map();
  const tableEl = root.querySelector('[data-table]');
  const lanesEl = root.querySelector('[data-lanes]');
  let lanes = null;
  let mode = mapMode;
  let lastT = store.get().t;
  const timers = new Set();

  const ensureMap = (sc) => {
    if (maps.has(sc.id)) return maps.get(sc.id);
    const m = createMap(root.querySelector(`[data-map="${sc.id}"]`), sc, { compact: true, mode });
    m.update(lastT);
    maps.set(sc.id, m);
    return m;
  };

  /** Show the chosen variant of each route; returns the length of the longest of them. */
  function show(next) {
    selection = next;
    scenarios = chosen(data, selection);
    const shown = new Set(scenarios.map((s) => s.id));
    for (const el of root.querySelectorAll('[data-scn]')) el.hidden = !shown.has(el.dataset.scn);
    for (const sc of scenarios) ensureMap(sc);
    for (const b of root.querySelectorAll('[data-all] [data-variant]')) {
      b.setAttribute('aria-pressed', String(scenarios.every((s) => s.variant === b.dataset.variant)));
    }
    tableEl.innerHTML = table(scenarios);
    lanes = createLanes(lanesEl, scenarios, { axisHours: maxHours(), compact: true, onScrub: (t) => store.set({ t, playing: false }) });
    lanes.setTime(lastT);
    return maxHours();
  }
  const maxHours = () => Math.max(...scenarios.map((s) => s.hours));
  show(selection);

  // The variants that are hidden get their maps a moment later, one at a time, while nobody is waiting.
  const later = data.scenarios.filter((sc) => !scenarios.includes(sc));
  later.forEach((sc, i) => {
    const id = setTimeout(() => { timers.delete(id); ensureMap(sc); }, 400 + i * 150);
    timers.add(id);
  });

  return {
    get maxT() { return maxHours(); },
    setVariants: show,
    update(t) {
      lastT = t;
      for (const sc of scenarios) maps.get(sc.id).update(t);
      lanes.setTime(t);
      for (const sc of scenarios) {
        const html = statusHTML(sc, t);
        if (lastStatus.get(sc.id) === html) continue;
        lastStatus.set(sc.id, html);
        statusEls.get(sc.id).innerHTML = html;
      }
    },
    setMapMode(next) {
      mode = next;
      maps.forEach((m) => m.setFrame(next));
    },
    destroy() {
      timers.forEach(clearTimeout);
      maps.forEach((m) => m.destroy());
      root.replaceChildren();
    },
  };
}

function card(sc) {
  const { route, kpis: k } = sc;
  return `<article class="card scn" data-scn="${sc.id}" hidden>
    <header class="scn__head">
      <span class="num">${route.number}</span>
      <div class="scn__titles">
        <h2><a href="#/${route.number}">${esc(route.title)}</a></h2>
        <p>${esc(VARIANT_LABEL[sc.variant])}</p>
      </div>
      ${sc.raw.wine_plan ? '<span class="chip chip--tag">Vinbonus i Béziers</span>' : ''}
    </header>
    <p class="scn__summary">${esc(sc.raw.summary)}</p>
    <div class="scn__map" data-map="${sc.id}" role="img" aria-label="Karta över ${esc(route.title)}"></div>
    <div class="scn__status" data-status="${sc.id}"></div>
    <dl class="kpis">
      <div><dt>Resdagar</dt><dd>${k.days}</dd></div>
      <div><dt>A kör</dt><dd>${fmtInt(k.byParty.A.carKm)}<small> km</small></dd></div>
      <div><dt>Tillsammans</dt><dd>${fmtDec(k.sharedDays)}<small> dygn</small></dd></div>
    </dl>
    <footer class="scn__foot"><a class="btn btn--ghost" href="#/${route.number}">Utforska rutten ${icon('arrow', 14)}</a></footer>
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

function table(scenarios) {
  const max = (pick) => Math.max(...scenarios.map(pick));
  const maxDays = max((s) => s.kpis.days);
  const maxKm = max((s) => s.kpis.fleetKm);
  const maxHours = max((s) => s.kpis.driveHours);
  const rows = [
    ['Resdagar', (s) => `${s.kpis.days} <small>(${s.kpis.flex.min}–${s.kpis.flex.max})</small>${bar(s.kpis.days, maxDays)}`],
    ['Tillsammans', (s) => `${fmtDec(s.kpis.sharedDays)} dygn`],
    ['Längst på samma ort', stayCell],
    ['Så reser A', (s) => esc(modesText(s, 'A'))],
    ['Så reser B', (s) => esc(modesText(s, 'B'))],
    ['Fordon', (s) => s.raw.vehicles.map((v) => esc(vehicleLine(s, v))).join('<br>')],
    ['Bilkilometer', (s) => `${fmtInt(s.kpis.fleetKm)} km<small> mellan orter<br>${fmtRange(s.kpis.totalKmRange)} km inkl. lokalt</small>${bar(s.kpis.fleetKm, maxKm)}`],
    ['Körtid', (s) => `${fmtInt(s.kpis.driveHours)} h<small> utan långa stopp</small>${bar(s.kpis.driveHours, maxHours)}`],
    ['Längsta dag på rundan', roundDayCell],
    ['Längsta kördag totalt', longestDriveCell],
    ['Vinbonus i Béziers', wineCell],
    ['Fördelar och avvägningar', (s) => list(s.raw.tradeoffs)],
    ['Osäkerheter', (s) => list(s.raw.uncertainties)],
  ];
  return `<div class="table-scroll"><table class="cmp" style="--cols:${scenarios.length}">
    <thead><tr><td></td>${scenarios.map((s) => `<th scope="col"><a href="#/${s.number}"><span class="num">${s.number}</span>${esc(s.route.title)}</a><small>${esc(VARIANT_LABEL[s.variant])}</small></th>`).join('')}</tr></thead>
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

/** Whether the route includes buying wine in Béziers, and how many nights are spent in the wine area. */
function wineCell(s) {
  const w = s.raw.wine_plan;
  if (!w) return 'Nej';
  return `Ja, ${plural(s.kpis.wineNights, 'natt', 'nätter')}<small><br>inköp dag ${w.purchase_day} · ${esc(WINE_TRANSPORT[w.transport_method])}</small>`;
}

/** The longest day of the round trip itself (both couples in the car), flagged when it is well over 40 mil. */
function roundDayCell(s) {
  const l = s.kpis.longestRound;
  const over = isLongRoundDay(l.distance_km);
  return `<span class="${over ? 'over' : ''}">${fmtInt(l.distance_km)} km · ${fmtDec(l.driving_hours)} h</span><small><br>${esc(legTitle(s, l))}, dag ${l.departure_day}${over ? `<br>mer än ${ROUND_LIMIT_KM / 10} mil` : ''}</small>`;
}
