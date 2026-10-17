// Composition root : lit la config, branche les adapters, écrit le ViewModel JSON sur stdout.
// Argument optionnel = recherche (code postal, ID de station ou @lat,lon), prioritaire sur config.mode.
// `suggest <texte>` = suggestions de communes pour la barre de recherche.
import { readFile } from 'node:fs/promises';
import { buildDashboard } from './app/buildDashboard.mjs';
import { prixCarburantsApi } from './adapters/prixCarburantsApi.mjs';
import { fixedLocation } from './adapters/fixedLocation.mjs';
import { parseSearch } from './app/parseSearch.mjs';
import { suggestCommunes } from './app/suggestCommunes.mjs';
import { geoApiCommunes } from './adapters/geoApiCommunes.mjs';

const LOCATION_PROVIDERS = { fixed: fixedLocation };

async function main() {
  const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));
  const search = process.argv[2];
  if (search) Object.assign(config, parseSearch(search));
  const makeLocation = LOCATION_PROVIDERS[config.location.provider];
  if (!makeLocation) throw new Error(`location.provider inconnu : ${config.location.provider}`);

  return buildDashboard(config, {
    stations: prixCarburantsApi(),
    location: makeLocation(config.location),
  });
}

const [command, arg] = process.argv.slice(2);

(command === 'suggest' ? suggestCommunes(arg ?? '', { communes: geoApiCommunes() }) : main())
  .catch((err) => ({ generatedAt: new Date().toISOString(), error: err.message }))
  .then((vm) => process.stdout.write(JSON.stringify(vm)));
