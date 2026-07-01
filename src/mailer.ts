import fs from 'node:fs'
import path from 'node:path'

const DRAFTS_DIR = path.resolve('downloads')

interface DraftParams {
  type: 'avis' | 'quittance'
  month: string
  pdfPath: string
  tenantEmails: string[]
}

export function createDraft(params: DraftParams): void {
  const { type, month, pdfPath, tenantEmails } = params

  const isAvis = type === 'avis'
  const subject = isAvis
    ? `Avis d'échéance du mois de ${month}`
    : `Quittance du mois de ${month}`

  const body = isAvis
    ? `Bonjour,\n\nVous trouverez en pièce jointe l'avis d'échéance du mois de ${month}.\n\nCordialement`
    : `Bonjour,\n\nVous trouverez en pièce jointe la quittance du mois de ${month}.\n\nCordialement`

  const folder = path.dirname(pdfPath)
  fs.mkdirSync(folder, { recursive: true })

  const draftPath = path.join(folder, `email-${type}-brouillon.txt`)
  const content = [
    `=== BROUILLON EMAIL ===`,
    `Date     : ${new Date().toLocaleDateString('fr-FR')}`,
    `Destinataires : ${tenantEmails.join(', ')}`,
    `Sujet    : ${subject}`,
    ``,
    body,
    ``,
    `---`,
    `Pièce jointe : ${path.basename(pdfPath)}`,
    `Chemin local  : ${pdfPath}`,
    `======================`,
  ].join('\n')

  fs.writeFileSync(draftPath, content, 'utf-8')
  console.log(`✓ Brouillon email créé : ${draftPath}`)
}
