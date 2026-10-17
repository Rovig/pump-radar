const DEFAULT_BASE = 'https://geo.api.gouv.fr/communes';

/** Commune brute de geo.api.gouv.fr → Commune du domaine. `centre` est en GeoJSON : longitude d'abord. */
export function toCommune(c) {
  const [lon, lat] = c.centre?.coordinates ?? [null, null];
  return {
    name: c.nom,
    insee: c.code,
    postcodes: c.codesPostaux ?? [],
    dept: c.codeDepartement ?? '',
    lat,
    lon,
    population: c.population ?? 0,
  };
}

/**
 * CommuneSource adossée à l'API Découpage administratif (sans clé).
 * @param {{ baseUrl?: string, fetchFn?: typeof fetch, timeoutMs?: number }} [opts]
 */
export function geoApiCommunes({ baseUrl = DEFAULT_BASE, fetchFn = fetch, timeoutMs = 5_000 } = {}) {
  return {
    async suggest(text, limit) {
      const params = new URLSearchParams({
        nom: text,
        fields: 'nom,code,codesPostaux,codeDepartement,centre,population',
        boost: 'population',
        limit: String(limit),
      });
      const res = await fetchFn(`${baseUrl}?${params}`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`API communes : HTTP ${res.status}`);
      return (await res.json()).map(toCommune);
    },
  };
}
