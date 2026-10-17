import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearch } from '../app/parseSearch.mjs';

test('5 chiffres = code postal, 6 à 9 chiffres = ID de station', () => {
  assert.deepEqual(parseSearch('75013'), { mode: 'postcode', postcode: '75013' });
  assert.deepEqual(parseSearch(' 75013025 '), { mode: 'ids', ids: [75013025] });
});

test('@lat,lon = stations autour d’un point', () => {
  assert.deepEqual(parseSearch('@48.824,2.2628'), { mode: 'nearby', location: { provider: 'fixed', lat: 48.824, lon: 2.2628 } });
  assert.deepEqual(parseSearch('@-21.1,55.5').location, { provider: 'fixed', lat: -21.1, lon: 55.5 });
});

test('toute autre saisie est refusée', () => {
  for (const q of ['', '7501', 'abc', '75013;rm', '1234567890', '@abc', '@95,2', '@48.8,2.3;ls', 'issy']) assert.throws(() => parseSearch(q), /recherche invalide/);
});
