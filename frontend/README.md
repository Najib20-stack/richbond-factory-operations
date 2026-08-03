# Frontend Richbond

Interface React construite avec Vite. En développement, Vite transmet les
requêtes `/api` au backend local sur le port 3000.

Depuis la racine du projet, démarrer le backend :

```powershell
npm run dev --prefix backend
```

Dans un second terminal, démarrer le frontend :

```powershell
npm run dev --prefix frontend
```

Ouvrir `http://localhost:5173`.

Commandes de vérification :

```powershell
npm run test --prefix frontend
npm run check --prefix frontend
```

Pour copier une nouvelle version du frontend vers Android :

```powershell
npm run android:sync
```
