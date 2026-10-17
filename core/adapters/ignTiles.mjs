const TILE = 256;
const EARTH_M_PER_PX_Z0 = 156543.03392; // mètres par pixel à l'équateur, zoom 0

/** Bornes du zoom manuel (molette, +/−, recherche @lat,lon,z). */
export const MIN_ZOOM = 6;
export const MAX_ZOOM = 18;

/** TileUrl : Plan IGN v2 via le WMTS de la Géoplateforme (sans clé). */
export const ignPlanTileUrl = (z, x, y) =>
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM' +
  `&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&FORMAT=image/png`;

/** Projection Web Mercator : lat/lon → pixel global au zoom z. */
export function project(lat, lon, z) {
  const size = TILE * 2 ** z;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

/** Inverse de `project` : pixel global au zoom z → lat/lon. */
export function unproject(x, y, z) {
  const size = TILE * 2 ** z;
  const n = Math.PI - (2 * Math.PI * y) / size;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lon: (x / size) * 360 - 180 };
}

/** Demi-diagonale du cadre en km (rayon de recherche couvrant tout ce qui est visible). */
export function viewRadiusKm({ center, zoom, width, height }) {
  const mPerPx = (EARTH_M_PER_PX_Z0 * Math.cos((center.lat * Math.PI) / 180)) / 2 ** zoom;
  return (Math.hypot(width, height) / 2) * mPerPx / 1000;
}

/**
 * Plus grand zoom ≤ maxZoom où tous les points tiennent dans le cadre (avec une marge).
 * @param {{ center: {lat:number, lon:number}, points: {lat:number, lon:number}[],
 *           width: number, height: number, maxZoom: number, margin?: number }} p
 */
export function fitZoom({ center, points, width, height, maxZoom, margin = 16 }) {
  for (let z = maxZoom; z > 0; z--) {
    const c = project(center.lat, center.lon, z);
    const fits = points.every((p) => {
      const px = project(p.lat, p.lon, z);
      return Math.abs(px.x - c.x) <= width / 2 - margin && Math.abs(px.y - c.y) <= height / 2 - margin;
    });
    if (fits) return z;
  }
  return 0;
}

/**
 * Calcule les tuiles et marqueurs d'un cadre width×height centré sur `center`.
 * `margin` (px) ajoute une couronne de tuiles et de marqueurs hors cadre, visible pendant un glissement.
 * @param {{ center: {lat:number, lon:number}, zoom: number, width: number, height: number,
 *           points: {id:number, lat:number, lon:number, level:string}[], margin?: number, tileUrl?: Function }} p
 */
export function layoutMap({ center, zoom, width, height, points, margin = 0, tileUrl = ignPlanTileUrl }) {
  const c = project(center.lat, center.lon, zoom);
  const originX = c.x - width / 2;
  const originY = c.y - height / 2;
  const maxTile = 2 ** zoom - 1;

  const tiles = [];
  for (let ty = Math.max(0, Math.floor((originY - margin) / TILE)); ty <= Math.min(maxTile, Math.floor((originY + height + margin - 1) / TILE)); ty++) {
    for (let tx = Math.floor((originX - margin) / TILE); tx <= Math.floor((originX + width + margin - 1) / TILE); tx++) {
      tiles.push({
        url: tileUrl(zoom, ((tx % (maxTile + 1)) + maxTile + 1) % (maxTile + 1), ty), // le monde se répète en longitude
        left: Math.round(tx * TILE - originX),
        top: Math.round(ty * TILE - originY),
      });
    }
  }

  const markers = points
    .map((p) => {
      const px = project(p.lat, p.lon, zoom);
      return { id: p.id, level: p.level, left: Math.round(px.x - originX), top: Math.round(px.y - originY) };
    })
    .filter((m) => m.left >= -margin && m.left <= width + margin && m.top >= -margin && m.top <= height + margin);

  return { zoom, width, height, tiles, markers };
}
