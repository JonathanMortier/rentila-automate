import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { google } from 'googleapis'
import { CONFIG } from './config.js'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
]
const PORT = 8080

async function main() {
  const oauth2Client = new google.auth.OAuth2({
    clientId: CONFIG.gmail.clientId,
    clientSecret: CONFIG.gmail.clientSecret,
    redirectUri: `http://localhost:${PORT}/oauth2callback`,
  })

  const state = randomBytes(16).toString('hex')

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state,
    prompt: 'consent',
  })

  console.log('\n🔗 Ouvre cette URL dans ton navigateur :\n')
  console.log(url)
  console.log()

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const urlObj = new URL(req.url!, `http://localhost:${PORT}`)

      if (urlObj.pathname !== '/oauth2callback') {
        res.writeHead(404)
        res.end()
        return
      }

      const receivedState = urlObj.searchParams.get('state')
      if (receivedState !== state) {
        res.writeHead(403)
        res.end('State mismatch')
        reject(new Error('State mismatch'))
        return
      }

      const codeParam = urlObj.searchParams.get('code')
      const error = urlObj.searchParams.get('error')

      if (error) {
        res.writeHead(400)
        res.end(`Erreur: ${error}`)
        reject(new Error(`Google auth error: ${error}`))
        return
      }

      if (!codeParam) {
        res.writeHead(400)
        res.end('No code')
        reject(new Error('No code received'))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body><h1>✅ Autorisation réussie ! Tu peux fermer cette page.</h1></body></html>')

      server.close()
      resolve(codeParam)
    })

    server.listen(PORT, '127.0.0.1', () => {
      console.log(`  En attente du callback sur http://localhost:${PORT}/oauth2callback...`)
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Le port ${PORT} est déjà utilisé`))
      } else {
        reject(err)
      }
    })
  })

  const { tokens } = await oauth2Client.getToken(code)

  if (!tokens.refresh_token) {
    throw new Error(
      'Aucun refresh_token reçu.\n' +
      'Vérifie que http://localhost:8080/oauth2callback est bien dans les\n' +
      '"Authorized redirect URIs" de ton projet Google Cloud Console.'
    )
  }

  console.log('\n✅ Ajoute cette ligne dans .env :\n')
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`)
  console.log()
}

main().catch(console.error)
