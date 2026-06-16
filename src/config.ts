import 'dotenv/config'

export const CONFIG = {
  rentila: {
    email: env('RENTILA_EMAIL'),
    password: env('RENTILA_PASSWORD'),
    verificationMode: env('RENTILA_VERIFICATION_MODE'),
  },
  tenants: {
    emails: env('TENANT_EMAILS').split(',').map(s => s.trim()).filter(Boolean),
    names: env('TENANT_NAMES'),
  },
  gmail: {
    clientId: env('GMAIL_CLIENT_ID'),
    clientSecret: env('GMAIL_CLIENT_SECRET'),
    refreshToken: env('GMAIL_REFRESH_TOKEN'),
  },
}

export const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

export function monthLabel(date: Date = new Date()): string {
  return `${MONTHS_FR[date.getMonth()]} ${date.getFullYear()}`
}

function env(key: string): string {
  return process.env[key] ?? ''
}
