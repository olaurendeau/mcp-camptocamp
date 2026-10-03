# mcp-camptocamp

Serveur MCP (Model Context Protocol) exposant l'API [Camptocamp.org](https://www.camptocamp.org) aux LLMs. Permet d'interroger des données fiables et à jour sur les itinéraires alpins, les altitudes de sommets et les descriptions de courses — en évitant les hallucinations sur les données d'alpinisme.

<!-- mcp-name: io.github.olaurendeau/mcp-camptocamp -->

## Outils disponibles

| Outil                 | Description                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `search_routes`       | Recherche d'itinéraires par mot-clé et/ou `area_id` (ID, titre, activités, alt., cotation)    |
| `get_route`           | Détail complet d'un itinéraire par ID (description, cotations, dénivelé, matériel, zones)     |
| `search_waypoints`    | Recherche des points de passage par nom et/ou zone `area_id` (sommets, refuges, bivouacs…)    |
| `get_waypoint`        | Détail d'un point de passage par ID (altitude, coordonnées GPS, description, zones)           |
| `search_user_outings` | Liste les sorties (comptes rendus) publiées par un utilisateur Camptocamp, par ID utilisateur |
| `get_outing`          | Détail d'une sortie par ID (conditions, météo, participants, itinéraires associés)            |
| `search_outings`      | Recherche des sorties récentes (mot-clé, zone, activité, dates, itinéraire, point de passage) |
| `search_areas`        | Recherche des zones (massif, département/canton, pays) par nom ; ID réutilisable en `area_id` |
| `get_area`            | Détail d'une zone par ID (type, résumé, description)                                          |
| `search_books`        | Recherche de livres (topos, histoire, romans…) par titre uniquement ; auteur/ISBN peu fiables |
| `get_book`            | Détail d'un livre par ID (auteur, éditeur, date, ISBN, pages, itinéraires et points couverts) |

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
make test         # Lancer les tests
make lint         # Vérification des types
make test-watch   # Tests en mode watch
make build        # Compiler TypeScript
make docker-build # Construire l'image de production
make help         # Liste toutes les commandes
```

## Publication

La publication est automatisée via GitHub Actions à chaque tag `v*` (ex. `v1.0.1`).

### Première publication

**Étape 1 — Publier une première fois manuellement** (une seule fois, avec ta 2FA) :

```bash
make login          # authentification interactive avec 2FA
make publish        # ci + tests + build + npm publish
```

Les identifiants npm sont stockés localement dans `.npm/` (ignoré par git).

**Étape 2 — Configurer Trusted Publishing sur npm** (remplace le token CI/CD) :

1. Va sur [npmjs.com](https://www.npmjs.com/) → ton package `@olaurendeau/mcp-camptocamp` → **Settings**
2. Section **Trusted Publisher** → choisis **GitHub Actions**
3. Renseigne exactement :
   - **Organization or user** : `olaurendeau`
   - **Repository** : `mcp-camptocamp`
   - **Workflow filename** : `publish.yml`
4. (Recommandé) Dans **Publishing access**, active **Require two-factor authentication and disallow tokens**

**Étape 3 — Publier via GitHub Actions** :

```bash
git tag v1.0.0
git push origin v1.0.0
```

Le workflow publie automatiquement sur npm (via OIDC, sans token), GHCR et le [registre MCP officiel](https://modelcontextprotocol.io/registry).

Après le premier push Docker, rendre le package GHCR public : Settings → Packages → mcp-camptocamp → Change visibility.

### Publication manuelle

```bash
make publish

# Registre MCP (nécessite mcp-publisher installé sur l'hôte)
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
