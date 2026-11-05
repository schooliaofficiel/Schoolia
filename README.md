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

## Application mobile installable (PWA)
- `public/manifest.webmanifest`, icônes, `public/sw.js` (service worker) et `public/offline.html`.
- Seuls les fichiers statiques sont mis en cache ; les données (Supabase) ne le sont jamais.
- Installation : Android (Chrome) via le bandeau ou Paramètres ; iPhone (Safari) via Partager > Sur l'écran d'accueil.
- Pour publier une nouvelle version du cache, changer `VERSION` dans `public/sw.js`.

## Tests
- `npm test` : tests unitaires (formats, calculs d'abonnement, export CSV).
- `npm run test:sw` : simulation du service worker (aucune donnée n'est mise en cache).
- `supabase/tests/001_security_and_isolation.sql` : à coller dans Supabase → SQL Editor ; vérifie l'isolation entre écoles, les droits par rôle, les finances et la facturation. Tout est annulé à la fin ; le message final indique « TESTS: n/n réussis » ou la liste des échecs.
- GitHub Actions (`.github/workflows/ci.yml`) lance les tests et la compilation à chaque envoi.

## Sécurité
Voir `docs/SECURITE.md` (mesures en place et réglages à faire dans les tableaux de bord).

- Isolation entre écoles garantie par les règles RLS PostgreSQL, pas par le code du navigateur.
- Les clés des fournisseurs d'IA ne seront jamais dans ce code : elles vivront dans une fonction serveur Supabase.

## Modules livrés
Authentification, création d'école, tableau de bord, élèves (inscription), finances (frais, paiements, reçus imprimables, soldes, dépenses/recettes), paramètres et démonstration.
