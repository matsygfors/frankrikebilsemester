import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { stamped, versionOf } from '../scripts/stamp.mjs';

test('index.html carries the version of the files (run `npm run stamp` after changing js, css or data)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(html, stamped(html, versionOf()));
  assert.ok(html.includes(`js/app.js?v=${versionOf()}`));
});
