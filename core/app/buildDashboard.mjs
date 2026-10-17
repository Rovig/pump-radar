import { trackedFuels, levelOf } from '../domain/availability.mjs';
import { fitZoom, viewRadiusKm } from '../adapters/ignTiles.mjs';

const mid = (xs) => (Math.min(...xs) + Math.max(...xs)) / 2;

/** Centre de l'emprise des stations (fallback si aucune). */
function centerOf(stations, fallback) {
  if (stations.length === 0) return fallback;
  return { lat: mid(stations.map((s) => s.lat)), lon: mid(stations.map((s) => s.lon)) };
}

const located = (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon);

const ageMinutes = (iso, now) => (iso ? Math.round((now - Date.parse(iso)) / 60_000) : null);

const fuelView = (f, now) => ({ fuel: f.fuel, state: f.state, price: f.price, ageMin: ageMinutes(f.updatedAt, now) });

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
  const byArea = config.mode === 'area'; // vue de la carte choisie à la main : centre et zoom imposés
  const position = await location.current();
  const { width, height, zoom: maxZoom } = config.map;
  const searchLimit = config.searchLimit ?? config.limit;
  let found;
  let total = null; // connu seulement pour une recherche par CP (peut dépasser ce qui est affiché)
  if (byIds) found = await stations.byIds(config.ids);
  else if (byPostcode) ({ stations: found, total } = await stations.byPostcode(config.postcode, searchLimit));
  else if (byArea) {
    const radiusKm = Math.max(0.5, viewRadiusKm({ center: position, zoom: config.zoom, width, height }));
    found = await stations.nearby(position, radiusKm, searchLimit);
  } else found = await stations.nearby(position, config.radiusKm, config.limit);

  const t = now();
  const rows = found.map((s) => {
    const fuels = trackedFuels(s, config.fuels);
    return {
      id: s.id,
      label: `${s.address}, ${s.city}`,
      address: s.address,
      postcode: s.postcode ?? '',
      city: s.city,
      lat: s.lat,
      lon: s.lon,
      // En mode area, la distance au centre de la vue ne veut rien dire.
      distanceKm: byArea || s.distanceM == null ? null : Math.round(s.distanceM / 100) / 10,
      level: levelOf(fuels),
      fuels: fuels.map((f) => fuelView(f, t)),
      // Bulle d'info : tous les carburants vendus, suivis ou non.
      allFuels: s.fuels.filter((f) => f.state !== 'absent').map((f) => ({ ...fuelView(f, t), tracked: config.fuels.includes(f.fuel) })),
    };
  });

  // Une station sans coordonnées reste dans la liste mais pas sur la carte (sinon centre/zoom NaN).
  const onMap = rows.filter(located);
  const center = byIds || byPostcode ? centerOf(onMap, position) : position;
  const foundIds = new Set(found.map((s) => s.id));
  const zoom = byArea ? config.zoom : fitZoom({ center, points: onMap, width, height, maxZoom });

  return {
    generatedAt: new Date(t).toISOString(),
    center,
    // Tuiles et marqueurs sont posés par le widget (layoutMap), pour pouvoir déplacer la carte sans node.
    map: { zoom, width, height },
    stations: rows,
    missingIds: byIds ? config.ids.filter((id) => !foundIds.has(id)) : [],
    total,
    error: null,
  };
}
