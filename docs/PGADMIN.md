# Connexion PostgreSQL avec pgAdmin

pgAdmin est l'outil d'administration. La base elle-même est hébergée par Neon.

## Enregistrer le serveur

1. Dans Neon, ouvrir le projet Richbond et afficher la connexion directe, sans
   pooler.
2. Dans pgAdmin, ouvrir **Register > Server**.
3. Dans **General**, saisir `Richbond - Neon`.
4. Dans **Connection**, renseigner l'hôte, le port `5432`, la base, l'utilisateur
   et le mot de passe indiqués par Neon.
5. Dans **SSL**, choisir le mode `require` ou plus strict.
6. Enregistrer puis ouvrir `Databases > neondb > Schemas > public > Tables`.

Ne jamais enregistrer la chaîne de connexion dans Git. Si pgAdmin propose de
mémoriser le mot de passe, cette décision doit respecter la politique du PC et
de l'entreprise.

## Tables principales

| Table | Contenu |
|---|---|
| `departments` | Départements de production |
| `users` | Comptes, rôles et mots de passe hachés |
| `tasks` | Tâches et état du workflow |
| `task_responsibles` | Affectations multiples |
| `task_notes` | Notes et problèmes signalés |
| `notifications` | Notifications utilisateur |
| `sessions` | Sessions hachées et expirables |
| `audit_log` | Journal de sécurité |
| `schema_migrations` | Versions du schéma appliquées |

La structure doit être modifiée uniquement par un nouveau fichier de migration,
jamais manuellement dans l'environnement déployé.
