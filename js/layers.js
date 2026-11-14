// Switches for what is drawn on the maps besides the routes: Superchargers, small hotels with a personal touch,
// cosy restaurants, points of interest and the mid-range example hotels.

import { esc } from './format.js';

export const LAYERS = [
  ['chargers', 'Superchargers'],
  ['hotell', 'Små hotell med personlig touch'],
  ['restauranger', 'Mysiga restauranger'],
  ['intresse', 'Intressepunkter'],
  ['examples', 'Exempel på hotell (mellanklass)'],
];
export const LAYER_KEYS = LAYERS.map(([key]) => key);
export const LAYER_DEFAULTS = { chargers: true, hotell: true, restauranger: true, intresse: true, examples: false };

export function layerBarHTML(state, keys = LAYER_KEYS) {
  const boxes = LAYERS.filter(([key]) => keys.includes(key))
    .map(([key, label]) => `<label class="check check--${key}"><input type="checkbox" data-layer="${key}"${state[key] ? ' checked' : ''}> ${esc(label)}</label>`)
    .join('');
  return `<div class="layerbar" role="group" aria-label="Visa på kartan">${boxes}</div>`;
}

export function bindLayerBar(root, store) {
  root.addEventListener('change', (e) => {
    const input = e.target.closest('[data-layer]');
    if (input) store.set({ [input.dataset.layer]: input.checked });
  });
}
