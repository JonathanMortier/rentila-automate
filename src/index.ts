#!/usr/bin/env node

import { downloadAvis, markPaidAndDownloadQuittance } from './rentila.js'

async function main() {
  const command = process.argv[2]

  switch (command) {
    case 'avis':
      await downloadAvis()
      break
    case 'quittance':
      await markPaidAndDownloadQuittance()
      break
    default:
      console.log(`
Usage:
  npm run avis        Télécharger l'avis d'échéance du mois
  npm run quittance   Marquer comme payé + télécharger la quittance
  DRY_RUN=true npm run <commande>  Sans connexion Rentila
  DEBUG=1 npm run <commande>  Mode visible
`)
      process.exit(1)
  }
}

main().catch(err => {
  console.error('Erreur :', err)
  process.exit(1)
})
