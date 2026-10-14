const TILE = 256;

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
 * @param {{ center: {lat:number, lon:number}, zoom: number, width: number, height: number,
 *           points: {id:number, lat:number, lon:number, level:string}[], tileUrl?: Function }} p
 */
export function layoutMap({ center, zoom, width, height, points, tileUrl = ignPlanTileUrl }) {
  const c = project(center.lat, center.lon, zoom);
  const originX = c.x - width / 2;
  const originY = c.y - height / 2;

  const tiles = [];
  for (let ty = Math.floor(originY / TILE); ty <= Math.floor((originY + height - 1) / TILE); ty++) {
    for (let tx = Math.floor(originX / TILE); tx <= Math.floor((originX + width - 1) / TILE); tx++) {
      tiles.push({
        url: tileUrl(zoom, tx, ty),
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
    .filter((m) => m.left >= 0 && m.left <= width && m.top >= 0 && m.top <= height);

  return { zoom, width, height, tiles, markers };
}
