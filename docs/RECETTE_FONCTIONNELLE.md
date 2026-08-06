# Recette fonctionnelle

Renseigner la date, le testeur, le résultat et une preuve pour chaque scénario.

| ID | Profil | Scénario | Résultat attendu | Statut |
|---|---|---|---|---|
| AUTH-01 | Vérificateur/Responsable | Connexion avec un compte valide | Accès à son espace opérationnel | À tester |
| AUTH-02 | Vérificateur/Responsable | Mot de passe incorrect | Refus sans révéler le compte | À tester |
| AUTH-03 | Vérificateur/Responsable | Mot de passe temporaire | Changement obligatoire | À tester |
| AUTH-04 | Vérificateur/Responsable | Déconnexion | Session immédiatement révoquée | À tester |
| NAV-01 | Vérificateur/Responsable | Ouvrir la navigation | Quatre onglets, sans To Do, Utilisateurs ni Rapports | À tester |
| NAV-02 | Administrateur | Ouvrir la navigation | Six onglets, dont Utilisateurs et Rapports | À tester |
| SEC-01 | Vérificateur/Responsable | Créer un compte via l'API | Réponse 403 | À tester |
| SEC-02 | Vérificateur/Responsable | Modifier un compte via l'API | Réponse 403 | À tester |
| SEC-03 | Administrateur | Créer puis désactiver un compte | Opérations acceptées et journalisées | À tester |
| DEP-01 | Vérificateur/Responsable | Ajouter un département | Département disponible dans les filtres | À tester |
| TASK-01 | Vérificateur/Responsable | Créer et affecter une tâche | Tâche visible par les personnes concernées | À tester |
| TASK-02 | Vérificateur/Responsable | Rejouer une soumission | Aucune tâche dupliquée | À tester |
| TASK-03 | Compte sans lien | Consulter une tâche du même département | Tâche absente et accès API refusé | À tester |
| WORK-01 | Responsable désigné | Démarrer une tâche | État En cours et date de début enregistrée | À tester |
| WORK-02 | Responsable désigné | Signaler un problème | État Bloquée et note enregistrée | À tester |
| WORK-03 | Responsable désigné | Demander une échéance | Demande visible par le créateur | À tester |
| WORK-04 | Responsable désigné | Clôturer une tâche | État En attente de vérification | À tester |
| REV-01 | Vérificateur désigné | Valider la tâche | État Terminée et notification envoyée | À tester |
| REV-02 | Autre compte | Tenter une validation | Action refusée | À tester |
| REV-03 | Vérificateur désigné | Tenter de rejeter sans motif | Rejet bloqué et motif signalé comme obligatoire | À tester |
| REV-04 | Vérificateur désigné | Rejeter avec un motif précis | État Rejetée et motif visible par le responsable dans À faire | À tester |
| FIL-01 | Vérificateur/Responsable | Filtrer par département | Uniquement les tâches correspondantes | À tester |
| FIL-02 | Administrateur | Filtrer par département | Tâches et indices limités au département | À tester |
| FIL-03 | Administrateur | Rechercher une tâche | Résultats globaux filtrés par le texte saisi | À tester |
| KPI-01 | Vérificateur/Responsable | Consulter l'indice d'engagement | Uniquement son propre indice | À tester |
| KPI-02 | Administrateur | Consulter les indices d'engagement | Tous les Vérificateurs/Responsables du périmètre | À tester |
| NET-01 | Vérificateur/Responsable | Couper le réseau | Message hors ligne et possibilité de réessayer | À tester |
| NET-02 | Vérificateur/Responsable | Double-clic sur une création | Une seule opération enregistrée | À tester |
| DB-01 | Exploitant | Ouvrir `/api/health` | `database` vaut `postgresql` | À tester |
| AND-01 | Vérificateur/Responsable | Parcours sur émulateur Android | Même comportement que le web | À tester |
