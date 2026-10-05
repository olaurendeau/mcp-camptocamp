## Pourquoi

<!-- Le problème ou le besoin. Lien vers l'issue si elle existe (Closes #…). -->

## Quoi

<!-- Les changements, en quelques puces. -->

## Comment vérifier

<!-- Tests ajoutés, commandes lancées, exemples d'appels MCP. -->

## Checklist

- [ ] Titre au format Conventional Commits (`feat: …`, `fix: …`, `chore: …`)
- [ ] ≤ 1000 lignes modifiées (hors `package-lock.json`)
- [ ] `make check` passe en local
- [ ] Tests ajoutés ou mis à jour pour tout changement de comportement
- [ ] Outil MCP changé : `docs/tools/<outil>.md` à jour (`npm run docs:tools` si le schéma d'entrée change, _Output format_ / _Example_ / _Limits_ si la sortie change), lignes du README et de l'index `docs/tools/README.md` seulement si le résumé change, CLAUDE.md si l'architecture ou le comportement change
