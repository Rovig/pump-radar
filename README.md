# ⛽ pump-radar

Widget de bureau macOS qui affiche, sur une carte IGN, la **disponibilité** des carburants
(et leur prix) dans les stations autour de vous — ou pour une liste de stations choisies.
Données officielles, mises à jour toutes les 10 minutes, **sans clé API**.

```
┌──────────────────────────────────────────────────┐
│ ☰ ⛽ Essence                   MAJ 08:20          │
│                                                  │
│           [ carte IGN + pastilles ]              │
│                                                  │
├──────────────────────────────────────────────────┤
│ ■ 36 Quai de la Rapée, Paris  2.2 km · #75012010 │
│   ● SP98 2.374 €   ● E10 2.227 €                 │
│ ■ 114 Bd de l'Hôpital, Paris  2.4 km · #75013024 │
│   ● SP98 rupture   ● E10 1.990 €                 │
└──────────────────────────────────────────────────┘
```

- **Pastilles** : 🟢 tout est dispo · 🟠 rupture partielle · 🔴 rien de dispo ·
  ⚪ ne vend aucun des carburants suivis.
- **Prix grisé** : dernière mise à jour il y a plus de 24 h (prix peu fiable).
- **☰ Recherche** : par code postal (`75013`) ou par ID de station (`75013025`).

## Prérequis

- macOS avec [Übersicht](https://tracesof.net/uebersicht/) (gratuit)
- Node.js **≥ 18** — via nvm, Homebrew ou `/usr/local` (détecté automatiquement)

## Installation

```sh
brew install --cask ubersicht
git clone https://github.com/Rovig/pump-radar.git ~/pump-radar
ln -s ~/pump-radar "$HOME/Library/Application Support/Übersicht/widgets/essence.widget"
```

> ⚠️ Le lien **doit** s'appeler `essence.widget` : c'est le chemin qu'utilise le widget pour
> lancer son script (`essence.widget/bin/essence`).

Le widget apparaît en haut à droite du bureau. S'il reste invisible, vérifiez qu'il est coché
dans le menu de l'icône Übersicht (barre des menus) ; si Übersicht lui-même ne répond pas,
quittez-le de force puis relancez-le.

## Configuration

Tout se règle dans `config.json` (rechargé à chaque rafraîchissement) :

| Clé | Rôle | Défaut |
|---|---|---|
| `mode` | `"nearby"` : stations autour de `location` · `"ids"` : liste fixe `ids` | `"nearby"` |
| `location` | Point de référence `{ "provider": "fixed", "lat", "lon" }` | centre de Paris |
| `radiusKm` | Rayon de recherche en mode `nearby` | `5` |
| `limit` | Nombre max de stations affichées (`nearby`) | `8` |
| `searchLimit` | Nombre max de stations pour une recherche par code postal | `20` |
| `ids` | IDs de stations suivies en mode `ids` | — |
| `fuels` | Carburants suivis : `Gazole`, `SP95`, `SP98`, `E10`, `E85`, `GPLc` | `["SP98", "E10"]` |
| `map` | Taille de la carte et **zoom maximal** (réduit automatiquement pour cadrer les stations) | 360×220, z15 |

> 🔒 Le dépôt est public : ne commitez pas les coordonnées de votre domicile dans `location`.

**Trouver l'ID d'une station** : il s'affiche à droite de chaque ligne (`#75013025`), ou sur
la fiche de la station sur [prix-carburants.gouv.fr](https://www.prix-carburants.gouv.fr).

## Utilisation

- **Rafraîchissement** : automatique toutes les 10 min (rythme du flux officiel).
- **Recherche** : ☰ → *Rechercher une station ou un code postal* → saisir puis Entrée.
  - 5 chiffres = code postal, 6 à 9 chiffres = ID de station.
  - Le résultat est rafraîchi avec le reste du widget ; ☰ → *Revenir aux stations proches*
    (ou ✕) pour revenir à la vue normale.
- **En ligne de commande** (debug) — sortie JSON brute :

  ```sh
  npm start              # vue configurée
  npm start -- 75013     # recherche par code postal
  npm start -- 75013025  # recherche par ID
  ```

## Développement

```sh
npm test   # node --test, aucune dépendance à installer
```

Übersicht recharge le widget à chaque modification de fichier. Toute la logique vit dans
`core/` (Node pur, testable sans Übersicht) ; `index.jsx` ne fait qu'afficher le JSON produit.

```
bin/essence      lanceur : trouve node ≥ 18, exécute core/main.mjs
core/main.mjs    point d'entrée : config → adapters → ViewModel JSON sur stdout
core/app/        cas d'usage (buildDashboard, parseSearch)
core/domain/     modèle Station et règles de disponibilité
core/adapters/   API prix-carburants, tuiles IGN, position
index.jsx        widget Übersicht (rendu, menu, recherche)
```

Architecture, contrats et choix techniques : voir [DESIGN.md](DESIGN.md).

## Données

- **Prix et disponibilités** : [Prix des carburants en France – flux instantané v2](https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2/),
  data.economie.gouv.fr (Licence Ouverte Etalab 2.0).
- **Fond de carte** : Plan IGN v2 via la [Géoplateforme](https://geoservices.ign.fr/) — © IGN.

Le jeu de données ne contient pas le nom ou l'enseigne des stations : le widget affiche
l'adresse et la ville.
