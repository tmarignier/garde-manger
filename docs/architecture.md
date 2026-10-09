# Architecture technique

## Objectifs

- **Dépendances minimales** : aucune bibliothèque externe, uniquement ce que fournissent le navigateur et Node.js.
- **Partagée** : tous les membres de la famille voient et modifient le même stock.
- **Multi-appareils** : utilisable sur iPhone comme sur ordinateur, depuis un simple navigateur.

## Vue d'ensemble

Une application web classique : un petit serveur garde les données dans un fichier SQLite et sert une interface en HTML, CSS et JavaScript.

```
 iPhone (Safari)  ─┐
                   │  HTTPS
 Ordinateur        ├────────►  Serveur Node.js  ───►  SQLite (garde-manger.db)
 (navigateur)     ─┘           API JSON + fichiers statiques
```

Sur iPhone, l'application peut être ajoutée à l'écran d'accueil (« Sur l'écran d'accueil » dans Safari). Elle s'ouvre alors en plein écran comme une application, sans passer par l'App Store.

## Choix proposés

| Sujet | Choix | Pourquoi |
|---|---|---|
| Interface | HTML, CSS et JavaScript, sans framework ni étape de compilation | Rien à installer, fonctionne dans tous les navigateurs, facile à lire. |
| Mise en page | CSS responsive, pensée d'abord pour le mobile | Une seule interface pour l'iPhone et l'ordinateur. |
| Installation sur iPhone | Manifeste web (`manifest.json`) et icône | Ajout à l'écran d'accueil et ouverture en plein écran. |
| Serveur | Node.js (version LTS), module intégré `node:http` | Même langage que l'interface, aucun paquet npm. |
| Base de données | SQLite via le module intégré `node:sqlite` | Un seul fichier, rien à installer ni administrer, sauvegarde par simple copie. |
| Tests | Lanceur de tests intégré `node:test` | Aucun outil supplémentaire. |

Le projet n'a donc **aucune dépendance npm** : il suffit d'installer Node.js pour le lancer.

> Le module `node:sqlite` est intégré à Node.js et utilisable sans option depuis la version 22.13, mais il est encore marqué en développement actif. Si cela pose problème, l'alternative la plus légère est le paquet `better-sqlite3`, qui serait alors la seule dépendance.

## Accès et sécurité

- L'application est protégée par un **mot de passe familial** unique, partagé entre les membres.
- Une fois connecté, l'appareil garde une session (cookie sécurisé) pour ne pas redemander le mot de passe à chaque fois.
- Le mot de passe est stocké sous forme hachée (module intégré `node:crypto`).
- Les échanges passent par **HTTPS**, indispensable dès que l'application est accessible depuis Internet.

## Utilisation à plusieurs

- Les modifications de quantité sont envoyées comme des **variations** (« +1 », « −1 ») plutôt que comme une valeur absolue. Si deux personnes retirent un paquet en même temps, les deux retraits sont bien comptés.
- L'interface recharge les données quand on revient sur l'application et après chaque modification. Pas de temps réel dans la première version.

## Modèle de données

```
categorie
  id, nom, ordre

produit
  id, nom, categorie_id, unite,
  quantite, seuil_minimum, quantite_cible (optionnelle)

article_ponctuel          (ajouté à la main à la liste de courses)
  id, nom, coche
```

La liste de courses n'est **pas stockée** : elle est calculée à partir des produits dont `quantite < seuil_minimum`, à laquelle s'ajoutent les articles ponctuels. Quantité à acheter = `quantite_cible − quantite` si une cible existe, sinon `seuil_minimum − quantite`.

## API

| Méthode | Chemin | Rôle |
|---|---|---|
| `POST` | `/api/connexion` | Se connecter avec le mot de passe familial |
| `GET` | `/api/produits` | Lister les produits |
| `POST` | `/api/produits` | Ajouter un produit |
| `PUT` | `/api/produits/:id` | Modifier un produit |
| `DELETE` | `/api/produits/:id` | Supprimer un produit |
| `POST` | `/api/produits/:id/variation` | Ajuster la quantité (`{ "delta": -1 }`) |
| `GET` | `/api/courses` | Obtenir la liste de courses calculée |
| `POST` | `/api/courses/achats` | Valider des achats (ajoute les quantités au stock) |
| `POST` / `DELETE` | `/api/articles-ponctuels` | Ajouter ou retirer un article ponctuel |
| `GET` / `POST` | `/api/categories` | Lister ou ajouter des catégories |

## Organisation du code

```
serveur/
  index.js        démarrage du serveur HTTP
  routes.js       routage des requêtes de l'API
  base.js         accès à SQLite et création des tables
  courses.js      calcul de la liste de courses (logique métier)
  auth.js         mot de passe et sessions
public/
  index.html
  style.css
  app.js
  manifest.json
  icone.png
tests/
```

La logique métier (calcul de la liste de courses, variations de quantité) est isolée pour être testée sans lancer le serveur.

## Hébergement

Pour que la famille y accède depuis n'importe où, le serveur doit tourner sur une machine allumée en permanence. Deux options :

- **Un petit serveur loué** (VPS, quelques euros par mois) avec un nom de domaine et un certificat HTTPS gratuit (Let's Encrypt). Recommandé : accessible partout, rien à gérer à la maison.
- **Une machine à la maison** (Raspberry Pi, NAS, vieil ordinateur). Gratuit, mais l'accès hors de la maison demande d'ouvrir l'accès depuis Internet ou d'utiliser un VPN.

Sauvegarde : copie régulière du fichier `garde-manger.db`.
