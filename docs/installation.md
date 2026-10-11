# Installation à la maison

L'application tourne sur le serveur Home Assistant OS de la maison, sous forme d'**add-on**. Ce guide décrit la première installation, l'accès depuis les téléphones et les mises à jour. Le fonctionnement technique est décrit dans [Hébergement](architecture.md#hébergement).

## 1. Avant de commencer

- **Le dépôt GitHub doit être public** : Home Assistant le télécharge sans identifiants. Sur GitHub, Settings > General > Danger Zone > Change repository visibility. Tant qu'il reste privé, voir [Installation sans dépôt public](#installation-sans-dépôt-public).
- **Une version doit être publiée** : l'étiquette `vX.Y.Z` publie l'image de l'add-on sur `ghcr.io` (voir [Publier une version](#publier-une-version)).
- **Les images doivent être publiques** : à la première publication, vérifier sur GitHub, dans l'onglet Packages du profil, que `amd64-garde-manger` et `aarch64-garde-manger` sont publics (Package settings > Change visibility). Sinon Home Assistant ne peut pas les télécharger.
- **L'architecture du serveur** doit être `amd64` (PC, NUC) ou `aarch64` (Raspberry Pi 4 ou 5, Home Assistant Green ou Yellow) : Paramètres > Système > Matériel, ou Paramètres > À propos.
- Un **compte administrateur** de Home Assistant.

## 2. Installer l'add-on

1. Dans Home Assistant : Paramètres > Modules complémentaires > Boutique des modules complémentaires.
2. Menu ⋮ en haut à droite > Dépôts, ajouter `https://github.com/tmarignier/garde-manger`, puis fermer.
3. Recharger la page : l'add-on **Garde-manger** apparaît dans la boutique. Cliquer dessus, puis **Installer**.
4. Dans l'onglet Info, activer :
   - **Démarrer au démarrage**, pour qu'il tourne en permanence ;
   - **Chien de garde**, pour qu'il redémarre s'il s'arrête ;
   - **Afficher dans la barre latérale**.
5. Cliquer sur **Démarrer**. L'onglet Journal doit afficher `garde-manger listening on http://localhost:3000`.

## 3. Créer les comptes

1. Ouvrir l'application : « Garde-manger » dans le menu latéral, ou **Ouvrir l'interface web**.
2. Créer le premier compte : il devient **administrateur**.
3. Dans l'écran « Comptes », créer un compte pour chaque membre de la famille et lui transmettre son nom et son mot de passe. Chacun peut ensuite changer son mot de passe dans « Mon compte ».

Les comptes de l'application sont indépendants de ceux de Home Assistant.

## 4. Sur l'iPhone

Pour avoir l'application sur l'écran d'accueil, on passe par l'**accès direct** sur le port 3000, plutôt que par l'application Home Assistant :

1. Donner au serveur une **adresse fixe** sur le réseau local (réservation DHCP dans la box), pour que l'adresse ne change pas.
2. Sur l'iPhone, connecté au Wi-Fi de la maison, ouvrir Safari à l'adresse `http://homeassistant.local:3000` (ou `http://<adresse du serveur>:3000`).
3. Se connecter avec son compte.
4. Bouton Partager > **Sur l'écran d'accueil**. L'application s'ouvre ensuite en plein écran, comme une application.

Sur ordinateur, la même adresse s'ouvre dans n'importe quel navigateur.

Pour couper l'accès direct et ne garder que l'accès par Home Assistant : onglet Configuration de l'add-on, section Réseau, vider le port.

## 5. Depuis l'extérieur de la maison

Pour consulter la liste au magasin, la solution recommandée est un **VPN** avec Tailscale :

1. Installer l'add-on **Tailscale** depuis la boutique des add-ons de Home Assistant, le démarrer et le connecter à un compte Tailscale (lien affiché dans son journal).
2. Installer l'application **Tailscale** sur chaque téléphone et se connecter au même compte (ou inviter les membres de la famille dans le réseau Tailscale).
3. Dans la console Tailscale, noter le nom ou l'adresse du serveur (par exemple `homeassistant` ou `100.x.y.z`).
4. Ajouter à l'écran d'accueil l'adresse `http://<nom Tailscale du serveur>:3000` : elle fonctionne à la maison comme dehors, tant que Tailscale est activé sur le téléphone.

L'application reste invisible depuis Internet, sans port ouvert sur la box. Si Home Assistant est déjà accessible de l'extérieur (Home Assistant Cloud par exemple), l'application est aussi accessible par le menu latéral de l'application Home Assistant.

## 6. Sauvegardes

L'add-on est inclus dans les sauvegardes de Home Assistant (Paramètres > Système > Sauvegardes). Pendant la sauvegarde, il est arrêté quelques secondes pour copier une base fermée proprement, puis redémarre tout seul.

Conseils :

- programmer une **sauvegarde automatique** quotidienne, la nuit ;
- envoyer les sauvegardes **hors du serveur** (NAS, Google Drive, Home Assistant Cloud), pour survivre à une panne du disque.

Pour restaurer : Paramètres > Système > Sauvegardes, choisir la sauvegarde, puis restaurer l'add-on « Garde-manger ».

## 7. Mises à jour

Quand une nouvelle version est publiée, Home Assistant la propose dans Paramètres > Modules complémentaires (et dans Paramètres, en haut). **Mettre à jour** télécharge la nouvelle image et redémarre l'add-on ; les données sont conservées et la base est mise à jour automatiquement au démarrage. Cocher « Créer une sauvegarde » avant la mise à jour permet de revenir en arrière.

## Publier une version

1. Dans une pull request, changer la version (`X.Y.Z`) dans `package.json` et `package-lock.json`, dans `home-assistant/garde-manger/config.yaml`, et ajouter l'entrée de la version en tête de `home-assistant/garde-manger/CHANGELOG.md`. Les tests vérifient que les trois correspondent.
2. Après la fusion, lancer la publication : onglet Actions de GitHub, workflow « Release », bouton **Run workflow** sur `main`. Le workflow lit la version dans `package.json`, refuse une version déjà publiée, relance les tests, publie les images `ghcr.io/tmarignier/amd64-garde-manger:1.2.3` et `ghcr.io/tmarignier/aarch64-garde-manger:1.2.3`, puis crée l'étiquette `v1.2.3`.

   Envoyer soi-même l'étiquette (`git tag v1.2.3 && git push origin v1.2.3`, ou une « release » créée sur GitHub) lance la même publication.

Home Assistant voit la nouvelle version dès la fusion : il vaut mieux lancer la publication juste après, pour que l'image existe quand quelqu'un lance la mise à jour.

## Installation sans dépôt public

Tant que le dépôt est privé, l'add-on peut être installé en **add-on local**, construit sur le serveur :

1. Sur un ordinateur avec Node.js 24 et le dépôt : `npm install` puis `npm run addon:local`. Le dossier `dist/garde-manger/` est prêt.
2. Installer l'add-on **Samba share** (ou **Terminal & SSH**) dans Home Assistant, pour accéder aux dossiers du serveur.
3. Copier le dossier `dist/garde-manger/` dans le dossier `addons` du serveur (`\\homeassistant.local\addons` avec Samba).
4. Boutique des modules complémentaires > menu ⋮ > **Rechercher des mises à jour** : l'add-on apparaît dans la section « Modules complémentaires locaux ». L'installer : Home Assistant construit l'image sur place, ce qui prend quelques minutes.
5. Continuer à partir de l'étape 2.4 ci-dessus.

Pour mettre à jour un add-on local, recommencer les étapes 1 et 3, puis **Reconstruire** depuis la page de l'add-on.

Pour Home Assistant, l'add-on local et celui du dépôt sont deux add-ons différents : les données de l'un ne passent pas à l'autre, et désinstaller un add-on efface ses données. Mieux vaut donc rendre le dépôt public avant de saisir tout le stock.
