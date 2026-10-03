COMPOSE := docker compose
RUN := $(COMPOSE) run --rm dev
RUN_IT := $(COMPOSE) run --rm -it dev

.DEFAULT_GOAL := help

.PHONY: help install ci check test test-hooks test-watch coverage lint typecheck format build pack docker-build login whoami publish-prep publish shell

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z0-9_-]+:.*##' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

.npm:
	mkdir -p .npm

install: ## Installe les dépendances npm
	$(RUN) npm install

ci: ## Installe les dépendances depuis package-lock.json
	$(RUN) npm ci

test: ci ## Lance les tests
	$(RUN) npm test

test-hooks: ## Teste le hook guard des agents (sur l'hôte : bash + jq)
	tests/hooks/guard.test.sh

test-watch: ci ## Lance les tests en mode watch
	$(RUN) npm run test:watch

coverage: ci ## Lance les tests avec seuils de couverture
	$(RUN) npm run test:coverage

lint: ci ## Lance ESLint
	$(RUN) npm run lint

typecheck: ci ## Vérifie les types TypeScript
	$(RUN) npm run typecheck

format: ci ## Formate le code avec Prettier
	$(RUN) npm run format

check: ci ## Lance le job checks de la CI (format, lint, types, couverture, build)
	$(RUN) npm run check

build: ci ## Compile TypeScript vers dist/
	$(RUN) npm run build

pack: build ## Simule la création du tarball npm
	$(RUN) npm pack --dry-run

docker-build: ## Construit l'image Docker de production
	$(COMPOSE) build mcp

login: .npm ## Authentification npm interactive (2FA)
	$(RUN_IT) npm login

whoami: .npm ## Affiche le compte npm connecté
	$(RUN) npm whoami

publish-prep: ci test build ## Prépare une publication (ci + tests + build)

publish: publish-prep ## Publie sur npm (nécessite make login)
	$(RUN) npm publish --access public

shell: ci ## Ouvre un shell dans le conteneur de dev
	$(RUN_IT) sh
