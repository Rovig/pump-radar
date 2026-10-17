import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { geoApiCommunes } from '../adapters/geoApiCommunes.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/communes-iss.json', import.meta.url), 'utf8'));

test('suggest : requête et mapping GeoJSON [lon, lat] → lat/lon', async () => {
  let url;
  const api = geoApiCommunes({ fetchFn: async (u) => { url = new URL(u); return { ok: true, json: async () => fixture }; } });
  const issy = (await api.suggest('iss', 15)).find((c) => c.insee === '92040');
  assert.equal(url.searchParams.get('nom'), 'iss');
  assert.equal(url.searchParams.get('limit'), '15');
  assert.deepEqual(issy, {
    name: 'Issy-les-Moulineaux', insee: '92040', postcodes: ['92130'], dept: '92',
    lat: 48.824, lon: 2.2628, population: issy.population,
  });
});

test('suggest : HTTP en erreur → rejet', async () => {
  const api = geoApiCommunes({ fetchFn: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(api.suggest('iss', 15), /HTTP 503/);
});
