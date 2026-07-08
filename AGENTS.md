# rentila-automate — Logique du projet

## Objectif
Automatiser le téléchargement des avis d'échéance et quittances de loyer depuis Rentila.com via Playwright, puis créer un brouillon Gmail avec le PDF en pièce jointe.

## Architecture

```
rentila-automate/
├── src/
│   ├── index.ts              # CLI : dispatche vers avis | quittance
│   ├── rentila.ts            # Playwright : login, navigation, téléchargement
│   ├── mailer.ts             # Brouillon email local (.txt)
│   ├── gmail.ts              # Brouillon Gmail + récupération code vérification
│   ├── auth-gmail.ts         # Script one-shot pour obtenir le refresh token
│   ├── test-gmail-scope.ts   # Test des scopes Gmail API
│   └── config.ts             # Variables d'environnement + mois français
├── .github/workflows/
│   ├── avis-echeance.yml     # Cron 1er du mois + déclenchement manuel
│   └── quittance.yml         # Déclenchement manuel uniquement
└── .env                      # Secrets locaux (gitignoré)
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

### Anti-détection (dans `launchBrowser()`)
- `args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']`
- User Agent Windows Chrome réaliste
- `addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }))`

### Vérification email (RENTILA_VERIFICATION_MODE=gmail)
Quand GitHub Actions headless est détecté, Rentila redirige vers une page de vérification avec code envoyé par email. La fonction `handleGmailVerificationCode()` :
1. Clique sur "Envoyer" pour déclencher l'email
2. Appelle `getVerificationCode()` (via Gmail API, search `from:noreply@rentila.com subject:"Code de vérification" after:YYYY/MM/DD`)
3. Extrait le code à 6 chiffres du corps HTML de l'email (via `extractEmailBody()` qui parcourt les parties MIME récursivement)
4. Remplit l'input et submit
5. Attend `/landlord/**`

Délais : 15s initial + 12 tentatives × 6s = ~87s max.

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
- Scopes : `gmail.compose` + `gmail.readonly` (pour lire les codes de vérification)
- Méthode : `users.drafts.create` avec message MIME multipart/mixed encodé en base64url
- Auth : Refresh token stocké dans `.env` (obtenu via `npm run auth:gmail`)
- Redirect URI : `http://localhost:8080/oauth2callback` (configuré dans Google Cloud Console)
- Dégradé : si les vars Gmail sont absentes, skip proprement

## Code de vérification — deux méthodes

### Méthode 1 : IMAP + App Password (recommandée)
- Utilise `imap` avec un mot de passe d'application Gmail
- Le mot de passe d'application **n'expire jamais**
- À configurer dans Google Account > Security > 2-Step Verification > App Passwords
- Variable : `GMAIL_APP_PASSWORD` (prioritaire sur OAuth)
- Pas d'OAuth nécessaire pour la lecture du code

### Méthode 2 : OAuth2 Gmail API (fallback)
- Utilise `gmail.users.messages.list` + `get` via l'API
- Nécessite `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`
- ⚠ Le refresh token expire après 7 jours si l'app Google est en mode "Testing"
- Utilisé seulement si `GMAIL_APP_PASSWORD` n'est pas défini

## Modes d'exécution

| Commande | DRY_RUN | DEBUG | Comportement |
|---|---|---|---|
| `npm run avis` | `false` | `false` | Headless + vrai Rentila |
| `npm run avis:debug` | `false` | `true` | Navigateur visible + slowMo 300ms + reste ouvert |
| `DRY_RUN=true npm run avis` | `true` | `false` | Fake PDF + brouillons uniquement |

Même chose pour `quittance` / `quittance:debug`.

Note : `DRY_RUN` est interprété comme `process.env.DRY_RUN === 'true'` — une valeur `"false"` (string) n'active PAS le dry run.

## Variables d'environnement

| Variable | Obligatoire | Description |
|---|---|---|
| `RENTILA_EMAIL` | Oui | Email de connexion Rentila |
| `RENTILA_PASSWORD` | Oui | Mot de passe Rentila |
| `TENANT_EMAILS` | Oui | Emails des locataires (séparés par des virgules) |
| `RENTILA_VERIFICATION_MODE` | Non | `gmail` pour auto-récupération du code de vérification |
| `GMAIL_CLIENT_ID` | Non | Client ID OAuth2 Google |
| `GMAIL_CLIENT_SECRET` | Non | Client Secret OAuth2 Google |
| `GMAIL_REFRESH_TOKEN` | Non | Refresh token (obtenu via `npm run auth:gmail`) |
| `GMAIL_APP_PASSWORD` | Non | Mot de passe d'application Gmail (IMAP) — ne expire pas |
| `DRY_RUN` | Non | `true` → skip Rentila, fake PDF |
| `DEBUG` | Non | `true` → navigateur visible, slowMo, screenshots, reste ouvert |

## GitHub Actions

### Secrets à configurer
`RENTILA_EMAIL`, `RENTILA_PASSWORD`, `TENANT_EMAILS`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_APP_PASSWORD`, `RENTILA_VERIFICATION_MODE`.

### État DRY_RUN
- `avis-echeance.yml` : `DRY_RUN: false` (production)
- `quittance.yml` : `DRY_RUN: true` (à passer à `false` pour la prod)

### Scripts utiles
```bash
npm run test:gmail      # Vérifie les scopes Gmail + cherche le dernier code Rentila
npm run auth:gmail      # Obtient/renouvelle le refresh token
```

## Priorité des méthodes de vérification
`getVerificationCode()` utilise la première méthode disponible dans cet ordre :
1. `GMAIL_APP_PASSWORD` (IMAP) — recommandé, ne expire jamais
2. `GMAIL_REFRESH_TOKEN` (OAuth2) — fallback, expire après 7j en mode Testing

## Ce qui est testé ✓
- Login Rentila avec gestion reCAPTCHA
- Anti-détection headless (User-Agent, webdriver, --disable-blink-features)
- Navigation `/#payments` et extraction ID
- Téléchargement PDF avis et quittance
- Brouillon local (.txt)
- Brouillon Gmail (compose)
- Dry run complet
- Récupération automatique du code de vérification via Gmail API (readonly)
- Marquage "Payé" via selectbox

## Pièges connus
- `g-recaptcha` : ne pas cliquer sur le bouton avec Playwright (`click()` échoue). Utiliser `form.submit()` en JS.
- `--no-sandbox` obligatoire dans GitHub Actions (conteneur).
- `--disable-blink-features=AutomationControlled` + userAgent réaliste + `addInitScript` nécessaires pour éviter la détection headless.
- SPA hash routing : `waitUntil: 'networkidle'` se déclenche avant le chargement des données. Utiliser `waitForFunction` à la place.
- L'URL après login peut être `/register/confirm` (vérification email) au lieu de `/landlord/**`. Déclencher `RENTILA_VERIFICATION_MODE=gmail`.
- L'email de vérification Rentila est en **HTML uniquement** (`text/plain` vide). Ne pas chercher le code dans le text/plain. Utiliser `extractEmailBody()` qui tombe sur le HTML en fallback.
- La recherche Gmail `is:unread` peut rater si l'email arrive avec du retard. Utiliser `after:YYYY/MM/DD` et `from:noreply@rentila.com` sans `is:unread`.
- `DRY_RUN: false` en string dans un workflow ne doit PAS être évalué comme truthy. Utiliser `=== 'true'`.
- Le port 8080 est utilisé par le callback OAuth — ne pas le bloquer.
- IMAP : nécessite `GMAIL_APP_PASSWORD` (mot de passe d'application). Activer 2FA sur le compte Google pour pouvoir en générer un.
- Le refresh token OAuth2 expire après 7 jours si l'app Google est en mode "Testing". Préférer `GMAIL_APP_PASSWORD`.
