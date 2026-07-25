import assert from 'node:assert/strict';
import test from 'node:test';

import { cargoStringLiteral, decodeCargoText } from './cargo-query.mjs';

test('Cargo literals preserve ordinary query values', () => {
  assert.equal(cargoStringLiteral('%Delirium Orb%'), "'%Delirium Orb%'");
});

test('Cargo literals escape every apostrophe and pre-existing backslash', () => {
  assert.equal(
    cargoStringLiteral("Maven's\\Chisel's"),
    "'Maven\\'s\\\\Chisel\\'s'",
  );
});

test('Cargo literals reject non-string configuration values', () => {
  assert.throws(() => cargoStringLiteral(null), {
    name: 'TypeError',
    message: 'Cargo string literal value must be a string',
  });
});

test('Cargo title text decodes numeric and named punctuation entities', () => {
  assert.equal(
    decodeCargoText('Maven&#039;s &amp; Diviner&#x27;s &quot;Chisel&quot;'),
    `Maven's & Diviner's "Chisel"`,
  );
});

test('Cargo title text leaves unknown and out-of-range entities intact', () => {
  assert.equal(decodeCargoText('A &unknown; B &#99999999;'), 'A &unknown; B &#99999999;');
});
