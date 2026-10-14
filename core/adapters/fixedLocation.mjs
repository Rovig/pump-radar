/** LocationProvider renvoyant une position fixe (config). */
export function fixedLocation({ lat, lon }) {
  return { current: async () => ({ lat, lon }) };
}
