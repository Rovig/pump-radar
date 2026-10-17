// Widget Übersicht : affichage seul. Toute la logique est dans core/ (testable en Node).
// bin/essence trouve node lui-même (Übersicht n'hérite pas du PATH de nvm).
// La carte est posée ici avec les maths pures de ignTiles.mjs, pour la déplacer sans relancer node.
import { run } from 'uebersicht';
import { layoutMap, project, unproject, MIN_ZOOM, MAX_ZOOM } from './core/adapters/ignTiles.mjs';

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

const button = {
  background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0,
};

const time = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

// --- Carte interactive : glisser, zoomer, cliquer une pastille ---

const MARGIN = 256; // couronne de tuiles hors cadre, visible pendant un glissement
const CLICK_PX = 4; // en dessous, un pointerdown/pointerup est un clic et non un glissement
const AREA_DELAY_MS = 400;
const LAYER_ID = 'essence-map-layer';

let drag = null; // { x0, y0, dx, dy, moved, stationId } : hors état React, pour ne pas re-rendre à chaque mousemove
let lastClick = 0;
let lastWheel = 0;
let areaTimer = null;

const located = (s) => Number.isFinite(s.lat) && Number.isFinite(s.lon);
const layer = () => document.getElementById(LAYER_ID);

// Nouvelle vue → rechargement des stations visibles, une fois les gestes terminés.
const setView = (view, dispatch) => {
  dispatch({ type: 'VIEW_SET', view });
  clearTimeout(areaTimer);
  areaTimer = setTimeout(() => {
    const { lat, lon } = view.center;
    submitSearch(`@${lat.toFixed(5)},${lon.toFixed(5)},${view.zoom}`, 'Carte', dispatch, { keepView: true });
  }, AREA_DELAY_MS);
};

// Zoom de `delta` en gardant fixe le point (mx, my) du cadre (centre par défaut).
const zoomBy = (view, map, delta, dispatch, mx = map.width / 2, my = map.height / 2) => {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom + delta));
  if (zoom === view.zoom) return;
  const c = project(view.center.lat, view.center.lon, view.zoom);
  const k = 2 ** (zoom - view.zoom);
  const ox = mx - map.width / 2;
  const oy = my - map.height / 2;
  setView({ center: unproject((c.x + ox) * k - ox, (c.y + oy) * k - oy, zoom), zoom }, dispatch);
};

const localPoint = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};

const mapHandlers = (view, map, dispatch) => ({
  onPointerDown: (e) => {
    if (e.button !== 0 || e.target.closest('[data-nodrag]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const marker = e.target.closest('[data-station]');
    drag = { x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false, stationId: marker ? Number(marker.dataset.station) : null };
  },
  onPointerMove: (e) => {
    if (!drag) return;
    drag.dx = e.clientX - drag.x0;
    drag.dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(drag.dx, drag.dy) < CLICK_PX) return;
    drag.moved = true;
    const el = layer();
    if (el) el.style.transform = `translate(${drag.dx}px, ${drag.dy}px)`;
  },
  onPointerUp: (e) => {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.moved) {
      const c = project(view.center.lat, view.center.lon, view.zoom);
      setView({ center: unproject(c.x - d.dx, c.y - d.dy, view.zoom), zoom: view.zoom }, dispatch);
      // Le transform est retiré une fois la grille recalculée sur le nouveau centre.
      requestAnimationFrame(() => { const el = layer(); if (el) el.style.transform = ''; });
    } else if (d.stationId != null) {
      dispatch({ type: 'POPUP_TOGGLE', id: d.stationId });
    } else if (Date.now() - lastClick < 300) {
      lastClick = 0;
      zoomBy(view, map, 1, dispatch, ...localPoint(e));
    } else {
      lastClick = Date.now();
      dispatch({ type: 'POPUP_CLOSE' });
    }
  },
  onPointerCancel: () => {
    drag = null;
    const el = layer();
    if (el) el.style.transform = '';
  },
  onWheel: (e) => {
    // Un trackpad envoie des dizaines d'événements par geste : un cran de zoom toutes les 250 ms au plus.
    if (Math.abs(e.deltaY) < 4 || Date.now() - lastWheel < 250) return;
    lastWheel = Date.now();
    zoomBy(view, map, e.deltaY < 0 ? 1 : -1, dispatch, ...localPoint(e));
  },
});

const ageText = (min) => {
  if (min == null) return '';
  if (min < 60) return `${Math.max(0, min)} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / (24 * 60))} j`;
};

const POPUP_W = 230;

const Popup = ({ s, marker, map, dispatch }) => {
  const rows = Math.ceil(s.allFuels.length / 2);
  const h = 64 + 17 * Math.max(rows, 1); // hauteur estimée, pour choisir au-dessus / en dessous
  const above = marker.top - 12 - h >= 0;
  const top = above ? marker.top - 12 - h : Math.min(marker.top + 12, map.height - h);
  const left = Math.min(Math.max(marker.left - POPUP_W / 2, 4), map.width - POPUP_W - 4);
  const { lat, lon } = s;
  return (
    <div data-nodrag style={{
      position: 'absolute', left, top: Math.max(top, 4), width: POPUP_W, zIndex: 2, cursor: 'default',
      background: 'rgba(28, 28, 30, 0.94)', borderRadius: 10, padding: '8px 10px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)', fontSize: 11, lineHeight: 1.4,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: COLORS[s.level] }}>■</span> {s.address}
        </span>
        <button style={{ ...button, opacity: 0.6 }} title="Fermer" onClick={() => dispatch({ type: 'POPUP_CLOSE' })}>✕</button>
      </div>
      <div style={{ opacity: 0.7 }}>{s.postcode} {s.city}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 10, margin: '4px 0' }}>
        {s.allFuels.length === 0 && <span style={{ opacity: 0.6 }}>aucun carburant déclaré</span>}
        {s.allFuels.map((f) => (
          <span key={f.fuel} title={f.ageMin != null ? `prix mis à jour il y a ${ageText(f.ageMin)}` : ''}
            style={{ whiteSpace: 'nowrap', opacity: f.ageMin > 24 * 60 ? 0.45 : 1, fontWeight: f.tracked ? 600 : 400 }}>
            <span style={{ color: f.state === 'ok' ? COLORS.ok : COLORS.empty }}>●</span> {f.fuel} {fuelText(f)}
            {f.state === 'ok' && f.ageMin != null && <span style={{ opacity: 0.5 }}> {ageText(f.ageMin)}</span>}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.8 }}>
        <span style={{ opacity: 0.7 }}>#{s.id}</span>
        <button style={button} title="Ouvrir dans Plans"
          onClick={() => run(`open 'maps://?daddr=${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}'`)}>
          Itinéraire ↗
        </button>
      </div>
    </div>
  );
};

const zoomButton = {
  ...button, display: 'block', width: 24, height: 24, fontSize: 16, lineHeight: '22px', textAlign: 'center',
  background: 'rgba(28, 28, 30, 0.82)', borderRadius: 6, marginBottom: 4,
};

const MapView = ({ vm, view, popup, loading, dispatch }) => {
  const { width, height } = vm.map;
  const points = vm.stations.filter(located);
  const layout = layoutMap({ center: view.center, zoom: view.zoom, width, height, points, margin: MARGIN });
  const open = popup != null && vm.stations.find((s) => s.id === popup && located(s));
  const openMarker = open && layout.markers.find((m) => m.id === open.id);
  return (
    <div {...mapHandlers(view, vm.map, dispatch)} style={{
      position: 'relative', width, height, overflow: 'hidden', background: '#3a3a3c',
      cursor: 'grab', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none',
    }}>
      <div id={LAYER_ID} style={{ position: 'absolute', inset: 0 }}>
        {layout.tiles.map((t) => (
          <img key={t.url} src={t.url} draggable={false}
            style={{ position: 'absolute', left: t.left, top: t.top, width: 256, height: 256, pointerEvents: 'none' }} />
        ))}
        {layout.markers.map((m) => (
          <div
            key={m.id}
            data-station={m.id}
            title={String(m.id)}
            style={{
              position: 'absolute', left: m.left - 7, top: m.top - 7, width: 14, height: 14, cursor: 'pointer',
              borderRadius: '50%', background: COLORS[m.level], border: '2px solid white',
              boxShadow: m.id === popup ? '0 0 0 3px rgba(255,255,255,0.55)' : '0 1px 3px rgba(0,0,0,0.5)',
            }}
          />
        ))}
        {openMarker && <Popup s={open} marker={openMarker} map={vm.map} dispatch={dispatch} />}
      </div>
      <div data-nodrag style={{ position: 'absolute', right: 6, top: 6, zIndex: 3 }}>
        <button style={zoomButton} title="Zoomer" onClick={() => zoomBy(view, vm.map, 1, dispatch)}>+</button>
        <button style={zoomButton} title="Dézoomer" onClick={() => zoomBy(view, vm.map, -1, dispatch)}>−</button>
      </div>
      {loading && <Spinner size={14} style={{ position: 'absolute', left: 6, top: 6, zIndex: 3 }} />}
      <div style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 9, color: '#333' }}>© IGN</div>
    </div>
  );
};

const fuelText = (f) => {
  if (f.state !== 'ok') return 'rupture';
  return f.price != null ? `${f.price.toFixed(3)} €` : 'prix n.c.';
};

const Fuel = ({ f }) => (
  <span style={{ marginRight: 10, opacity: f.ageMin > 24 * 60 ? 0.45 : 1 }}>
    <span style={{ color: f.state === 'ok' ? COLORS.ok : COLORS.empty }}>●</span> {f.fuel} {fuelText(f)}
  </span>
);

// Clic sur une ligne : centre la carte sur la station et ouvre sa bulle (sans recharger : elle est déjà là).
const Row = ({ s, view, selected, dispatch }) => (
  <div
    onClick={() => {
      if (!located(s)) return;
      dispatch({ type: 'VIEW_SET', view: { center: { lat: s.lat, lon: s.lon }, zoom: view.zoom } });
      dispatch({ type: 'POPUP_OPEN', id: s.id });
    }}
    style={{
      padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', cursor: located(s) ? 'pointer' : 'default',
      background: selected ? 'rgba(255,255,255,0.08)' : 'none',
    }}
  >
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

// --- Menu burger + recherche (ville, code postal ou ID de station) ---

export const initialState = {
  output: '', error: null, menu: false, searching: false, query: '', search: null,
  suggest: null, // { query, items, index, error } : suggestions de communes pour la saisie en cours
  view: null, // { center, zoom } choisie à la main sur la carte ; null = suivre le ViewModel
  popup: null, // id de la station dont la bulle est ouverte
};

export const updateState = (event, prev) => {
  switch (event.type) {
    case 'UB/COMMAND_RAN': return { ...prev, output: event.output, error: event.error };
    case 'MENU_TOGGLE': return { ...prev, menu: !prev.menu };
    case 'SEARCH_OPEN': return { ...prev, menu: false, searching: true };
    case 'SEARCH_CLOSE':
      return { ...prev, menu: false, searching: false, query: '', search: null, suggest: null, view: null, popup: null };
    case 'QUERY': return { ...prev, query: event.query, suggest: isDigits(event.query) ? null : prev.suggest };
    case 'SEARCH_START':
      return {
        ...prev,
        suggest: null,
        // Une nouvelle recherche (ville, CP, ID) recadre la carte ; un déplacement de la carte garde sa vue.
        view: event.keepView ? prev.view : null,
        popup: event.keepView ? prev.popup : null,
        search: {
          query: event.query, label: event.label, quiet: Boolean(event.keepView),
          output: prev.search?.output ?? null, loading: true,
        },
      };
    case 'SEARCH_DONE':
      // Ignore une réponse arrivée après une nouvelle recherche ou une fermeture.
      return prev.search?.query === event.query
        ? { ...prev, search: { ...prev.search, output: event.output, loading: false } }
        : prev;
    case 'SUGGEST_DONE': {
      // Ignore une réponse pour une saisie déjà modifiée.
      if (shellText(prev.query) !== event.query) return prev;
      const r = parse(event.output);
      return { ...prev, suggest: { query: event.query, items: r?.suggestions ?? [], index: 0, error: r ? r.error : 'réponse illisible' } };
    }
    case 'SUGGEST_MOVE': {
      if (!prev.suggest?.items.length) return prev;
      const n = prev.suggest.items.length;
      return { ...prev, suggest: { ...prev.suggest, index: (prev.suggest.index + event.delta + n) % n } };
    }
    case 'SUGGEST_CLEAR': return { ...prev, suggest: null };
    case 'VIEW_SET': return { ...prev, view: event.view };
    case 'POPUP_OPEN': return { ...prev, popup: event.id };
    case 'POPUP_TOGGLE': return { ...prev, popup: prev.popup === event.id ? null : event.id };
    case 'POPUP_CLOSE': return prev.popup == null ? prev : { ...prev, popup: null };
    default: return prev;
  }
};

const isDigits = (text) => /^\d+$/.test(text);

// La saisie finit dans une commande shell : chiffres seuls (CP / ID), ou lettres, espaces et tirets
// entre guillemets simples (l'apostrophe est remplacée, elle ne peut donc pas fermer les guillemets).
const cleanInput = (text) => {
  const t = text.replace(/[^\p{L}\d '’-]/gu, '');
  return isDigits(t.replace(/\s/g, '')) ? t.replace(/\D/g, '').slice(0, 9) : t.slice(0, 40);
};
const shellText = (text) => text.replace(/['’]/g, ' ').replace(/[^\p{L} -]/gu, '').trim();

const SUGGEST_DELAY_MS = 250;
let suggestTimer = null;

const typeQuery = (raw, dispatch) => {
  const query = cleanInput(raw);
  dispatch({ type: 'QUERY', query });
  clearTimeout(suggestTimer);
  const text = shellText(query);
  if (isDigits(query) || text.replace(/[ -]/g, '').length < 2) return dispatch({ type: 'SUGGEST_CLEAR' });
  suggestTimer = setTimeout(() => {
    run(`${CMD} suggest '${text}'`)
      .catch((err) => JSON.stringify({ query: text, error: String(err) }))
      .then((output) => dispatch({ type: 'SUGGEST_DONE', query: text, output }));
  }, SUGGEST_DELAY_MS);
};

const searchLabel = (q) => (q.length === 5 ? `CP ${q}` : `ID ${q}`);

const submitSearch = (query, label, dispatch, { keepView = false } = {}) => {
  if (!query) return;
  clearTimeout(suggestTimer);
  if (!keepView) clearTimeout(areaTimer);
  activeSearch = query;
  dispatch({ type: 'SEARCH_START', query, label, keepView });
  fetchSearch(query, dispatch);
};

// Seules les coordonnées (nombres) partent dans la commande, jamais le nom de la commune.
const chooseCommune = (c, dispatch) => {
  dispatch({ type: 'QUERY', query: c.name });
  submitSearch(`@${Number(c.lat).toFixed(5)},${Number(c.lon).toFixed(5)}`, c.name, dispatch);
};

const submitQuery = (state, dispatch) => {
  const { query, suggest } = state;
  if (isDigits(query)) return submitSearch(query, searchLabel(query), dispatch);
  const picked = suggest?.items[suggest.index];
  if (picked) chooseCommune(picked, dispatch);
};

const closeSearch = (dispatch) => {
  clearTimeout(suggestTimer);
  clearTimeout(areaTimer);
  activeSearch = null;
  dispatch({ type: 'SEARCH_CLOSE' });
};

const Menu = ({ state, dispatch }) => (
  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '4px 0' }}>
    <button style={{ ...button, display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px' }}
      onClick={() => dispatch({ type: 'SEARCH_OPEN' })}>
      🔍 Rechercher une ville, un code postal ou une station
    </button>
    {(state.searching || state.search) && (
      <button style={{ ...button, display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px' }}
        onClick={() => closeSearch(dispatch)}>
        📍 Revenir aux stations proches
      </button>
    )}
  </div>
);

const KEYS = { ArrowDown: 1, ArrowUp: -1 };

const onKeyDown = (e, dispatch) => {
  if (e.key in KEYS) {
    e.preventDefault();
    dispatch({ type: 'SUGGEST_MOVE', delta: KEYS[e.key] });
  } else if (e.key === 'Escape') dispatch({ type: 'SUGGEST_CLEAR' });
};

const Suggestions = ({ suggest, dispatch }) => {
  if (suggest.error) return <div style={{ padding: '4px 12px 6px', opacity: 0.5 }}>suggestions indisponibles</div>;
  if (!suggest.items.length) return <div style={{ padding: '4px 12px 6px', opacity: 0.5 }}>aucune commune trouvée</div>;
  return (
    <div style={{ paddingBottom: 4 }}>
      {suggest.items.map((c, i) => (
        <button
          key={c.insee}
          style={{
            ...button, display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%', textAlign: 'left',
            padding: '4px 12px', background: i === suggest.index ? 'rgba(255,255,255,0.12)' : 'none',
          }}
          onMouseEnter={() => dispatch({ type: 'SUGGEST_MOVE', delta: i - suggest.index })}
          onClick={() => chooseCommune(c, dispatch)}
        >
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
          <span style={{ opacity: 0.6, whiteSpace: 'nowrap' }}>
            {c.postcodes[0]}{c.postcodes.length > 1 ? '…' : ''} · {c.dept}
          </span>
        </button>
      ))}
    </div>
  );
};

const SearchBar = ({ state, dispatch }) => (
  <form
    style={{ display: 'flex', gap: 6, padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}
    onSubmit={(e) => { e.preventDefault(); submitQuery(state, dispatch); }}
  >
    <input
      autoFocus
      placeholder="Ville, code postal ou ID de station"
      value={state.query}
      onChange={(e) => typeQuery(e.target.value, dispatch)}
      onKeyDown={(e) => onKeyDown(e, dispatch)}
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

const parse = (output) => {
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
};

const Spinner = ({ size = 26, style }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', boxSizing: 'border-box',
    border: `${size > 20 ? 3 : 2}px solid rgba(255,255,255,0.25)`, borderTopColor: COLORS.ok,
    animation: 'essence-spin 0.8s linear infinite', ...style,
  }} />
);

// Voile + spinner posé sur le contenu pendant l'appel API.
const Loader = ({ text }) => (
  <div style={{
    position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 10,
    background: 'rgba(28, 28, 30, 0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  }}>
    <Spinner />
    <span style={{ opacity: 0.8 }}>{text}</span>
  </div>
);

const Body = ({ vm, state, mapLoading, dispatch }) => {
  const view = state.view ?? { center: vm.center, zoom: vm.map.zoom };
  return (
  <div>
    <MapView vm={vm} view={view} popup={state.popup} loading={mapLoading} dispatch={dispatch} />
    <div style={{ maxHeight: 380, overflowY: 'auto' }}>
      {vm.stations.map((s) => <Row key={s.id} s={s} view={view} selected={s.id === state.popup} dispatch={dispatch} />)}
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
};

export const render = (state, dispatch) => {
  const { search } = state;
  const prefix = search ? `${search.label} · ` : '';
  const loading = search ? search.loading : !state.output && !state.error;
  // Rechargement après un geste sur la carte : petit spinner, la carte reste utilisable.
  const quiet = loading && search?.quiet;
  // Pendant une recherche, le résultat précédent (ou le tableau de bord) reste visible sous le loader.
  const vm = parse(search?.output ?? state.output);

  let text;
  if (loading) text = search ? `${prefix}recherche…` : 'chargement…';
  else if (!vm) text = state.error ? `erreur : ${state.error}` : '';
  else if (vm.error) text = search ? `${prefix}${vm.error}` : `hors ligne — ${vm.error} (${time(vm.generatedAt)})`;
  else text = `${prefix}MAJ ${time(vm.generatedAt)}`;

  return (
    <div onKeyDown={(e) => { if (e.key === 'Escape') dispatch({ type: 'POPUP_CLOSE' }); }}>
      <style>{'@keyframes essence-spin { to { transform: rotate(360deg) } }'}</style>
      <Header text={text} dispatch={dispatch} />
      {state.menu && <Menu state={state} dispatch={dispatch} />}
      {state.searching && <SearchBar state={state} dispatch={dispatch} />}
      {state.searching && state.suggest && <Suggestions suggest={state.suggest} dispatch={dispatch} />}
      <div style={{ position: 'relative', minHeight: loading && !quiet ? 140 : 0 }}>
        {vm && !vm.error && <Body vm={vm} state={state} mapLoading={quiet} dispatch={dispatch} />}
        {loading && !quiet && <Loader text={search ? 'Recherche en cours…' : 'Chargement des stations…'} />}
      </div>
    </div>
  );
};
