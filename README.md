# mcp-camptocamp

Serveur MCP (Model Context Protocol) exposant l'API [Camptocamp.org](https://www.camptocamp.org) aux LLMs. Permet d'interroger des données fiables et à jour sur les itinéraires alpins, les altitudes de sommets et les descriptions de courses — en évitant les hallucinations sur les données d'alpinisme.

<!-- mcp-name: io.github.olaurendeau/mcp-camptocamp -->

## Outils disponibles

| Outil | Description |
|-------|-------------|
| `search_routes` | Recherche des itinéraires par mot-clé (retourne ID, titre, activités, altitude, cotation) |
| `get_route` | Détail complet d'un itinéraire par ID (description, cotations, dénivelé, matériel) |
| `search_waypoints` | Recherche des points de passage par nom (sommets, refuges, bivouacs…) |
| `get_waypoint` | Détail d'un point de passage par ID (altitude, coordonnées GPS, description) |

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

```bash
# Installer les dépendances
docker compose run --rm dev npm install

# Lancer les tests
docker compose run --rm dev npm test

# Vérification des types
docker compose run --rm dev npm run lint

# Tests en mode watch
docker compose run --rm dev npm run test:watch

# Construire l'image de production
docker compose build mcp
```

## Publication

La publication est automatisée via GitHub Actions à chaque tag `v*` (ex. `v1.0.1`).

### Première publication

1. Créer un compte sur [npmjs.com](https://www.npmjs.com/)
2. Générer un token npm (type « Automation »)
3. Ajouter le secret `NPM_TOKEN` dans les paramètres GitHub du repo (Settings → Secrets and variables → Actions)
4. Rendre le package GHCR public (Settings → Packages → mcp-camptocamp → Change visibility) après le premier push
5. Créer et pousser un tag :

```bash
git tag v1.0.0
git push origin v1.0.0
```

Le workflow publie automatiquement sur npm, GHCR et le [registre MCP officiel](https://modelcontextprotocol.io/registry).

### Publication manuelle

```bash
npm ci && npm test && npm run build
npm publish --access public

# Registre MCP
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher
./mcp-publisher login github
./mcp-publisher publish
```

## Stack technique

- **Runtime** : Node.js 22 + TypeScript
- **MCP SDK** : `@modelcontextprotocol/sdk`
- **Transport** : stdio
- **Tests** : Vitest
- **Docker** : image multi-stage (`node:22-alpine`)

## Licence

MIT
