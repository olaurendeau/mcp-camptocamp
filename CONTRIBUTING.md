# Contribuer

Tout changement arrive sur `main` par une pull request qui passe la CI et une revue d'agent indépendant. Personne ne pousse directement sur `main`, admin compris.

## Cycle d'une PR

1. **Branche** depuis `main` : `feat/…`, `fix/…`, `chore/…`, `docs/…`.
2. **Code + tests.** `make check` doit passer en local : il lance le job `checks` de la CI (format, lint, types, couverture, build). Les autres checks (`docker`, `audit`, `pr-size`, `pr-title`) ne tournent qu'en CI.
3. **PR** avec un titre [Conventional Commits](https://www.conventionalcommits.org/) (`feat: add search_outings tool`). Le titre devient le message du commit squashé sur `main`.
4. **CI** : tous les checks requis passent au vert.
5. **Revue agent** : un agent _qui n'a pas écrit le code_ relit la PR et pose le status `agent-review` sur le commit de tête (voir plus bas).
6. **Corrections** : chaque nouveau push invalide la revue, qu'il faut relancer sur le nouveau SHA.
7. **Merge** en squash ; la branche est supprimée automatiquement.

## Règles

| Règle        | Seuil                                              | Vérifié par                 |
| ------------ | -------------------------------------------------- | --------------------------- |
| Taille de PR | ≤ 1000 lignes modifiées, `package-lock.json` exclu | check `pr-size`             |
| Titre de PR  | Conventional Commits                               | check `pr-title`            |
| Formatage    | Prettier                                           | check `checks`              |
| Lint         | ESLint (`typescript-eslint` strict)                | check `checks`              |
| Types        | `tsc` sur `src/`, `tests/` et `vitest.config.ts`   | check `checks`              |
| Couverture   | ≥ 80 % (lignes, fonctions, statements, branches)   | check `checks`              |
| Build        | `tsc` + image Docker                               | checks `checks` et `docker` |
| Dépendances  | aucune vulnérabilité _high_ en production          | check `audit`               |
| Revue        | agent indépendant, verdict sans point bloquant     | status `agent-review`       |

Une PR qui dépasse 1000 lignes se découpe : d'abord le refactoring préparatoire, puis la fonctionnalité, puis la doc.

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
- **Release** : bump de version, tag, publication npm / GHCR / registre MCP.

Chaque décision est tracée en commentaire de l'issue. Une revue est _clean_ quand elle n'a aucun point bloquant ; le coordinateur trie les suggestions (correction, issue de suivi ou rejet motivé) avant de merger.

Pour lancer une session avec un autre rôle : `claude --agent <nom>`.

## Revue par un agent indépendant

L'agent qui code ne relit jamais son propre travail. La revue est faite par le sous-agent [`pr-reviewer`](.claude/agents/pr-reviewer.md), lancé dans un contexte vierge : il ne voit que le diff, la description de la PR et le repo.

Le coordinateur la lance après chaque ouverture ou mise à jour de PR. L'agent poste sa revue en commentaire de la PR, puis pose le commit status `agent-review` (`success` ou `failure`) sur le SHA qu'il a relu. La protection de `main` exige ce status : sans revue, ou après un nouveau push, le merge reste bloqué.

Le hook [`.claude/hooks/guard.sh`](.claude/hooks/guard.sh) (`PreToolUse` sur `Bash`) fait respecter les rôles dans les sessions Claude Code de ce repo :

| Commande                                                                                                                        | Autorisée pour                               |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `gh pr merge`                                                                                                                   | `coordinator` uniquement                     |
| écriture du status `agent-review`                                                                                               | `pr-reviewer` uniquement                     |
| release : `npm publish`, `make publish`, tag `v*`, push de tag, `gh release create/upload/edit/delete`, `mcp-publisher publish` | personne : la release est faite par l'humain |

Pour les règles de merge et de release, le hook ignore le texte : arguments de message, de titre ou de corps (`-m`, `--body`, `--title`…), arguments d'`echo`/`printf`, et corps de heredoc qui ne sont pas passés à un shell. Un commentaire de PR ou un message de commit peut donc citer ces commandes, alors que `sh -c "…"`, `bash -c '…'` et `$(…)` restent contrôlés. La règle `agent-review` regarde aussi dans les chaînes et les heredocs, où se trouve souvent le contexte du status. Le hook a besoin de `jq` et `perl` sur l'hôte ; s'il lui en manque un ou s'il plante, il bloque la commande. C'est un garde-fou pour les agents, pas une frontière de sécurité : l'humain n'est pas concerné, et une commande volontairement obfusquée passerait. Tests : `make test-hooks`, lancés aussi par `make check` et en CI.

## Protection de `main`

Configurée par un ruleset GitHub :

- PR obligatoire, merge en squash uniquement, historique linéaire ;
- checks requis : `checks`, `pr-size`, `pr-title`, `docker`, `audit`, `agent-review` ;
- force-push et suppression de branche interdits ;
- 0 approbation humaine requise (un mainteneur seul ne peut pas approuver ses propres PR).

## Release

Inchangée : bump de version via une PR, puis tag `vX.Y.Z` sur `main`, qui déclenche `publish.yml`.
