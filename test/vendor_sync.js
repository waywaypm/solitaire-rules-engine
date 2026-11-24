/* Fails when docs/vendor/*.js drifts from src/*.js.
 *
 * The demo copies the engines so GitHub Pages can serve them (Pages has no access to ../src).
 * Copies rot. This asserts the bytes match, so the demo can never show different rules from
 * the ones the tests prove.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const pairs = ['cards.js', 'klondike.js'];
let bad = 0;
for (const name of pairs) {
  const a = fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');
  const b = fs.readFileSync(path.join(__dirname, '..', 'docs', 'vendor', name), 'utf8');
  if (a !== b) {
    console.error(`  ✗ ${name}: docs/vendor copy differs from src/`);
    bad += 1;
  } else {
    console.log(`  ok   ${name} in sync`);
  }
}
if (bad) {
  console.error('\nRun: cp src/cards.js src/klondike.js docs/vendor/');
  process.exit(1);
}
console.log('\nvendor copies match the tested engines');
