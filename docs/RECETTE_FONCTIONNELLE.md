# Recette fonctionnelle

Renseigner la date, le testeur, le résultat et une preuve pour chaque scénario.

| ID | Profil | Scénario | Résultat attendu | Statut |
|---|---|---|---|---|
| AUTH-01 | Tous | Connexion avec un compte valide | Accès au bon espace | À tester |
| AUTH-02 | Tous | Mot de passe incorrect | Refus sans révéler le compte | À tester |
| AUTH-03 | Tous | Mot de passe temporaire | Changement obligatoire | À tester |
| AUTH-04 | Tous | Déconnexion | Session immédiatement révoquée | À tester |
| SEC-01 | Responsable | Ouvrir l'URL Utilisateurs | Accès refusé par l'API | À tester |
| SEC-02 | Responsable | Créer une tâche via l'API | Réponse 403 | À tester |
| USR-01 | Vérificateur | Créer un responsable | Compte créé avec mot de passe temporaire | À tester |
| USR-02 | Vérificateur | Désactiver un compte | Connexion et sessions refusées | À tester |
| DEP-01 | Vérificateur | Ajouter un département | Département disponible dans les filtres | À tester |
| TASK-01 | Vérificateur | Créer et affecter une tâche | Tâche visible par les responsables choisis | À tester |
| TASK-02 | Vérificateur | Rejouer une soumission | Aucune tâche dupliquée | À tester |
| WORK-01 | Responsable | Démarrer une tâche | État En cours et date de début enregistrée | À tester |
| WORK-02 | Responsable | Signaler un problème | État Bloquée et note enregistrée | À tester |
| WORK-03 | Responsable | Demander une échéance | Demande visible par le créateur | À tester |
| WORK-04 | Responsable | Terminer une tâche | État En attente de vérification | À tester |
| REV-01 | Vérificateur désigné | Valider la tâche | État Terminée et notification envoyée | À tester |
| REV-02 | Autre vérificateur | Tenter une validation | Action refusée | À tester |
| REV-03 | Vérificateur désigné | Refuser avec un motif | Retour En cours et motif visible | À tester |
| FIL-01 | Vérificateur | Filtrer par département | Uniquement les tâches correspondantes | À tester |
| SRC-01 | Tous | Rechercher une tâche visible | Résultats pertinents sans fuite de données | À tester |
| REP-01 | Vérificateur | Exporter une période | Fichier structuré et compréhensible | À tester |
| NET-01 | Tous | Couper le réseau | Message hors ligne et possibilité de réessayer | À tester |
| NET-02 | Tous | Double-clic sur une création | Une seule opération enregistrée | À tester |
| DB-01 | Exploitant | Ouvrir `/api/health` | `database` vaut `postgresql` | À tester |
| AND-01 | Tous | Parcours sur émulateur Android | Même comportement que le web | À tester |
