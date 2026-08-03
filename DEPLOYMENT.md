# Déploiement Neon et Render

L'environnement temporaire utilise Neon pour PostgreSQL et Render pour le
backend Node.js. Le backend sert également le frontend React. Le navigateur et
l'application Android utilisent donc une seule adresse HTTPS.

```text
Navigateur / Android -> HTTPS Render -> API Node.js -> TLS Neon PostgreSQL
                                            |
                                      frontend React
```

## Préparation locale

Depuis la racine du projet :

```powershell
npm ci
npm test
npm run check
npm run data:audit
npm run data:backup
```

Le déploiement doit être interrompu si l'une de ces commandes échoue.

## Base Neon

La base est créée et administrée avec le plugin Neon Postgres. Le schéma est
défini dans `database/migrations/` et appliqué par :

```powershell
npm run db:migrate
```

L'import initial conserve les utilisateurs, mots de passe hachés, tâches,
notes, activités, rapports, notifications et traces d'audit :

```powershell
npm run db:import -- --file "database/richbond-db.json" --confirm
npm run db:audit
npm run db:status
```

Les sessions locales ne sont jamais importées. Tous les utilisateurs doivent
se reconnecter au service déployé. `database/richbond-db.json` est un fichier
privé, ignoré par Git, qui doit rester sur le poste autorisé à effectuer
l'import.

## Backend Render

Le fichier `render.yaml` configure le Web Service :

- dépôt GitHub : `Najib20-stack/richbond-factory-operations` ;
- branche : `main` ;
- région : Oregon, à proximité de la base Neon temporaire en `us-west-2` ;
- build : `npm ci && npm test && npm run build` ;
- démarrage : `node backend/server.mjs` ;
- contrôle de santé : `/api/health`.

Render demande la valeur secrète `DATABASE_URL` pendant la création du
Blueprint. Utiliser l'URL PostgreSQL fournie par Neon. Elle ne doit apparaître
ni dans Git, ni dans un journal, ni dans une capture d'écran.

Le backend applique automatiquement les migrations au démarrage. Il refuse de
démarrer en production si `DATABASE_URL` est absente ou si PostgreSQL est
injoignable.

## Validation après déploiement

Remplacer l'adresse ci-dessous par l'URL Render réelle :

```powershell
Invoke-RestMethod https://richbond-operations.onrender.com/api/health
```

La réponse attendue contient :

```json
{
  "ok": true,
  "app": "Richbond Operations Usine",
  "database": "postgresql"
}
```

Tester ensuite une connexion de vérificateur, une connexion de responsable, la
création d'une tâche, son démarrage, sa soumission et sa validation.

## Android

Après validation de l'API HTTPS :

```powershell
$env:VITE_API_URL="https://richbond-operations.onrender.com"
npm run android:sync
```

L'application Android ne contient jamais les identifiants PostgreSQL. Elle
communique uniquement avec l'API Render.

## Limites temporaires

Une instance Render gratuite se met en veille lorsqu'elle reste inactive. Pour
une présentation planifiée, ouvrir le site quelques minutes avant ou utiliser
une instance payante. L'infrastructure finale pourra être déplacée vers le
serveur de l'entreprise en changeant `DATABASE_URL` et l'URL du backend.
