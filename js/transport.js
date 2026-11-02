// The control strip: play/pause, day steps, a time slider, playback speed and map framing.

import { clamp, fmtMoment } from './format.js';
import { icon } from './icons.js';

const SPEEDS = [[6, '¼ dag/s'], [12, '½ dag/s'], [24, '1 dag/s'], [48, '2 dagar/s'], [96, '4 dagar/s']];
const MAP_MODES = [['france', 'Frankrike'], ['all', 'Hela rutten']];
const options = (list) => list.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');

export function createTransport(root, store) {
  root.innerHTML = `
    <div class="transport__buttons">
      <button type="button" class="btn btn--icon" data-act="back" aria-label="Föregående dag" title="Föregående dag (Skift + ←)">${icon('left', 18)}</button>
      <button type="button" class="btn btn--play" data-act="play"></button>
      <button type="button" class="btn btn--icon" data-act="forward" aria-label="Nästa dag" title="Nästa dag (Skift + →)">${icon('right', 18)}</button>
    </div>
    <input class="transport__range" type="range" min="0" max="0" step="0.5" aria-label="Tid på resan">
    <output class="transport__time"></output>
    <label class="field">Hastighet<select data-field="speed">${options(SPEEDS)}</select></label>
    <label class="field">Karta<select data-field="mapMode">${options(MAP_MODES)}</select></label>`;

  const range = root.querySelector('.transport__range');
  const readout = root.querySelector('.transport__time');
  const playBtn = root.querySelector('[data-act="play"]');
  const fields = Object.fromEntries([...root.querySelectorAll('[data-field]')].map((el) => [el.dataset.field, el]));

  const step = (days) => store.set({ t: clamp(store.get().t + days * 24, 0, store.get().maxT), playing: false });
  const toggle = () => store.set({ playing: !store.get().playing });

  range.addEventListener('input', () => store.set({ t: Number(range.value), playing: false }));
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'play') toggle();
    else if (act) step(act === 'back' ? -1 : 1);
  });
  fields.speed.addEventListener('change', () => store.set({ speed: Number(fields.speed.value) }));
  fields.mapMode.addEventListener('change', () => store.set({ mapMode: fields.mapMode.value }));

  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea, button, a, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ') toggle();
    else if (e.shiftKey && e.key === 'ArrowLeft') step(-1);
    else if (e.shiftKey && e.key === 'ArrowRight') step(1);
    else return;
    e.preventDefault();
  });

  // Playback: advance trip time by speed (hours per second), stop at the end.
  let frame = 0;
  let last = 0;
  const tick = (now) => {
    const { t, speed, maxT } = store.get();
    const next = t + (Math.min(now - last, 100) / 1000) * speed;
    last = now;
    if (next >= maxT) return store.set({ t: maxT, playing: false });
    store.set({ t: next });
    frame = requestAnimationFrame(tick);
  };

  function render(s) {
    if (Number(range.max) !== s.maxT) range.max = s.maxT;
    if (Number(range.value) !== s.t) range.value = s.t;
    range.style.setProperty('--p', `${s.maxT ? (s.t / s.maxT) * 100 : 0}%`);
    readout.textContent = fmtMoment(s.t, s.maxT);
    playBtn.innerHTML = icon(s.playing ? 'pause' : 'play', 18);
    playBtn.setAttribute('aria-label', s.playing ? 'Pausa' : 'Spela upp');
    playBtn.title = 'Spela upp / pausa (mellanslag)';
    fields.speed.value = String(s.speed);
    fields.mapMode.value = s.mapMode;
  }

  store.subscribe((s, patch) => {
    if ('playing' in patch) {
      cancelAnimationFrame(frame);
      if (s.playing) {
        if (s.t >= s.maxT) store.set({ t: 0 });
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }
    render(s);
  });
  render(store.get());
}
