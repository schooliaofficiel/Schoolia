# Sécurité de SCHOOLIA — ce qui est en place et ce qu'il reste à régler dans les tableaux de bord

## Déjà en place (dans le code et la base)
- **Isolation entre écoles** : règles RLS PostgreSQL sur toutes les tables, clés étrangères composites (une ligne ne peut pas référencer une autre école).
- **Rôles** : directeur, secrétaire, comptable, enseignant, parent, élève, avec droits distincts appliqués par la base.
- **Finances inaltérables** : plus de modification ni de suppression directe des paiements, dépenses et recettes ; annulation ou correction uniquement, avec motif obligatoire.
- **Journal d'audit** : création, modification, suppression des données sensibles, avec avant/après.
- **École suspendue** : accès bloqué au niveau de la base de données (pas seulement dans l'interface).
- **Assistant IA** : lecture seule, exécuté avec les droits de l'utilisateur connecté ; la clé du fournisseur n'existe que côté serveur.
- **Double authentification** facultative (application d'authentification) et **fermeture de session après 30 min d'inactivité**.
- **En-têtes de sécurité** (CSP, anti-clickjacking, HSTS…) dans `vercel.json`.
- **Limites anti-abus** : taille maximale des champs texte, 100 messages/jour/utilisateur, 150 questions IA/jour/utilisateur.
- **Export CSV** protégé contre l'injection de formules.
- **Tests** : `supabase/tests/001_security_and_isolation.sql` (88 contrôles) et tests unitaires `npm test`.

## À régler dans Supabase (je ne peux pas le faire à ta place)
Supabase → projet `schoolia` :
1. **Authentication → Sign In / Providers → Email** : activer **Confirm email** une fois la phase de test terminée ; longueur minimale du mot de passe : **10**.
2. **Authentication → Attack Protection** : activer **CAPTCHA** (Cloudflare Turnstile, gratuit) pour limiter la création de fausses écoles ; régler les limites de débit.
3. **Authentication → Password security** : activer **Leaked password protection** (nécessite le plan Pro).
4. **Authentication → Multi-Factor** : vérifier que **TOTP** est activé.
5. **Authentication → URL Configuration** : *Site URL* = l'adresse Vercel ; ne laisser que les URL de redirection nécessaires.
6. **Authentication → Sessions** : durée maximale de session (par ex. 7 jours) et expiration du jeton à 1 h.
7. **Project Settings → Database → Backups** : sauvegardes quotidiennes (plan Pro) et **Point-in-time recovery** pour les écoles payantes.
8. **Edge Functions → Secrets** : `MISTRAL_API_KEY` ; ajouter `ALLOWED_ORIGINS` = l'adresse exacte du site (ex. `https://schoolia.vercel.app`) pour que seule ton application puisse appeler l'assistant.
9. **SMTP personnalisé** (Authentication → SMTP) avant le lancement commercial : le service par défaut est très limité.

## À régler ailleurs
- **GitHub** : activer l'authentification à deux facteurs ; protéger la branche `main` ; activer Dependabot.
- **Vercel** : activer l'authentification à deux facteurs ; n'ajouter dans les variables d'environnement que `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (jamais la clé `service_role`).
- **Clés** : ne jamais partager la clé `service_role` de Supabase ni la clé Mistral ; les renouveler en cas de doute.

## Bonnes pratiques d'exploitation
- Exécuter la suite SQL de tests après chaque évolution de la base.
- Consulter régulièrement *Supabase → Advisors → Security*.
- Garder au moins deux personnes de confiance avec accès aux comptes GitHub, Vercel et Supabase.
