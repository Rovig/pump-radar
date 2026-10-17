import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { toStation, prixCarburantsApi, parisWallTimeToIso } from '../adapters/prixCarburantsApi.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/record.json', import.meta.url), 'utf8'));

test('toStation mappe un enregistrement réel', () => {
  const s = toStation(fixture.results[0]);
  assert.equal(s.id, 75012010);
  assert.equal(s.city, 'Paris');
  assert.equal(s.postcode, '75012');
  assert.deepEqual([s.lat, s.lon], [48.842, 2.373]);
  const byFuel = Object.fromEntries(s.fuels.map((f) => [f.fuel, f]));
  assert.equal(byFuel.SP98.state, 'ok');
  assert.equal(byFuel.SP98.price, 2.353);
  assert.equal(byFuel.E85.state, 'rupture');
  assert.equal(byFuel.GPLc.state, 'rupture');
  assert.equal(byFuel.SP95.state, 'absent');
});

test('nearby construit la requête géographique (lon avant lat)', async () => {
  let url;
  const api = prixCarburantsApi({
    fetchFn: async (u) => { url = new URL(u); return { ok: true, json: async () => fixture }; },
  });
  const res = await api.nearby({ lat: 48.8, lon: 2.3 }, 5, 8);
  assert.equal(res.length, 1);
  assert.equal(url.searchParams.get('where'), "within_distance(geom, geom'POINT(2.3 48.8)', 5km)");
  assert.equal(url.searchParams.get('order_by'), 'd');
});

test('byIds filtre par id et lève une erreur sur HTTP KO', async () => {
  let url;
  const ok = prixCarburantsApi({ fetchFn: async (u) => { url = new URL(u); return { ok: true, json: async () => fixture }; } });
  await ok.byIds([1, 2]);
  assert.equal(url.searchParams.get('where'), 'id in (1,2)');

  const ko = prixCarburantsApi({ fetchFn: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(ko.byIds([1]), /HTTP 503/);
});

test('parisWallTimeToIso corrige le faux +00:00 (été UTC+2, hiver UTC+1)', () => {
  assert.equal(parisWallTimeToIso('2026-10-14T07:00:00+00:00'), '2026-10-14T05:00:00.000Z');
  assert.equal(parisWallTimeToIso('2026-12-01T07:00:00+00:00'), '2026-12-01T06:00:00.000Z');
  assert.equal(parisWallTimeToIso(null), null);
});

test('byPostcode filtre par code postal et refuse un CP mal formé', async () => {
  let url;
  const api = prixCarburantsApi({ fetchFn: async (u) => { url = new URL(u); return { ok: true, json: async () => fixture }; } });
  const res = await api.byPostcode('75012', 8);
  assert.deepEqual([res.stations.length, res.total], [1, 2]);
  assert.equal(url.searchParams.get('where'), 'cp = "75012"');
  assert.equal(url.searchParams.get('limit'), '8');
  await assert.rejects(api.byPostcode('75"; x', 8), /code postal invalide/);
});

test('toStation : geom absent → lat/lon null', () => {
  const s = toStation({ ...fixture.results[0], geom: null });
  assert.deepEqual([s.lat, s.lon], [null, null]);
});
