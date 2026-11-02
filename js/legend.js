// Key to the colours and line styles used on the maps and timelines.

const sample = (...paths) =>
  `<svg class="legend__line" width="36" height="10" viewBox="0 0 36 10" aria-hidden="true">${paths.map((cls) => `<path d="M2 5H34" class="route route--done ${cls}"/>`).join('')}</svg>`;

export function legendHTML() {
  return `<ul class="legend" aria-label="Teckenförklaring">
    <li><span class="dot dot--A">A</span>Par A (från Stockholm)</li>
    <li><span class="dot dot--B">B</span>Par B (från Paris eller Nice)</li>
    <li>${sample('route--shared route--car')}Reser tillsammans</li>
    <li>${sample('route--parallel-A route--car', 'route--parallel-B route--car')}Tillsammans i två bilar</li>
    <li>${sample('route--A route--car')}Bil</li>
    <li>${sample('route--A route--train')}Tåg</li>
    <li>${sample('route--A route--flight')}Flyg</li>
    <li class="legend__note">Linjerna är schematiska: raka streck mellan orter, inte körbara vägar.</li>
  </ul>`;
}
