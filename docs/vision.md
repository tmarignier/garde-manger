# Vision

## Le problème

Au moment de faire les courses, on ne sait jamais vraiment ce qu'il reste dans les placards. Résultat : on achète en double, ou on rentre sans l'essentiel.

## La réponse

Garde-manger est une application web qui tient à jour l'inventaire de l'épicerie de la maison et en déduit la liste de courses. L'objectif est de faire les courses sereinement, sans avoir à vérifier les placards avant de partir.

## Pour qui

Pour notre famille uniquement. Tous les membres de la famille partagent le même stock et peuvent le modifier, depuis un iPhone ou un ordinateur. L'application n'a pas vocation à être utilisée par d'autres foyers.

## Principes

- **Simple avant tout** : ajouter un produit ou mettre à jour une quantité doit prendre quelques secondes.
- **Saisie manuelle d'abord** : pas de scan ni de reconnaissance de ticket dans un premier temps.
- **Dépendances minimales** : du HTML, du CSS, du TypeScript et Node.js. Une bibliothèque externe n'est ajoutée que si elle se justifie (voir [architecture](architecture.md#politique-de-dépendances)).
- **Partout** : un simple navigateur suffit, sur téléphone comme sur ordinateur.

## Ce que l'application n'est pas (pour l'instant)

- Un gestionnaire de recettes ou de menus.
- Un suivi des dates de péremption.
- Un comparateur de prix ou un outil de commande en ligne.
