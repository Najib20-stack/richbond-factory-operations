# Richbond Operations Usine

Application de suivi des opérations d'usine avec une interface React, une API
Node.js sécurisée, PostgreSQL en production et une application Android générée
avec Capacitor. Le stockage JSON reste disponible uniquement comme solution de
développement local et comme source de l'import initial.

## Rôles métier

- **Vérificateur** : crée et affecte les tâches, contrôle les travaux, gère les
  utilisateurs et les départements, puis consulte les rapports.
- **Responsable** : consulte uniquement ses tâches, les démarre, les met en
  pause, signale un problème, demande une nouvelle échéance et les soumet à la
  vérification.

Le backend contrôle ces droits sur chaque requête. Masquer un écran dans le
frontend ne suffit jamais à donner ou à retirer une autorisation.

## Démarrage local

Prérequis : Node.js 22 ou une version plus récente.

```powershell
npm install
npm start
```

Ouvrir ensuite `http://localhost:3000`.

Pour travailler avec le serveur Vite et son rechargement automatique, utiliser
deux terminaux :

```powershell
npm run dev --prefix backend
npm run dev --prefix frontend
```

L'interface Vite est alors disponible sur `http://localhost:5173`.

## Comptes de démonstration

```text
Vérificateur : verificateur.demo1@example.test
Responsable  : responsable.demo1@example.test
Mot de passe temporaire : richbond123
```

Ces comptes imposent le choix d'un nouveau mot de passe à la première
connexion. Ils doivent être remplacés par les comptes réels avant la mise en
production.

Au premier démarrage local, `database/richbond-db.json` est créé depuis le jeu
synthétique `database/seed.json`. Ce fichier de travail est ignoré par Git et
ne doit jamais être publié.

## Vérification du projet

```powershell
npm test
npm run check
npm run data:audit
npm run data:backup
```

Avec une variable `DATABASE_URL` configurée :

```powershell
npm run db:migrate
npm run db:import -- --file "database/richbond-db.json" --confirm
npm run db:audit
```

La restauration est volontairement protégée par une confirmation explicite :

```powershell
npm run data:restore -- --file "backups/database/sauvegarde.json" --confirm
```

## Structure

```text
frontend/        Interface React et tests de parcours
backend/         API, sécurité, contrôleurs et tests
database/        migrations SQL et jeu initial synthétique
android/         projet Android Studio
deploy/          exemples Nginx, systemd et environnement
docs/            guides, recette et procédures d'exploitation
```

## Documentation

- [Application Android](ANDROID.md)
- [Déploiement sur le serveur de l'entreprise](DEPLOYMENT.md)
- [Guide du vérificateur](docs/GUIDE_VERIFICATEUR.md)
- [Guide du responsable](docs/GUIDE_RESPONSABLE.md)
- [Recette fonctionnelle](docs/RECETTE_FONCTIONNELLE.md)
- [Exploitation et reprise](docs/EXPLOITATION.md)
- [Décisions à confirmer avec l'entreprise](docs/DECISIONS_EN_ATTENTE.md)
- [Connexion avec pgAdmin](docs/PGADMIN.md)

## Sécurité actuelle

- mots de passe hachés avec `scrypt` et sels aléatoires ;
- sessions opaques, limitées dans le temps et révoquées à la déconnexion ;
- changement obligatoire des mots de passe temporaires ;
- limitation des tentatives de connexion ;
- validation des entrées, contrôle des rôles et journal d'audit ;
- transactions PostgreSQL sérialisées entre les instances du backend ;
- HTTPS obligatoire pour une version Android de production.
