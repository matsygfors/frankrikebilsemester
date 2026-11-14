// Entry point: load the data, draw tabs and controls, and switch between the compare view
// and one alternative's detail view. The URL hash holds the view and the time: #/2?t=312.

import { mountCompare } from './compare.js';
import { loadData } from './data.js';
import { mountDetail } from './detail.js';
import { clamp, esc } from './format.js';
import { LAYER_DEFAULTS, LAYER_KEYS } from './layers.js';
import { createStore } from './store.js';
import { hideTip } from './tooltip.js';
import { createTransport } from './transport.js';

// The data file gets the same ?v= as this module (see scripts/stamp.mjs), so it is never older than the code.
const DATA_URL = `data/frankrike-2027.json${new URL(import.meta.url).search}`;
const MAP_MODE = { compare: 'france', detail: 'all' };

const viewEl = document.querySelector('#view');
const tabsEl = document.querySelector('#tabs');
const store = createStore({ t: 0, maxT: 0, playing: false, speed: 24, mapMode: MAP_MODE.detail, variants: {}, ...LAYER_DEFAULTS });

function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const t = params.get('t');
  return { name: path, t: t === null || t === '' ? null : Number(t) };
}

function renderTabs(data) {
  // With one route there is nothing to compare: the page opens on the route itself.
  tabsEl.innerHTML = [
    data.routes.length > 1 ? '<a class="tab" href="#/jamfor" data-name="jamfor">Jämför</a>' : '',
    ...data.routes.map((r) => `<a class="tab" href="#/${r.number}" data-name="${r.number}"><span class="num">${r.number}</span>${esc(r.title)}</a>`),
  ].join('');
}

async function main() {
  let data;
  try {
    const version = new URL(import.meta.url).search;
    data = await loadData(DATA_URL, { chargers: `data/superchargers.json${version}`, hotels: `data/hotels.json${version}`, places: `data/places.json${version}` });
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
    const single = data.routes.length === 1;
    const { name: asked, t } = parseHash();
    const name = asked || (single ? '1' : 'jamfor');
    const selection = store.get().variants;
    const picked = data.routes.find((r) => String(r.number) === name) ?? (single && name !== 'jamfor' ? data.routes[0] : undefined);
    const sc = picked && (picked.variants[selection[picked.id]] ?? picked.variants.own_car);
    current = sc ? String(picked.number) : 'jamfor';
    const mapMode = sc ? MAP_MODE.detail : MAP_MODE.compare;
    view = sc ? mountDetail(viewEl, { data, store, sc, mapMode }) : mountCompare(viewEl, { data, store, mapMode });

    store.set({ playing: false, maxT: view.maxT, mapMode, t: clamp(t ?? store.get().t, 0, view.maxT) });
    view.update(store.get().t);
    unsubscribe = store.subscribe((s, patch) => {
      if ('mapMode' in patch) view.setMapMode(s.mapMode);
      if (LAYER_KEYS.some((key) => key in patch)) view.setLayers(s);
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
    if (!('t' in patch)) return;
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => history.replaceState(null, '', `#/${current}?t=${Math.round(s.t * 4) / 4}`), 200);
  });
  // A new choice of variant draws the view again (the maps and timelines are built for one set of scenarios).
  // The choice is not kept in the address: the page always opens with the own car from Sweden.
  store.subscribe((s, patch) => {
    if (!('variants' in patch)) return;
    if (!view.setVariants) return route();
    // The first page shows the chosen variants of the routes it has already drawn: no redrawing.
    const maxT = view.setVariants(s.variants);
    store.set({ maxT, t: Math.min(s.t, maxT) });
  });
  addEventListener('hashchange', route);
  route();
}

main();
