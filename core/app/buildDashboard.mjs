import { trackedFuels, levelOf } from '../domain/availability.mjs';
import { layoutMap, fitZoom } from '../adapters/ignTiles.mjs';

const mid = (xs) => (Math.min(...xs) + Math.max(...xs)) / 2;

/** Centre de l'emprise des stations (fallback si aucune). */
function centerOf(stations, fallback) {
  if (stations.length === 0) return fallback;
  return { lat: mid(stations.map((s) => s.lat)), lon: mid(stations.map((s) => s.lon)) };
}

const located = (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon);

const ageMinutes = (iso, now) => (iso ? Math.round((now - Date.parse(iso)) / 60_000) : null);

/**
 * Use case : config + ports → ViewModel prêt à afficher.
 * @param {object} config
 * @param {{ stations: { nearby: Function, byIds: Function, byPostcode: Function },
 *           location: { current: () => Promise<{lat:number, lon:number}> },
 *           now?: () => number }} deps
 */
export async function buildDashboard(config, { stations, location, now = Date.now }) {
  const byIds = config.mode === 'ids';
  const byPostcode = config.mode === 'postcode';
  const position = await location.current();
  let found;
  let total = null; // connu seulement pour une recherche par CP (peut dépasser ce qui est affiché)
  if (byIds) found = await stations.byIds(config.ids);
  else if (byPostcode) ({ stations: found, total } = await stations.byPostcode(config.postcode, config.searchLimit ?? config.limit));
  else found = await stations.nearby(position, config.radiusKm, config.limit);

  const t = now();
  const rows = found.map((s) => {
    const fuels = trackedFuels(s, config.fuels);
    return {
      id: s.id,
      label: `${s.address}, ${s.city}`,
      lat: s.lat,
      lon: s.lon,
      distanceKm: s.distanceM == null ? null : Math.round(s.distanceM / 100) / 10,
      level: levelOf(fuels),
      fuels: fuels.map((f) => ({ fuel: f.fuel, state: f.state, price: f.price, ageMin: ageMinutes(f.updatedAt, t) })),
    };
  });

  // Une station sans coordonnées reste dans la liste mais pas sur la carte (sinon centre/zoom NaN).
  const onMap = rows.filter(located);
  const center = byIds || byPostcode ? centerOf(onMap, position) : position;
  const foundIds = new Set(found.map((s) => s.id));

  const { width, height, zoom: maxZoom } = config.map;
  const zoom = fitZoom({ center, points: onMap, width, height, maxZoom });

  return {
    generatedAt: new Date(t).toISOString(),
    center,
    map: layoutMap({ center, zoom, width, height, points: onMap }),
    stations: rows.map(({ lat, lon, ...row }) => row),
    missingIds: byIds ? config.ids.filter((id) => !foundIds.has(id)) : [],
    total,
    error: null,
  };
}
