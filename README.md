# garde-manger

Application web pour gérer les stocks d'épicerie de la maison et préparer les courses sereinement, utilisable sur iPhone et sur ordinateur.

## Démarrer

Il faut Node.js 24 (voir `.nvmrc`).

```sh
npm install
npm run dev
```

L'application est alors disponible sur <http://localhost:3000>. Les données sont enregistrées dans `data/garde-manger.db`.

Au premier lancement, l'application demande de créer le premier compte, qui devient administrateur. Il crée ensuite les comptes des autres membres de la famille depuis l'écran « Comptes ».

## Installer

L'application s'installe comme add-on Home Assistant, en ajoutant ce dépôt dans la boutique des modules complémentaires :

[![Ajouter le dépôt à Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Ftmarignier%2Fgarde-manger)

Le [guide d'installation](docs/installation.md) détaille l'installation, les comptes, l'accès depuis les téléphones et l'installation sans Home Assistant.

## Documentation

- [Vision](docs/vision.md) : pourquoi ce projet, pour qui, et ce qu'il n'est pas.
- [Fonctionnalités](docs/fonctionnalites.md) : le périmètre de la première version et la suite.
- [Architecture](docs/architecture.md) : les choix techniques.
- [Plan de développement](docs/plan.md) : les étapes pour construire la première version.
- [Installation](docs/installation.md) : l'add-on Home Assistant, les téléphones, l'accès depuis l'extérieur, les mises à jour et l'installation sans Home Assistant.
- [Publier une version](docs/publication.md) : pour le mainteneur, la publication des versions et les tests d'une version de développement.

Les conventions de développement sont dans [CLAUDE.md](CLAUDE.md).

## Licence

Garde-manger est distribué sous [licence MIT](LICENSE).
