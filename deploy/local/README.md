# Demonstration HTTPS gratuite

Cette solution conserve PostgreSQL sur Neon et publie temporairement le serveur
execute sur ce PC avec un Quick Tunnel Cloudflare.

## Premiere configuration

1. Executer `powershell -ExecutionPolicy Bypass -File deploy/local/Install-Cloudflared.ps1`.
2. Copier la chaine de connexion PostgreSQL groupee depuis Neon.
3. Executer `powershell -ExecutionPolicy Bypass -File deploy/local/Set-RichbondDatabaseSecret.ps1`.
4. Coller la chaine dans l'invite securisee et appuyer sur Entree.

La valeur est chiffree par Windows pour l'utilisateur courant et enregistree dans
le dossier `.tools`, ignore par Git.

## Demarrer

```powershell
powershell -ExecutionPolicy Bypass -File deploy/local/Start-RichbondDemo.ps1
```

Le script construit le frontend, demarre l'API avec Neon, ouvre le tunnel HTTPS
et affiche l'adresse publique apres avoir verifie `/api/health`.

## Arreter

```powershell
powershell -ExecutionPolicy Bypass -File deploy/local/Stop-RichbondDemo.ps1
```

Le PC doit rester allume et connecte. L'adresse `trycloudflare.com` change a
chaque redemarrage. Cette solution convient aux tests et demonstrations, pas a
la production definitive.
