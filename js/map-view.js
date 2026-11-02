// One Leaflet map for one scenario: schematic routes that fill in as time passes,
// places, key events, and a marker for each couple. Leaflet is loaded as the global `L`.

import { stateAt } from './data.js';
import { clamp, esc } from './format.js';
import { partial } from './geo.js';
import { icon } from './icons.js';
import { EVENT_ICON, eventTip, placeTip, routeTip } from './text.js';

// OpenStreetMap's own tiles (fine for light use, see their tile usage policy). The map is toned
// down, and darkened in dark mode, with CSS filters on .leaflet-tile-pane rather than a second tile set.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// One shared frame for the France view, so the alternatives can be compared at the same scale.
const FRANCE = [[42.5, -3.6], [49.9, 9.2]];
const EVENT_ORDER = ['wine_pickup', 'meet', 'split', 'vehicle_pickup', 'vehicle_return'];
const TOGETHER_DEG = 0.02; // closer than ~2 km: draw the two couple markers side by side

const whoIcon = (id, pair) =>
  L.divIcon({
    className: 'who-wrap',
    html: `<span class="who who--${id}">${id}</span>`,
    iconSize: [22, 22],
    iconAnchor: pair ? (id === 'A' ? [23, 11] : [-1, 11]) : [11, 11],
  });

/** mode: 'france' (common frame) or 'all' (the whole route, Sweden included). */
export function createMap(el, scn, { compact = false, mode = 'france' } = {}) {
  const map = L.map(el, {
    zoomControl: !compact,
    scrollWheelZoom: !compact,
    dragging: !(compact && L.Browser.mobile),
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    attributionControl: false,
  });
  L.control.attribution({ prefix: false }).addTo(map);
  if (!compact) L.control.scale({ imperial: false }).addTo(map);

  // Give the map a view before adding any layer. On a map that isn't loaded yet layers are queued,
  // and a group's layers can then run before the renderer they share is ready.
  map.setView(L.latLngBounds(FRANCE).getCenter(), 5);
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);

  // Routes: a faint line for the whole leg and a strong one that grows with time. All faint lines
  // go in first so a strong line is never covered by another leg's faint one.
  const baseGroup = L.layerGroup().addTo(map);
  const doneGroup = L.layerGroup().addTo(map);
  const routes = scn.routes.map((r) => {
    const kinds = r.kind === 'parallel' ? ['parallel-A', 'parallel-B'] : [r.kind];
    const line = (state, kind, path) => L.polyline(path, { className: `route route--${state} route--${kind} route--${r.mode}`, interactive: false });
    kinds.forEach((k) => line('base', k, r.path).addTo(baseGroup));
    return { r, done: kinds.map((k) => line('done', k, []).addTo(doneGroup)), f: -1 };
  });
  if (!compact) {
    // Wide invisible lines make the thin dashed routes easy to hover.
    const hits = L.layerGroup().addTo(map);
    for (const r of scn.routes) {
      L.polyline(r.path, { weight: 16, opacity: 0, className: 'route-hit' })
        .bindTooltip(routeTip(scn, r), { sticky: true, className: 'tip-leaf' })
        .addTo(hits);
    }
  }

  // Places: stays are sized by nights and tinted by who stays there; via-only anchors are small dots.
  const labelled = new Set(['beziers', ...Object.values(scn.raw.party_initial_location_ids), ...scn.raw.events.filter((e) => e.kind === 'meet' || e.kind === 'split').map((e) => e.location_id)]);
  const tags = [];
  for (const place of scn.places.values()) {
    const { loc } = place;
    const tone = place.id === 'beziers' ? 'wine' : place.parties.size > 1 ? 'both' : [...place.parties][0];
    const nights = Math.max(...Object.values(place.nights));
    const at = [loc.latitude, loc.longitude];
    L.circleMarker(at, { radius: 5 + Math.min(nights, 4) * 1.2, className: `place place--${tone}` })
      .bindTooltip(placeTip(place), { className: 'tip-leaf', direction: 'top', offset: [0, -4] })
      .addTo(map);
    if (!compact || labelled.has(place.id)) {
      const side = loc.longitude > 6.5 ? 'left' : 'right';
      const marker = L.marker(at, {
        icon: L.divIcon({ className: `place-tag place-tag--${side}`, html: `<span>${esc(loc.short)}</span>`, iconSize: [0, 0] }),
        interactive: false,
        keyboard: false,
      }).addTo(map);
      tags.push({ marker, at, side, width: loc.short.length * 6.4 + 4, rank: (labelled.has(place.id) ? 100 : 0) + nights });
    }
  }

  // Hide a label when it would overlap one that matters more; redone whenever the zoom changes.
  function declutter() {
    const taken = [];
    for (const tag of [...tags].sort((a, b) => b.rank - a.rank)) {
      const { x, y } = map.latLngToContainerPoint(tag.at);
      const x0 = tag.side === 'right' ? x + 12 : x - 12 - tag.width;
      const box = [x0, y - 8, x0 + tag.width, y + 8];
      const clash = taken.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
      tag.marker.getElement()?.classList.toggle('is-hidden', clash);
      if (!clash) taken.push(box);
    }
  }
  map.on('zoomend', declutter);
  if (!compact) {
    for (const id of scn.waypoints) {
      const loc = scn.locations.get(id);
      L.circleMarker([loc.latitude, loc.longitude], { radius: 3, className: 'waypoint' })
        .bindTooltip(loc.short, { className: 'tip-leaf', direction: 'top' })
        .addTo(map);
    }
  }

  // Events: one pin per place (a place can have several), dimmed until the event has happened.
  const byPlace = Map.groupBy(scn.raw.events, (e) => e.location_id);
  const pins = [...byPlace].map(([locId, evs]) => {
    const loc = scn.locations.get(locId);
    const lead = EVENT_ORDER.find((k) => evs.some((e) => e.kind === k));
    const html = `<span class="ev ev--${lead}">${icon(EVENT_ICON[lead], 13)}${evs.length > 1 ? `<b>${evs.length}</b>` : ''}</span>`;
    const marker = L.marker([loc.latitude, loc.longitude], {
      icon: L.divIcon({ className: 'ev-wrap', html, iconSize: [24, 24], iconAnchor: [12, 36] }),
      keyboard: false,
      zIndexOffset: 500,
    })
      .bindTooltip(evs.map((e) => `<div class="tip-item">${eventTip(scn, e)}</div>`).join(''), { className: 'tip-leaf', direction: 'top', offset: [0, -30] })
      .addTo(map);
    return { marker, first: Math.min(...evs.map((e) => e.at_hour)) };
  });

  // The couples.
  const who = Object.fromEntries(
    ['A', 'B'].map((id) => [id, L.marker([0, 0], { icon: whoIcon(id, false), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map)]),
  );
  let paired = null;

  const bounds = (m) => (m === 'all' ? L.latLngBounds(scn.routes.flatMap((r) => r.path)) : L.latLngBounds(FRANCE));
  const fit = () => {
    if (!el.clientWidth || !el.clientHeight) return;
    map.invalidateSize({ animate: false });
    map.fitBounds(bounds(mode), { padding: [18, 18], animate: false });
    declutter();
  };

  const resizer = new ResizeObserver(fit);
  resizer.observe(el);
  fit();

  function update(t) {
    const tt = clamp(t, 0, scn.hours);
    for (const item of routes) {
      const f = clamp((tt - item.r.start) / (item.r.end - item.r.start), 0, 1);
      if (f === item.f) continue;
      item.f = f;
      const part = f > 0 ? partial(item.r.path, item.r.cum, f) : [];
      for (const line of item.done) line.setLatLngs(part);
    }
    const [a, b] = ['A', 'B'].map((id) => stateAt(scn, id, tt).latlng);
    const pair = Math.abs(a[0] - b[0]) < TOGETHER_DEG && Math.abs(a[1] - b[1]) < TOGETHER_DEG;
    if (pair !== paired) {
      paired = pair;
      who.A.setIcon(whoIcon('A', pair));
      who.B.setIcon(whoIcon('B', pair));
    }
    who.A.setLatLng(a);
    who.B.setLatLng(b);
    for (const pin of pins) pin.marker.getElement()?.classList.toggle('is-past', tt >= pin.first);
  }

  return {
    update,
    setFrame(next) {
      mode = next;
      fit();
    },
    destroy() {
      resizer.disconnect();
      map.remove();
    },
  };
}
