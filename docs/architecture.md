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
- Les mots de passe sont stockés hachés avec `scrypt` (module intégré `node:crypto`), jamais en clair.
- Une fois connecté, l'appareil garde une session (cookie `HttpOnly`) pour ne pas redemander le mot de passe à chaque fois. Les sessions sont stockées en base et peuvent être révoquées.
- Pas de récupération de mot de passe par e-mail : l'administrateur le réinitialise.

## Utilisation à plusieurs

- Les modifications de quantité sont envoyées comme des **variations** (« +1 », « −1 ») plutôt que comme une valeur absolue. Si deux personnes retirent un paquet en même temps, les deux retraits sont bien comptés.
- L'interface recharge les données quand on revient sur l'application et après chaque modification. Pas de temps réel dans la première version.

## Modèle de données

Les noms des tables et colonnes sont en anglais, en `snake_case`.

```
users                     comptes de la famille
  id, name, password_hash, is_admin (booléen), created_at

sessions                  sessions de connexion
  id (jeton aléatoire), user_id, expires_at

categories                catégories de produits
  id, name, position

products                  produits suivis en stock
  id, name, category_id, unit,
  quantity, min_quantity (seuil minimum), target_quantity (optionnelle),
  updated_by (user_id), updated_at

extra_items               articles ponctuels ajoutés à la main à la liste de courses
  id, name, checked
```

La liste de courses n'est **pas stockée** : elle est calculée à partir des produits dont `quantity < min_quantity`, à laquelle s'ajoutent les articles ponctuels. Quantité à acheter = `target_quantity − quantity` si une cible existe, sinon `min_quantity − quantity`.

## API

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/api/health` | Vérifier que le serveur répond (sans connexion) |
| `POST` | `/api/setup` | Créer le premier compte administrateur (uniquement si aucun compte n'existe) |
| `POST` | `/api/login` | Se connecter avec son nom et son mot de passe |
| `POST` | `/api/logout` | Se déconnecter |
| `PUT` | `/api/me/password` | Changer son mot de passe |
| `GET` / `POST` | `/api/users` | Lister ou créer des comptes (administrateur) |
| `PUT` / `DELETE` | `/api/users/:id` | Réinitialiser le mot de passe ou supprimer un compte (administrateur) |
| `GET` | `/api/products` | Lister les produits |
| `POST` | `/api/products` | Ajouter un produit |
| `PUT` | `/api/products/:id` | Modifier un produit |
| `DELETE` | `/api/products/:id` | Supprimer un produit |
| `POST` | `/api/products/:id/adjust` | Ajuster la quantité (`{ "delta": -1 }`) |
| `GET` | `/api/shopping-list` | Obtenir la liste de courses calculée |
| `POST` | `/api/shopping-list/purchases` | Valider des achats (ajoute les quantités au stock) |
| `POST` / `DELETE` | `/api/extra-items` | Ajouter ou retirer un article ponctuel |
| `GET` / `POST` | `/api/categories` | Lister ou ajouter des catégories |

## Organisation du code

```
server/                 exécuté directement par Node.js
  index.ts              démarrage du serveur HTTP
  router.ts             routage des requêtes de l'API
  database.ts           accès à SQLite, création des tables et migrations
  shopping-list.ts      calcul de la liste de courses (logique métier)
  auth.ts               comptes, mots de passe et sessions
client/                 compilé par tsc vers public/js/
  app.ts                point d'entrée de l'interface
  api.ts                appels à l'API
  views/                écrans (stock, produit, courses, comptes)
shared/
  types.ts              types partagés entre serveur et interface
public/                 servi tel quel par le serveur
  index.html
  style.css
  manifest.json
  icon.png
  js/                   généré par la compilation, non versionné
tests/
  *.test.ts
tsconfig.json           configuration du serveur, des tests et du code partagé
tsconfig.client.json    configuration de l'interface (sortie vers public/js/)
package.json
```

La logique métier (calcul de la liste de courses, variations de quantité) est isolée pour être testée sans lancer le serveur.

## Hébergement

Le serveur tourne sur **une machine de la maison** allumée en permanence : un Raspberry Pi, un NAS capable de lancer Node.js ou un vieil ordinateur.

- **À la maison** : on accède à l'application depuis le réseau Wi-Fi, avec l'adresse de la machine (par exemple `http://garde-manger.local:3000`). Il faut donner à la machine une adresse fixe sur le réseau local, via la box.
- **Hors de la maison** (pour consulter la liste au magasin) : la solution recommandée est un **VPN** comme Tailscale ou WireGuard, installé sur la machine et sur les téléphones. L'application reste invisible depuis Internet, sans ouvrir de port sur la box. Tailscale peut en plus fournir un certificat HTTPS.
- **Démarrage automatique** : le serveur est lancé comme service système (par exemple avec `systemd`), pour redémarrer tout seul après une coupure.
- **Sauvegarde** : copie régulière du fichier `garde-manger.db` vers un autre support (disque externe, NAS, cloud).

L'accès depuis Internet sans VPN (ouverture de port et HTTPS) est déconseillé : il expose l'application et demande plus de maintenance.
