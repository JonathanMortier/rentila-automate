# rentila-automate

Automatisation du téléchargement des avis d'échéance et quittances de loyer depuis [Rentila.com](https://www.rentila.com).

## Principe

Un script [Playwright](https://playwright.dev/) qui se connecte à votre compte Rentila, navigue dans la section Finances, télécharge les documents PDF et crée des brouillons d'email prêts à être envoyés.

Deux commandes :

| Commande | Action | Déclenchement |
|---|---|---|
| `npm run avis` | Télécharge l'avis d'échéance du mois | Automatique le 1er du mois (cron) |
| `npm run quittance` | Marque le loyer comme payé + télécharge la quittance | Manuel (quand vous recevez le virement) |

## Prérequis

- [Node.js](https://nodejs.org/) 20 ou +
- Un compte [Rentila](https://www.rentila.com)
- (optionnel) Un compte GitHub pour l'automatisation cloud

## Installation locale

```bash
git clone <votre-repo>
cd rentila-automate
npm install
npx playwright install chromium
```

Créez le fichier `.env` à partir de l'exemple :

```bash
cp .env.example .env
```

Remplissez vos informations :

```env
RENTILA_EMAIL=votre.email@exemple.com
RENTILA_PASSWORD=votre-mot-de-passe-rentila
TENANT_EMAILS=locataire1@mail.com,locataire2@mail.com
TENANT_NAMES=Alice & Bob
```

## Utilisation

### Télécharger l'avis d'échéance

```bash
npm run avis
```

Le script :
1. Se connecte à Rentila
2. Va dans la section Finances
3. Trouve le loyer du mois en cours
4. Télécharge l'avis d'échéance PDF dans `downloads/mois-annee/`
5. Crée un fichier brouillon email à côté (`email-avis-brouillon.txt`)

### Marquer comme payé et télécharger la quittance

Quand vous recevez le virement de votre locataire :

```bash
npm run quittance
```

Le script :
1. Se connecte à Rentila
2. Va dans la section Finances
3. Trouve le loyer du mois en cours
4. Clique sur "Marquer comme payé"
5. Télécharge la quittance PDF dans `downloads/mois-annee/`
6. Crée un fichier brouillon email à côté (`email-quittance-brouillon.txt`)

### Mode debug (navigateur visible)

Ajoutez `DEBUG=1` devant la commande pour voir ce que fait le navigateur :

```bash
DEBUG=1 npm run avis
```

Les captures d'écran sont sauvegardées dans le dossier `debug/`.

## Exemple de brouillon généré

```text
=== BROUILLON EMAIL ===
Date     : 01/06/2026
Destinataires : locataire1@mail.com, locataire2@mail.com
Sujet    : Avis d'échéance du mois de juin 2026

Bonjour Alice & Bob,

Vous trouverez en pièce jointe l'avis d'échéance du mois de juin 2026.

Cordialement

---
Pièce jointe : avis-echeance-juin-2026.pdf
Chemin local  : /home/.../downloads/juin-2026/avis-echeance-juin-2026.pdf
======================
```

Les locataires sont mis en CC.

## Automatisation avec GitHub Actions

### 1. Créer un repository sur GitHub

```bash
# Dans le dossier du projet
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/votre-compte/rentila-automate.git
git push -u origin main
```

### 2. Configurer les secrets

Allez dans votre repo GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

Créez ces secrets :

| Secret | Valeur |
|---|---|
| `RENTILA_EMAIL` | Identifiant de connexion Rentila |
| `RENTILA_PASSWORD` | Mot de passe Rentila |
| `TENANT_EMAILS` | Emails des locataires séparés par des virgules |
| `TENANT_NAMES` | Prénoms ou nom des locataires |
| `GMAIL_CLIENT_ID` | Client ID OAuth2 Google (pour brouillon Gmail) |
| `GMAIL_CLIENT_SECRET` | Client Secret OAuth2 Google |
| `GMAIL_REFRESH_TOKEN` | Refresh token obtenu via `npm run auth:gmail` |

### 3. Workflows disponibles

Deux workflows sont préconfigurés dans `.github/workflows/` :

#### `avis-echeance.yml`

- Se déclenche **automatiquement le 1er de chaque mois** à 6h (heure française)
- Peut aussi être lancé **manuellement** depuis l'onglet **Actions** → **Avis d'échéance** → **Run workflow**
- Les PDFs et brouillons sont disponibles en **Artifact** téléchargeable (en bas du job)

#### `quittance.yml`

- Se déclenche **manuellement uniquement** depuis l'onglet **Actions** → **Quittance de loyer** → **Run workflow**
- Lancez-le quand vous recevez le virement de votre locataire

### 4. Récupérer les fichiers après exécution

Dans GitHub Actions, une fois le job terminé :

1. Cliquez sur le run terminé
2. Descendez dans la section **Artifacts**
3. Téléchargez `downloads-avis` ou `downloads-quittance` (archive zip contenant les PDFs et brouillons)

## Arborescence du projet

```
rentila-automate/
├── .github/workflows/
│   ├── avis-echeance.yml      # Workflow cron 1er du mois
│   └── quittance.yml          # Workflow manuel
├── src/
│   ├── index.ts               # Point d'entrée (CLI)
│   ├── rentila.ts             # Automation Playwright
│   ├── mailer.ts              # Création des brouillons email locaux
│   ├── gmail.ts               # Création brouillon Gmail (API OAuth2)
│   ├── auth-gmail.ts          # Script d'authentification Gmail one-shot
│   └── config.ts              # Configuration et mois en français
├── downloads/                 # PDFs et brouillons générés (gitignoré)
├── debug/                     # Captures d'écran en mode DEBUG (gitignoré)
├── package.json
├── tsconfig.json
├── .env.example               # Variables d'environnement
├── .gitignore
└── README.md
```

## Sécurité

- Le fichier `.env` contient vos identifiants — il est dans `.gitignore` et n'est **jamais envoyé sur GitHub**
- Les secrets GitHub sont chiffrés (AES-256) et invisibles dans les logs
- Utilisez un compte Rentila dédié si possible
- Ne partagez jamais votre `.env`

## Brouillon Gmail (optionnel)

Au lieu d'un simple fichier `.txt`, le script peut créer un vrai brouillon directement dans Gmail.

### Configuration

1. Allez sur [console.cloud.google.com](https://console.cloud.google.com) → créez un projet → activez **Gmail API**
2. Créez un identifiant OAuth2 (type "Application de bureau")
3. Ajoutez `http://localhost:8080/oauth2callback` dans les **Authorized redirect URIs**
4. Ajoutez `GMAIL_CLIENT_ID` et `GMAIL_CLIENT_SECRET` dans `.env`
5. Exécutez :
   ```bash
   npm run auth:gmail
   ```
6. Autorisez l'accès dans le navigateur, puis ajoutez `GMAIL_REFRESH_TOKEN` dans `.env`

### Fonctionnement

Si les 3 variables Gmail sont présentes, un brouillon est créé dans Gmail après chaque téléchargement. Sinon, seul le fichier `.txt` local est généré (pas de blocage).

## Ce qu'il reste à faire

### 1. Contournement reCAPTCHA (connexion Rentila)

La connexion à Rentila est actuellement bloquée par Google reCAPTCHA après trop de tentatives. Solutions à explorer :
- Soumettre le formulaire de login directement par requête HTTP (POST vers `/register/?action=login`) avec les headers adaptés
- Attendre que le rate-limit retombe (24-48h)
- Utiliser un service de résolution de captcha (non souhaité — payant)

### 2. Navigation SPA `/#payments`

Le chargement des données via le hash routing de l'application AngularJS est capricieux en headless. Solution testée :
- `page.waitForFunction(() => document.querySelector('tr[id^="tr_"]'))` avec timeout long
- À valider une fois le login fonctionnel

### 3. Marquer "Payé" + quittance

La fonction `markPaidAndDownloadQuittance` (`npm run quittance`) est écrite mais non testée. Elle :
1. Navigue vers `/#payments/received?id={id}`
2. Soumet le formulaire de paiement
3. Télécharge la quittance via `/landlord/payments/{id}/download`

### 4. Supprimer `DRY_RUN: true` du workflow

Actuellement en dry run pour tester le pipeline GitHub sans connexion Rentila. Quand la connexion fonctionnera :
- Retirer `DRY_RUN: true` des fichiers `.github/workflows/*.yml`
- Les secrets GitHub doivent être configurés (cf. section secrets)

### 5. Notifications / Monitoring

- Ajouter une notification Slack/Discord/email en cas d'échec du workflow
- Logger les résultats pour traçabilité
