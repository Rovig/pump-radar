/**
 * Saisie de la barre de recherche → surcharge de config.
 * 5 chiffres = code postal, 6 à 9 chiffres = ID de station (ex. 75013025).
 * @param {string} text
 * @returns {{ mode: 'postcode', postcode: string } | { mode: 'ids', ids: number[] }}
 */
export function parseSearch(text) {
  const q = String(text).trim();
  if (/^\d{5}$/.test(q)) return { mode: 'postcode', postcode: q };
  if (/^\d{6,9}$/.test(q)) return { mode: 'ids', ids: [Number(q)] };
  throw new Error(`recherche invalide : « ${q} » (code postal à 5 chiffres ou ID de station)`);
}
