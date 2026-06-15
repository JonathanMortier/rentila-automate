# rentila-automate — Logique du projet

## Objectif
Automatiser le téléchargement des avis d'échéance et quittances de loyer depuis Rentila.com via Playwright, puis créer un brouillon Gmail avec le PDF en pièce jointe.

## Architecture

```
rentila-automate/
├── src/
│   ├── index.ts          # CLI : dispatche vers avis | quittance
│   ├── rentila.ts        # Playwright : login, navigation, téléchargement
│   ├── mailer.ts         # Brouillon email local (.txt)
│   ├── gmail.ts          # Brouillon Gmail via API OAuth2
│   ├── auth-gmail.ts     # Script one-shot pour obtenir le refresh token
│   └── config.ts         # Variables d'environnement + mois français
├── .github/workflows/
│   ├── avis-echeance.yml # Cron 1er du mois + déclenchement manuel
│   └── quittance.yml     # Déclenchement manuel uniquement
└── .env                  # Secrets locaux (gitignoré)
```

## Flux

### Avis d'échéance (`npm run avis`)
1. Login Rentila (soumission formulaire via JS pour bypass reCAPTCHA)
2. Navigation vers `/#payments`
3. Attente du premier `<tr id^="tr_">` → extraction de l'ID
4. Téléchargement : `GET /landlord/payments/{id}/download?avis=1`
5. Sauvegarde PDF dans `downloads/{mois-annee}/`
6. Création brouillon local (.txt)
7. Création brouillon Gmail (si configuré)

### Quittance (`npm run quittance`)
1-3. Identique à l'avis
4. Sélection de l'option "Payé" (value `"2"`) dans `<select id="changeStatus{id}">`
5. Téléchargement : `GET /landlord/payments/{id}/download` (sans `?avis=1`)
6-7. Identique à l'avis

## Connexion Rentila

- URL : `https://www.rentila.com/`
- Formulaire : `<form id="login-form">` avec action `/register/?action=login`
- Champs : `#login-email`, `#login-password`
- reCAPTCHA : bouton avec classe `g-recaptcha`, pas d'attribut `type="submit"`
- Contournement : `form.submit()` en JS direct (pas de clic sur le bouton)
- Redirection attendue : `**/landlord/**`

## Navigation SPA

- `/#payments` utilise le hash routing (AngularJS)
- Attente des données : `page.waitForFunction(() => document.querySelector('tr[id^="tr_"]'))` (timeout 20s)
- L'ID brut est extrait en retirant le préfixe `tr_`
- La selectbox de statut a l'ID `changeStatus{id}`

## Téléchargement PDF

Les URLs de téléchargement sont des vrais chemins (pas du hash routing) :
- Avis : `https://www.rentila.com/landlord/payments/{id}/download?avis=1`
- Quittance : `https://www.rentila.com/landlord/payments/{id}/download`

Requête via `page.context().request.get(url)` (utilise la session Playwright).

## Brouillon Gmail

- API : Gmail API (`googleapis`)
- Scope : `https://www.googleapis.com/auth/gmail.compose`
- Méthode : `users.drafts.create` avec message MIME multipart/mixed encodé en base64url
- Auth : Refresh token stocké dans `.env` (obtenu via `npm run auth:gmail`)
- Redirect URI : `http://localhost:8080/oauth2callback` (configuré dans Google Cloud Console)
- Dégradé : si les vars Gmail sont absentes, skip proprement

## Modes d'exécution

| Commande | DRY_RUN | DEBUG | Comportement |
|---|---|---|---|
| `npm run avis` | non | non | Headless + vrai Rentila |
| `npm run avis:debug` | non | oui | Navigateur visible + slowMo 300ms + reste ouvert après exécution |
| `DRY_RUN=true npm run avis` | oui | non | Fake PDF + brouillons uniquement (test Gmail) |

Même chose pour `quittance` / `quittance:debug`.

## Variables d'environnement

| Variable | Obligatoire | Description |
|---|---|---|
| `RENTILA_EMAIL` | Oui | Email de connexion Rentila |
| `RENTILA_PASSWORD` | Oui | Mot de passe Rentila |
| `TENANT_EMAILS` | Oui | Emails des locataires (séparés par des virgules) |
| `TENANT_NAMES` | Oui | Noms des locataires |
| `GMAIL_CLIENT_ID` | Non | Client ID OAuth2 Google |
| `GMAIL_CLIENT_SECRET` | Non | Client Secret OAuth2 Google |
| `GMAIL_REFRESH_TOKEN` | Non | Refresh token (obtenu via `npm run auth:gmail`) |
| `DRY_RUN` | Non | `true` → skip Rentila, fake PDF |
| `DEBUG` | Non | `true` → navigateur visible, slowMo, screenshots, reste ouvert |

## GitHub Actions

### Secrets à configurer
`RENTILA_EMAIL`, `RENTILA_PASSWORD`, `TENANT_EMAILS`, `TENANT_NAMES`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`.

### Passage en prod
- Retirer `DRY_RUN: true` des fichiers `.github/workflows/*.yml`
- Les workflows doivent être sur la branche par défaut (`main`)

## Ce qui est testé ✓
- Login Rentila (debug)
- Navigation `/#payments` (debug)
- Téléchargement avis PDF
- Brouillon Gmail
- Dry run (Rentila + Gmail)

## Ce qui reste à faire
- Fonction quittance complète (select payé + download)
- Tester quittance en debug
- Retirer `DRY_RUN: true` des workflows GitHub
- Notifications en cas d'échec (optionnel)

## Pièges connus
- `g-recaptcha` : ne pas cliquer sur le bouton avec Playwright (`click()` ne déclenche pas reCAPTCHA correctement). Utiliser `form.submit()` en JS.
- SPA hash routing : `waitUntil: 'networkidle'` se déclenche avant le chargement des données. Utiliser `waitForFunction` à la place.
- L'URL du navigateur après login peut être `https://www.rentila.com/register/login` si reCAPTCHA bloque. Attendre `waitForURL('**/landlord/**')`.
