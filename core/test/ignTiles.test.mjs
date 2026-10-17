import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, unproject, viewRadiusKm, layoutMap, fitZoom } from '../adapters/ignTiles.mjs';

test('project : origine (0,0) au centre du monde au zoom 0', () => {
  const p = project(0, 0, 0);
  assert.equal(p.x, 128);
  assert.ok(Math.abs(p.y - 128) < 1e-9);
});

test('project : Paris au zoom 14 tombe dans la tuile 8299/5636', () => {
  const p = project(48.8566, 2.3522, 14);
  assert.equal(Math.floor(p.x / 256), 8299);
  assert.equal(Math.floor(p.y / 256), 5636);
});

test('layoutMap : marqueur au centre, tuiles couvrant le cadre, hors cadre filtré', () => {
  const center = { lat: 48.8566, lon: 2.3522 };
  const m = layoutMap({
    center, zoom: 14, width: 360, height: 220,
    points: [{ id: 1, ...center, level: 'ok' }, { id: 2, lat: 43.3, lon: 5.4, level: 'ok' }],
  });
  assert.deepEqual(m.markers, [{ id: 1, level: 'ok', left: 180, top: 110 }]);
  for (const t of m.tiles) {
    assert.ok(t.left < 360 && t.left + 256 > 0 && t.top < 220 && t.top + 256 > 0);
  }
  assert.ok(m.tiles.every((t) => t.url.includes('TILEMATRIX=14')));
});

test('fitZoom : réduit le zoom jusqu’à cadrer tous les points', () => {
  const center = { lat: 48.8566, lon: 2.3522 };
  const near = [{ lat: 48.857, lon: 2.353 }];
  const far = [{ lat: 48.83, lon: 2.40 }];
  assert.equal(fitZoom({ center, points: near, width: 360, height: 220, maxZoom: 15 }), 15);
  const z = fitZoom({ center, points: far, width: 360, height: 220, maxZoom: 15 });
  assert.ok(z < 15);
  assert.equal(layoutMap({ center, zoom: z, width: 360, height: 220, points: far.map((p) => ({ ...p, id: 1, level: 'ok' })) }).markers.length, 1);
});

test('unproject inverse project', () => {
  const p = project(48.8566, 2.3522, 15);
  const back = unproject(p.x, p.y, 15);
  assert.ok(Math.abs(back.lat - 48.8566) < 1e-9 && Math.abs(back.lon - 2.3522) < 1e-9);
});

test('viewRadiusKm : demi-diagonale 360×220 à z15 sur Paris ≈ 0,66 km', () => {
  const r = viewRadiusKm({ center: { lat: 48.8566, lon: 2.3522 }, zoom: 15, width: 360, height: 220 });
  assert.ok(Math.abs(r - 0.663) < 0.005, `r = ${r}`);
});

test('layoutMap : margin ajoute une couronne de tuiles et garde les marqueurs proches du cadre', () => {
  const center = { lat: 48.8566, lon: 2.3522 };
  const base = { center, zoom: 14, width: 360, height: 220 };
  const out = { id: 2, lat: 48.8566, lon: 2.3522 + 0.02, level: 'ok' }; // ~370 px à droite : hors cadre
  const plain = layoutMap({ ...base, points: [out] });
  const wide = layoutMap({ ...base, points: [out], margin: 256 });
  assert.equal(plain.markers.length, 0);
  assert.equal(wide.markers.length, 1);
  assert.ok(wide.tiles.length > plain.tiles.length);
  for (const t of wide.tiles) assert.ok(t.left < 360 + 256 && t.left + 256 > -256 && t.top < 220 + 256 && t.top + 256 > -256);
});
