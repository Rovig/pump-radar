/** @typedef {import('./station.mjs').Station} Station */
/** @typedef {import('./station.mjs').FuelStatus} FuelStatus */
/** @typedef {'ok'|'partial'|'empty'|'none'} Level */

/**
 * Carburants suivis réellement vendus par la station (les « absent » sont masqués).
 * @param {Station} station
 * @param {string[]} tracked
 * @returns {FuelStatus[]}
 */
export function trackedFuels(station, tracked) {
  return station.fuels.filter((f) => tracked.includes(f.fuel) && f.state !== 'absent');
}

/**
 * ok = tout est dispo, partial = au moins un en rupture, empty = rien de dispo,
 * none = ne vend aucun des carburants suivis (≠ rupture).
 * @param {FuelStatus[]} fuels
 * @returns {Level}
 */
export function levelOf(fuels) {
  if (fuels.length === 0) return 'none';
  const available = fuels.filter((f) => f.state === 'ok').length;
  if (available === 0) return 'empty';
  return available === fuels.length ? 'ok' : 'partial';
}
