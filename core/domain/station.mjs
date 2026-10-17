/** @typedef {'Gazole'|'SP95'|'SP98'|'E10'|'E85'|'GPLc'} Fuel */

/**
 * @typedef {'ok'|'rupture'|'absent'} FuelState
 * ok      = en vente
 * rupture = rupture temporaire
 * absent  = jamais vendu / rupture définitive (masqué)
 */

/** @typedef {{ fuel: Fuel, state: FuelState, price: number|null, updatedAt: string|null }} FuelStatus */

/**
 * @typedef {{ id: number, address: string, city: string, postcode: string,
 *             lat: number|null, lon: number|null, distanceM: number|null,
 *             fuels: FuelStatus[] }} Station
 */

/** @type {readonly Fuel[]} */
export const FUELS = Object.freeze(['Gazole', 'SP95', 'SP98', 'E10', 'E85', 'GPLc']);
