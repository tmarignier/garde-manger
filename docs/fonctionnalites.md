# Fonctionnalités

## Première version

### 0. Comptes de la famille

- Chaque membre de la famille a son compte (nom et mot de passe).
- Le premier compte créé est administrateur et crée les comptes des autres membres.
- Chacun peut changer son mot de passe ; l'administrateur peut le réinitialiser.
- Tous les membres partagent le même stock et voient les modifications des autres, avec le nom de la dernière personne qui a modifié chaque produit.
- Utilisable sur iPhone (avec ajout possible à l'écran d'accueil) et sur ordinateur.

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
- Historique complet des mouvements de stock (qui a ajouté ou retiré quoi, et quand).
- Mises à jour en temps réel entre les appareils.
- Fonctionnement hors connexion.
