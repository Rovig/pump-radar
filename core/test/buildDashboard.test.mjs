import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboard } from '../app/buildDashboard.mjs';

const NOW = Date.parse('2026-10-14T10:00:00Z');
const st = (id, lat, lon, sp98) => ({
  id, address: `${id} rue`, city: 'Paris', lat, lon, distanceM: 1234,
  fuels: [{ fuel: 'SP98', state: sp98, price: 1.9, updatedAt: '2026-10-14T09:00:00Z' }],
});
const fakeStations = { nearby: async () => [st(1, 48.85, 2.35, 'ok')], byIds: async () => [st(1, 48.85, 2.35, 'rupture'), st(2, 48.87, 2.37, 'ok')],
  byPostcode: async (cp, limit) => ({ stations: [st(4, 48.83, 2.36, 'ok'), st(5, 48.82, 2.37, 'ok')].slice(0, limit), total: 3 }) };
const location = { current: async () => ({ lat: 48.85, lon: 2.35 }) };
const config = { radiusKm: 5, limit: 8, ids: [1, 2, 3], fuels: ['SP98'], map: { zoom: 13, width: 360, height: 220 } };

test('mode nearby : centré sur la position, niveau et âge calculés', async () => {
  const vm = await buildDashboard({ ...config, mode: 'nearby' }, { stations: fakeStations, location, now: () => NOW });
  assert.deepEqual(vm.center, { lat: 48.85, lon: 2.35 });
  assert.equal(vm.stations[0].level, 'ok');
  assert.equal(vm.stations[0].distanceKm, 1.2);
  assert.equal(vm.stations[0].fuels[0].ageMin, 60);
  assert.deepEqual([vm.stations[0].lat, vm.stations[0].lon], [48.85, 2.35]);
  assert.deepEqual(vm.missingIds, []);
  assert.equal(vm.total, null);
});

test('mode ids : centré sur l’emprise, IDs manquants signalés', async () => {
  const vm = await buildDashboard({ ...config, mode: 'ids' }, { stations: fakeStations, location, now: () => NOW });
  assert.deepEqual([vm.center.lat.toFixed(4), vm.center.lon.toFixed(4)], ['48.8600', '2.3600']);
  assert.deepEqual(vm.stations.map((s) => s.level), ['empty', 'ok']);
  assert.deepEqual(vm.missingIds, [3]);
});

test('mode postcode : stations du code postal, centré sur leur emprise', async () => {
  const vm = await buildDashboard({ ...config, mode: 'postcode', postcode: '75013' }, { stations: fakeStations, location, now: () => NOW });
  assert.deepEqual(vm.stations.map((s) => s.id), [4, 5]);
  assert.equal(vm.total, 3); // une station du CP n'est pas affichée
  assert.deepEqual([vm.center.lat.toFixed(3), vm.center.lon.toFixed(3)], ['48.825', '2.365']);
  assert.deepEqual(vm.missingIds, []);
});

test('mode postcode : searchLimit prioritaire sur limit', async () => {
  const vm = await buildDashboard({ ...config, mode: 'postcode', postcode: '75013', limit: 8, searchLimit: 1 }, { stations: fakeStations, location, now: () => NOW });
  assert.equal(vm.stations.length, 1);
});

test('station sans coordonnées : listée, absente de la carte, sans fausser centre ni zoom', async () => {
  const noGeom = { ...st(9, null, null, 'ok'), lat: null, lon: null };
  const stations = { ...fakeStations, byIds: async () => [st(1, 48.85, 2.35, 'ok'), noGeom] };
  const vm = await buildDashboard({ ...config, mode: 'ids', ids: [1, 9] }, { stations, location, now: () => NOW });
  assert.deepEqual(vm.stations.map((s) => s.id), [1, 9]);
  assert.deepEqual(vm.center, { lat: 48.85, lon: 2.35 });
  assert.equal(vm.map.zoom, 13);
  assert.deepEqual(vm.map, { zoom: 13, width: 360, height: 220 });
});

test('mode area : centre et zoom imposés, rayon = vue, searchLimit, pas de distance', async () => {
  let args;
  const stations = { ...fakeStations, nearby: async (...a) => { args = a; return [st(1, 48.9, 2.4, 'ok')]; } };
  const area = { ...config, searchLimit: 20, mode: 'area', zoom: 15, location: { provider: 'fixed', lat: 48.85, lon: 2.35 } };
  const vm = await buildDashboard(area, { stations, location, now: () => NOW });
  assert.deepEqual(vm.center, { lat: 48.85, lon: 2.35 });
  assert.equal(vm.map.zoom, 15); // pas de fitZoom, même si la station est hors cadre
  assert.ok(args[1] > 0.5 && args[1] < 1, `rayon ${args[1]}`);
  assert.equal(args[2], 20);
  assert.equal(vm.stations[0].distanceKm, null);
});

test('allFuels : tous les carburants vendus, suivis marqués, absents exclus', async () => {
  const s = { ...st(1, 48.85, 2.35, 'ok'), postcode: '75004', fuels: [
    { fuel: 'Gazole', state: 'rupture', price: null, updatedAt: null },
    { fuel: 'SP98', state: 'ok', price: 1.9, updatedAt: '2026-10-14T09:00:00Z' },
    { fuel: 'E85', state: 'absent', price: null, updatedAt: null },
  ] };
  const vm = await buildDashboard({ ...config, mode: 'nearby' }, { stations: { ...fakeStations, nearby: async () => [s] }, location, now: () => NOW });
  const row = vm.stations[0];
  assert.deepEqual(row.allFuels, [
    { fuel: 'Gazole', state: 'rupture', price: null, ageMin: null, tracked: false },
    { fuel: 'SP98', state: 'ok', price: 1.9, ageMin: 60, tracked: true },
  ]);
  assert.deepEqual([row.address, row.postcode, row.city], ['1 rue', '75004', 'Paris']);
});
