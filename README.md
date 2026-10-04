# mcp-camptocamp

Serveur MCP (Model Context Protocol) exposant l'API [Camptocamp.org](https://www.camptocamp.org) aux LLMs. Permet d'interroger des données fiables et à jour sur les itinéraires alpins, les altitudes de sommets et les descriptions de courses — en évitant les hallucinations sur les données d'alpinisme.

<!-- mcp-name: io.github.olaurendeau/mcp-camptocamp -->

## Outils disponibles

| Outil                 | Description                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `search_routes`       | Recherche d'itinéraires (mot-clé, zone, point, activité, cotation, D+, type, configuration) ; paginée     |
| `get_route`           | Détail par ID (sommet : titre, textes, cotations, D+, orientations, durée, zones, topos, points, sorties) |
| `search_waypoints`    | Points de passage par nom et/ou zone `area_id`, filtrables par type (sommet, refuge, bivouac…) ; paginée  |
| `get_waypoint`        | Détail d'un point par ID (altitude, GPS, zones, infos refuge, accès, itinéraires, topos, sorties)         |
| `search_user_outings` | Alias de `search_outings` par `user_id` : sorties où figure l'utilisateur, pas que les siennes ; paginée  |
| `get_outing`          | Détail d'une sortie par ID (cotations, conditions, météo, participants et leurs comptes, itinéraires)     |
| `search_outings`      | Sorties récentes : mot-clé, zone, activité, dates, période, itinéraire, point, participant ; paginée      |
| `search_areas`        | Recherche des zones (massif, département/canton, pays) par nom ; ID réutilisable en `area_id` ; paginée   |
| `get_area`            | Détail d'une zone par ID (type, résumé, description)                                                      |
| `search_books`        | Livres par titre uniquement (auteur/ISBN peu fiables), filtrables par type et activité ; paginée          |
| `get_book`            | Détail d'un livre par ID (auteur, éditeur, date, ISBN, pages, langues, itinéraires, points, articles)     |
| `search_articles`     | Recherche d'articles par mot-clé (matériel, technique, environnement, récits…) ; collab/perso ; paginée   |
| `get_article`         | Détail d'un article par ID (texte, auteur, type, itinéraires, points, sorties, livres liés)               |

Chaque outil `get_*` commence par le titre et l'ID du document, suivis de son lien camptocamp.org (`**URL**: https://www.camptocamp.org/<routes|waypoints|outings|areas|books|articles>/<id>`) à citer comme source.

`get_route` donne aussi les infos pratiques de l'itinéraire, recopiées telles que Camptocamp les envoie (codes non traduits) : `**Difficulties height difference**` et `**Access height difference**` (en mètres), `**Orientations**`, `**Duration (days)**`, `**Route types**` (`return_same_way`, `loop`…), `**Configuration**` (`glacier`, `edge`…), `**Glacier gear**` (`glacier_safety_gear`…) et `**Lift access**` (`yes`/`no`). Ses textes libres sont imprimés dans cet ordre : `Summary`, `Description`, `Slope` (pente, par exemple `40°`), `Remarks`, `Gear`, `Route history`, `External resources`.

`get_route` liste aussi, avec leurs ID, les livres (topos, magazines…) qui couvrent l'itinéraire, ses points de passage (le principal marqué `main waypoint`), les itinéraires voisins, les articles liés et ses sorties récentes (`## Recent outings (10 of 64)`, suivi de `More: search_outings with route_id=<id>` pour les voir toutes). Une liste vide n'imprime pas de section.

Les textes libres écrits par les contributeurs (description, résumé, remarques, matériel, accès, conditions, météo…) sont imprimés entre `[begin user-written text: <champ>]` et `[end user-written text: <champ>]`, avec leurs titres Markdown abaissés de deux niveaux (`#`, `##` et titres soulignés par `===` ou `---`) et une coupe à 8000 caractères (`[truncated, N more characters]`). Les balises d'image Camptocamp deviennent `[image: <légende>]` (rien sans légende) et les liens internes `<libellé> (<type>/<id>)`, par exemple `[[routes/54080/fr|Col des Roches]]` → `Col des Roches (routes/54080)` ; le reste du balisage est conservé. La coupe compte les caractères après cette réécriture. La description de chaque outil `get_*` précise que ce texte est du contenu écrit par les utilisateurs, pas des instructions.

Les recherches paginées (`search_routes`, `search_waypoints`, `search_outings`, `search_areas`, `search_books`, `search_articles`) acceptent `offset` et commencent par `Found <total> <type>(s). Showing <n> from offset <offset>:` (`Found <total> outing(s), most recent first. Showing <n> from offset <offset>:` pour `search_outings`), suivi d'une ligne `Filters:` listant les filtres appliqués. Sans aucun résultat, la sortie tient en une ligne : `No <type>s found matching <filtres>.` (`No <type>s found.` sans filtre). Quand d'autres résultats suivent, la sortie se termine par `Next page: offset=<n>`, ou `Next page: offset=<n> (limit at most <m>)` quand une page complète dépasserait la fenêtre de 10 000 résultats (`limit` doit alors descendre à `<m>`). Camptocamp ne renvoie que les 10 000 premiers résultats d'une recherche : si la page suivante commencerait à 10 000 ou au-delà, la sortie se termine par `More results exist beyond Camptocamp's 10,000-result window; narrow the filters.`, et un appel avec `offset + limit` au-delà de 10 000 est refusé avant toute requête.

`get_waypoint` distingue `**Capacity (unstaffed)**` (places hors gardiennage, `0` compris) de `**Capacity (staffed)**` (places en gardiennage) pour les refuges, gîtes, campings et autres points ; un bivouac n'a qu'un `**Capacity**` (nombre de places). `**Custodianship**` est imprimé tel que Camptocamp l'envoie (`accessible_when_wardened`, `always_accessible`, `key_needed`, `no_warden`, ou toute nouvelle valeur), et la période d'accès (`Access period`) est un texte libre recopié tel quel, jamais converti en dates.

`get_waypoint` liste ensuite, avec leurs ID, les itinéraires du point au format de `search_routes` (`## Routes (27 of 27)` ; au plus 50, suivis de `More: search_routes with waypoint_id=<id>` quand il y en a davantage), les livres qui le couvrent (`## Associated books`) et ses sorties récentes (`## Recent outings (10 of 1743)`, suivi de `More: search_outings with waypoint_id=<id>`). Une liste vide n'imprime pas de section.

Un point de passage virtuel (`waypoint_type` `virtual`, comme `Ouvertures 2013` qui regroupe les itinéraires ouverts cette année-là) n'a pas d'emplacement réel : ni `get_waypoint`, ni `search_waypoints`, ni les listes de points de `get_route`, `get_book` et `get_article` n'affichent son altitude ou ses coordonnées.

Chaque cotation d'itinéraire ou de sortie est nommée par son système, jamais par un simple `Rating` : `Ski rating (Toponeige): 4.1 | Ski exposure: E2 | Labande: S4 / AD | Global rating: F`, puis engagement, risque, équipement, rocher, artif, glace, mixte, via ferrata, randonnée, raquettes et VTT.

`search_routes` demande au moins un filtre, un seul suffit ; plusieurs se combinent en ET : `query`, `area_id`, `waypoint_id` (itinéraires d'un sommet, refuge…), `activity`, `rating_system` avec `rating_min` et/ou `rating_max` (un système par appel, bornes incluses ; les itinéraires sans cette cotation sont exclus), `height_diff_up_min` / `height_diff_up_max` (D+ en mètres), `route_types` et `configuration` (l'une des valeurs données). Une cotation hors de l'échelle du système ou une valeur hors liste est refusée avant tout appel, avec la liste des valeurs valides : l'API l'ignorerait sans rien dire. L'en-tête rappelle les filtres (`Filters: area 14409, activity skitouring, ski rating (Toponeige) 3.1 → 4.1, elevation gain 1000 → 1500m`) et la réponse se termine par `Next page: offset=N` tant qu'il reste des résultats.

`search_waypoints` accepte `waypoint_type` (un des 26 types Camptocamp : `summit`, `pass`, `hut`, `bivouac`, `climbing_outdoor`…), qui précise une recherche par `query` ou `area_id` sans suffire seul. `search_books` accepte `book_type` (`topo`, `environment`, `historical`, `biography`, `photos-art`, `novel`, `technics`, `tourism`, `magazine`) et `activity` (`skitouring`, `hiking`…) : `{query: "vanoise", book_type: "topo", activity: "skitouring"}` donne les topos de ski de randonnée en Vanoise. Comme pour `search_routes`, une valeur hors liste est refusée avant tout appel avec la liste des valeurs valides, et la ligne `Filters:` les rappelle (`Filters: query "pourri", waypoint type hut`).

## Installation

### npm (recommandé)

Prérequis : [Node.js](https://nodejs.org/) 18+

**Claude Desktop** — ajouter dans la configuration :

```json
{
  "mcpServers": {
    "camptocamp": {
      "command": "npx",
      "args": ["-y", "@olaurendeau/mcp-camptocamp"]
    }
  }
}
```

**Cursor** — ajouter dans `~/.cursor/mcp.json` ou `.cursor/mcp.json` :

```json
{
  "mcpServers": {
    "camptocamp": {
      "command": "npx",
      "args": ["-y", "@olaurendeau/mcp-camptocamp"]
    }
  }
}
```

### Docker

Prérequis : [Docker](https://docs.docker.com/get-docker/)

```json
{
  "mcpServers": {
    "camptocamp": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "ghcr.io/olaurendeau/mcp-camptocamp:latest"]
    }
  }
}
```

Pour construire l'image localement :

```bash
docker compose build mcp
```

Puis utiliser l'image locale `mcp-camptocamp-mcp` à la place de `ghcr.io/olaurendeau/mcp-camptocamp:latest`.

## Développement

Prérequis : [Docker](https://docs.docker.com/get-docker/) et [Docker Compose](https://docs.docker.com/compose/)

Toutes les commandes npm passent par Docker via le `Makefile` :

```bash
make install       # Installer les dépendances
make check         # Équivalent du job `checks` de la CI (format, lint, types, couverture, build, tests du hook)
make test          # Lancer les tests
make test-contract # Tests de contrat contre l'API Camptocamp réelle (npm run test:contract, réseau requis, hors make check)
make lint          # Lint ESLint
make typecheck     # Vérification des types
make test-watch    # Tests en mode watch
make build         # Compiler TypeScript
make docker-build  # Construire l'image de production
make help          # Liste toutes les commandes
```

Les tests de contrat tournent aussi chaque lundi via le workflow `Contract` (`.github/workflows/contract.yml`, planifié ou lancé à la main, jamais requis sur une PR) :

- GitHub désactive les workflows planifiés après 60 jours sans activité sur le dépôt : une exécution hebdomadaire absente ne vaut pas succès. GitHub refuse de lancer à la main un workflow désactivé : le réactiver d'abord (`gh workflow enable contract.yml` ou l'onglet Actions), puis le lancer avec `gh workflow run contract.yml`.
- Les échecs des exécutions planifiées sont notifiés à l'utilisateur qui a modifié la ligne `cron` en dernier (après un squash merge, l'auteur de ce commit sur `main`) ou, si le workflow a été réactivé, à l'utilisateur qui l'a réactivé.

## Publication

La publication est automatisée : le tag `vX.Y.Z` déclenche le workflow `publish.yml`, qui publie sur npm, GHCR et le [registre MCP officiel](https://modelcontextprotocol.io/registry). Aucune publication manuelle : le processus (PR de bump, merge, tag) est décrit dans la section [Release de `CONTRIBUTING.md`](CONTRIBUTING.md#release).

## Stack technique

- **Runtime** : Node.js 22 + TypeScript
- **MCP SDK** : `@modelcontextprotocol/sdk`
- **Transport** : stdio
- **Tests** : Vitest
- **Docker** : image multi-stage (`node:22-alpine`)

## Licence

MIT
