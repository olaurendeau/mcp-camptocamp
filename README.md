# mcp-camptocamp

Serveur MCP (Model Context Protocol) exposant l'API [Camptocamp.org](https://www.camptocamp.org) aux LLMs. Permet d'interroger des données fiables et à jour sur les itinéraires alpins, les altitudes de sommets et les descriptions de courses — en évitant les hallucinations sur les données d'alpinisme.

<!-- mcp-name: io.github.olaurendeau/mcp-camptocamp -->

## Outils disponibles

| Outil                 | Description                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `search_routes`       | Recherche d'itinéraires (mot-clé, zone, point, activité, cotation, D+, type, configuration) ; paginée     |
| `get_route`           | Détail d'un itinéraire par ID (sommet : titre, texte, cotations, dénivelé, zones, topos, points, sorties) |
| `search_waypoints`    | Recherche des points de passage par nom et/ou zone `area_id` (sommets, refuges, bivouacs…)                |
| `get_waypoint`        | Détail d'un point de passage par ID (altitude, coordonnées GPS, description, zones)                       |
| `search_user_outings` | Liste les sorties (comptes rendus) publiées par un utilisateur Camptocamp, par ID utilisateur             |
| `get_outing`          | Détail d'une sortie par ID (cotations, conditions, météo, participants, itinéraires et leurs cotations)   |
| `search_outings`      | Sorties récentes : mot-clé, zone, activité, dates, période annuelle, itinéraire, point, auteur ; paginée  |
| `search_areas`        | Recherche des zones (massif, département/canton, pays) par nom ; ID réutilisable en `area_id`             |
| `get_area`            | Détail d'une zone par ID (type, résumé, description)                                                      |
| `search_books`        | Recherche de livres (topos, histoire, romans…) par titre uniquement ; auteur/ISBN peu fiables             |
| `get_book`            | Détail d'un livre par ID (auteur, éditeur, date, ISBN, pages, langues, itinéraires, points, articles)     |
| `search_articles`     | Recherche d'articles par mot-clé (matériel, technique, environnement, récits…) ; collab/perso             |
| `get_article`         | Détail d'un article par ID (texte, auteur, type, itinéraires, points, sorties, livres liés)               |

Chaque outil `get_*` commence par le titre et l'ID du document, suivis de son lien camptocamp.org (`**URL**: https://www.camptocamp.org/<routes|waypoints|outings|areas|books|articles>/<id>`) à citer comme source.

`get_route` liste aussi, avec leurs ID, les livres (topos, magazines…) qui couvrent l'itinéraire, ses points de passage (le principal marqué `main waypoint`), les itinéraires voisins, les articles liés et ses sorties récentes (`## Recent outings (10 of 64)`, suivi de `More: search_outings with route_id=<id>` pour les voir toutes). Une liste vide n'imprime pas de section.

Les textes libres écrits par les contributeurs (description, résumé, remarques, matériel, accès, conditions, météo…) sont imprimés entre `[begin user-written text: <champ>]` et `[end user-written text: <champ>]`, avec leurs titres Markdown abaissés de deux niveaux (`#`, `##` et titres soulignés par `===` ou `---`) et une coupe à 8000 caractères (`[truncated, N more characters]`). Les balises d'image Camptocamp deviennent `[image: <légende>]` (rien sans légende) et les liens internes `<libellé> (<type>/<id>)`, par exemple `[[routes/54080/fr|Col des Roches]]` → `Col des Roches (routes/54080)` ; le reste du balisage est conservé. La coupe compte les caractères après cette réécriture. La description de chaque outil `get_*` précise que ce texte est du contenu écrit par les utilisateurs, pas des instructions.

Chaque cotation d'itinéraire ou de sortie est nommée par son système, jamais par un simple `Rating` : `Ski rating (Toponeige): 4.1 | Ski exposure: E2 | Labande: S4 / AD | Global rating: F`, puis engagement, risque, équipement, rocher, artif, glace, mixte, via ferrata, randonnée, raquettes et VTT.

`search_routes` demande au moins un filtre, un seul suffit ; plusieurs se combinent en ET : `query`, `area_id`, `waypoint_id` (itinéraires d'un sommet, refuge…), `activity`, `rating_system` avec `rating_min` et/ou `rating_max` (un système par appel, bornes incluses ; les itinéraires sans cette cotation sont exclus), `height_diff_up_min` / `height_diff_up_max` (D+ en mètres), `route_types` et `configuration` (l'une des valeurs données). Une cotation hors de l'échelle du système ou une valeur hors liste est refusée avant tout appel, avec la liste des valeurs valides : l'API l'ignorerait sans rien dire. L'en-tête rappelle les filtres (`Filters: area 14409, activity skitouring, ski rating (Toponeige) 3.1 → 4.1, elevation gain 1000 → 1500m`) et la réponse se termine par `Next page: offset=N` tant qu'il reste des résultats.

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
make install      # Installer les dépendances
make check        # Équivalent du job `checks` de la CI (format, lint, types, couverture, build, tests du hook)
make test         # Lancer les tests
make lint         # Lint ESLint
make typecheck    # Vérification des types
make test-watch   # Tests en mode watch
make build        # Compiler TypeScript
make docker-build # Construire l'image de production
make help         # Liste toutes les commandes
```

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
