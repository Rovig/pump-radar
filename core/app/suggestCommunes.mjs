const FETCHED = 15; // l'API classe mal (« iss » → Issou avant Issy) : on en prend plus et on reclasse
const SHOWN = 6;

/** Minuscules, sans accents, tirets et apostrophes → espaces. */
export const normalize = (text) =>
  String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[-'’\s]+/g, ' ').trim();

/**
 * Noms commençant par la saisie d'abord (les plus peuplés en tête), puis le reste dans l'ordre de l'API.
 * @param {string} text
 * @param {{ name: string, population: number }[]} communes
 */
export function rankCommunes(text, communes, limit = SHOWN) {
  const q = normalize(text);
  const prefix = communes.filter((c) => normalize(c.name).startsWith(q)).sort((a, b) => b.population - a.population);
  const others = communes.filter((c) => !prefix.includes(c));
  return [...prefix, ...others].slice(0, limit);
}

/**
 * Use case : saisie → suggestions de communes, prêtes à afficher (erreur incluse, jamais levée).
 * @param {string} text
 * @param {{ communes: { suggest: (text: string, limit: number) => Promise<object[]> } }} deps
 */
export async function suggestCommunes(text, { communes }) {
  const query = String(text);
  try {
    const q = normalize(query);
    if (q.length < 2) return { query, suggestions: [] };
    return { query, suggestions: rankCommunes(q, await communes.suggest(q, FETCHED)) };
  } catch (err) {
    return { query, error: err.message };
  }
}
