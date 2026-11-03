# SCHOOLIA

Plateforme SaaS de gestion scolaire multi-écoles (React + TypeScript + Tailwind + Supabase).

## Démarrage local
```bash
npm install
cp .env.example .env.local   # puis renseigner les 2 variables
npm run dev
```

## Variables d'environnement
| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clé publique (publishable / anon). Jamais la clé `service_role`. |

## Déploiement (Vercel)
1. Importer le dépôt GitHub dans Vercel (preset Vite détecté automatiquement).
2. Ajouter les 2 variables ci-dessus.
3. Déployer. `vercel.json` gère le routage de l'application monopage.

## Supabase
- Authentification : dans *Authentication → Providers → Email*, désactiver « Confirm email » pendant les tests pour créer un compte et accéder directement à l'application.
- Dans *Authentication → URL Configuration*, ajouter l'URL Vercel du site.

## Sécurité
- Isolation entre écoles garantie par les règles RLS PostgreSQL, pas par le code du navigateur.
- Les clés des fournisseurs d'IA ne seront jamais dans ce code : elles vivront dans une fonction serveur Supabase.

## Modules livrés
Authentification, création d'école, tableau de bord, élèves (inscription), finances (frais, paiements, reçus imprimables, soldes, dépenses/recettes), paramètres et démonstration.
