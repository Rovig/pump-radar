// Widget Übersicht : affichage seul. Toute la logique est dans core/ (testable en Node).
// bin/essence trouve node lui-même (Übersicht n'hérite pas du PATH de nvm).
import { run } from 'uebersicht';

const CMD = 'essence.widget/bin/essence';

// Recherche affichée : relancée à chaque rafraîchissement pour ne pas montrer de données figées.
let activeSearch = null;

const fetchSearch = (query, dispatch) =>
  run(`${CMD} ${query}`)
    .catch((err) => JSON.stringify({ generatedAt: new Date().toISOString(), error: String(err) }))
    .then((output) => dispatch({ type: 'SEARCH_DONE', query, output }));

// Übersicht appelle cette fonction à chaque cycle ; sa promesse devient l'événement UB/COMMAND_RAN.
export const command = (dispatch) => {
  if (activeSearch) fetchSearch(activeSearch, dispatch);
  return run(CMD);
};
export const refreshFrequency = 10 * 60 * 1000; // le flux officiel est mis à jour ~toutes les 10 min

export const className = `
  top: 20px;
  right: 20px;
  width: 360px;
  font: 12px -apple-system, BlinkMacSystemFont, sans-serif;
  color: #f2f2f2;
  background: rgba(28, 28, 30, 0.82);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
`;

const COLORS = { ok: '#30d158', partial: '#ff9f0a', empty: '#ff453a', none: '#8e8e93' };

const time = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const MapView = ({ map }) => (
  <div style={{ position: 'relative', width: map.width, height: map.height, overflow: 'hidden', background: '#3a3a3c' }}>
    {map.tiles.map((t) => (
      <img key={t.url} src={t.url} style={{ position: 'absolute', left: t.left, top: t.top, width: 256, height: 256 }} />
    ))}
    {map.markers.map((m) => (
      <div
        key={m.id}
        title={String(m.id)}
        style={{
          position: 'absolute', left: m.left - 7, top: m.top - 7, width: 14, height: 14,
          borderRadius: '50%', background: COLORS[m.level], border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
        }}
      />
    ))}
    <div style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 9, color: '#333' }}>© IGN</div>
  </div>
);

const fuelText = (f) => {
  if (f.state !== 'ok') return 'rupture';
  return f.price != null ? `${f.price.toFixed(3)} €` : 'prix n.c.';
};

const Fuel = ({ f }) => (
  <span style={{ marginRight: 10, opacity: f.ageMin > 24 * 60 ? 0.45 : 1 }}>
    <span style={{ color: f.state === 'ok' ? COLORS.ok : COLORS.empty }}>●</span> {f.fuel} {fuelText(f)}
  </span>
);

const Row = ({ s }) => (
  <div style={{ padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <span style={{ color: COLORS[s.level] }}>■</span> {s.label}
      </span>
      <span style={{ opacity: 0.6, whiteSpace: 'nowrap' }}>
        {s.distanceKm != null ? `${s.distanceKm} km · ` : ''}#{s.id}
      </span>
    </div>
    <div style={{ marginTop: 2 }}>
      {s.fuels.length ? s.fuels.map((f) => <Fuel key={f.fuel} f={f} />) : <span style={{ opacity: 0.6 }}>carburants suivis non vendus</span>}
    </div>
  </div>
);

// --- Menu burger + recherche (ID de station ou code postal) ---

export const initialState = { output: '', error: null, menu: false, searching: false, query: '', search: null };

export const updateState = (event, prev) => {
  switch (event.type) {
    case 'UB/COMMAND_RAN': return { ...prev, output: event.output, error: event.error };
    case 'MENU_TOGGLE': return { ...prev, menu: !prev.menu };
    case 'SEARCH_OPEN': return { ...prev, menu: false, searching: true };
    case 'SEARCH_CLOSE': return { ...prev, menu: false, searching: false, query: '', search: null };
    case 'QUERY': return { ...prev, query: event.query };
    case 'SEARCH_START':
      return { ...prev, search: { query: event.query, output: prev.search?.output ?? null, loading: true } };
    case 'SEARCH_DONE':
      // Ignore une réponse arrivée après une nouvelle recherche ou une fermeture.
      return prev.search?.query === event.query
        ? { ...prev, search: { ...prev.search, output: event.output, loading: false } }
        : prev;
    default: return prev;
  }
};

// Seuls les chiffres passent : la saisie est ensuite injectée dans une commande shell.
const digits = (text) => text.replace(/\D/g, '');

const submitSearch = (query, dispatch) => {
  if (!query) return;
  activeSearch = query;
  dispatch({ type: 'SEARCH_START', query });
  fetchSearch(query, dispatch);
};

const closeSearch = (dispatch) => {
  activeSearch = null;
  dispatch({ type: 'SEARCH_CLOSE' });
};

const button = {
  background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0,
};

const Menu = ({ state, dispatch }) => (
  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '4px 0' }}>
    <button style={{ ...button, display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px' }}
      onClick={() => dispatch({ type: 'SEARCH_OPEN' })}>
      🔍 Rechercher une station ou un code postal
    </button>
    {state.searching && (
      <button style={{ ...button, display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px' }}
        onClick={() => closeSearch(dispatch)}>
        📍 Revenir aux stations proches
      </button>
    )}
  </div>
);

const SearchBar = ({ state, dispatch }) => (
  <form
    style={{ display: 'flex', gap: 6, padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}
    onSubmit={(e) => { e.preventDefault(); submitSearch(state.query, dispatch); }}
  >
    <input
      autoFocus
      inputMode="numeric"
      placeholder="ID station (75013025) ou code postal (75013)"
      value={state.query}
      onChange={(e) => dispatch({ type: 'QUERY', query: digits(e.target.value).slice(0, 9) })}
      style={{
        flex: 1, font: 'inherit', color: 'inherit', background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 8px', outline: 'none',
      }}
    />
    <button type="submit" style={{ ...button, padding: '0 6px' }} title="Rechercher">OK</button>
    <button type="button" style={{ ...button, padding: '0 6px', opacity: 0.6 }} title="Fermer"
      onClick={() => closeSearch(dispatch)}>✕</button>
  </form>
);

const Header = ({ text, dispatch }) => (
  <div style={{ padding: '8px 12px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
    <span>
      <button style={{ ...button, marginRight: 8, fontSize: 14 }} title="Menu"
        onClick={() => dispatch({ type: 'MENU_TOGGLE' })}>☰</button>
      ⛽ Essence
    </span>
    <span style={{ fontWeight: 400, opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
  </div>
);

const searchLabel = (q) => (q.length === 5 ? `CP ${q}` : `ID ${q}`);

const parse = (output) => {
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
};

// Voile + spinner posé sur le contenu pendant l'appel API.
const Loader = ({ text }) => (
  <div style={{
    position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 10,
    background: 'rgba(28, 28, 30, 0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  }}>
    <style>{'@keyframes essence-spin { to { transform: rotate(360deg) } }'}</style>
    <div style={{
      width: 26, height: 26, borderRadius: '50%',
      border: '3px solid rgba(255,255,255,0.2)', borderTopColor: COLORS.ok,
      animation: 'essence-spin 0.8s linear infinite',
    }} />
    <span style={{ opacity: 0.8 }}>{text}</span>
  </div>
);

const Body = ({ vm }) => (
  <div>
    <MapView map={vm.map} />
    <div style={{ maxHeight: 380, overflowY: 'auto' }}>
      {vm.stations.map((s) => <Row key={s.id} s={s} />)}
    </div>
    {vm.total != null && vm.total > vm.stations.length && (
      <div style={{ padding: '6px 12px', opacity: 0.6, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {vm.stations.length} / {vm.total} stations affichées (searchLimit dans config.json)
      </div>
    )}
    {vm.missingIds.map((id) => (
      <div key={id} style={{ padding: '6px 12px', opacity: 0.6 }}>ID {id} introuvable</div>
    ))}
    {vm.stations.length === 0 && vm.missingIds.length === 0 && (
      <div style={{ padding: '6px 12px', opacity: 0.6 }}>Aucune station trouvée</div>
    )}
  </div>
);

export const render = (state, dispatch) => {
  const { search } = state;
  const prefix = search ? `${searchLabel(search.query)} · ` : '';
  const loading = search ? search.loading : !state.output && !state.error;
  // Pendant une recherche, le résultat précédent (ou le tableau de bord) reste visible sous le loader.
  const vm = parse(search?.output ?? state.output);

  let text;
  if (loading) text = search ? `${prefix}recherche…` : 'chargement…';
  else if (!vm) text = state.error ? `erreur : ${state.error}` : '';
  else if (vm.error) text = search ? `${prefix}${vm.error}` : `hors ligne — ${vm.error} (${time(vm.generatedAt)})`;
  else text = `${prefix}MAJ ${time(vm.generatedAt)}`;

  return (
    <div>
      <Header text={text} dispatch={dispatch} />
      {state.menu && <Menu state={state} dispatch={dispatch} />}
      {state.searching && <SearchBar state={state} dispatch={dispatch} />}
      <div style={{ position: 'relative', minHeight: loading ? 140 : 0 }}>
        {vm && !vm.error && <Body vm={vm} />}
        {loading && <Loader text={search ? 'Recherche en cours…' : 'Chargement des stations…'} />}
      </div>
    </div>
  );
};
