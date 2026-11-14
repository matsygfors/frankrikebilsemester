// Entry point: load the data, draw tabs and controls, and switch between the compare view
// and one alternative's detail view. The URL hash holds the view and the time: #/2?t=312.

import { mountCompare } from './compare.js';
import { VARIANTS, loadData } from './data.js';
import { mountDetail } from './detail.js';
import { clamp, esc } from './format.js';
import { createStore } from './store.js';
import { hideTip } from './tooltip.js';
import { createTransport } from './transport.js';

const DATA_URL = 'data/frankrike-2027.json';
const MAP_MODE = { compare: 'france', detail: 'all' };

const viewEl = document.querySelector('#view');
const tabsEl = document.querySelector('#tabs');
const store = createStore({ t: 0, maxT: 0, playing: false, speed: 24, mapMode: MAP_MODE.compare, variants: {} });

// The chosen variant per route in the address: one letter per route, b = own car (bil), f = fly and rent (flyg).
const CODE = { own_car: 'b', fly_rent: 'f' };
const encodeVariants = (data, selection) => data.routes.map((r) => CODE[selection[r.id] ?? 'own_car']).join('');
const decodeVariants = (data, code) => Object.fromEntries(data.routes.map((r, i) => [r.id, VARIANTS.find((v) => CODE[v] === code[i]) ?? 'own_car']));

function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const t = params.get('t');
  return { name: path || 'jamfor', t: t === null || t === '' ? null : Number(t), v: params.get('v') };
}

function renderTabs(data) {
  tabsEl.innerHTML = [
    '<a class="tab" href="#/jamfor" data-name="jamfor">Jämför</a>',
    ...data.routes.map((r) => `<a class="tab" href="#/${r.number}" data-name="${r.number}"><span class="num">${r.number}</span>${esc(r.title)}</a>`),
  ].join('');
}

async function main() {
  let data;
  try {
    data = await loadData(DATA_URL);
  } catch (err) {
    viewEl.innerHTML = `<p class="error">Det gick inte att läsa underlaget. ${esc(err.message)}</p>`;
    return;
  }
  renderTabs(data);
  createTransport(document.querySelector('#transport'), store);

  let view = null;
  let unsubscribe = null;
  let current = 'jamfor';

  function route() {
    unsubscribe?.();
    view?.destroy();
    hideTip();
    const { name, t } = parseHash();
    const selection = store.get().variants;
    const picked = data.routes.find((r) => String(r.number) === name);
    const sc = picked && (picked.variants[selection[picked.id]] ?? picked.variants.own_car);
    current = sc ? name : 'jamfor';
    const mapMode = sc ? MAP_MODE.detail : MAP_MODE.compare;
    view = sc ? mountDetail(viewEl, { data, store, sc, mapMode }) : mountCompare(viewEl, { data, store, mapMode });

    store.set({ playing: false, maxT: view.maxT, mapMode, t: clamp(t ?? store.get().t, 0, view.maxT) });
    view.update(store.get().t);
    unsubscribe = store.subscribe((s, patch) => {
      if ('mapMode' in patch) view.setMapMode(s.mapMode);
      if ('t' in patch) view.update(s.t);
    });

    for (const a of tabsEl.querySelectorAll('.tab')) {
      if (a.dataset.name === current) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    // On narrow screens the tab strip scrolls sideways: keep the current tab in view.
    const active = tabsEl.querySelector('[aria-current]');
    tabsEl.scrollLeft = active.offsetLeft - (tabsEl.clientWidth - active.offsetWidth) / 2;
    document.title = sc ? `${sc.route.title} · Frankrike 2027` : 'Frankrike 2027 · roadtrips i Frankrike';
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // Keep the time in the address bar (without adding history entries) so a moment can be shared.
  let hashTimer = 0;
  store.subscribe((s, patch) => {
    if (!('t' in patch) && !('variants' in patch)) return;
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => history.replaceState(null, '', `#/${current}?t=${Math.round(s.t * 4) / 4}&v=${encodeVariants(data, s.variants)}`), 200);
  });
  // A new choice of variant draws the view again (the maps and timelines are built for one set of scenarios).
  let applyingHash = false;
  store.subscribe((s, patch) => {
    if (!('variants' in patch) || applyingHash) return;
    if (!view.setVariants) return route();
    // The first page shows the chosen variants of the routes it has already drawn: no redrawing.
    const maxT = view.setVariants(s.variants);
    store.set({ maxT, t: Math.min(s.t, maxT) });
  });
  // The address may carry the choice (v=); apply it before drawing, without drawing twice.
  function onHash() {
    const { v } = parseHash();
    if (v && v !== encodeVariants(data, store.get().variants)) {
      applyingHash = true;
      store.set({ variants: decodeVariants(data, v) });
      applyingHash = false;
    }
    route();
  }

  addEventListener('hashchange', onHash);
  onHash();
}

main();
