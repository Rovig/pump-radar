import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalize, rankCommunes, suggestCommunes } from '../app/suggestCommunes.mjs';
import { toCommune } from '../adapters/geoApiCommunes.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/communes-iss.json', import.meta.url), 'utf8'));
const communes = fixture.map(toCommune);

test('normalize ignore casse, accents, tirets et apostrophes', () => {
  assert.equal(normalize("Saint-Étienne"), 'saint etienne');
  assert.equal(normalize("  L'Haÿ-les-Roses "), 'l hay les roses');
});

test('rankCommunes : « iss » → Issy-les-Moulineaux en premier malgré l’ordre de l’API', () => {
  assert.equal(communes[0].name, 'Issou'); // ordre brut de l'API
  assert.equal(rankCommunes('iss', communes)[0].name, 'Issy-les-Moulineaux');
});

test('rankCommunes : préfixes avant les autres, limite respectée', () => {
  const c = (name, population) => ({ name, population });
  const ranked = rankCommunes('saint e', [c('Erny-Saint-Julien', 9e6), c('Saint-Éman', 94), c('Saint-Étienne', 173136)]);
  assert.deepEqual(ranked.map((x) => x.name), ['Saint-Étienne', 'Saint-Éman', 'Erny-Saint-Julien']);
  assert.equal(rankCommunes('iss', communes, 2).length, 2);
});

test('suggestCommunes : moins de 2 lettres → aucun appel', async () => {
  const fail = { suggest: async () => assert.fail('appel inattendu') };
  assert.deepEqual(await suggestCommunes('é', { communes: fail }), { query: 'é', suggestions: [] });
});

test('suggestCommunes : erreur renvoyée, jamais levée', async () => {
  const ko = { suggest: async () => { throw new Error('API communes : HTTP 503'); } };
  assert.deepEqual(await suggestCommunes('iss', { communes: ko }), { query: 'iss', error: 'API communes : HTTP 503' });
});
