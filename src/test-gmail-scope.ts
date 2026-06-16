import { google } from 'googleapis'
import 'dotenv/config'

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
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
