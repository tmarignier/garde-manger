# Architecture technique

## Vue d'ensemble

Une application iOS native, sans serveur. Les données sont stockées sur l'iPhone et synchronisées via iCloud.

```
┌──────────────────────────────┐        ┌──────────────────────┐
│ iPhone                       │        │ iCloud (CloudKit)    │
│                              │        │                      │
│  Vues SwiftUI                │        │  Base privée         │
│      │                       │ sync   │  + zone partagée     │
│  Modèles / logique métier    │◄──────►│  (partage familial)  │
│      │                       │        │                      │
│  Core Data (base locale)     │        └──────────────────────┘
└──────────────────────────────┘
```

## Choix proposés

| Sujet | Choix | Pourquoi |
|---|---|---|
| Langage | Swift | Langage officiel d'Apple pour iOS. |
| Interface | SwiftUI | Moderne, peu de code, aperçus en direct dans Xcode. |
| Stockage local | Core Data | Fonctionne hors ligne, intégré à iOS. |
| Synchronisation | CloudKit via `NSPersistentCloudKitContainer` | Gratuit, pas de serveur ni de compte à gérer, et permet de **partager** le stock avec d'autres comptes iCloud de la famille. |
| Version minimale | iOS 17 | Couvre les iPhone récents et donne accès aux API SwiftUI actuelles. |
| Tests | XCTest / Swift Testing | Outils intégrés à Xcode. |

### Pourquoi Core Data plutôt que SwiftData ?

SwiftData est plus récent et plus simple à écrire, mais sa synchronisation iCloud ne couvre que la base privée d'un seul compte. Core Data sait partager des données entre plusieurs comptes iCloud (partage familial). Si finalement une seule personne utilise l'application, SwiftData devient le meilleur choix.

## Modèle de données

```
Categorie
  - nom            : texte
  - ordre          : entier (tri d'affichage)

Produit
  - nom            : texte
  - categorie      : Categorie
  - unite          : texte (paquet, boîte, kg…)
  - quantite       : décimal
  - seuilMinimum   : décimal
  - quantiteCible  : décimal (optionnel)

ArticlePonctuel          (ajouté à la main à la liste de courses)
  - nom            : texte
  - coche          : booléen
```

La liste de courses n'est **pas stockée** : elle est calculée à partir des produits dont `quantite < seuilMinimum`, à laquelle s'ajoutent les articles ponctuels. Quantité à acheter = `quantiteCible − quantite` si une cible existe, sinon `seuilMinimum − quantite`.

## Organisation du code

```
GardeManger/
  App/           point d'entrée de l'application
  Modeles/       entités Core Data et logique métier (calcul de la liste de courses)
  Vues/
    Stock/       liste des produits, fiche produit
    Courses/     liste de courses
  Persistance/   configuration Core Data + CloudKit
GardeMangerTests/
```

La logique métier (calcul de la liste de courses, ajustement des quantités) est isolée des vues pour pouvoir être testée facilement.

## Prérequis pour développer

- Un **Mac avec Xcode** (gratuit sur le Mac App Store).
- Un **compte Apple Developer payant** (99 € par an). Il est nécessaire pour utiliser CloudKit et pour installer l'application durablement sur l'iPhone, par exemple via TestFlight. Avec un compte gratuit, l'application installée depuis Xcode expire au bout de 7 jours et iCloud n'est pas disponible.

## Distribution

L'application n'est pas destinée à l'App Store. Elle sera installée sur les iPhone de la famille via **TestFlight**, qui permet d'inviter des proches à la tester.
