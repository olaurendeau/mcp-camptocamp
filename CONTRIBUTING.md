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

### Documentation des outils

Chaque outil MCP a sa page de référence `docs/tools/<outil>.md`. Une PR qui change un outil met sa page à jour dans la même PR :

- **Entrées** : après tout changement du schéma d'entrée, lancer `docker compose run --rm dev npm run docs:tools`, qui régénère le bloc _Inputs_ entre les marqueurs `generated:inputs`. Ce bloc ne s'édite jamais à la main, et `make check` échoue tant qu'il ne correspond pas au schéma enregistré.
- **Sortie** : quand la sortie change, mettre à jour à la main les sections _Output format_, _Example_ et _Limits_. Un exemple recapturé dit d'où il vient : `captured from vX.Y.Z on <date>`, ou `captured from main at <sha> on <date>, with a local build` tant que la sortie n'est dans aucune release.
- **Résumé** : la ligne de l'outil dans `README.md` (section _Tools_) et dans l'index `docs/tools/README.md` ne change que si son résumé d'une ligne change. Le README n'a pas de paragraphe par outil : le détail va dans `docs/tools/`.
- **Nouvel outil** : `npm run docs:tools` crée sa page (_Purpose_, _Inputs_, _Related tools_) ; écrire les autres sections et ajouter l'outil aux deux index, ce que `make check` vérifie.

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

Chaque décision est tracée en commentaire de l'issue, avec trois exceptions : une décision prise avant que l'epic existe va dans le corps de l'epic, sous **Decisions** ; le tri des suggestions d'une revue est posté en un seul commentaire de la PR ; le rejet d'un point bloquant est tracé sur la PR (voir [Rejeter un point bloquant](#rejeter-un-point-bloquant)). Une revue est _clean_ quand elle n'a aucun point bloquant ; le coordinateur trie les suggestions (correction, issue de suivi ou rejet motivé) avant de merger.

Pour lancer une session avec un autre rôle : `claude --agent <nom>`.

## Revue par un agent indépendant

L'agent qui code ne relit jamais son propre travail. La revue est faite par le sous-agent [`pr-reviewer`](.claude/agents/pr-reviewer.md), lancé dans un contexte vierge : il ne voit que le diff, la description de la PR, le repo et, parmi les commentaires de la PR, les seuls commentaires `Decision: finding "…" rejected by the human` (voir [Rejeter un point bloquant](#rejeter-un-point-bloquant)). Il ignore tous les autres commentaires, revues précédentes comprises.

Le coordinateur la lance après chaque ouverture ou mise à jour de PR. L'agent poste sa revue en commentaire de la PR, puis pose le commit status `agent-review` (`success` ou `failure`) sur le SHA qu'il a relu. La protection de `main` exige ce status : sans revue, ou après un nouveau push, le merge reste bloqué.

Le hook [`.claude/hooks/guard.sh`](.claude/hooks/guard.sh) (`PreToolUse` sur `Bash`) fait respecter les rôles dans les sessions Claude Code de ce repo :

| Commande                                                                                                                                                                                                                               | Autorisée pour                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| merge de PR (`gh pr merge`, ou `PUT …/pulls/N/merge` via l'API)                                                                                                                                                                        | `coordinator` uniquement                                        |
| écriture du status `agent-review`                                                                                                                                                                                                      | `pr-reviewer` uniquement                                        |
| bump de version : `npm version X.Y.Z --no-git-tag-version` (sans ce flag, `npm version` crée aussi un tag)                                                                                                                             | `developer` uniquement                                          |
| tag de version : `git tag v*`, push d'un tag nommé (`v*`, `refs/tags/`), création par l'API (`POST …/git/refs` via `gh api` ou `curl`, mutation GraphQL `createRef`), sauf si l'appel vise `refs/heads/` ; `git tag -l` reste libre    | `coordinator` uniquement                                        |
| push en masse (`--tags`, `--follow-tags`, `--mirror`, refspec glob comme `refs/tags/*`, activation de `push.followTags`), déplacement ou suppression d'un tag `v*` (`git tag -f/-d`, push forcé, refspec `+v…` ou push de suppression) | personne : un tag repoussé republierait une version déjà sortie |
| par l'API (`gh api` ou `curl`) : déplacement ou suppression d'un tag (`PATCH`/`DELETE …/git/refs/…`, mutation GraphQL `updateRef`/`deleteRef`, `updateRefs` sauf si l'appel vise `refs/heads/`), écriture sur `…/releases`             | personne : un tag `v*` déclencherait `publish.yml`              |
| publication manuelle : `npm publish`, `make publish`, `mcp-publisher publish`, `gh release create/upload/edit/delete`                                                                                                                  | personne : seul `publish.yml` publie, déclenché par le tag      |

Le hook contrôle chaque commande d'une chaîne (`&&`, `||`, `;`, `|`, `&`) séparément, sans couper à l'intérieur des guillemets. Le code qu'une commande fait exécuter (`$(…)`, `` `…` ``, `sh -c '…'`, `eval "…"`) est contrôlé comme une commande à part. Une exemption (`git tag -l`, `--method GET`, `--no-git-tag-version`, `refs/heads/`) ne vaut que pour sa propre commande : `git push origin HEAD:refs/heads/x && gh api …/git/refs --input ref.json` reste une création de tag possible. Un corps lu sur l'entrée standard (`--input -`, `-d @-`) ne compte que s'il vient du heredoc ou de la here-string de la commande elle-même ; lu dans un fichier ou par un pipe, il est inconnu et n'exempte rien. `updateRef` et `deleteRef` désignent leur ref par un `refId` : la commande ne nomme jamais leur cible, donc aucun `refs/heads/` ne les exempte. Une mutation GraphQL est cherchée dans toute la ligne, car elle peut venir d'une variable posée par une autre commande. Un mot de lecture (`view`, `info`, `show`, `v`, `run`, `run-script`) pris comme valeur d'option ne désactive pas la règle de bump : une option, un mot de lecture puis `version` suivi d'un argument (`npm --tag v version patch`) restent un bump, au prix de faux positifs rares comme `npm --json view version patch` ou `npm --silent run version foo`. Pour les règles de merge et de release, il ignore le texte : arguments de message, de titre ou de corps (`-m`, `--body`, `--title`…), arguments d'`echo`/`printf`/`grep`/`awk`/`sed`, commentaires `#`, et corps de heredoc qui ne sont pas passés à un shell (`sh`, `bash`, `/bin/sh`…). Un commentaire de PR ou un message de commit peut donc citer ces commandes, alors que `sh -c "…"`, `bash -c '…'` et `$(…)` restent contrôlés, y compris dans un texte entre guillemets doubles. La règle `agent-review` regarde aussi dans les chaînes et les heredocs, où se trouve souvent le contexte du status. Le hook a besoin de `jq` et `perl` sur l'hôte ; s'il lui en manque un ou s'il plante, il bloque la commande. C'est un garde-fou pour les agents, pas une frontière de sécurité : l'humain n'est pas concerné, et une commande volontairement obfusquée passerait. Limite connue : un corps ou une requête lus dans un fichier (`--input ref.json`, `-F query=@move.graphql`, `curl -d @body.json`) ne sont jamais inspectés, donc un `updateRef` écrit dans un fichier passe encore pour le `coordinator`. Tests : `make test-hooks`, lancés aussi par `make check` et en CI.

### Rejeter un point bloquant

Un point bloquant ne doit disparaître que de deux façons : le développeur le corrige, ou l'humain le rejette. Le rejet par l'humain est le seul moyen de passer une revue bloquante sans correction ; ni le coordinateur ni le développeur ne peuvent l'écarter seuls.

1. Le développeur conteste le point avec une raison, ou le même point survit à deux cycles de correction.
2. Le coordinateur tranche : si le point est fondé, il le renvoie au développeur comme correction obligatoire ; s'il le juge faux positif, il pose la question à l'humain (label `needs-human` sur l'issue de la tâche pendant l'attente, retiré après la réponse).
3. Si l'humain confirme le rejet, le coordinateur poste sur la PR `Decision: finding "<point>" rejected by the human — Reason: …`, puis relance la revue. Le reviewer traite ce point comme réglé : au plus une mention en suggestion, jamais en bloquant.

Ce commentaire va sur la PR, et non sur l'issue, parce que le reviewer ne lit que la PR.

C'est une convention, pas un contrôle technique : les agents écrivent sur GitHub avec le même compte que l'humain et le hook ne filtre pas les commentaires, donc n'importe quel agent pourrait techniquement poster ce commentaire. Seul le coordinateur le poste, et uniquement après la réponse de l'humain. Cette réponse passe par `AskUserQuestion` et ne laisse aucune trace sur GitHub : la seule trace vérifiable est le commentaire `Decision: finding "…" rejected by the human — Reason: …` posté sur la PR, qui ne prouve pas à lui seul que l'humain a répondu.

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
5. Une fois `vX.Y.Z` publiée, un `developer` ouvre une PR `docs:` qui remet à jour ce qui dépend d'une date ou d'une version :
   - **Pages clients** : pour chaque page qui finit par `Last verified: <date> against official docs` (`docs/clients/*.md`, `docs/agent-sdks.md`, `docs/getting-started.md`, `docs/troubleshooting.md`), relire chaque lien de sa liste _Sources_, corriger la page si la doc officielle a changé, puis mettre la date du jour dans cette ligne et, si la page a une ligne dans la matrice de `docs/README.md` (pages clients et `docs/agent-sdks.md` ; `getting-started.md` et `troubleshooting.md` n'en ont pas), dans sa colonne _Last verified_ (le test des docs vérifie que les deux dates concordent).
   - **Mesures** : refaire sur `vX.Y.Z` chaque mesure liée à une version et mettre à jour sa version, sa date et ses chiffres, ainsi que ce que la page en conclut. Exemple : le paragraphe `Measured on v1.3.0` de `docs/clients/claude-code.md` mesure les instructions et les descriptions d'outils face à la coupure à 2 048 caractères ; la description de `search_outings` passe de 2 241 à 2 015 caractères à la release suivante, donc « Claude Code drops its last two sentences » et la recette « To keep the whole `search_outings` description » sont à réécrire.
   - **Exemples capturés depuis `main`** : recapturer depuis `vX.Y.Z` chaque exemple `captured from main at <sha>` (`docs/using-with-llms.md`, `docs/tools/*.md`) et le réétiqueter `captured from vX.Y.Z on <date>`.
   - **Notes de version** : réécrire en `vX.Y.Z or later` les notes sur ce que la release précédente n'avait pas et que `vX.Y.Z` apporte : `not in v1.3.0`, `the release after v1.3.0`, `after v1.3.0`, `comes with the next release` (`docs/`, `docs/system-prompt.md` compris, et la ligne `search_articles` de `README.md`), ainsi que `refused by v1.3.0` (`docs/tools/search_articles.md`) et `v1.3.0 prints the same output without…` (`docs/tools/get_area.md`).

   Pour tout retrouver : `grep -rnE 'Last verified|Measured on v|captured from main|not in v[0-9]|after v[0-9]|next release' docs README.md`, puis `grep -rnF 'v<version précédente>' docs README.md` pour les autres mentions de la version précédente. `vX.Y.Z or later` et `captured from vX.Y.Z` restent vrais et ne changent pas.

### Prérequis externes (déjà en place)

`publish.yml` dépend d'une configuration faite hors du repo. Renommer `publish.yml`, renommer ou transférer le repo casse la publication suivante tant qu'elle n'est pas refaite :

- **npm Trusted Publisher** sur `@olaurendeau/mcp-camptocamp` (npmjs.com → Settings → Trusted Publisher → GitHub Actions) : utilisateur `olaurendeau`, repo `mcp-camptocamp`, workflow `publish.yml`. L'étape npm de `publish.yml` n'utilise aucun token : elle repose uniquement sur ce lien (OIDC). Option _Require two-factor authentication and disallow tokens_ activée dans _Publishing access_.
- **GHCR** : le package `ghcr.io/olaurendeau/mcp-camptocamp` a été rendu public à la main après le premier push (Settings → Packages → Change visibility).
- **Registre MCP** : `mcp-publisher login github-oidc` n'accepte le nom `io.github.olaurendeau/…` que depuis un repo du compte `olaurendeau`.

Aucun agent ne publie à la main : le hook bloque `npm publish`, `make publish`, `mcp-publisher publish` et `gh release …`. Il bloque aussi `git push --tags` / `--follow-tags` / `--mirror`, les refspecs glob (`refs/tags/*`), l'activation de `push.followTags`, tout déplacement ou suppression d'un tag de version (refspec `+vX.Y.Z`, `PATCH`/`DELETE` REST et mutations GraphQL `updateRef`/`updateRefs`/`deleteRef` compris, `coordinator` inclus), et la création d'une release par l'API ; seul le `coordinator` peut créer un tag par l'API (`POST …/git/refs`, `createRef`). Une écriture de ref par l'API n'est libre pour tous que si l'appel lui-même vise une branche (`refs/heads/`). Corriger un tag est une décision de l'humain.
