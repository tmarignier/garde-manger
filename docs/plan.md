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

Objectif : l'application tourne en permanence pour toute la famille.

- Manifeste web et icône pour l'ajout à l'écran d'accueil de l'iPhone.
- Service `systemd` pour le démarrage automatique sur la machine de la maison.
- Script de sauvegarde du fichier de base.
- Guide d'installation (`docs/installation.md`), avec l'accès hors de la maison par VPN.

Terminé quand : chaque membre de la famille a l'application sur son téléphone et l'utilise.

## Après la première version

Les idées de la section « Plus tard » des [fonctionnalités](fonctionnalites.md) sont reprises une par une, selon l'usage réel.
