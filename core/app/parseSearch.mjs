import { MIN_ZOOM, MAX_ZOOM } from '../adapters/ignTiles.mjs';

/**
 * Saisie de la barre de recherche → surcharge de config.
 * 5 chiffres = code postal, 6 à 9 chiffres = ID de station (ex. 75013025),
 * `@lat,lon` = stations autour d'un point (commune choisie dans les suggestions),
 * `@lat,lon,z` = stations visibles dans la vue de la carte (déplacée ou zoomée à la main).
 * @param {string} text
 * @returns {{ mode: 'postcode', postcode: string } | { mode: 'ids', ids: number[] }
 *         | { mode: 'nearby', location: { provider: 'fixed', lat: number, lon: number } }
 *         | { mode: 'area', location: { provider: 'fixed', lat: number, lon: number }, zoom: number }}
 */
export function parseSearch(text) {
  const q = String(text).trim();
  if (/^\d{5}$/.test(q)) return { mode: 'postcode', postcode: q };
  if (/^\d{6,9}$/.test(q)) return { mode: 'ids', ids: [Number(q)] };
  const at = q.match(/^@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:,(\d{1,2}))?$/);
  if (at) {
    const [lat, lon] = [Number(at[1]), Number(at[2])];
    const location = { provider: 'fixed', lat, lon };
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      if (at[3] === undefined) return { mode: 'nearby', location };
      const zoom = Number(at[3]);
      if (zoom >= MIN_ZOOM && zoom <= MAX_ZOOM) return { mode: 'area', location, zoom };
    }
  }
  throw new Error(`recherche invalide : « ${q} » (code postal à 5 chiffres, ID de station, @lat,lon ou @lat,lon,zoom)`);
}
