# Plan de développement

La première version est construite en cinq étapes. Chacune aboutit à quelque chose qui fonctionne et qui est testé, et fait l'objet de sa propre pull request.

## Étape 1 : socle du projet

Objectif : un serveur qui démarre, une base créée, une page servie.

- `package.json`, `tsconfig.json` et `tsconfig.client.json`, avec les scripts décrits dans [CLAUDE.md](../CLAUDE.md).
- Serveur `node:http` : routage minimal, lecture du JSON reçu, réponses JSON, erreurs, service des fichiers de `public/`.
- Base SQLite : ouverture du fichier, création des tables du [modèle de données](architecture.md#modèle-de-données), mécanisme simple de migrations (numéro de version du schéma).
- Route `GET /api/health` qui répond `{ "ok": true }`.
- Page `index.html` minimale qui charge `public/js/client/app.js` compilé.
- Premiers tests et vérification des types qui passent.

Terminé quand : `npm run dev` lance l'application, la page s'affiche dans le navigateur, et `npm test` et `npm run typecheck` passent.

## Étape 2 : comptes et connexion

Objectif : chaque membre de la famille peut se connecter.

- Écran d'installation au premier lancement : création du compte administrateur.
- Connexion, déconnexion, session par cookie `HttpOnly` stockée en base.
- Hachage des mots de passe avec `scrypt`.
- Toutes les routes de l'API, sauf installation, connexion et santé, exigent une session valide.
- Écran d'administration : créer un compte, réinitialiser un mot de passe, supprimer un compte.
- Changement de son propre mot de passe.

Terminé quand : l'administrateur crée un compte pour un autre membre, qui se connecte depuis un autre appareil.

## Étape 3 : produits et quantités

Objectif : tenir l'inventaire à jour.

- Catégories : liste et ajout.
- Produits : ajout, modification, suppression, avec nom, catégorie, unité, quantité, seuil minimum et quantité cible.
- Liste des produits regroupés par catégorie, avec recherche par nom.
- Boutons `+` et `−` qui envoient une variation de quantité.
- Affichage de la dernière personne qui a modifié le produit.

Terminé quand : on peut saisir le contenu de ses placards et ajuster les quantités depuis le téléphone.

## Étape 4 : liste de courses

Objectif : faire les courses avec l'application.

- Calcul de la liste à partir des produits sous leur seuil, avec la quantité à acheter (logique isolée et testée).
- Articles ponctuels : ajout et suppression.
- Cocher les produits achetés, puis valider : les quantités achetées s'ajoutent au stock.
- Interface pensée pour une main sur le téléphone, dans les rayons.

Terminé quand : une vraie séance de courses est faite avec l'application.

## Étape 5 : installation à la maison

Objectif : l'application tourne en permanence pour toute la famille, sur le serveur Home Assistant OS de la maison, et s'installe et se met à jour depuis l'interface de Home Assistant.

### Prérequis

L'application est empaquetée en **add-on Home Assistant**, distribué par un **dépôt d'add-ons** : on ajoute l'adresse du dépôt GitHub dans la boutique des add-ons de Home Assistant, puis l'installation, le démarrage automatique, les journaux, les sauvegardes et les mises à jour se font depuis l'interface. Voir [Hébergement](architecture.md#hébergement) pour le détail.

Conditions à réunir avant de commencer :

- **Dépôt GitHub public.** Home Assistant télécharge le dépôt d'add-ons sans identifiants. Tant que le dépôt reste privé, seule l'installation en add-on local est possible (copie des fichiers dans le dossier `/addons` du serveur, par le partage Samba ou SSH, et mise à jour à la main).
- **Image publiée** sur le registre de GitHub (`ghcr.io`), en paquet public, pour les architectures `amd64` et `aarch64`.
- **Accès administrateur** à Home Assistant, pour ajouter le dépôt et installer l'add-on.
- **Architecture du serveur** connue (Paramètres > Système > Matériel), pour vérifier qu'elle fait partie des images publiées.

### Contenu de l'étape

- Manifeste web et icône pour l'ajout à l'écran d'accueil de l'iPhone.
- Chemins relatifs dans l'interface (`api/...`, `style.css`, `js/...`) au lieu de chemins absolus, pour fonctionner derrière l'ingress de Home Assistant, qui sert l'application sous un préfixe (`/api/hassio_ingress/<jeton>/`). Le cookie de session est limité à ce préfixe.
- `Dockerfile` à la racine : image Node.js 24 qui compile l'interface et lance le serveur, avec la base dans `/data/garde-manger.db`.
- Dépôt d'add-ons : `repository.yaml` à la racine et dossier `home-assistant/garde-manger/` avec `config.yaml` (nom, version, architectures, ingress, port, image), `DOCS.md` (documentation affichée dans Home Assistant), icône et journal des versions.
- Intégration continue : construction et publication de l'image multi-architecture sur `ghcr.io` à chaque version (étiquette Git `vX.Y.Z`), la version de `config.yaml` suivant celle de l'étiquette.
- Sauvegarde : les données de l'add-on (`/data`) sont incluses dans les sauvegardes de Home Assistant. Comme la base est en mode WAL, la sauvegarde passe par une copie cohérente (`VACUUM INTO`) faite juste avant (`backup_pre` dans `config.yaml`), ou à défaut par une sauvegarde à froid (`backup: cold`).
- Guide d'installation (`docs/installation.md`) : ajout du dépôt, installation de l'add-on, premier compte, accès sur iPhone, accès hors de la maison par VPN (add-on Tailscale) et mises à jour.

Terminé quand : l'add-on s'installe depuis la boutique de Home Assistant, redémarre seul avec le serveur, survit à une restauration de sauvegarde, et chaque membre de la famille a l'application sur son téléphone et l'utilise.

## Après la première version

Les idées de la section « Plus tard » des [fonctionnalités](fonctionnalites.md) sont reprises une par une, selon l'usage réel.
