# Publier une version

Ce guide s'adresse au mainteneur du dépôt. Pour installer l'application, voir le [guide d'installation](installation.md). Le fonctionnement technique est décrit dans [Hébergement](architecture.md#hébergement).

## Publier une version

1. Dans une pull request, changer la version (`X.Y.Z`) dans `package.json` et `package-lock.json`, dans `home-assistant/garde-manger/config.yaml`, et ajouter l'entrée de la version en tête de `home-assistant/garde-manger/CHANGELOG.md`. Les tests vérifient que les trois correspondent.
2. Après la fusion, lancer la publication : onglet Actions de GitHub, workflow « Release », bouton **Run workflow** sur `main`. Le workflow lit la version dans `package.json`, refuse une version déjà publiée, relance les tests, publie les images `ghcr.io/tmarignier/amd64-garde-manger:1.2.3` et `ghcr.io/tmarignier/aarch64-garde-manger:1.2.3`, puis crée l'étiquette `v1.2.3` et la release « Garde-manger 1.2.3 » sur GitHub, avec l'entrée du journal des versions comme notes.

   Si l'étiquette existe déjà sans release, relancer le workflow crée seulement la release, sans republier les images.

   Envoyer soi-même l'étiquette (`git tag v1.2.3 && git push origin v1.2.3`, ou une « release » créée sur GitHub) lance la même publication.

Home Assistant voit la nouvelle version dès la fusion : il vaut mieux lancer la publication juste après, pour que l'image existe quand quelqu'un lance la mise à jour.

Les images doivent rester **publiques** pour que Home Assistant les télécharge sans identifiants : sur GitHub, onglet Packages du profil, `amd64-garde-manger` et `aarch64-garde-manger` (Package settings > Change visibility). C'est à vérifier quand une nouvelle image est publiée pour la première fois.

## Tester une version de développement

Pour essayer une version non publiée sur un serveur Home Assistant, l'add-on peut être installé en **add-on local**, construit sur le serveur :

1. Sur un ordinateur avec Node.js 24 et le dépôt : `npm install` puis `npm run addon:local`. Le dossier `dist/garde-manger/` est prêt.
2. Installer l'add-on **Samba share** (ou **Terminal & SSH**) dans Home Assistant, pour accéder aux dossiers du serveur.
3. Copier le dossier `dist/garde-manger/` dans le dossier `addons` du serveur (`\\homeassistant.local\addons` avec Samba).
4. Boutique des modules complémentaires > menu ⋮ > **Rechercher des mises à jour** : l'add-on apparaît dans la section « Modules complémentaires locaux ». L'installer : Home Assistant construit l'image sur place, ce qui prend quelques minutes.
5. Continuer à partir de l'étape [Installer l'add-on](installation.md#2-installer-ladd-on) du guide d'installation.

Pour mettre à jour un add-on local, recommencer les étapes 1 et 3, puis **Reconstruire** depuis la page de l'add-on.

Pour Home Assistant, l'add-on local et celui du dépôt sont deux add-ons différents : les données de l'un ne passent pas à l'autre, et désinstaller un add-on efface ses données.
