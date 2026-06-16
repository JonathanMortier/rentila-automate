import fs from 'node:fs'
import path from 'node:path'
import { google } from 'googleapis'
import { CONFIG } from './config.js'

export async function authorize() {
  const oauth2Client = new google.auth.OAuth2({
    clientId: CONFIG.gmail.clientId,
    clientSecret: CONFIG.gmail.clientSecret,
    redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
  })

  if (CONFIG.gmail.refreshToken) {
    oauth2Client.setCredentials({ refresh_token: CONFIG.gmail.refreshToken })
  }

  return oauth2Client
}

export async function createGmailDraft(params: {
  to: string[]
  subject: string
  body: string
  pdfPath: string
}): Promise<void> {
  if (!CONFIG.gmail.clientId || !CONFIG.gmail.clientSecret) {
    console.log('  ⚠ Gmail non configuré (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET manquants)')
    return
  }

  if (!CONFIG.gmail.refreshToken) {
    console.log('  ⚠ Exécute d\'abord: npm run auth:gmail')
    return
  }

  const auth = await authorize()
  const gmail = google.gmail({ version: 'v1', auth })

  const mimeMessage = buildMimeMessage(params)
  const encoded = Buffer.from(mimeMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: { raw: encoded },
    },
  })

  const draftId = res.data.id
  console.log(`✓ Brouillon Gmail créé : https://mail.google.com/mail/u/0/#drafts/${draftId}`)
}

export async function getVerificationCode(): Promise<string> {
  if (!CONFIG.gmail.clientId || !CONFIG.gmail.clientSecret || !CONFIG.gmail.refreshToken) {
    throw new Error('Gmail non configuré (GMAIL_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN requis)')
  }

  const auth = await authorize()
  const gmail = google.gmail({ version: 'v1', auth })
  const maxRetries = 12
  const delayMs = 6000

  // Wait a bit for the email to arrive before first search
  console.log('  Attente de la réception de l\'email...')
  await new Promise(r => setTimeout(r, 15000))

  for (let i = 0; i < maxRetries; i++) {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: `from:noreply@rentila.com subject:"Code de vérification"`,
      maxResults: 5,
    })

    const messageId = res.data.messages?.[0]?.id
    if (messageId) {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      })

      const parts = msg.data.payload?.parts ?? []
      let body = ''
      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8')
          break
        }
      }
      if (!body && msg.data.payload?.body?.data) {
        body = Buffer.from(msg.data.payload.body.data, 'base64').toString('utf-8')
      }

      const match = body.match(/\b(\d{6})\b/)
      if (match) return match[1]
    }

    if (i < maxRetries - 1) {
      console.log(`  En attente du code de vérification... (${i + 1}/${maxRetries})`)
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  throw new Error('Code de vérification introuvable dans les emails Rentila')
}

export async function getAuthUrl(): Promise<string> {
  const oauth2Client = new google.auth.OAuth2({
    clientId: CONFIG.gmail.clientId,
    clientSecret: CONFIG.gmail.clientSecret,
    redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
  })

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.compose'],
    prompt: 'consent',
  })
}

export async function exchangeCode(code: string): Promise<string> {
  const oauth2Client = new google.auth.OAuth2({
    clientId: CONFIG.gmail.clientId,
    clientSecret: CONFIG.gmail.clientSecret,
    redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
  })

  const { tokens } = await oauth2Client.getToken(code)
  if (!tokens.refresh_token) throw new Error('Pas de refresh_token reçu')
  return tokens.refresh_token
}

function buildMimeMessage({ to, subject, body, pdfPath }: {
  to: string[]
  subject: string
  body: string
  pdfPath: string
}): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const pdfBuf = fs.readFileSync(pdfPath)
  const pdfB64 = pdfBuf.toString('base64')
  const pdfName = path.basename(pdfPath)
  const encodedSubject = encodeHeader(subject)

  const lines: string[] = [
    'MIME-Version: 1.0',
    `To: ${to.join(', ')}`,
    `Subject: ${encodedSubject}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body, 'utf-8').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: application/pdf',
    `Content-Disposition: attachment; filename="${encodeHeader(pdfName)}"`,
    'Content-Transfer-Encoding: base64',
    '',
  ]

  for (let i = 0; i < pdfB64.length; i += 76) {
    lines.push(pdfB64.slice(i, i + 76))
  }

  lines.push('', `--${boundary}--`)
  return lines.join('\r\n')
}

function encodeHeader(text: string): string {
  const encoded = Buffer.from(text, 'utf-8').toString('base64')
  return `=?UTF-8?B?${encoded}?=`
}
