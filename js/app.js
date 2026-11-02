// Entry point: load the data, draw tabs and controls, and switch between the compare view
// and one alternative's detail view. The URL hash holds the view and the time: #/2?t=312.

import { mountCompare } from './compare.js';
import { loadData } from './data.js';
import { mountDetail } from './detail.js';
import { clamp, esc } from './format.js';
import { createStore } from './store.js';
import { hideTip } from './tooltip.js';
import { createTransport } from './transport.js';

const DATA_URL = 'data/frankrike-2027.json';
const MAP_MODE = { compare: 'france', detail: 'all' };

const viewEl = document.querySelector('#view');
const tabsEl = document.querySelector('#tabs');
const store = createStore({ t: 0, maxT: 0, playing: false, speed: 24, mapMode: MAP_MODE.compare });

function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const t = new URLSearchParams(query).get('t');
  return { name: path || 'jamfor', t: t === null || t === '' ? null : Number(t) };
}

function renderTabs(data) {
  tabsEl.innerHTML = [
    '<a class="tab" href="#/jamfor" data-name="jamfor">Jämför</a>',
    ...data.scenarios.map((s) => `<a class="tab" href="#/${s.number}" data-name="${s.number}"><span class="num">${s.number}</span>${esc(s.title)}</a>`),
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
    const sc = data.scenarios.find((s) => String(s.number) === name);
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
    document.title = sc ? `Alternativ ${sc.number}: ${sc.title} · Frankrike 2027` : 'Frankrike 2027 · resealternativ till Béziers';
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // Keep the time in the address bar (without adding history entries) so a moment can be shared.
  let hashTimer = 0;
  store.subscribe((s, patch) => {
    if (!('t' in patch)) return;
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => history.replaceState(null, '', `#/${current}?t=${Math.round(s.t * 4) / 4}`), 200);
  });

  addEventListener('hashchange', route);
  route();
}

main();
