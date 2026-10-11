# Installation

Garde-manger s'installe comme **add-on Home Assistant** : il tourne sur le serveur Home Assistant du foyer, démarre avec lui, et ses données font partie des sauvegardes de Home Assistant. Ce guide décrit l'installation, la création des comptes, l'accès depuis les téléphones et les mises à jour. Sans Home Assistant, voir [Installation sans Home Assistant](#installation-sans-home-assistant).

## 1. Ce qu'il faut

- **Home Assistant OS** (ou Home Assistant Supervised) : ce sont les seules installations de Home Assistant qui gèrent les add-ons. Le type d'installation est indiqué dans Paramètres > À propos.
- Un serveur **`amd64`** (PC, mini-PC, NUC) ou **`aarch64`** (Raspberry Pi 4 ou 5, Home Assistant Green ou Yellow) : Paramètres > Système > Matériel. Les autres architectures (Raspberry Pi 3 en 32 bits par exemple) ne sont pas prises en charge.
- Un **compte administrateur** de Home Assistant, pour installer l'add-on.

## 2. Installer l'add-on

Le plus simple : depuis un navigateur connecté à Home Assistant, ce bouton ouvre directement l'ajout du dépôt.

[![Ajouter le dépôt à Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Ftmarignier%2Fgarde-manger)

Ou à la main :

1. Dans Home Assistant : Paramètres > Modules complémentaires > Boutique des modules complémentaires.
2. Menu ⋮ en haut à droite > Dépôts, ajouter `https://github.com/tmarignier/garde-manger`, puis fermer.
3. Recharger la page : l'add-on **Garde-manger** apparaît dans la boutique.

Ensuite :

1. Cliquer sur l'add-on **Garde-manger**, puis **Installer**. Home Assistant télécharge une image toute prête : l'installation prend moins d'une minute.
2. Dans l'onglet Info, activer :
   - **Démarrer au démarrage**, pour qu'il tourne en permanence ;
   - **Chien de garde**, pour qu'il redémarre s'il s'arrête ;
   - **Afficher dans la barre latérale**.
3. Cliquer sur **Démarrer**. L'onglet Journal doit afficher `garde-manger listening on http://localhost:3000`.

## 3. Créer les comptes

1. Ouvrir l'application : « Garde-manger » dans le menu latéral, ou **Ouvrir l'interface web** sur la page de l'add-on.
2. Créer le premier compte : il devient **administrateur**.
3. Dans l'écran « Comptes », créer un compte pour chaque membre du foyer et lui transmettre son nom et son mot de passe. Chacun peut ensuite changer son mot de passe dans « Mon compte ».

Les comptes de l'application sont indépendants de ceux de Home Assistant : chacun se connecte avec son propre compte Garde-manger, même s'il passe par Home Assistant.

## 4. Sur les téléphones et les ordinateurs

L'application s'ouvre de deux façons :

- **Par Home Assistant** : menu latéral, « Garde-manger », dans le navigateur ou dans l'application Home Assistant. Rien à configurer, mais il faut passer par Home Assistant.
- **En accès direct**, sur le port `3000` du serveur : `http://homeassistant.local:3000`, ou `http://<adresse du serveur>:3000`. C'est l'adresse à utiliser pour installer l'application sur l'écran d'accueil d'un téléphone.

Pour l'accès direct, donner d'abord au serveur une **adresse fixe** sur le réseau local (réservation DHCP dans la box ou le routeur), pour que l'adresse ne change pas. Puis, depuis le Wi-Fi du foyer :

- **iPhone** : ouvrir l'adresse dans Safari, se connecter, puis bouton Partager > **Sur l'écran d'accueil**.
- **Android** : ouvrir l'adresse dans Chrome, se connecter, puis menu ⋮ > **Ajouter à l'écran d'accueil**.

L'application s'ouvre ensuite en plein écran, comme une application. Sur ordinateur, la même adresse s'ouvre dans n'importe quel navigateur.

Le port de l'accès direct se change dans l'onglet Configuration de l'add-on, section Réseau. Pour couper l'accès direct et ne garder que l'accès par Home Assistant, vider ce champ.

## 5. Depuis l'extérieur

Pour consulter la liste de courses au magasin, la solution recommandée est un **VPN**, par exemple avec Tailscale :

1. Installer l'add-on **Tailscale** depuis la boutique des modules complémentaires, le démarrer et le connecter à un compte Tailscale (lien affiché dans son journal).
2. Installer l'application **Tailscale** sur chaque téléphone et se connecter au même compte (ou inviter les membres du foyer dans le réseau Tailscale).
3. Dans la console Tailscale, noter le nom ou l'adresse du serveur (par exemple `homeassistant` ou `100.x.y.z`).
4. Ajouter à l'écran d'accueil l'adresse `http://<nom Tailscale du serveur>:3000` : elle fonctionne à la maison comme dehors, tant que Tailscale est activé sur le téléphone.

L'application reste ainsi invisible depuis Internet, sans port ouvert sur la box. Si Home Assistant est déjà accessible de l'extérieur (Home Assistant Cloud, ou un autre accès distant), l'application l'est aussi par le menu latéral de Home Assistant.

Ouvrir le port `3000` directement sur Internet est **déconseillé** : l'application ne gère pas le HTTPS, et les mots de passe circuleraient en clair.

## 6. Sauvegardes

L'add-on est inclus dans les sauvegardes de Home Assistant (Paramètres > Système > Sauvegardes). Pendant la sauvegarde, il est arrêté quelques secondes pour copier une base fermée proprement, puis redémarre tout seul.

Conseils :

- programmer une **sauvegarde automatique** quotidienne, la nuit ;
- envoyer les sauvegardes **hors du serveur** (NAS, stockage en ligne, Home Assistant Cloud), pour survivre à une panne du disque.

Pour restaurer : Paramètres > Système > Sauvegardes, choisir la sauvegarde, puis restaurer l'add-on « Garde-manger ».

## 7. Mises à jour

Quand une nouvelle version est publiée, Home Assistant la propose dans Paramètres > Modules complémentaires (et dans Paramètres, en haut). **Mettre à jour** télécharge la nouvelle version et redémarre l'add-on ; les données sont conservées et la base est mise à jour automatiquement au démarrage. Cocher « Créer une sauvegarde » avant la mise à jour permet de revenir en arrière. Les nouveautés de chaque version sont dans l'onglet « Journal des modifications » de l'add-on.

## En cas de problème

- **L'add-on n'apparaît pas dans la boutique** : vérifier l'adresse du dépôt, puis menu ⋮ > **Rechercher des mises à jour** et recharger la page. S'il n'apparaît toujours pas, l'architecture du serveur n'est sans doute pas prise en charge (voir [Ce qu'il faut](#1-ce-quil-faut)).
- **L'adresse directe ne répond pas** : vérifier que l'add-on est démarré, que le port est renseigné dans l'onglet Configuration, et que le téléphone est sur le même réseau. Si `homeassistant.local` ne répond pas, utiliser l'adresse IP du serveur.
- **Mot de passe oublié** : l'administrateur peut le réinitialiser dans l'écran « Comptes ».
- **Autre souci** : l'onglet Journal de l'add-on affiche les erreurs. Les problèmes se signalent sur [GitHub](https://github.com/tmarignier/garde-manger/issues), avec le journal et la version de l'add-on.

Désinstaller l'add-on **efface ses données** : faire une sauvegarde avant.

## Installation sans Home Assistant

L'application est un simple serveur Node.js : elle tourne aussi sur n'importe quelle machine allumée en permanence (NAS, mini-PC, Raspberry Pi). Il faut alors s'occuper soi-même du démarrage automatique et des sauvegardes.

**Avec Docker**, en utilisant l'image publiée, `amd64` ou `aarch64` selon la machine, et le numéro de la dernière version (voir le [journal des versions](../home-assistant/garde-manger/CHANGELOG.md)) :

```sh
docker run -d --name garde-manger --restart unless-stopped \
  -p 3000:3000 -v garde-manger-data:/data \
  ghcr.io/tmarignier/amd64-garde-manger:1.0.0
```

La base est dans le volume `garde-manger-data` (`/data/garde-manger.db`). Pour mettre à jour, relancer le conteneur avec le numéro de la nouvelle version.

**Avec Node.js 24** :

```sh
git clone https://github.com/tmarignier/garde-manger.git
cd garde-manger
npm install
npm start
```

Le port et l'emplacement de la base se changent avec les variables d'environnement `PORT` (défaut `3000`) et `DATABASE_PATH` (défaut `./data/garde-manger.db`).

Dans les deux cas, l'application s'ouvre ensuite sur `http://<adresse de la machine>:3000`, et la suite est la même : [créer les comptes](#3-créer-les-comptes), puis [les téléphones](#4-sur-les-téléphones-et-les-ordinateurs). Pour sauvegarder la base sans arrêter l'application, `sqlite3 garde-manger.db ".backup copie.db"` fait une copie cohérente.

La publication des versions et l'installation d'une version de développement sont décrites dans [Publier une version](publication.md).
