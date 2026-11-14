// The switch on each route: A drives the own car from Sweden, or everyone flies and rents a car.
// Each button shows what the choice means for the trip, so the switch doubles as a comparison.

import { VARIANTS } from './data.js';
import { esc, fmtInt } from './format.js';
import { VARIANT_LABEL } from './text.js';

const describe = (sc) => `${sc.kpis.days} dagar · A kör ${fmtInt(sc.kpis.byParty.A.carKm)} km`;

export function switchHTML(route, active) {
  const buttons = VARIANTS.map((v) => {
    const sc = route.variants[v];
    return `<button type="button" data-route="${route.id}" data-variant="${v}" aria-pressed="${v === active}"><b>${esc(VARIANT_LABEL[v])}</b><small>${esc(describe(sc))}</small></button>`;
  });
  return `<div class="switch" role="group" aria-label="Så reser A">${buttons.join('')}</div>`;
}

/** The one switch on the first page: the same choice for every route, with what it means in days. */
export function allSwitchHTML(data, selection) {
  const buttons = VARIANTS.map((v) => {
    const on = data.routes.every((r) => (selection[r.id] ?? 'own_car') === v);
    const days = data.routes.map((r) => r.variants[v].kpis.days);
    const [lo, hi] = [Math.min(...days), Math.max(...days)];
    return `<button type="button" data-route="*" data-variant="${v}" aria-pressed="${on}"><b>${esc(VARIANT_LABEL[v])}</b><small>${lo === hi ? lo : `${lo}–${hi}`} dagar</small></button>`;
  });
  return `<div class="switch switch--all" role="group" aria-label="Så reser A, för alla rutter">${buttons.join('')}</div>`;
}

/** Clicks on any switch inside root change the chosen variants in the store. */
export function bindSwitches(root, data, store) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-variant]');
    if (!btn) return;
    const ids = btn.dataset.route === '*' ? data.routes.map((r) => r.id) : [btn.dataset.route];
    const variants = { ...store.get().variants };
    for (const id of ids) variants[id] = btn.dataset.variant;
    store.set({ variants });
  });
}
