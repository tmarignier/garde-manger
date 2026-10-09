# Conventions du projet garde-manger

Application web familiale de gestion des stocks d'épicerie. Avant de coder, lire [docs/architecture.md](docs/architecture.md) et l'étape en cours du [plan](docs/plan.md).

## Environnement

- **Node.js 24** (LTS). La version est fixée dans `.nvmrc` et dans `engines` du `package.json`.
- **TypeScript** partout, en mode `strict`. Node.js exécute directement les fichiers `.ts` du serveur et des tests ; seul le code de `client/` est compilé, vers `public/js/`.
- Dépendances : uniquement `typescript` et `@types/node` en développement. Toute nouvelle dépendance suit la [politique de dépendances](docs/architecture.md#politique-de-dépendances) et est ajoutée au tableau de ce document, dans la même pull request.

## Commandes

| Commande | Rôle |
|---|---|
| `npm install` | Installer les dépendances de développement |
| `npm run dev` | Compiler l'interface en continu et lancer le serveur avec rechargement automatique (`node --watch`) |
| `npm start` | Compiler l'interface puis lancer le serveur |
| `npm test` | Lancer les tests (`node --test`) |
| `npm run verifier` | Vérifier les types du serveur et de l'interface (`tsc --noEmit`) |

Avant chaque commit : `npm run verifier` et `npm test` doivent passer.

## Configuration

- Variables d'environnement : `PORT` (défaut `3000`) et `CHEMIN_BASE` (défaut `./donnees/garde-manger.db`).
- Le dossier `donnees/` et `public/js/` ne sont pas versionnés.

## TypeScript

- Options clés de `tsconfig.json` : `strict`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, `module: nodenext`.
- Pas d'`enum`, de `namespace` ni de propriétés de paramètres de constructeur : utiliser des unions de chaînes et des objets `as const`.
- Imports relatifs avec l'extension `.ts`. Imports de types avec `import type`.
- Pas de `any`. Les données venant de l'extérieur (corps de requête, lignes SQLite) sont typées `unknown` puis validées.
- Les types partagés entre serveur et interface vivent dans `commun/types.ts`.
- Modules ES uniquement (`"type": "module"`).

## Style de code

- Indentation de 2 espaces, guillemets simples, points-virgules.
- **Noms en français** pour le domaine (`produit`, `seuilMinimum`, `calculerListeCourses`), en `camelCase` pour les variables et fonctions, `PascalCase` pour les types. Colonnes SQLite en `snake_case`.
- Fonctions courtes et pures dès que possible. La logique métier (calcul de la liste de courses, variations de quantité) ne dépend ni de HTTP ni de SQLite, pour être testée seule.
- Commentaires en français, seulement quand le code ne suffit pas à expliquer le pourquoi.
- Requêtes SQL toujours paramétrées, jamais construites par concaténation.

## Tests

- Fichiers `tests/*.test.ts`, avec `node:test` et `node:assert/strict`.
- Logique métier : tests unitaires.
- API : tests qui démarrent le serveur sur un port libre avec une base SQLite en mémoire (`:memory:`).
- Chaque correction de bug commence par un test qui le reproduit.

## Git

- Une branche et une pull request par étape du plan ou par fonctionnalité.
- Messages de commit en français, à l'impératif (« Ajoute le calcul de la liste de courses »).
- La documentation est mise à jour dans la même pull request que le code qu'elle décrit.
