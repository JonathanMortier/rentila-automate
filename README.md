# rentila-automate

Automatisation du téléchargement des avis d'échéance et quittances de loyer depuis [Rentila.com](https://www.rentila.com) avec création de brouillon Gmail en pièce jointe.

Deux modes :
- **Avis d'échéance** — déclenché automatiquement le 1er du mois (GitHub Actions cron)
- **Quittance** — déclenché manuellement après réception du virement

## Prérequis

- [Node.js](https://nodejs.org/) 20+
- Un compte [Rentila](https://www.rentila.com)

## Installation

```bash
git clone <votre-repo>
cd rentila-automate
npm install
npx playwright install chromium
```

Créez le fichier `.env` :

```bash
cp .env.example .env
```

Remplissez vos informations :

```env
RENTILA_EMAIL=votre.email@exemple.com
RENTILA_PASSWORD=votre-mot-de-passe
TENANT_EMAILS=locataire1@mail.com,locataire2@mail.com
```

## Utilisation

### Avis d'échéance

```bash
npm run avis
```

1. Connexion à Rentila
2. Navigation vers la page des paiements
3. Téléchargement de l'avis d'échéance PDF
4. Création d'un brouillon email local (.txt)
5. Création d'un brouillon Gmail (si configuré)

### Quittance

```bash
npm run quittance
```

1. Connexion à Rentila
2. Navigation vers la page des paiements
3. Marquage du loyer comme "Payé" via la selectbox
4. Téléchargement de la quittance PDF
5. Création d'un brouillon email local (.txt)
6. Création d'un brouillon Gmail (si configuré)

### Modes spéciaux

| Commande | Effet |
|---|---|
| `npm run avis:debug` | Navigateur visible, ralenti, reste ouvert |
| `DRY_RUN=true npm run avis` | Skip Rentila, génère un faux PDF (test Gmail) |

## Configuration avancée

### Vérification email Rentila (GitHub Actions)

En environnement headless (GitHub Actions), Rentila demande parfois un code de vérification envoyé par email. Pour l'automatiser :

```env
RENTILA_VERIFICATION_MODE=gmail
```

Le script détecte la page de vérification, récupère le code depuis Gmail via l'API et le soumet automatiquement.

Nécessite la configuration Gmail complète (voir ci-dessous) **avec le scope `gmail.readonly`** — relancez `npm run auth:gmail` si votre refresh token date d'avant l'ajout de ce scope.

### Brouillon Gmail (optionnel)

```bash
npm run auth:gmail
```

Configurez dans votre projet Google Cloud :
1. Activer **Gmail API**
2. Créer un **OAuth Client ID** (type Web application)
3. Ajouter `http://localhost:8080/oauth2callback` dans les **Authorized redirect URIs**
4. Ajouter `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` dans `.env`
5. Exécuter `npm run auth:gmail` → ajouter `GMAIL_REFRESH_TOKEN` dans `.env`

### Vérifier la configuration Gmail

```bash
npm run test:gmail
```

Teste les scopes `compose` et `readonly`, et cherche le dernier email de vérification Rentila.

## Détection anti-bot

Le navigateur Playwright est lancé avec plusieurs mesures pour éviter la détection :
- `--disable-blink-features=AutomationControlled` (cache `navigator.webdriver`)
- User Agent Windows Chrome réaliste
- `addInitScript` forçant `navigator.webdriver = false`

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
| `DRY_RUN` | Non | `true` → skip Rentila, fake PDF |
| `DEBUG` | Non | `true` → navigateur visible, screenshots, reste ouvert |

## GitHub Actions

### Secrets à configurer

`RENTILA_EMAIL`, `RENTILA_PASSWORD`, `TENANT_EMAILS`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `RENTILA_VERIFICATION_MODE`.

### Workflows

| Workflow | Déclenchement | DRY_RUN |
|---|---|---|
| `avis-echeance.yml` | Cron 1er du mois à 05:00 UTC + manuel | `false` |
| `quittance.yml` | Manuel uniquement | `true` |

Les PDFs et brouillons sont disponibles dans les **Artifacts** après chaque run.

## Arborescence

```
rentila-automate/
├── .github/workflows/
│   ├── avis-echeance.yml      # Cron mensuel + manuel
│   └── quittance.yml          # Manuel uniquement
├── src/
│   ├── index.ts               # CLI (dispatche avis|quittance)
│   ├── rentila.ts             # Playwright : login, navigation, download
│   ├── mailer.ts              # Brouillon email local (.txt)
│   ├── gmail.ts               # Brouillon Gmail + récupération code vérification
│   ├── auth-gmail.ts          # OAuth one-shot pour obtenir le refresh token
│   ├── test-gmail-scope.ts    # Test des scopes Gmail API
│   └── config.ts              # Variables d'environnement + mois français
├── downloads/                 # PDFs et brouillons (gitignoré)
├── debug/                     # Captures d'écran DEBUG (gitignoré)
├── .env.example
└── README.md
```

## Sécurité

- `.env` est dans `.gitignore` — jamais commité
- Les secrets GitHub sont chiffrés (AES-256)
- Le code ne contient aucun secret en clair
