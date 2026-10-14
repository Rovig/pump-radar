import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackedFuels, levelOf } from '../domain/availability.mjs';

const station = (states) => ({
  fuels: Object.entries(states).map(([fuel, state]) => ({ fuel, state, price: 1, updatedAt: null })),
});

test('trackedFuels garde les carburants suivis et masque les absents', () => {
  const s = station({ SP98: 'ok', E10: 'absent', Gazole: 'rupture' });
  assert.deepEqual(trackedFuels(s, ['SP98', 'E10']).map((f) => f.fuel), ['SP98']);
});

test('levelOf', () => {
  const f = (state) => ({ state });
  assert.equal(levelOf([f('ok'), f('ok')]), 'ok');
  assert.equal(levelOf([f('ok'), f('rupture')]), 'partial');
  assert.equal(levelOf([f('rupture')]), 'empty');
  assert.equal(levelOf([]), 'none');
});
