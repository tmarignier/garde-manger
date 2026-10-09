# Architecture technique

## Objectifs

- **TypeScript partout** : serveur, interface et tests.
- **Code en anglais** : noms, fichiers, routes, tables et commentaires. L'interface reste en français pour la famille.
- **Dépendances minimales** : on part de ce que fournissent le navigateur et Node.js, et chaque bibliothèque ajoutée doit être justifiée.
- **Partagée** : tous les membres de la famille voient et modifient le même stock.
- **Multi-appareils** : utilisable sur iPhone comme sur ordinateur, depuis un simple navigateur.

## Vue d'ensemble

Une application web classique : un petit serveur, installé sur une machine de la maison, garde les données dans un fichier SQLite et sert une interface en HTML et CSS, avec du TypeScript compilé en JavaScript pour le navigateur.

```
 iPhone (Safari) ─┐                 Machine à la maison
                  │      ┌──────────────────────────────────────┐
 Ordinateur      ─┼─────►│ Serveur Node.js ──► SQLite           │
 (navigateur)     │      │ API JSON + fichiers (garde-manger.db)│
                  │      └──────────────────────────────────────┘
   réseau local de la maison, ou VPN depuis l'extérieur
```

Sur iPhone, l'application peut être ajoutée à l'écran d'accueil (« Sur l'écran d'accueil » dans Safari). Elle s'ouvre alors en plein écran comme une application, sans passer par l'App Store.

## Choix proposés

| Sujet | Choix | Pourquoi |
|---|---|---|
| Langage | TypeScript, en mode strict | Les erreurs de types sont détectées avant l'exécution, et les types sont partagés entre serveur et interface. |
| Interface | HTML, CSS et TypeScript, sans framework | Fonctionne dans tous les navigateurs, facile à lire. Le TypeScript est compilé en JavaScript par `tsc`. |
| Mise en page | CSS responsive, pensée d'abord pour le mobile | Une seule interface pour l'iPhone et l'ordinateur. |
| Installation sur iPhone | Manifeste web (`manifest.json`) et icône | Ajout à l'écran d'accueil et ouverture en plein écran. |
| Serveur | Node.js 24 (LTS), module intégré `node:http` | Node.js exécute directement les fichiers `.ts` (suppression des types intégrée) : pas d'étape de compilation pour le serveur. |
| Base de données | SQLite via le module intégré `node:sqlite` | Un seul fichier, rien à installer ni administrer, sauvegarde par simple copie. |
| Tests | Lanceur de tests intégré `node:test`, tests écrits en TypeScript | Aucun outil supplémentaire. |
| Vérification des types | `tsc --noEmit` | Node.js retire les types sans les vérifier : `tsc` s'en charge. |

Au démarrage, le projet n'a donc **aucune dépendance d'exécution** : seules deux dépendances de développement sont nécessaires (voir ci-dessous).

### TypeScript exécuté par Node.js

Node.js retire les annotations de type au chargement des fichiers `.ts`, sans les transformer. Cela impose quelques règles, vérifiées par l'option `erasableSyntaxOnly` de `tsc` :

- pas d'`enum`, de `namespace` ni de propriétés déclarées dans les paramètres du constructeur : on utilise des objets `as const` et des unions de chaînes ;
- les imports relatifs indiquent l'extension `.ts` (`import { computeShoppingList } from './shopping-list.ts'`) ;
- les imports de types utilisent `import type`.

## Politique de dépendances

On démarre sans aucune bibliothèque externe. Une dépendance peut être ajoutée si elle remplit ces conditions :

- elle évite d'écrire et de maintenir une quantité significative de code ;
- elle est stable, maintenue et largement utilisée ;
- elle apporte peu ou pas de dépendances indirectes.

Chaque dépendance ajoutée est notée ci-dessous, avec la raison de son ajout.

Candidates identifiées si le besoin apparaît :

| Bibliothèque | Quand l'ajouter |
|---|---|
| `better-sqlite3` | Si le module intégré `node:sqlite`, encore marqué en développement actif dans Node.js, pose problème. |
| Preact | Si l'interface devient trop complexe à mettre à jour à la main. |

Dépendances actuelles :

| Bibliothèque | Type | Raison |
|---|---|---|
| `typescript` | développement | Vérification des types et compilation du code de l'interface. Indispensable pour écrire en TypeScript. |
| `@types/node` | développement | Types des modules intégrés de Node.js. |

Aucune dépendance d'exécution.

## Utilisateurs et sécurité

Une gestion d'utilisateurs basique : chaque membre de la famille a son propre compte.

- **Compte** : un nom d'utilisateur et un mot de passe.
- **Premier lancement** : l'application demande de créer le premier compte, qui devient **administrateur**.
- **Administrateur** : il crée les comptes des autres membres, peut réinitialiser leur mot de passe et supprimer un compte. Pas d'inscription libre.
- **Membre** : il utilise l'application et peut changer son propre mot de passe.
- Tous les comptes voient et modifient le même stock.
- Chaque produit garde **qui l'a modifié en dernier** et quand, pour savoir qui a pris le dernier paquet.
- Les noms sont comparés sans tenir compte des majuscules, lettres accentuées comprises : « Léa » et « LÉA » sont le même compte.
- Les mots de passe font au moins 8 caractères. Ils sont stockés hachés avec `scrypt` (module intégré `node:crypto`, sel aléatoire, paramètres enregistrés avec chaque empreinte pour pouvoir les renforcer plus tard), jamais en clair.
- Une fois connecté, l'appareil garde une session (cookie `HttpOnly`, `SameSite=Strict`) pour ne pas redemander le mot de passe à chaque fois. La session dure 90 jours et se prolonge toute seule quand l'appareil s'en sert : un téléphone utilisé chaque semaine reste connecté.
- Les sessions sont stockées en base et peuvent être révoquées. La base ne contient qu'une empreinte (SHA-256) de chaque jeton : la lire ne permet pas d'ouvrir une session.
- Changer son mot de passe déconnecte ses autres appareils. Une réinitialisation par l'administrateur, ou la suppression du compte, déconnecte tous les appareils du compte.
- L'administrateur ne peut pas supprimer son propre compte : il reste toujours au moins un administrateur.
- Les requêtes de l'API qui envoient des données doivent les déclarer en JSON (`Content-Type: application/json`), sinon elles sont refusées (415). Avec `SameSite=Strict`, cela empêche un autre site d'agir sur l'application avec la session d'un membre de la famille.
- À la maison, l'application est servie en HTTP simple : le cookie ne peut pas être marqué `Secure`. Il l'est automatiquement quand un proxy HTTPS place devant l'application l'en-tête `X-Forwarded-Proto: https`.
- Pas de récupération de mot de passe par e-mail : l'administrateur le réinitialise.

## Utilisation à plusieurs

- Les modifications de quantité sont envoyées comme des **variations** (« +1 », « −1 ») plutôt que comme une valeur absolue. Si deux personnes retirent un paquet en même temps, les deux retraits sont bien comptés.
- La quantité en stock n'est jamais négative. Le bouton `−` est désactivé à 0, et si deux personnes retirent le dernier paquet en même temps, le serveur s'arrête à 0 au lieu de refuser la variation.
- Modifier la fiche d'un produit sans toucher à sa quantité n'envoie pas la quantité : un `+` ou un `−` fait entre-temps sur un autre appareil n'est pas écrasé.
- La quantité cible, quand elle existe, n'est jamais inférieure au seuil minimum : sinon le produit resterait dans la liste de courses juste après l'achat.
- Les quantités acceptent les décimales (par exemple 1,5 kg), arrondies à trois chiffres après la virgule.
- L'interface recharge les données quand on revient sur l'application et après chaque modification. Pas de temps réel dans la première version.

## Modèle de données

Les noms des tables et colonnes sont en anglais, en `snake_case`.

```
users                     comptes de la famille
  id, name, name_key (nom en minuscules, unique), password_hash, is_admin (booléen), created_at

sessions                  sessions de connexion
  id (jeton aléatoire), user_id, expires_at

categories                catégories de produits
  id, name, name_key (nom en minuscules, unique), position (ordre d'affichage)

products                  produits suivis en stock
  id, name, category_id, unit,
  quantity, min_quantity (seuil minimum), target_quantity (optionnelle),
  updated_by (user_id), updated_at

extra_items               articles ponctuels ajoutés à la main à la liste de courses
  id, name
```

La liste de courses n'est **pas stockée** : elle est calculée à partir des produits dont `quantity < min_quantity`, à laquelle s'ajoutent les articles ponctuels. Quantité à acheter = `target_quantity − quantity` si une cible existe, sinon `min_quantity − quantity`. Le calcul est dans `server/shopping-list.ts`, sans HTTP ni SQLite.

### Courses

- Pendant les courses, les articles cochés et les quantités réellement achetées restent **sur l'appareil** (`localStorage`), jusqu'à la validation. Ils survivent à un rechargement de la page par Safari, mais ne sont pas partagés entre les téléphones.
- Valider envoie en une fois les quantités achetées et les articles ponctuels cochés. Les quantités s'ajoutent au stock du moment, comme un `+` : un changement fait à la maison pendant les courses est conservé. Les articles ponctuels validés sont retirés de la liste. Tout est enregistré dans une seule transaction.
- Un produit ou un article ponctuel supprimé entre-temps est ignoré à la validation. Un produit qui a quitté la liste entre-temps (quelqu'un l'a racheté) est décoché sur l'appareil au rechargement de la liste.
- La quantité achetée est proposée par défaut et se modifie avant de valider (par exemple un lot de six au lieu de quatre paquets).

### Migrations

Le schéma est créé et mis à jour au démarrage par `server/database.ts`. Chaque migration est un script SQL qui fait passer le schéma de la version N à N + 1 ; la version courante est enregistrée dans la base (`PRAGMA user_version`). Chaque migration s'exécute dans une transaction : en cas d'erreur, la base reste dans sa version précédente. Une migration déjà publiée n'est jamais modifiée : on en ajoute une nouvelle à la suite.

Les tables sont déclarées `STRICT` (SQLite vérifie le type de chaque valeur) et les clés étrangères sont activées (`PRAGMA foreign_keys = ON`). Les dates sont stockées en texte au format ISO 8601 (UTC), les booléens en entiers `0` ou `1`.

## API

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/api/health` | Vérifier que le serveur répond (sans connexion) |
| `GET` | `/api/session` | Savoir qui est connecté sur l'appareil et si le premier compte reste à créer (sans connexion) |
| `POST` | `/api/setup` | Créer le premier compte administrateur, uniquement si aucun compte n'existe (sans connexion) |
| `POST` | `/api/login` | Se connecter avec son nom et son mot de passe (sans connexion) |
| `POST` | `/api/logout` | Se déconnecter (sans connexion, pour qu'un appareil à la session expirée puisse effacer son cookie) |
| `PUT` | `/api/me/password` | Changer son mot de passe |
| `GET` / `POST` | `/api/users` | Lister ou créer des comptes (administrateur) |
| `PUT` / `DELETE` | `/api/users/:id` | Réinitialiser le mot de passe ou supprimer un compte (administrateur) |
| `GET` | `/api/products` | Lister les produits |
| `POST` | `/api/products` | Ajouter un produit |
| `PUT` | `/api/products/:id` | Modifier un produit |
| `DELETE` | `/api/products/:id` | Supprimer un produit |
| `POST` | `/api/products/:id/adjust` | Ajuster la quantité (`{ "delta": -1 }`) |
| `GET` | `/api/shopping-list` | Obtenir la liste de courses calculée |
| `POST` | `/api/shopping-list/purchases` | Valider des achats (`{ "purchases": [{ "productId": 1, "quantity": 3 }], "extraItemIds": [2] }`) : ajoute les quantités au stock, retire les articles ponctuels, et renvoie la nouvelle liste |
| `POST` | `/api/extra-items` | Ajouter un article ponctuel (`{ "name": "Bougies" }`) |
| `DELETE` | `/api/extra-items/:id` | Retirer un article ponctuel |
| `GET` / `POST` | `/api/categories` | Lister ou ajouter des catégories |

Toutes les routes exigent une session valide, sauf celles marquées « sans connexion » : sinon le serveur répond 401. Les routes des comptes (`/api/users`) sont réservées aux administrateurs (403 pour les autres). Chaque route déclare son niveau d'accès (`access` dans `server/router.ts` : `public`, `user` par défaut, ou `admin`), et le serveur le vérifie avant d'appeler la route.

Les messages d'erreur de l'API sont en anglais ; l'interface affiche ses propres messages en français selon le code de réponse.

## Organisation du code

```
server/                 exécuté directement par Node.js
  index.ts              démarrage : configuration, base de données, écoute HTTP
  server.ts             serveur HTTP : API, fichiers statiques et gestion des erreurs
  router.ts             routage des requêtes de l'API (chemins avec paramètres `:id`)
  routes.ts             liste des routes de l'API
  http.ts               lecture du JSON reçu, réponses JSON, erreurs HTTP
  static.ts             service des fichiers de public/
  database.ts           accès à SQLite, création des tables, migrations et transactions
  shopping-list.ts      calcul de la liste de courses (logique métier)
  auth.ts               mots de passe, sessions et cookie de session
  users.ts              lecture et écriture des comptes en base
  account-routes.ts     routes de l'API pour la connexion et les comptes
  products.ts           lecture et écriture des produits et catégories en base
  product-routes.ts     routes de l'API pour les produits et catégories
  extra-items.ts        lecture et écriture des articles ponctuels en base
  shopping-list-routes.ts  routes de l'API pour la liste de courses et les achats
client/                 compilé par tsc vers public/js/client/
  app.ts                point d'entrée de l'interface
  api.ts                appels à l'API
  dom.ts                petites fonctions pour construire l'interface
  views/                écrans (installation, connexion, compte, comptes, stock, courses)
shared/
  types.ts              types partagés entre serveur et interface
  accounts.ts           règles des comptes (longueur du nom et du mot de passe), communes aux deux
  products.ts           règles du stock (validation, variations de quantité, regroupement, recherche)
public/                 servi tel quel par le serveur
  index.html
  style.css
  manifest.json
  icon.png
  js/                   généré par la compilation, non versionné
scripts/
  dev.ts                mode développement (compilation et serveur en continu)
tests/
  *.test.ts
tsconfig.json           configuration du serveur, des tests et du code partagé
tsconfig.client.json    configuration de l'interface (sortie vers public/js/)
package.json
```

La compilation de l'interface conserve l'arborescence : `client/app.ts` devient `public/js/client/app.js` et `shared/types.ts` devient `public/js/shared/types.js`. Les extensions `.ts` des imports sont réécrites en `.js` (option `rewriteRelativeImportExtensions`).

La logique métier (calcul de la liste de courses, variations de quantité) est isolée pour être testée sans lancer le serveur.

## Hébergement

Le serveur tourne sur **une machine de la maison** allumée en permanence : un Raspberry Pi, un NAS capable de lancer Node.js ou un vieil ordinateur.

- **À la maison** : on accède à l'application depuis le réseau Wi-Fi, avec l'adresse de la machine (par exemple `http://garde-manger.local:3000`). Il faut donner à la machine une adresse fixe sur le réseau local, via la box.
- **Hors de la maison** (pour consulter la liste au magasin) : la solution recommandée est un **VPN** comme Tailscale ou WireGuard, installé sur la machine et sur les téléphones. L'application reste invisible depuis Internet, sans ouvrir de port sur la box. Tailscale peut en plus fournir un certificat HTTPS.
- **Démarrage automatique** : le serveur est lancé comme service système (par exemple avec `systemd`), pour redémarrer tout seul après une coupure.
- **Sauvegarde** : copie régulière du fichier `garde-manger.db` vers un autre support (disque externe, NAS, cloud).

L'accès depuis Internet sans VPN (ouverture de port et HTTPS) est déconseillé : il expose l'application et demande plus de maintenance.
