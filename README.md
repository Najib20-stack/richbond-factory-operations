# Richbond Operations Usine

Application full-stack de gestion des taches d'usine Richbond, avec frontend, backend Node.js et base de donnees JSON locale.

## Structure du projet

```text
richbond/
  frontend/
    index.html
    styles.css
    app.js
    package.json
  backend/
    server.mjs
    src/
    package.json
  database/
    richbond-db.json
    seed.json
  package.json
  render.yaml
```

## Lancer le projet

Depuis la racine :

```bash
npm start
```

Puis ouvrir :

```text
http://localhost:3000
```

## Connexion demo

```text
Verificateur : nadia@richbond.local
Verificateur : sara@richbond.local
Responsable  : youssef@richbond.local
Mot de passe : richbond123
```

## Scripts utiles

```bash
npm run dev
npm run check
npm run check:backend
npm run check:frontend
```

## API

- `GET /api/health`
- `GET /api/bootstrap`
- `POST /api/login`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `GET /api/departments`
- `POST /api/departments`

## Base de donnees

En local, les donnees sont enregistrees dans :

```text
database/richbond-db.json
```

Les donnees initiales sont dans :

```text
database/seed.json
```

Pour un deploiement avec stockage persistant, configure :

```text
DATABASE_DIR=/chemin/vers/le/dossier/database
```
