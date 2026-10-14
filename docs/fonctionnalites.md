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
- Modifier ou supprimer un produit, y compris changer sa catégorie.
- Renommer une catégorie : le nouveau nom s'applique à tous ses produits.
- Consulter la liste des produits, regroupés par catégorie, une ligne par produit. La recherche par nom et les filtres restent en haut de l'écran pendant qu'on fait défiler la liste ; ils sont conservés quand on passe par la liste de courses.
- Filtrer d'un toucher : les produits à racheter (sous leur seuil), ceux en rupture (quantité 0), ou une catégorie.
- La recherche trouve tous les mots tapés, dans n'importe quel ordre (« basmati riz » trouve « Riz basmati »), dans le nom du produit ou de sa catégorie (« surgelés » montre toute la catégorie). Sur ordinateur, `/` place le curseur dans la recherche et Échap l'efface.
- Chaque catégorie affiche son nombre de produits ; toucher son titre la replie. Les catégories repliées sont mémorisées sur chaque appareil, et toujours dépliées pendant une recherche ou un filtre.
- Le nombre de produits affichés est indiqué en tête de liste, et les produits en rupture (quantité 0) sont signalés à part de ceux à racheter.
- Quand la recherche ne trouve rien, un bouton propose d'ajouter le produit avec le nom déjà saisi ; si le produit existe hors du filtre choisi, un bouton propose de chercher dans tout le stock.

### 2. Suivre la quantité en stock

- Chaque produit porte une quantité actuelle.
- Boutons `+` et `−` pour ajuster rapidement la quantité (on consomme un paquet, on en range un).
- Consulter l'historique de chaque produit : qui a ajouté, retiré, acheté ou modifié quoi, et quand. Les `+` et `−` faits d'affilée par la même personne sont regroupés sur une ligne.

### 3. Générer la liste de courses

- Chaque produit a un **seuil minimum** (ex. « 2 paquets de pâtes »).
- Dès que la quantité passe **sous le seuil**, le produit apparaît automatiquement dans la liste de courses.
- Chaque produit peut aussi avoir une **quantité cible** (ex. « 4 paquets ») : la liste propose alors d'en acheter la différence. Sans quantité cible, on propose de remonter jusqu'au seuil.
- Pendant les courses, on coche les produits achetés, en corrigeant si besoin la quantité achetée. Valider les achats ajoute les quantités achetées au stock.
- Les coches sont gardées et partagées par toute la famille jusqu'à la validation : on peut cocher en passant la commande d'un drive, puis valider à la livraison, depuis n'importe quel téléphone.
- La liste est regroupée par catégorie, comme le stock, et se manipule d'une main sur le téléphone. Un filtre par catégorie, en pastilles, n'affiche que les produits d'un rayon ; les articles ponctuels restent affichés et les produits cochés hors du filtre sont validés avec les autres.
- On peut ajouter à la main un article ponctuel à la liste (hors stock suivi).

## Plus tard (idées, non prioritaires)

- Scan du code-barres pour ajouter un produit.
- Lecture du ticket de caisse pour mettre le stock à jour.
- Lieux de rangement (placard, cellier, congélateur).
- Dates de péremption et alertes.
- Tri de la liste de courses selon l'ordre des rayons du magasin.
- Journal général de toutes les modifications du stock, filtrable par personne.
- Mises à jour en temps réel entre les appareils.
- Fonctionnement hors connexion.
