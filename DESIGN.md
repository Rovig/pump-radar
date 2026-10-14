# Essence Widget — Design

Widget de bureau macOS qui affiche une carte IGN et la **disponibilité** des carburants
(et le prix) pour les stations proches d'un point, ou pour une liste d'IDs choisis.
Rafraîchissement automatique.

Principes : **KISS** d'abord (zéro dépendance runtime, aucun build), **SOLID** pour garder
le cœur testable et les sources remplaçables.

---

## 1. Faits vérifiés (14/10/2026)

| Source | Endpoint | Constat |
|---|---|---|
| Prix carburants (data.economie.gouv.fr, Opendatasoft v2.1) | `GET /api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records` | Sans clé. Flux mis à jour ~10 min. |
| ↳ proximité | `where=within_distance(geom, geom'POINT(lon lat)', 5km)` + `select=…, distance(geom, geom'POINT(lon lat)') as d` + `order_by=d` | OK, `d` en **mètres**. |
| ↳ par IDs | `where=id in (75013025, 75001003)` | OK. |
| ↳ dispo | `carburants_disponibles` (array), `carburants_rupture_temporaire` (`"E85;GPLc"` ou null), `carburants_rupture_definitive`, `<fuel>_prix`, `<fuel>_maj`, `geom {lat, lon}`, `adresse`, `ville`, `cp` | **Pas de nom/enseigne** de station dans le dataset → afficher adresse + ville. |
| Carte IGN (Géoplateforme) | `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png` | Sans clé, HTTP 200 `image/png`. Grille Web Mercator standard (z/x/y). |
| Poste | macOS 26.6, **Command Line Tools seulement (pas Xcode)**, Node 22 (nvm) | WidgetKit natif impossible sans Xcode. |

Carburants : `Gazole`, `SP95`, `SP98`, `E10`, `E85`, `GPLc`.

---

## 2. Choix de plateforme

**Retenu : [Übersicht](https://tracesof.net/uebersicht/)** (widget de bureau gratuit, `brew install --cask ubersicht`).

- Un widget = un fichier `.jsx` avec `command` (shell), `refreshFrequency` (ms) et `render` (JSX).
- Rendu HTML → les tuiles IGN s'affichent comme de simples `<img>`.
- Aucun build, aucun Xcode, édition à chaud.

| Option | Pour | Contre |
|---|---|---|
| **Übersicht** ✅ | HTML libre, refresh natif, 0 build | App tierce |
| WidgetKit (SwiftUI) | Widget « officiel » Centre de notifs | Xcode + app hôte + signature, carte = snapshot image, budget de refresh limité par l'OS |
| SwiftBar (menubar) | Très léger | Pas de carte |

**Pas de Leaflet** : le widget n'est pas interactif (pas de pan/zoom), donc une grille de
grille de tuiles (2 à 4 pour un cadre 360×220) + marqueurs positionnés en absolu suffit (~30 lignes de maths slippy-map).
→ KISS : zéro dépendance.

---

## 3. Architecture

Le cœur tourne en **Node pur** (testable sans Übersicht) et sort un **ViewModel JSON** sur
stdout. Le `.jsx` ne fait qu'afficher. Une seule frontière, un seul format.

```
┌────────────────── Übersicht ──────────────────┐
│ essence.widget/index.jsx                       │
│   command: "<node> core/main.mjs"  (toutes N min)
│   render({ output }) → JSON.parse → <Widget/>  │
└──────────────┬─────────────────────────────────┘
               │ stdout = ViewModel JSON
┌──────────────▼──────────── core/ (Node, ESM) ──┐
│ main.mjs        composition root (wiring)      │
│ app/                                           │
│   buildDashboard.mjs  use case (pur + ports)   │
│   parseSearch.mjs     saisie → mode (pur)      │
│ domain/                                        │
│   station.mjs   Station, FuelStatus            │
│   availability.mjs  règles de dispo (pur)      │
│ (ports : contrats JSDoc décrits au §4, pas de  │
│  dossier) StationSource · LocationProvider ·   │
│  TileUrl                                       │
│ adapters/                                      │
│   prixCarburantsApi.mjs   → StationSource      │
│   fixedLocation.mjs       → LocationProvider   │
│   (corelocation.mjs : v2, non implémenté)      │
│   ignTiles.mjs            → TileUrl + maths    │
└────────────────────────────────────────────────┘
               │ lit
           config.json
```

### Application des principes

| Principe | Concrètement |
|---|---|
| **S** | API ≠ domaine ≠ rendu ≠ config. `prixCarburantsApi` ne fait *que* HTTP + mapping vers `Station`. `availability` ne fait *que* des règles. |
| **O** | Nouvelle source (flux XML roulez-eco, cache disque) ou autre fond IGN (orthophotos) = nouvel adapter, rien d'autre ne bouge. |
| **L** | Tout `StationSource` renvoie des `Station` normalisées ; le use case ne sait pas d'où elles viennent. |
| **I** | Ports minimaux : 2 méthodes pour les stations, 1 pour la position, 1 pour les tuiles. |
| **D** | `buildDashboard(config, { stations, location })` reçoit ses dépendances ; seul `main.mjs` instancie les adapters. Tests = faux adapters en mémoire. |
| **KISS** | `fetch` natif Node, pas de framework, pas de cache au départ (l'API répond < 1 s et le flux n'évolue que toutes les ~10 min), pas de base de données, config en JSON. |

---

## 4. Contrats

```js
// domain/station.mjs
/** @typedef {'Gazole'|'SP95'|'SP98'|'E10'|'E85'|'GPLc'} Fuel */
/** @typedef {'ok'|'rupture'|'absent'} FuelState
 *  ok      = dans carburants_disponibles
 *  rupture = dans carburants_rupture_temporaire   ← l'info clé
 *  absent  = jamais vendu / rupture définitive    → masqué */
/** @typedef {{ fuel: Fuel, state: FuelState, price: number|null, updatedAt: string|null }} FuelStatus */
/** @typedef {{ id: number, address: string, city: string,
 *              lat: number, lon: number, distanceM: number|null,
 *              fuels: FuelStatus[] }} Station */

// ports
/** StationSource
 *   nearby({lat, lon}, radiusKm, limit): Promise<Station[]>   // triées par distance
 *   byIds(ids: number[]): Promise<Station[]>
 *   byPostcode(cp: string, limit): Promise<{ stations: Station[], total: number }>
 *     total = nb de stations du CP, même au-delà de limit     */
/** LocationProvider
 *   current(): Promise<{lat, lon}>                            */
/** TileUrl
 *   (z, x, y) => string                                       */
```

### ViewModel (stdout → JSX)

```json
{
  "generatedAt": "2026-10-14T07:42:00Z",
  "center": { "lat": 48.8566, "lon": 2.3522 },
  "map": {
    "zoom": 14,
    "tiles": [{ "url": "https://data.geopf.fr/wmts?...", "left": 0, "top": 0 }],
    "markers": [{ "id": 75001003, "left": 212, "top": 140, "level": "ok" }]
  },
  "stations": [{
    "id": 75001003, "label": "12 rue X, Paris", "distanceKm": 0.95,
    "level": "ok",
    "fuels": [{ "fuel": "SP98", "state": "ok", "price": 1.99, "ageMin": 41 }]
  }],
  "error": null
}
```

`level` d'une station (pour la couleur du marqueur) = calculé **sur les carburants suivis**
(`config.fuels`) : `ok` (tous dispo) · `partial` (au moins un en rupture) · `empty` (aucun dispo)
· `none` (ne vend aucun carburant suivi → gris, pas rouge).

Le **projeté pixel** (tuiles + marqueurs) est calculé côté core, pas dans le JSX :
le rendu reste bête, et les maths sont testées en Node.

---

## 5. Configuration

```json
{
  "mode": "nearby",                       // "nearby" | "ids"
  "location": { "provider": "fixed", "lat": 48.8566, "lon": 2.3522 },
  "radiusKm": 5,
  "limit": 8,
  "searchLimit": 20,                      // max de stations pour une recherche par code postal
  "ids": [75013025, 75001003],
  "fuels": ["SP98", "E10"],
  "map": { "zoom": 15, "width": 360, "height": 220 }   // zoom = zoom MAX, réduit auto pour cadrer toutes les stations
}
```

- `mode: "ids"` → `byIds(ids)`, carte centrée sur l'emprise des stations.
- `mode: "postcode"` + `postcode: "75013"` → `byPostcode(cp, searchLimit)`, idem (utilisé par la recherche).
- Fréquence de rafraîchissement : `refreshFrequency` dans `index.jsx` (Übersicht la lit statiquement).
- Trouver un ID : https://www.prix-carburants.gouv.fr (l'ID figure dans la fiche) ou mode `nearby` qui l'affiche.
- `location.provider: "corelocation"` (optionnel, v2) : via `brew install corelocationcli`
  (demande l'autorisation de localisation une fois). Par défaut `fixed` → KISS.

---

### Recherche (menu ☰)

Le burger de l'en-tête ouvre un menu → « Rechercher » affiche une barre de saisie.
`main.mjs <saisie>` surcharge `config.mode` via `app/parseSearch.mjs` :
5 chiffres = code postal (`where cp = "75013"`), 6 à 9 chiffres = ID de station.
Le JSX ne laisse passer que des chiffres (la saisie finit dans une commande shell via `run`).
Le résultat reste affiché jusqu'à « Revenir aux stations proches » ou ✕, et il est relancé
à chaque rafraîchissement (`command` est une fonction qui relance aussi la recherche active).
Un CP peut compter plus de stations que `searchLimit` : le ViewModel porte alors `total`
et le widget affiche « 8 / 15 stations affichées ».

## 6. Flux d'un rafraîchissement

```
Übersicht timer ─► command(dispatch) ─► bin/essence [recherche] ─► node core/main.mjs
   main: lit config (+ parseSearch) → instancie adapters → buildDashboard()
     buildDashboard:
       pos      = location.current()                       (toujours : repli du centre)
       stations = ids      ? source.byIds(ids)
                : postcode ? source.byPostcode(cp, searchLimit)   → { stations, total }
                :            source.nearby(pos, r, n)
       fuels    = trackedFuels(station, config.fuels) ; level = levelOf(fuels)
       centre   = nearby ? pos : emprise des stations géolocalisées
       zoom     = fitZoom(centre, stations géolocalisées, w, h, zoom max)
       map      = layoutMap(centre, zoom, w, h, stations géolocalisées)
       return ViewModel
   stdout ◄─ JSON.stringify(vm)
render(output) ─► carte (tuiles <img> + pastilles) + liste
```

Requête "nearby" construite par l'adapter (une seule requête HTTP) :

```
select = id,adresse,ville,cp,geom,carburants_disponibles,carburants_rupture_temporaire,
         gazole_prix,gazole_maj,sp95_prix,sp95_maj,sp98_prix,sp98_maj,
         e10_prix,e10_maj,e85_prix,e85_maj,gplc_prix,gplc_maj,
         distance(geom, geom'POINT(lon lat)') as d
where  = within_distance(geom, geom'POINT(lon lat)', {r}km)
order_by = d
limit  = {n}
```

⚠️ Ordre WKT : `POINT(lon lat)` (longitude d'abord).

---

## 7. Erreurs (KISS)

| Cas | Comportement |
|---|---|
| Réseau / API KO | `main` attrape tout, sort `{ error: "…", generatedAt }` avec code 0 ; le JSX affiche « hors ligne — <erreur> (HH:MM de l'échec) » à la place des données. |
| Station sans coordonnées | Gardée dans la liste, exclue de la carte (centre, zoom, marqueurs). |
| Carburant dispo sans prix | « prix n.c. » (pastille verte), pas « rupture ». |
| Tuile IGN KO | `<img>` cassée ignorée (fond gris CSS), la liste reste utile. |
| ID inconnu | Absent du résultat → ligne « ID 123 introuvable » (diff `ids` vs résultats). |
| Prix ancien | `ageMin` affiché ; > 24 h grisé (prix non fiable). |

Pas de retry ni de cache disque en v1 : le prochain tick est le retry.

---

## 8. Arborescence

```
~/Library/Application Support/Übersicht/widgets/essence.widget/
├── index.jsx            # command + refreshFrequency + render (UI seule)
├── config.json
├── bin/essence          # lanceur : trouve node ≥ 18 puis exécute core/main.mjs
└── core/
    ├── main.mjs
    ├── app/buildDashboard.mjs
    ├── app/parseSearch.mjs
    ├── domain/station.mjs
    ├── domain/availability.mjs
    ├── adapters/prixCarburantsApi.mjs
    ├── adapters/fixedLocation.mjs
    ├── adapters/ignTiles.mjs
    └── test/*.test.mjs    # node --test, faux adapters
```

Développement dans `~/essence`, puis symlink vers le dossier widgets d'Übersicht.

---

## 9. Points d'attention

1. **PATH d'Übersicht** : il n'hérite pas de nvm → le widget passe par `bin/essence`, qui cherche
   node ≥ 18 (nvm le plus récent, puis Homebrew, puis /usr/local — ce dernier est en v16 ici, ignoré).
2. **Coordonnées** : utiliser `geom.lat/lon` (float) ; ignorer `latitude`/`longitude` (strings ×100000).
3. **Rupture définitive** = carburant non commercialisé → masqué, pas affiché en rouge.
4. **Fuseau des `<fuel>_maj`** : l'API renvoie l'heure de Paris étiquetée `+00:00` (vérifié le
   14/10/2026). `prixCarburantsApi` la réinterprète en Europe/Paris (`parisWallTimeToIso`).
5. **Composant carte nommé `MapView`** : `Map` masquerait le `Map` global de JS.
6. **Usage IGN** : 2 à 4 tuiles / 10 min, largement dans les limites ; mentionner « © IGN » sur la carte.

---

## 10. Installation

```sh
brew install --cask ubersicht
ln -s ~/essence "$HOME/Library/Application Support/Übersicht/widgets/essence.widget"
npm test          # 19 tests, node --test
npm start         # ViewModel JSON brut (debug)
npm start -- 75013   # idem pour une recherche (code postal ou ID de station)
```

## 11. Tests

- `availability` : table de cas (dispo / rupture temporaire / définitive / non vendu → niveau).
- `ignTiles` : lat/lon → (x, y, pixel) sur points connus ; marqueur au centre = centre du cadre.
- `prixCarburantsApi` : mapping d'un enregistrement réel figé en fixture JSON.
- `buildDashboard` : faux `StationSource` / `LocationProvider`, modes `nearby`, `ids` et `postcode`.
- `parseSearch` : saisie → code postal / ID / refus.

## 12. Hors périmètre v1 (YAGNI)

Notifications de retour en stock, historique des prix, carte interactive, widget WidgetKit
natif. Chacun s'ajoute plus tard par un adapter ou un nouveau rendu, sans toucher au cœur.
