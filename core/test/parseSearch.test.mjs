import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearch } from '../app/parseSearch.mjs';

test('5 chiffres = code postal, 6 à 9 chiffres = ID de station', () => {
  assert.deepEqual(parseSearch('75013'), { mode: 'postcode', postcode: '75013' });
  assert.deepEqual(parseSearch(' 75013025 '), { mode: 'ids', ids: [75013025] });
});

test('toute autre saisie est refusée', () => {
  for (const q of ['', '7501', 'abc', '75013;rm', '1234567890']) assert.throws(() => parseSearch(q), /recherche invalide/);
});
