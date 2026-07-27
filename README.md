# Richbond Operations Usine

Application full-stack exécutable pour la gestion des opérations d’usine Richbond, avec dossiers séparés pour le frontend, le backend et la base de données.

## Structure Du Projet

```text
richbond/
  frontend/
    index.html
    styles.css
    app.js
    README.md
  backend/
    server.mjs
    package.json
    README.md
  database/
    richbond-db.json
    seed.json
  package.json
  README.md
  .gitignore
```

## Contenu

- Frontend : tableau de bord futuriste et interface par rôle dans `frontend/`
- Backend : API REST Node.js dans `backend/`
- Base de données : base locale JSON dans `database/`
- Aucune dépendance externe requise

## Lancer Le Projet

Depuis la racine du projet :

```bash
npm start
```

Puis ouvrir :

```text
http://localhost:3000
```

## Connexion

Comptes de démonstration :

```text
Administrateur : nadia@richbond.local
Superviseur    : sara@richbond.local
Employé        : ahmed@richbond.local
Mot de passe   : richbond123
```

Chaque rôle voit seulement les pages autorisées pour son profil.

## Scripts Utiles

```bash
npm run dev
npm run check
```

Vous pouvez aussi lancer uniquement le backend :

```bash
cd backend
npm start
```

Ou démarrer depuis le dossier frontend :

```bash
cd frontend
npm run dev
```

Le terminal affichera ensuite :

```text
Site web : http://localhost:3000
```

## Endpoints API

- `GET /api/health`
- `GET /api/bootstrap`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `GET /api/users`
- `GET /api/departments`

## Base De Données

Les changements de statut et les nouvelles tâches sont enregistrés dans :

```text
database/richbond-db.json
```

Les données de démonstration initiales sont stockées dans :

```text
database/seed.json
```
