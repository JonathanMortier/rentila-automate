import { chromium, type Browser, type Page } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import { CONFIG, monthLabel } from './config.js'
import { createDraft } from './mailer.js'
import { createGmailDraft, getVerificationCode } from './gmail.js'

const DOWNLOADS = path.resolve('downloads')
const DEBUG = !!process.env.DEBUG
const DRY_RUN = process.env.DRY_RUN === 'true'

async function dryRun(type: 'avis' | 'quittance', label: string, pdfPath: string): Promise<void> {
  console.log(`→ DRY RUN : pas de connexion Rentila`)
  fs.writeFileSync(pdfPath, `FACTICE - ${type === 'avis' ? "Avis d'échéance" : 'Quittance'} ${label}`)
  createDraft({
    type,
    month: label,
    pdfPath,
    tenantEmails: CONFIG.tenants.emails
  })
  await pushGmailDraft(type, label, pdfPath)
}

export async function downloadAvis(): Promise<void> {
  const label = monthLabel()
  const folder = ensureDir(label)
  const pdfPath = path.join(folder, `avis-echeance-${sanitize(label)}.pdf`)

  if (DRY_RUN) return dryRun('avis', label, pdfPath)

  const { browser, page } = await launchBrowser()

  try {
    await login(page, folder)
    const paymentId = await getCurrentPaymentId(page)
    const savedPath = await downloadDirect(page, paymentId, pdfPath, true)

    await createDraft({
      type: 'avis',
      month: label,
      pdfPath: savedPath,
      tenantEmails: CONFIG.tenants.emails,
    })
    await pushGmailDraft('avis', label, savedPath)
  } finally {
    if (DEBUG) {
      console.log('  🔍 Mode debug – navigateur laissé ouvert. Appuie sur Ctrl+C pour quitter.')
      await new Promise(() => {})
    }
    await browser.close()
  }
}

export async function markPaidAndDownloadQuittance(): Promise<void> {
  const label = monthLabel()
  const folder = ensureDir(label)
  const pdfPath = path.join(folder, `quittance-${sanitize(label)}.pdf`)

  if (DRY_RUN) return dryRun('quittance', label, pdfPath)

  const { browser, page } = await launchBrowser()

  try {
    await login(page, folder)
    const paymentId = await getCurrentPaymentId(page)

    // Changer le statut de "Pas payé" à "Payé" via la selectbox
    console.log(`→ Marquage du paiement ${paymentId} comme Payé...`)
    const select = page.locator(`#changeStatus${paymentId}`)
    await select.waitFor({ state: 'visible', timeout: 10000 })
    await select.selectOption('2')
    await page.waitForTimeout(2000)
    await screenshot(page, '05-paid')
    console.log('✓ Paiement marqué Payé')

    const savedPath = await downloadDirect(page, paymentId, pdfPath, false)

    await createDraft({
      type: 'quittance',
      month: label,
      pdfPath: savedPath,
      tenantEmails: CONFIG.tenants.emails,
    })
    await pushGmailDraft('quittance', label, savedPath)
  } finally {
    if (DEBUG) {
      console.log('  🔍 Mode debug – navigateur laissé ouvert. Appuie sur Ctrl+C pour quitter.')
      await new Promise(() => {})
    }
    await browser.close()
  }
}

async function pushGmailDraft(type: 'avis' | 'quittance', month: string, pdfPath: string): Promise<void> {
  const isAvis = type === 'avis'
  const subject = isAvis
    ? `Avis d'échéance du mois de ${month}`
    : `Quittance du mois de ${month}`
  const body = isAvis
    ? `Bonjour,\n\nVous trouverez en pièce jointe l'avis d'échéance du mois de ${month}.\n\nCordialement`
    : `Bonjour,\n\nVous trouverez en pièce jointe la quittance du mois de ${month}.\n\nCordialement`

  await createGmailDraft({
    to: CONFIG.tenants.emails,
    subject,
    body,
    pdfPath,
  })
}

async function launchBrowser(): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({
    headless: !DEBUG,
    slowMo: DEBUG ? 300 : undefined,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })
  return { browser, page }
}

async function login(page: Page, screenshotDir?: string): Promise<void> {
  console.log('→ Connexion à Rentila ...')
  await page.goto('https://www.rentila.com/', { waitUntil: 'networkidle' })
  await screenshot(page, '01-home')

  const connexionBtn = page.getByRole('link', { name: /connexion|se connecter/i })
  if (await connexionBtn.first().isVisible()) {
    await connexionBtn.first().click()
    await page.waitForTimeout(2000)
  }

  await screenshot(page, '02-login-form')
  await page.locator('#login-email').first().waitFor({ state: 'visible', timeout: 15000 })
  await page.locator('#login-email').first().fill(CONFIG.rentila.email)
  await page.locator('#login-password').first().fill(CONFIG.rentila.password)

  await page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('#login-form')
    if (form) form.submit()
  })
  console.log('→ Attente de la page landlord ...')

  let onLandlord = false
  try {
    await page.waitForURL('**/landlord/**', { timeout: 30000 })
    onLandlord = true
  } catch {
    onLandlord = page.url().includes('/landlord/')
  }

  if (!onLandlord) {
    console.log(`  Redirigé vers : ${page.url()}`)

    if (CONFIG.rentila.verificationMode === 'gmail') {
      await handleGmailVerificationCode(page, screenshotDir)
    } else {
      await page.screenshot({ path: path.join(screenshotDir ?? DOWNLOADS, 'error-login.png'), fullPage: true })
      throw new Error(
        `Login échoué : redirigé vers ${page.url()}\n` +
        '  Ajoute RENTILA_VERIFICATION_MODE=gmail dans .env pour la récupération automatique du code.'
      )
    }
  }

  await closeTermsModal(page)
  await page.waitForTimeout(1000)
  console.log(`✓ Connecté (${page.url()})`)
}

async function closeTermsModal(page: Page): Promise<void> {
  const buttons = page.locator('button').filter({ hasText: /fermer|close|j.?accepte|accepter/i })
  const count = await buttons.count()
  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i)
    if (await btn.isVisible().catch(() => false)) {
      await btn.click()
      await page.waitForTimeout(500)
      console.log('  ✓ Popup Conditions Générales fermé')
      return
    }
  }
}

async function handleGmailVerificationCode(page: Page, screenshotDir?: string): Promise<void> {
  console.log('→ Mode vérification Gmail activé')

  const debugDir = screenshotDir ?? DOWNLOADS
  await page.screenshot({ path: path.join(debugDir, 'verification-page.png'), fullPage: true })

  const envoyerBtn = page.getByRole('button').or(page.locator('a')).filter({ hasText: /envoyer|recevoir|code/i }).first()
  if (await envoyerBtn.isVisible().catch(() => false)) {
    await envoyerBtn.click()
    console.log('  ✓ Email de vérification demandé')
  } else {
    console.log('  ⚠ Bouton "Envoyer le code" introuvable — aucun email ne sera envoyé')
  }
  await page.screenshot({ path: path.join(debugDir, 'after-click-envoyer.png'), fullPage: true })

  const code = await getVerificationCode()

  const input = page.locator('input[type="text"], input[type="number"]').first()
  await input.waitFor({ state: 'visible', timeout: 10000 })
  await input.fill(code)
  await page.screenshot({ path: path.join(debugDir, 'after-fill-code.png'), fullPage: true })

  await page.locator('button[type="submit"], input[type="submit"]').first().click()
  await page.screenshot({ path: path.join(debugDir, 'after-submit-code.png'), fullPage: true })

  await page.waitForURL('**/landlord/**', { timeout: 20000 })
  console.log('  ✓ Vérification email réussie')
}

async function getCurrentPaymentId(page: Page): Promise<string> {
  console.log('→ Navigation vers la page des paiements...')
  await page.goto('https://www.rentila.com/landlord/#payments', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => {
    const row = document.querySelector('tr[id^="tr_"]')
    return row && row.id.length > 0
  }, { timeout: 20000 })

  await page.waitForTimeout(1000)
  await screenshot(page, '04-payments')

  const id = await page.evaluate(() => {
    const firstRow = document.querySelector('tr[id^="tr_"]')
    return firstRow?.id.replace('tr_', '') ?? null
  })

  if (!id) throw new Error('Aucune ligne de paiement trouvée')
  console.log(`✓ ID paiement : ${id}`)
  return id
}

async function downloadDirect(page: Page, paymentId: string, filePath: string, isAvis: boolean): Promise<string> {
  const url = `https://www.rentila.com/landlord/payments/${paymentId}/download${isAvis ? '?avis=1' : ''}`
  console.log(`→ Téléchargement : ${url}`)

  const response = await page.context().request.get(url)
  const buf = Buffer.from(await response.body())

  if (buf.length < 100) {
    throw new Error(`Réponse trop courte (${buf.length} octets)`)
  }

  fs.writeFileSync(filePath, buf)
  console.log(`✓ PDF sauvegardé : ${filePath} (${buf.length} octets)`)
  return filePath
}

function ensureDir(label: string): string {
  const dir = path.join(DOWNLOADS, sanitize(label))
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function screenshot(page: Page, name: string): Promise<void> {
  if (DEBUG) {
    const dir = path.resolve('debug')
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
  }
}

function sanitize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/gi, '-')
    .toLowerCase()
}
