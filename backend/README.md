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
      jsonDatabase.js
    models/
      departmentModel.js
      taskModel.js
      userModel.js
    routes/
      apiRoutes.js
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
GET    /api/tasks
POST   /api/tasks
PATCH  /api/tasks/:id
GET    /api/users
POST   /api/users
PATCH  /api/users/:id
GET    /api/departments
POST   /api/departments
```

## Base de données

Les données sont stockées dans :

```txt
../database/richbond-db.json
```

Si ce fichier n'existe pas, le backend le crée depuis :

```txt
../database/seed.json
```

## Vérification

```bash
npm run check
npm run check:all
```
