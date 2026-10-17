import { FUELS } from '../domain/station.mjs';

const DEFAULT_BASE =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/' +
  'prix-des-carburants-en-france-flux-instantane-v2/records';

const FIELDS = [
  'id', 'adresse', 'ville', 'cp', 'geom',
  'carburants_disponibles', 'carburants_rupture_temporaire',
  ...FUELS.flatMap((f) => [`${f.toLowerCase()}_prix`, `${f.toLowerCase()}_maj`]),
];

const point = ({ lat, lon }) => `geom'POINT(${lon} ${lat})'`; // WKT : longitude d'abord

/**
 * Les `<fuel>_maj` sont en heure de Paris mais étiquetées `+00:00` par l'API.
 * On réinterprète l'heure murale en Europe/Paris et on renvoie un ISO UTC correct.
 */
export function parisWallTimeToIso(value) {
  if (!value) return null;
  const naiveUtc = Date.parse(`${value.slice(0, 19)}Z`);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'longOffset' })
    .formatToParts(naiveUtc)
    .find((p) => p.type === 'timeZoneName').value; // ex. "GMT+02:00"
  const [, sign, hh, mm] = offset.match(/([+-])(\d{2}):(\d{2})/) ?? [, '+', '00', '00'];
  const offsetMs = (sign === '-' ? -1 : 1) * (Number(hh) * 60 + Number(mm)) * 60_000;
  return new Date(naiveUtc - offsetMs).toISOString();
}

const asList = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(';') : []);

/** Enregistrement brut de l'API → Station du domaine. */
export function toStation(r) {
  const available = asList(r.carburants_disponibles);
  const rupture = asList(r.carburants_rupture_temporaire);
  return {
    id: r.id,
    address: r.adresse ?? '',
    city: r.ville ?? '',
    postcode: r.cp ?? '',
    lat: r.geom?.lat ?? null,
    lon: r.geom?.lon ?? null,
    distanceM: r.d ?? null,
    fuels: FUELS.map((fuel) => {
      const key = fuel.toLowerCase();
      const state = available.includes(fuel) ? 'ok' : rupture.includes(fuel) ? 'rupture' : 'absent';
      return { fuel, state, price: r[`${key}_prix`] ?? null, updatedAt: parisWallTimeToIso(r[`${key}_maj`]) };
    }),
  };
}

/**
 * StationSource adossée à l'API Opendatasoft de data.economie.gouv.fr.
 * @param {{ baseUrl?: string, fetchFn?: typeof fetch, timeoutMs?: number }} [opts]
 */
export function prixCarburantsApi({ baseUrl = DEFAULT_BASE, fetchFn = fetch, timeoutMs = 10_000 } = {}) {
  async function query(params) {
    const url = `${baseUrl}?${new URLSearchParams(params)}`;
    const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`API carburants : HTTP ${res.status}`);
    const body = await res.json();
    return { stations: body.results.map(toStation), total: body.total_count };
  }

  const stationsOnly = (r) => r.stations;

  return {
    nearby(center, radiusKm, limit) {
      return query({
        select: [...FIELDS, `distance(geom, ${point(center)}) as d`].join(','),
        where: `within_distance(geom, ${point(center)}, ${radiusKm}km)`,
        order_by: 'd',
        limit: String(limit),
      }).then(stationsOnly);
    },
    byIds(ids) {
      if (ids.length === 0) return Promise.resolve([]);
      return query({
        select: FIELDS.join(','),
        where: `id in (${ids.map(Number).join(',')})`,
        limit: String(Math.min(ids.length, 100)),
      }).then(stationsOnly);
    },
    /** → { stations, total } : total = nombre de stations du CP, même au-delà de `limit`. */
    byPostcode(postcode, limit) {
      if (!/^\d{5}$/.test(postcode)) return Promise.reject(new Error(`code postal invalide : ${postcode}`));
      return query({
        select: FIELDS.join(','),
        where: `cp = "${postcode}"`,
        order_by: 'id',
        limit: String(limit),
      });
    },
  };
}
