import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { stamped, versionOf } from '../scripts/stamp.mjs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('index.html and version.json carry the version of the files (run `npm run stamp` after changing js, css or data)', () => {
  const html = read('index.html');
  assert.equal(html, stamped(html, versionOf()));
  assert.ok(html.includes(`js/app.js?v=${versionOf()}`));
  assert.ok(html.includes(`<meta name="app-version" content="${versionOf()}">`));
  assert.deepEqual(JSON.parse(read('version.json')), { version: versionOf() });
});

test('the page checks version.json without the cache and loads the newer page once', () => {
  const html = read('index.html');
  assert.ok(html.includes("fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })"));
  assert.ok(html.includes("url.searchParams.get('v') === current.version")); // no endless reloading
});
