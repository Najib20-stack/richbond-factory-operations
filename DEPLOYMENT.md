# Déploiement gratuit Neon et Cloudflare

L'environnement temporaire utilise Neon pour PostgreSQL et Cloudflare Workers
pour le backend Node.js et le frontend React. Le navigateur et l'application
Android utilisent la même API HTTPS.

```text
Navigateur / Android -> HTTPS Cloudflare -> API Node.js -> TLS Neon PostgreSQL
                              |
                        frontend React
```

Adresse publique actuelle :

```text
https://richbond-operations.richbond-ma.workers.dev
```

## Préparation locale

Depuis la racine du projet :

```powershell
npm ci
npm test
npm run check
npm run data:audit
npm run build
```

Le déploiement doit être interrompu si l'une de ces commandes échoue.

## Base Neon

Le schéma est défini dans `database/migrations/`. Les migrations et l'import
initial doivent être exécutés depuis un poste autorisé avant le déploiement du
Worker :

```powershell
npm run db:migrate
npm run db:import -- --file "database/richbond-db.json" --confirm
npm run db:audit
npm run db:status
```

Les sessions locales ne sont jamais importées. Le fichier
`database/richbond-db.json` est privé et ignoré par Git. L'adresse PostgreSQL
Neon doit rester dans un gestionnaire de secrets et ne doit jamais apparaître
dans Git, un journal ou une capture d'écran.

## Backend Cloudflare

Le fichier `wrangler.jsonc` configure le Worker, les fichiers React statiques,
le routage `/api/*` et les paramètres de production non secrets. La variable
`DATABASE_URL` est enregistrée séparément comme secret Cloudflare :

```powershell
npx wrangler login
npx wrangler secret put DATABASE_URL
npm run cloudflare:deploy
```

La dernière commande reconstruit le frontend puis déploie le backend et les
fichiers statiques. Le Worker utilise la connexion PostgreSQL groupée fournie
par Neon et ouvre une connexion éphémère par requête.

## Validation

```powershell
Invoke-RestMethod `
  https://richbond-operations.richbond-ma.workers.dev/api/health
```

La réponse attendue contient :

```json
{
  "ok": true,
  "app": "Richbond Operations Usine",
  "database": "postgresql"
}
```

Il faut ensuite vérifier la connexion de chaque rôle, la création et
l'affectation d'une tâche, son exécution, son rejet motivé, sa vérification et
l'export des rapports.

## Android

Le fichier local ignoré `frontend/.env.android.local` doit contenir :

```dotenv
VITE_API_URL=https://richbond-operations.richbond-ma.workers.dev
```

Puis synchroniser et construire l'application :

```powershell
npm run android:sync
Set-Location android
.\gradlew.bat assembleDebug --no-daemon
```

L'application Android ne contient jamais les identifiants PostgreSQL. Elle
communique uniquement avec l'API Cloudflare.

## Limites de l'environnement gratuit

Cette infrastructure gratuite convient aux essais, aux démonstrations et au
pilote. Elle est soumise aux quotas de Cloudflare Workers et de Neon et ne
constitue pas un hébergement d'entreprise avec garantie de disponibilité. Pour
la production interne, le Worker et la base pourront être déplacés vers
l'infrastructure approuvée par Richbond sans modifier les workflows métier.
