# Contribuer

Tout changement arrive sur `main` par une pull request qui passe la CI et une revue d'agent indépendant. Personne ne pousse directement sur `main`, admin compris.

## Cycle d'une PR

1. **Branche** depuis `main` : `feat/…`, `fix/…`, `chore/…`, `docs/…`.
2. **Code + tests.** `make check` doit passer en local : c'est exactement ce que lance la CI.
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

## Revue par un agent indépendant

L'agent qui code ne relit jamais son propre travail. La revue est faite par le sous-agent [`pr-reviewer`](.claude/agents/pr-reviewer.md), lancé dans un contexte vierge : il ne voit que le diff, la description de la PR et le repo.

Depuis Claude Code :

```
> lance l'agent pr-reviewer sur la PR 12
```

L'agent poste sa revue en commentaire de la PR, puis pose le commit status `agent-review` (`success` ou `failure`) sur le SHA qu'il a relu. La protection de `main` exige ce status : sans revue, ou après un nouveau push, le merge reste bloqué.

> Limite connue : le status est posé avec ton token GitHub, donc rien n'empêche techniquement un autre agent de le poser. La règle « seul `pr-reviewer` pose `agent-review` » est une convention, inscrite dans `CLAUDE.md`.

## Protection de `main`

Configurée par un ruleset GitHub :

- PR obligatoire, merge en squash uniquement, historique linéaire ;
- checks requis : `checks`, `pr-size`, `pr-title`, `docker`, `audit`, `agent-review` ;
- force-push et suppression de branche interdits ;
- 0 approbation humaine requise (un mainteneur seul ne peut pas approuver ses propres PR).

## Release

Inchangée : bump de version via une PR, puis tag `vX.Y.Z` sur `main`, qui déclenche `publish.yml`.
