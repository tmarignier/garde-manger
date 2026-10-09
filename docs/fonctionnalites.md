# Fonctionnalités

## Première version

### 1. Gérer la liste des produits en stock

- Ajouter un produit : nom, catégorie (ex. épicerie salée, épicerie sucrée, boissons, hygiène), unité (paquet, boîte, bouteille, kg…).
- Modifier ou supprimer un produit.
- Consulter la liste des produits, regroupés par catégorie, avec une recherche par nom.

### 2. Suivre la quantité en stock

- Chaque produit porte une quantité actuelle.
- Boutons `+` et `−` pour ajuster rapidement la quantité (on consomme un paquet, on en range un).

### 3. Générer la liste de courses

- Chaque produit a un **seuil minimum** (ex. « 2 paquets de pâtes »).
- Dès que la quantité passe **sous le seuil**, le produit apparaît automatiquement dans la liste de courses.
- Chaque produit peut aussi avoir une **quantité cible** (ex. « 4 paquets ») : la liste propose alors d'en acheter la différence. Sans quantité cible, on propose de remonter jusqu'au seuil.
- Pendant les courses, on coche les produits achetés. Cocher un produit ajoute la quantité achetée au stock.
- On peut ajouter à la main un article ponctuel à la liste (hors stock suivi).

## Plus tard (idées, non prioritaires)

- Scan du code-barres pour ajouter un produit.
- Lecture du ticket de caisse pour mettre le stock à jour.
- Lieux de rangement (placard, cellier, congélateur).
- Dates de péremption et alertes.
- Tri de la liste de courses selon l'ordre des rayons du magasin.
- Widget sur l'écran d'accueil, raccourcis Siri.

## Questions ouvertes

- **Partage familial** : plusieurs membres de la famille doivent-ils modifier le même stock depuis leur propre iPhone ? L'architecture proposée le permet (voir [architecture](architecture.md)), mais cela reste à confirmer.
