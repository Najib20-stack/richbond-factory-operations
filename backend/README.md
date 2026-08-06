# Backend Richbond

Backend Node.js pour l'application Richbond Operations.

## Lancer le backend

Depuis la racine du projet :

```bash
npm start
```

Depuis le dossier backend :

```bash
npm run dev
```

Le serveur démarre sur :

```txt
http://localhost:3000
```

## Structure

```txt
backend/
  server.mjs
  src/
    app.js
    config/
      env.js
    controllers/
      authController.js
      bootstrapController.js
      departmentController.js
      taskController.js
      userController.js
    database/
      database.js
      jsonDatabase.js
      postgresDatabase.js
      migrations.js
    models/
      departmentModel.js
      taskModel.js
      userModel.js
    routes/
      apiRoutes.js
    security/
      authorization.js
      loginProtection.js
      passwords.js
      sessions.js
    services/
      staticFileService.js
    utils/
      enrich.js
      http.js
      roles.js
      status.js
```

## API

```txt
GET    /api/health
GET    /api/bootstrap
POST   /api/login
POST   /api/logout
POST   /api/change-password
GET    /api/tasks
POST   /api/tasks
PATCH  /api/tasks/:id
DELETE /api/tasks/:id
GET    /api/users          (Administrateur)
POST   /api/users          (Administrateur)
PATCH  /api/users/:id      (Administrateur)
GET    /api/departments
POST   /api/departments
```

## Base de données

En production, le backend utilise PostgreSQL lorsque `DATABASE_URL` est définie.
Les migrations versionnées sont dans :

```txt
../database/migrations/
```

Sans `DATABASE_URL`, le développement local utilise le fichier de secours :

```txt
../database/richbond-db.json
```

Il est créé depuis `../database/seed.json` au premier démarrage, reste local et
est ignoré par Git.

Le mode `production` refuse de démarrer sans PostgreSQL.

## Vérification

```bash
npm run check:all
npm test
npm run data:audit
npm run data:backup
npm run db:migrate
npm run db:audit
```

Les tests utilisent une base temporaire indépendante et couvrent
l'authentification, les permissions, les transitions des tâches et le journal
d'audit.

## Configuration

Les variables principales sont `PORT`, `HOST`, `DATABASE_URL`,
`DATABASE_SSL_MODE`, `DATABASE_POOL_MAX`, `CORS_ORIGINS`, `SESSION_TTL_MS`,
`LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MS` et `LOGIN_LOCK_MS`.

Copier les valeurs utiles de `.env.example` dans l'environnement du service.
En production, `CORS_ORIGINS` doit contenir uniquement l'adresse HTTPS de
l'application et les origines Capacitor utilisées.

## Import initial PostgreSQL

```bash
npm run db:migrate
npm run db:import -- --file "database/richbond-db.json" --confirm
npm run db:status
npm run db:audit
```

Pour créer le premier compte Administrateur dans le moteur configuré, définir
`ADMIN_EMAIL`, `ADMIN_PASSWORD` et, si nécessaire, `ADMIN_DEPARTMENT_ID`, puis
exécuter :

```powershell
npm run admin:create
```

La commande ne journalise pas le mot de passe et impose son remplacement à la
première connexion.

## Sauvegarde JSON locale

Depuis la racine du projet :

```bash
npm run data:backup
npm run data:audit
npm run data:restore -- --file "backups/database/sauvegarde.json" --confirm
```

La restauration contrôle le fichier demandé et crée une sauvegarde de sécurité
avant de remplacer la base active.
