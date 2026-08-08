import { google } from 'googleapis'
import 'dotenv/config'

function stripHtml(html: string): string {
  return html
    .replace(/</g, '')
    .replace(/>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

async function main() {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('❌ GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET et GMAIL_REFRESH_TOKEN doivent être définis dans .env')
    process.exit(1)
  }

  const auth = new google.auth.OAuth2({
    clientId,
    clientSecret,
    redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
  })
  auth.setCredentials({ refresh_token: refreshToken })

  const gmail = google.gmail({ version: 'v1', auth })

  // Test 1 : écrire un brouillon (compose scope)
  try {
    const draft = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: Buffer.from('Subject: test\n\nok').toString('base64url'),
        },
      },
    })
    await gmail.users.drafts.delete({ userId: 'me', id: draft.data.id! })
    console.log('✅ Scope gmail.compose : OK')
  } catch {
    console.log('❌ Scope gmail.compose : KO')
    throw new Error('Impossible de créer un brouillon')
  }

  // Test 2 : lire les messages (readonly scope)
  try {
    const res = await gmail.users.messages.list({ userId: 'me', maxResults: 1 })
    console.log('✅ Scope gmail.readonly : OK')
    console.log(`   Messages dans la boîte : ${res.data.resultSizeEstimate}`)
  } catch {
    console.log('❌ Scope gmail.readonly : KO')
    console.log('   Relance : npm run auth:gmail')
    process.exit(1)
  }

  // Test 3 : chercher le code de vérification Rentila
  try {
    const testRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'from:noreply@rentila.com subject:"Code de vérification"',
      maxResults: 1,
    })
    if (testRes.data.messages?.length) {
      const msgId = testRes.data.messages[0].id
      if (!msgId) return
      const msg = await gmail.users.messages.get({ userId: 'me', id: msgId, format: 'full' })
      let body = ''
      if (msg.data.payload?.body?.data) {
        body = Buffer.from(msg.data.payload.body.data, 'base64').toString('utf-8')
      }
      const parts = msg.data.payload?.parts ?? []
      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8')
          break
        }
        if (part.mimeType === 'text/html' && part.body?.data && !body) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8')
        }
      }
      const stripped = stripHtml(body)
      const code = stripped.match(/\b(\d{6})\b/)
      console.log(`📧 Dernier email Rentila trouvé`)
      console.log(`   Code : ${code ? code[1] : 'non trouvé'}`)
    } else {
      console.log('📧 Aucun email Rentila en attente')
    }
  } catch {
    console.log('⚠ Impossible de chercher les emails Rentila')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
