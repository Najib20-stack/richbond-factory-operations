# Deploiement Richbond

Cette application doit etre deployee comme une application Node.js, pas comme un simple site statique.

Le backend sert aussi le frontend et enregistre les donnees dans une base JSON.

## Option recommandee : Render

1. Cree un compte sur Render.
2. Mets ce projet sur GitHub.
3. Dans Render, choisis `New Web Service`.
4. Connecte le depot GitHub du projet.
5. Render detectera le fichier `render.yaml`.
6. Lance le deploiement.

Apres le deploiement, Render donnera une URL publique du type :

```txt
https://richbond-operations.onrender.com
```

Tu peux ouvrir cette URL sur ton telephone.

## Commandes utilisees

```bash
npm run check
npm start
```

## Base de donnees en mode gratuit

Le deploiement gratuit permet d'ouvrir l'application depuis ton telephone avec une URL publique.

Important : en mode gratuit, les fichiers modifies sur le serveur peuvent etre perdus apres redemarrage, redeploiement ou mise en veille du service.

En local et en deploiement gratuit, l'application utilise :

```txt
database/richbond-db.json
```

## Pour garder les donnees en production

Pour une vraie utilisation en production, il faudra utiliser l'une de ces options :

- un disque persistant sur un service payant ;
- une vraie base de donnees comme PostgreSQL.

Dans ce cas, configure une variable d'environnement :

```txt
DATABASE_DIR=/chemin/vers/le/dossier/persistant/database
```
