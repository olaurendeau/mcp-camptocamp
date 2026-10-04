# mcp-camptocamp

Serveur MCP (Model Context Protocol) exposant l'API [Camptocamp.org](https://www.camptocamp.org) aux LLMs. Permet d'interroger des données fiables et à jour sur les itinéraires alpins, les altitudes de sommets et les descriptions de courses — en évitant les hallucinations sur les données d'alpinisme.

<!-- mcp-name: io.github.olaurendeau/mcp-camptocamp -->

## Outils disponibles

| Outil                 | Description                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `search_routes`       | Recherche d'itinéraires par mot-clé et/ou `area_id` (ID, sommet : titre, activités, alt., cotation)       |
| `get_route`           | Détail complet d'un itinéraire par ID (sommet : titre, description, cotations, dénivelé, matériel, zones) |
| `search_waypoints`    | Recherche des points de passage par nom et/ou zone `area_id` (sommets, refuges, bivouacs…)                |
| `get_waypoint`        | Détail d'un point de passage par ID (altitude, coordonnées GPS, description, zones)                       |
| `search_user_outings` | Liste les sorties (comptes rendus) publiées par un utilisateur Camptocamp, par ID utilisateur             |
| `get_outing`          | Détail d'une sortie par ID (conditions, météo, participants, itinéraires associés avec leur sommet)       |
| `search_outings`      | Recherche des sorties récentes (mot-clé, zone, activité, dates, itinéraire, point de passage)             |
| `search_areas`        | Recherche des zones (massif, département/canton, pays) par nom ; ID réutilisable en `area_id`             |
| `get_area`            | Détail d'une zone par ID (type, résumé, description)                                                      |
| `search_books`        | Recherche de livres (topos, histoire, romans…) par titre uniquement ; auteur/ISBN peu fiables             |
| `get_book`            | Détail d'un livre par ID (auteur, éditeur, date, ISBN, pages, langues, itinéraires, points, articles)     |
| `search_articles`     | Recherche d'articles par mot-clé (matériel, technique, environnement, récits…) ; collab/perso             |
| `get_article`         | Détail d'un article par ID (texte, auteur, type, itinéraires, points, sorties, livres liés)               |

Chaque outil `get_*` commence par le titre et l'ID du document, suivis de son lien camptocamp.org (`**URL**: https://www.camptocamp.org/<routes|waypoints|outings|areas|books|articles>/<id>`) à citer comme source.

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
