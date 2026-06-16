import { chromium, type Page } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import { CONFIG, monthLabel } from './config.js'
import { createDraft } from './mailer.js'
import { createGmailDraft } from './gmail.js'

const DOWNLOADS = path.resolve('downloads')
const DEBUG = !!process.env.DEBUG

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

  if (process.env.DRY_RUN) return dryRun('avis', label, pdfPath)

  const browser = await chromium.launch({
    headless: !DEBUG,
    slowMo: DEBUG ? 300 : undefined,
  })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1280, height: 900 })

  try {
    await login(page)
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

  if (process.env.DRY_RUN) return dryRun('quittance', label, pdfPath)

  const browser = await chromium.launch({
    headless: !DEBUG,
    slowMo: DEBUG ? 300 : undefined,
  })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1280, height: 900 })

  try {
    await login(page)
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

async function login(page: Page): Promise<void> {
  console.log('→ Connexion à Rentila...')
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

  // Submit form directly via JS (bypasses reCAPTCHA click handler)
  await page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('#login-form')
    if (form) form.submit()
  })

  // Wait for redirect to landlord dashboard
  await page.waitForURL('**/landlord/**', { timeout: 20000 })
  await page.waitForTimeout(1000)
  console.log(`  URL après login : ${page.url()}`)
  await screenshot(page, '03-after-login')
  console.log('✓ Connecté')
}

async function getCurrentPaymentId(page: Page): Promise<string> {
  console.log('→ Navigation vers la page des paiements...')
  await page.goto('https://www.rentila.com/landlord/#payments', { waitUntil: 'networkidle' })
  console.log(`  URL : ${page.url()}`)

  // Wait for any row with an id to appear
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
  return str.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()
}
