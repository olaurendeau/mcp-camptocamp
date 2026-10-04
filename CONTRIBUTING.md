# Contribuer

Tout changement arrive sur `main` par une pull request qui passe la CI et une revue d'agent indépendant. Personne ne pousse directement sur `main`, admin compris.

## Cycle d'une PR

1. **Branche** depuis `main` : `feat/…`, `fix/…`, `chore/…`, `docs/…`.
2. **Code + tests.** `make check` doit passer en local : il lance les étapes du job `checks` de la CI sous Node 22 : format, lint, types, couverture, build et tests du hook (`make test-hooks`). En CI, ces étapes tournent sous Node 22 et 24 (`checks (node 22)`, `checks (node 24)`), les versions couvertes par `engines.node` ; le check `checks` ne passe que si les deux passent. Les autres checks (`docker`, `audit`, `pr-size`, `pr-title`) ne tournent qu'en CI.
3. **PR** avec un titre [Conventional Commits](https://www.conventionalcommits.org/) (`feat: add search_outings tool`). Le titre devient le message du commit squashé sur `main`.
4. **CI** : tous les checks requis passent au vert.
5. **Revue agent** : un agent _qui n'a pas écrit le code_ relit la PR et pose le status `agent-review` sur le commit de tête (voir plus bas).
6. **Corrections** : chaque nouveau push invalide la revue, qu'il faut relancer sur le nouveau SHA.
7. **Merge** en squash ; la branche est supprimée automatiquement.

## Règles

| Règle        | Seuil                                                                                     | Vérifié par                 |
| ------------ | ----------------------------------------------------------------------------------------- | --------------------------- |
| Taille de PR | ≤ 1000 lignes modifiées, `package-lock.json` exclu                                        | check `pr-size`             |
| Titre de PR  | Conventional Commits                                                                      | check `pr-title`            |
| Formatage    | Prettier                                                                                  | check `checks`              |
| Lint         | ESLint 10 (`typescript-eslint` `strictTypeChecked`)                                       | check `checks`              |
| Types        | `tsc` strict sur `src/`, `tests/` (sans `noUncheckedIndexedAccess`) et `vitest.config.ts` | check `checks`              |
| Couverture   | ≥ 95 % (lignes, fonctions, statements), ≥ 90 % (branches)                                 | check `checks`              |
| Build        | `tsc` + image Docker                                                                      | checks `checks` et `docker` |
| Dépendances  | aucune vulnérabilité _high_ en production                                                 | check `audit`               |
| Revue        | agent indépendant, verdict sans point bloquant                                            | status `agent-review`       |

Une PR qui dépasse 1000 lignes se découpe : d'abord le refactoring préparatoire, puis la fonctionnalité, puis la doc.

### Suivi des dépendances

- **Dependabot** ([`.github/dependabot.yml`](.github/dependabot.yml)) propose chaque lundi les mises à jour npm, GitHub Actions et Docker. Les montées mineures et correctives npm sont groupées (une PR pour la production, une pour le dev) ; chaque montée majeure npm arrive seule et reste une décision de l'humain. Les mises à jour de sécurité arrivent sans délai, une PR chacune. Une PR Dependabot suit le même cycle que les autres : checks requis, revue agent, merge par le coordinateur.
- **Audit hebdomadaire** ([`.github/workflows/audit.yml`](.github/workflows/audit.yml), lundi et à la demande, jamais requis) : échoue sur toute vulnérabilité _moderate_ ou plus en production. L'audit complet (dépendances de dev comprises) échoue sur toute vulnérabilité _high_ ou plus.

## Équipe d'agents

Dans ce repo, la session Claude Code est le **coordinateur** ([`coordinator`](.claude/agents/coordinator.md), activé par `.claude/settings.json`). C'est à lui que l'humain s'adresse. Il planifie, pose les questions, distribue le travail et merge.

| Rôle             | Agent                                                    | Produit                                                             |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| Product designer | [`product-designer`](.claude/agents/product-designer.md) | problème, user stories, critères d'acceptation → issue `epic`       |
| Architecte       | [`architect`](.claude/agents/architect.md)               | design technique, découpage en tâches ≤ 1000 lignes → issues `task` |
| Développeur      | [`developer`](.claude/agents/developer.md)               | une PR par tâche, test-first, dans un worktree isolé                |
| Reviewer         | [`pr-reviewer`](.claude/agents/pr-reviewer.md)           | revue + status `agent-review`                                       |

Chaque agent termine par un rapport `Status` / `Deliverables`, complété par `Decisions needed` (designer, architecte, développeur) ou par les points bloquants et suggestions (reviewer). Le coordinateur tranche lui-même, sauf pour quatre catégories qu'il remonte toujours à l'humain (label `needs-human` pendant l'attente) :

- **Périmètre / produit** : ajout, retrait ou renommage d'un outil MCP, changement visible par l'utilisateur, écart avec la demande ;
- **Dépendances** : nouvelle dépendance runtime, montée de version majeure ;
- **Process / sécurité** : CI, ruleset, seuils de qualité, hooks, définitions des agents ;
- **Release** : la décision de publier et le numéro de version (l'exécution suit la section [Release](#release)).

Chaque décision est tracée en commentaire de l'issue. Une revue est _clean_ quand elle n'a aucun point bloquant ; le coordinateur trie les suggestions (correction, issue de suivi ou rejet motivé) avant de merger.

Pour lancer une session avec un autre rôle : `claude --agent <nom>`.

## Revue par un agent indépendant

L'agent qui code ne relit jamais son propre travail. La revue est faite par le sous-agent [`pr-reviewer`](.claude/agents/pr-reviewer.md), lancé dans un contexte vierge : il ne voit que le diff, la description de la PR et le repo.

Le coordinateur la lance après chaque ouverture ou mise à jour de PR. L'agent poste sa revue en commentaire de la PR, puis pose le commit status `agent-review` (`success` ou `failure`) sur le SHA qu'il a relu. La protection de `main` exige ce status : sans revue, ou après un nouveau push, le merge reste bloqué.

Le hook [`.claude/hooks/guard.sh`](.claude/hooks/guard.sh) (`PreToolUse` sur `Bash`) fait respecter les rôles dans les sessions Claude Code de ce repo :

| Commande                                                                                                                            | Autorisée pour                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| merge de PR (`gh pr merge`, ou `PUT …/pulls/N/merge` via l'API)                                                                     | `coordinator` uniquement                                        |
| écriture du status `agent-review`                                                                                                   | `pr-reviewer` uniquement                                        |
| bump de version : `npm version X.Y.Z --no-git-tag-version` (sans ce flag, `npm version` crée aussi un tag)                          | `developer` uniquement                                          |
| tag de version : `git tag v*`, push d'un tag nommé (`v*`, `refs/tags/`) ; `git tag -l` reste libre                                  | `coordinator` uniquement                                        |
| push en masse (`--tags`, `--follow-tags`), déplacement ou suppression d'un tag `v*` (`git tag -f/-d`, push forcé ou de suppression) | personne : un tag repoussé republierait une version déjà sortie |
| publication manuelle : `npm publish`, `make publish`, `mcp-publisher publish`, `gh release create/upload/edit/delete`               | personne : seul `publish.yml` publie, déclenché par le tag      |

Le hook contrôle chaque commande d'une chaîne (`&&`, `||`, `;`, `|`) séparément. Pour les règles de merge et de release, il ignore le texte : arguments de message, de titre ou de corps (`-m`, `--body`, `--title`…), arguments d'`echo`/`printf`/`grep`, et corps de heredoc qui ne sont pas passés à un shell. Un commentaire de PR ou un message de commit peut donc citer ces commandes, alors que `sh -c "…"`, `bash -c '…'` et `$(…)` restent contrôlés. La règle `agent-review` regarde aussi dans les chaînes et les heredocs, où se trouve souvent le contexte du status. Le hook a besoin de `jq` et `perl` sur l'hôte ; s'il lui en manque un ou s'il plante, il bloque la commande. C'est un garde-fou pour les agents, pas une frontière de sécurité : l'humain n'est pas concerné, et une commande volontairement obfusquée passerait. Tests : `make test-hooks`, lancés aussi par `make check` et en CI.

## Protection de `main`

Configurée par un ruleset GitHub :

- PR obligatoire, merge en squash uniquement, historique linéaire ;
- checks requis : `checks`, `pr-size`, `pr-title`, `docker`, `audit`, `agent-review` ;
- force-push et suppression de branche interdits ;
- 0 approbation humaine requise (un mainteneur seul ne peut pas approuver ses propres PR).

## Release

Une release n'a lieu que quand l'humain la demande : la décision de publier et le numéro de version lui reviennent.

1. L'humain demande la release et fixe la version `X.Y.Z`.
2. Un `developer` ouvre la PR de bump (`package.json`, `package-lock.json`, `server.json`) : `npm version X.Y.Z --no-git-tag-version` dans le conteneur de dev, puis `server.json` à la main.
3. Le `coordinator` la merge, comme toute PR.
4. Le `coordinator` pose le tag `vX.Y.Z` sur le commit de merge de la PR de bump (`gh pr view <N> --json mergeCommit`) et pousse ce seul tag (`git push origin vX.Y.Z`), ce qui déclenche `publish.yml` (npm, GHCR, registre MCP).

### Prérequis externes (déjà en place)

`publish.yml` dépend d'une configuration faite hors du repo. Renommer `publish.yml`, renommer ou transférer le repo casse la publication suivante tant qu'elle n'est pas refaite :

- **npm Trusted Publisher** sur `@olaurendeau/mcp-camptocamp` (npmjs.com → Settings → Trusted Publisher → GitHub Actions) : utilisateur `olaurendeau`, repo `mcp-camptocamp`, workflow `publish.yml`. L'étape npm de `publish.yml` n'utilise aucun token : elle repose uniquement sur ce lien (OIDC). Option _Require two-factor authentication and disallow tokens_ activée dans _Publishing access_.
- **GHCR** : le package `ghcr.io/olaurendeau/mcp-camptocamp` a été rendu public à la main après le premier push (Settings → Packages → Change visibility).
- **Registre MCP** : `mcp-publisher login github-oidc` n'accepte le nom `io.github.olaurendeau/…` que depuis un repo du compte `olaurendeau`.

Aucun agent ne publie à la main : le hook bloque `npm publish`, `make publish`, `mcp-publisher publish` et `gh release …`. Il bloque aussi `git push --tags` / `--follow-tags` et tout déplacement ou suppression d'un tag de version ; corriger un tag est une décision de l'humain.
