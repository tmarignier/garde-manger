# Historique des modifications d'un produit — conception

*Conception validée le 11 octobre 2026, réalisée dans la version 1.3.0. Le fonctionnement retenu est décrit dans [architecture.md](../architecture.md) ; ce document garde le raisonnement et les choix.*

## Besoin

Pouvoir ouvrir un produit et voir **qui a changé quoi, et quand** : « Léa a retiré 1 paquet hier à 19 h 02 (3 → 2) », « Thibault en a rangé 4 au retour des courses », « Thibault a passé le seuil de 2 à 3 ».

Aujourd'hui, chaque produit ne garde que la **dernière** modification (`updated_by`, `updated_at`) : tout ce qui précède est perdu.

## Ce qu'on enregistre

Un **événement** par modification réelle d'un produit, écrit dans la même transaction que la modification elle-même : si l'une échoue, l'autre n'existe pas.

| Type (`kind`) | Déclencheur aujourd'hui | Ce qu'on garde |
|---|---|---|
| `created` | `POST /api/products` | Quantité de départ et fiche complète |
| `adjusted` | Boutons `+` / `−` (`POST /api/products/:id/adjust`) | Quantité avant et après |
| `purchased` | Validation des courses (`POST /api/shopping-list/purchases`) | Quantité avant et après |
| `edited` | Fiche modifiée (`PUT /api/products/:id`) | Les seuls champs changés, avant et après (nom, catégorie, unité, seuil, cible, et la quantité si elle a été saisie) |
| `deleted` | `DELETE /api/products/:id` | La fiche telle qu'elle était |

Règles :

- **On garde « avant → après », pas seulement la variation.** La variation se déduit (`après − avant`), et on voit aussi les cas où le serveur a bloqué à 0 (deux personnes retirent le dernier paquet en même temps : un seul événement de −1, pas deux).
- **Rien n'est enregistré si rien ne change** : un `−` à 0 (le serveur l'ignore déjà), une fiche enregistrée sans modification.
- **On fige les noms au moment de l'événement** (nom de la personne, nom du produit, nom de la catégorie). Un compte supprimé ou une catégorie renommée plus tard ne réécrivent pas le passé : l'historique affiche « Léa » même si le compte de Léa n'existe plus.
- Le renommage d'une catégorie n'est **pas** un événement de chaque produit : ce n'est pas le produit qui a changé.
- Les articles ponctuels de la liste de courses ne sont pas des produits suivis : pas d'historique pour eux.

## Modèle de données

Une nouvelle table, ajoutée par la **migration 5** :

```
product_events            historique des modifications des produits
  id
  product_id              produit concerné ; reste renseigné après la suppression du produit (pas de clé étrangère)
  product_name            nom du produit au moment de l'événement
  user_id                 auteur (clé étrangère, ON DELETE SET NULL)
  user_name               nom de l'auteur au moment de l'événement
  kind                    'created' | 'adjusted' | 'purchased' | 'edited' | 'deleted' (CHECK)
  quantity_before         REAL, NULL si la quantité n'a pas changé
  quantity_after          REAL, NULL si la quantité n'a pas changé
  changes                 TEXT JSON : les champs de la fiche changés (liste vide pour un + ou un −)
  created_at              date ISO 8601 (UTC)

  index (product_id, id)  pour lire l'historique d'un produit du plus récent au plus ancien
  index (user_id)         pour la suppression d'un compte
```

- Table `STRICT`, comme les autres. `changes` est une liste JSON `[{ "field": "minQuantity", "before": 2, "after": 3 }]`, relue côté serveur comme `unknown` puis validé.
- **Pas de clé étrangère vers `products`** : sinon la suppression d'un produit effacerait (ou bloquerait) son historique.
- **Un identifiant de produit n'est jamais réutilisé** : SQLite peut redonner l'identifiant du dernier produit supprimé au produit suivant, qui hériterait alors de son historique. Un nouveau produit prend donc un identifiant plus grand que tous ceux des produits et de l'historique.
- **Pas de reprise du passé** : les modifications faites avant la mise à jour n'existent nulle part. L'historique d'un produit commence à l'installation de la version 1.3.0, et l'écran le dit (« Les modifications faites avant la version 1.3.0 de l'application ne sont pas connues »).

### Volume

Une famille fait au plus quelques dizaines de modifications par jour : environ 20 000 événements par an, soit 2 à 3 Mo dans la base. L'historique est gardé sans limite. La base reste un seul fichier, déjà couvert par la sauvegarde à froid de l'add-on : aucun changement côté sauvegarde.

## Code

Fidèle aux conventions actuelles (logique métier pure et testée seule, SQL paramétré, `unknown` validé) :

- `shared/product-history.ts` — **logique pure** :
  - `productEventFields(before, after)` : la quantité avant et après et les champs changés (rien si rien n'a changé) ;
  - `groupEvents(events)` : regroupe à l'affichage les `+`/`−` successifs d'une même personne dans le même sens, à moins de 5 minutes d'intervalle (« −3 (3 fois) » plutôt que trois lignes) ;
  - `isProductEvent` : validation d'un événement, utilisée par l'interface.
- `server/product-history.ts` — lecture et écriture de `product_events` en base (`findProductSnapshot`, `recordProductEvent`, `listProductEvents`).
- Les routes des produits et des courses : chaque écriture d'un produit lit la fiche **avant**, écrit, relit la fiche **après** et enregistre l'événement, le tout dans `transaction()`.
- `client/views/product-history.ts` : l'écran de l'historique, dans un fichier à part pour ne pas faire grossir `stock.ts` ; `describeEvent` y donne le texte en français.
- `shared/types.ts` : `ProductEvent`, `ProductEventKind`, `ProductChange`, `ProductHistoryResponse`.

Pas de déclencheur SQLite (`TRIGGER`) : il ne connaît pas l'auteur de la modification, et la logique resterait hors des tests unitaires.

## API

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/api/products/:id/history?before=<id>` | Les 50 événements les plus récents du produit (avant l'événement `before` pour la page suivante) : `{ "events": [...], "hasMore": true }` |

- Accessible à tous les comptes connectés (même règle que le stock : toute la famille voit tout).
- Fonctionne aussi pour un produit supprimé, puisque ses événements restent (utile pour un futur journal général).
- Pagination par identifiant plutôt que par numéro de page : un `−` fait pendant qu'on fait défiler ne décale pas la liste.

## Interface

Dans l'écran **Stock**, la ligne « Modifié par … » de chaque produit se termine par un lien **Historique**, qui déplie l'historique sous le produit (au même emplacement que le formulaire de modification) :

```
Historique de « Pâtes »
Aujourd'hui
  19:02  Léa         −1          3 → 2
  08:15  Thibault    −1          4 → 3
Hier
  18:40  Thibault    Courses +4  0 → 4
  12:30  Léa         −2 (2 fois) 2 → 0
3 oct.
  21:10  Thibault    Fiche : seuil 2 → 3, cible — → 4
                                  [Voir plus]
```

- Regroupé par jour, heure locale du téléphone, formats français (`Intl.DateTimeFormat('fr-FR')`, déjà disponible dans le navigateur).
- Lisible sur iPhone : une ligne par événement, la variation en évidence, « avant → après » en plus petit.
- « Voir plus » charge la page suivante.

## Tests prévus

- Unitaires : `productEventFields` (aucun changement, champ par champ, cible qui passe à vide, création et suppression), `groupEvents` (même personne, personnes différentes, sens, écart de temps).
- API, base en mémoire :
  - `+`, `−`, `−` à 0 (aucun événement), courses, modification de fiche avec et sans quantité, création, suppression ;
  - un compte supprimé garde son nom dans l'historique ;
  - pagination `before` ;
  - une modification qui échoue n'écrit pas d'événement (transaction) ;
  - migration 5 sur une base existante en version 4.

## Livraison

Une seule pull request, version **1.3.0** de l'add-on (migration 5 appliquée au démarrage, sans action de la famille), avec `docs/architecture.md` (table, API) et `docs/fonctionnalites.md` (l'idée passe de « Plus tard » à la liste des fonctionnalités) mis à jour dans la même pull request.

Hors périmètre de cette première version : annuler une modification depuis l'historique, statistiques de consommation, journal général de tous les produits.

## Choix validés

1. **L'historique d'un produit supprimé est gardé**, avec un dernier événement « supprimé par … » ; un futur journal général pourra le montrer.
2. **L'historique est gardé sans limite** (quelques Mo par an).
3. **Les `+`/`−` rapprochés** sont enregistrés un par un et regroupés seulement à l'affichage : rien n'est perdu.
4. **Le journal général** (toutes les modifications de tous les produits, filtrable par personne) viendra plus tard, dans une autre pull request.
