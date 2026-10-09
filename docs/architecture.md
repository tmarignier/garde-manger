# Architecture technique

## Objectifs

- **Dépendances minimales** : on part de ce que fournissent le navigateur et Node.js, et chaque bibliothèque ajoutée doit être justifiée.
- **Partagée** : tous les membres de la famille voient et modifient le même stock.
- **Multi-appareils** : utilisable sur iPhone comme sur ordinateur, depuis un simple navigateur.

## Vue d'ensemble

Une application web classique : un petit serveur, installé sur une machine de la maison, garde les données dans un fichier SQLite et sert une interface en HTML, CSS et JavaScript.

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
| Interface | HTML, CSS et JavaScript, sans framework ni étape de compilation | Rien à installer, fonctionne dans tous les navigateurs, facile à lire. |
| Mise en page | CSS responsive, pensée d'abord pour le mobile | Une seule interface pour l'iPhone et l'ordinateur. |
| Installation sur iPhone | Manifeste web (`manifest.json`) et icône | Ajout à l'écran d'accueil et ouverture en plein écran. |
| Serveur | Node.js (version LTS), module intégré `node:http` | Même langage que l'interface, rien à installer. |
| Base de données | SQLite via le module intégré `node:sqlite` | Un seul fichier, rien à installer ni administrer, sauvegarde par simple copie. |
| Tests | Lanceur de tests intégré `node:test` | Aucun outil supplémentaire. |

Au démarrage, le projet n'a donc **aucune dépendance npm** : il suffit d'installer Node.js pour le lancer.

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

Dépendances actuelles : aucune.

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

```
utilisateur
  id, nom, mot_de_passe_hache, administrateur (booléen), cree_le

session
  id (jeton aléatoire), utilisateur_id, expire_le

categorie
  id, nom, ordre

produit
  id, nom, categorie_id, unite,
  quantite, seuil_minimum, quantite_cible (optionnelle),
  modifie_par (utilisateur_id), modifie_le

article_ponctuel          (ajouté à la main à la liste de courses)
  id, nom, coche
```

La liste de courses n'est **pas stockée** : elle est calculée à partir des produits dont `quantite < seuil_minimum`, à laquelle s'ajoutent les articles ponctuels. Quantité à acheter = `quantite_cible − quantite` si une cible existe, sinon `seuil_minimum − quantite`.

## API

| Méthode | Chemin | Rôle |
|---|---|---|
| `POST` | `/api/installation` | Créer le premier compte administrateur (uniquement si aucun compte n'existe) |
| `POST` | `/api/connexion` | Se connecter avec son nom et son mot de passe |
| `POST` | `/api/deconnexion` | Se déconnecter |
| `PUT` | `/api/moi/mot-de-passe` | Changer son mot de passe |
| `GET` / `POST` | `/api/utilisateurs` | Lister ou créer des comptes (administrateur) |
| `PUT` / `DELETE` | `/api/utilisateurs/:id` | Réinitialiser le mot de passe ou supprimer un compte (administrateur) |
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
  auth.js         comptes, mots de passe et sessions
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

Le serveur tourne sur **une machine de la maison** allumée en permanence : un Raspberry Pi, un NAS capable de lancer Node.js ou un vieil ordinateur.

- **À la maison** : on accède à l'application depuis le réseau Wi-Fi, avec l'adresse de la machine (par exemple `http://garde-manger.local:3000`). Il faut donner à la machine une adresse fixe sur le réseau local, via la box.
- **Hors de la maison** (pour consulter la liste au magasin) : la solution recommandée est un **VPN** comme Tailscale ou WireGuard, installé sur la machine et sur les téléphones. L'application reste invisible depuis Internet, sans ouvrir de port sur la box. Tailscale peut en plus fournir un certificat HTTPS.
- **Démarrage automatique** : le serveur est lancé comme service système (par exemple avec `systemd`), pour redémarrer tout seul après une coupure.
- **Sauvegarde** : copie régulière du fichier `garde-manger.db` vers un autre support (disque externe, NAS, cloud).

L'accès depuis Internet sans VPN (ouverture de port et HTTPS) est déconseillé : il expose l'application et demande plus de maintenance.
