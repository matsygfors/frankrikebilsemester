// Stamps a version into index.html so that browsers never mix old and new files.
// GitHub Pages lets browsers keep every file for ten minutes; after an update some modules can then be
// old and some new, and the page stops at "Läser in underlaget". The version is a hash of the files
// themselves; an import map gives every module its own ?v=, and so do the style sheet and the data file.
// version.json holds the same version; index.html checks it without the cache and loads the new page if it is older
// than the file on the server, so nobody is stuck with a cached page.
// Run `npm run stamp` after changing anything in js/, css/ or data/ (npm test checks that you did).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const modules = () => readdirSync(new URL('js/', root)).filter((f) => f.endsWith('.js')).sort().map((f) => `js/${f}`);

export function versionOf() {
  const hash = createHash('sha1');
  for (const file of [...modules(), 'css/style.css', 'data/frankrike-2027.json', 'data/hotels.json', 'data/places.json', 'data/superchargers.json'].filter((f) => existsSync(new URL(f, root)))) hash.update(file).update(readFileSync(new URL(file, root)));
  return hash.digest('hex').slice(0, 8);
}

const importMap = (v) =>
  `<script type="importmap">\n${JSON.stringify({ imports: Object.fromEntries(modules().map((m) => [`./${m}`, `./${m}?v=${v}`])) }, null, 2)}\n  </script>`;

export const stamped = (html, v) =>
  html
    .replace(/<meta name="app-version" content="[^"]*">/, `<meta name="app-version" content="${v}">`)
    .replace(/<script type="importmap">[\s\S]*?<\/script>/, importMap(v))
    .replace(/href="css\/style\.css[^"]*"/, `href="css/style.css?v=${v}"`)
    .replace(/src="js\/app\.js[^"]*"/, `src="js/app.js?v=${v}"`);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = new URL('index.html', root);
  writeFileSync(file, stamped(readFileSync(file, 'utf8'), versionOf()));
  writeFileSync(new URL('version.json', root), JSON.stringify({ version: versionOf() }) + '\n');
  console.log(`index.html stämplad med version ${versionOf()}`);
}
