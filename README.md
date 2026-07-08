# mcp-camptocamp

Serveur MCP (Model Context Protocol) exposant l'API [Camptocamp.org](https://www.camptocamp.org) aux LLMs. Permet d'interroger des données fiables et à jour sur les itinéraires alpins, les altitudes de sommets et les descriptions de courses — en évitant les hallucinations sur les données d'alpinisme.

## Outils disponibles

| Outil | Description |
|-------|-------------|
| `search_routes` | Recherche des itinéraires par mot-clé (retourne ID, titre, activités, altitude, cotation) |
| `get_route` | Détail complet d'un itinéraire par ID (description, cotations, dénivelé, matériel) |
| `search_waypoints` | Recherche des points de passage par nom (sommets, refuges, bivouacs…) |
| `get_waypoint` | Détail d'un point de passage par ID (altitude, coordonnées GPS, description) |

## Prérequis

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/)

Aucune installation locale de Node.js n'est requise.

## Démarrage rapide

```bash
# Installer les dépendances
docker compose run --rm dev npm install

# Lancer les tests
docker compose run --rm dev npm test

# Construire l'image de production
docker compose build mcp
```

## Intégration Claude Desktop

Après avoir construit l'image (`docker compose build mcp`), ajouter dans la configuration Claude Desktop :

```json
{
  "mcpServers": {
    "camptocamp": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "mcp-camptocamp-mcp"]
    }
  }
}
```

## Développement

```bash
# Vérification des types
docker compose run --rm dev npm run lint

# Tests en mode watch
docker compose run --rm dev npm run test:watch
```

## Stack technique

- **Runtime** : Node.js 22 + TypeScript
- **MCP SDK** : `@modelcontextprotocol/sdk`
- **Transport** : stdio
- **Tests** : Vitest
- **Docker** : image multi-stage (`node:22-alpine`)
