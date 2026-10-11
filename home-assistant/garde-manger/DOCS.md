# Garde-manger

Les stocks d'épicerie de la maison et la liste de courses, partagés par toute la famille.

## Premier lancement

1. Démarrez l'add-on, puis cliquez sur « Ouvrir l'interface web » (ou sur « Garde-manger » dans le menu latéral).
2. L'application demande de créer le premier compte : il devient **administrateur**.
3. Depuis l'écran « Comptes », l'administrateur crée un compte pour chaque membre du foyer.

Les comptes de l'application sont indépendants de ceux de Home Assistant : chaque membre se connecte avec son propre nom et son mot de passe.

## Ouvrir l'application

- **Depuis Home Assistant** : menu latéral, « Garde-manger ». Fonctionne aussi dans l'application Home Assistant, y compris hors de la maison si Home Assistant y est accessible.
- **En accès direct** : `http://<adresse du serveur>:3000`, par exemple `http://homeassistant.local:3000`, depuis le réseau local. C'est l'adresse à utiliser pour ajouter l'application à l'écran d'accueil d'un téléphone : sur iPhone, dans Safari, bouton Partager puis « Sur l'écran d'accueil » ; sur Android, dans Chrome, menu ⋮ puis « Ajouter à l'écran d'accueil ».

Pour ne garder que l'accès par Home Assistant, videz le port dans l'onglet « Configuration », section « Réseau ».

## Depuis l'extérieur

Le plus simple et le plus sûr est un VPN : installez l'add-on **Tailscale** sur Home Assistant et l'application Tailscale sur les téléphones. L'adresse directe fonctionne alors aussi au magasin, sans ouvrir de port sur la box ou le routeur.

## Sauvegardes

Les données (`/data/garde-manger.db`) font partie des sauvegardes de Home Assistant. Pendant une sauvegarde, l'add-on est arrêté quelques secondes, le temps de copier une base fermée proprement, puis il redémarre tout seul.

Pour restaurer, restaurez l'add-on « Garde-manger » depuis une sauvegarde (Paramètres > Système > Sauvegardes).

## Désinstallation

Désinstaller l'add-on efface ses données : faites une sauvegarde avant.

Le guide complet est sur [GitHub](https://github.com/tmarignier/garde-manger/blob/main/docs/installation.md).

## Mises à jour

Une nouvelle version apparaît dans Paramètres > Modules complémentaires. Les données sont conservées ; la base est mise à jour automatiquement au démarrage. Le détail des versions est dans l'onglet « Journal des modifications ».
