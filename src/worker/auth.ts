import type { Context, Next } from 'hono'
import type { Env } from './types'

/**
 * Cloudflare Access JWT verification middleware.
 * When CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are set,
 * validates the Cf-Access-Jwt-Assertion header against
 * Cloudflare's public keys.
 *
 * If neither var is set, auth is skipped (local dev mode).
 */
let cachedKeys: { keys: JsonWebKey[]; expires: number } | null = null

export function cfAccessAuth() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN
    const aud = c.env.CF_ACCESS_AUD

    // Skip auth if not configured (local dev)
    if (!teamDomain || !aud) {
      await next()
      return
    }

    const jwt = c.req.header('Cf-Access-Jwt-Assertion')
    if (!jwt) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing Cf-Access-Jwt-Assertion header' } }, 401)
    }

    try {
      const keys = await fetchKeys(teamDomain)

      const verified = await verifyJwt(jwt, keys, aud, `https://${teamDomain}`)
      if (!verified) {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid Access token' } }, 401)
      }

      await next()
    } catch (err) {
      console.error('Access auth error:', err)
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication failed' } }, 401)
    }
  }
}

async function fetchKeys(teamDomain: string): Promise<JsonWebKey[]> {
  if (cachedKeys && Date.now() < cachedKeys.expires) {
    return cachedKeys.keys
  }
  const resp = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`)
  if (!resp.ok) throw new Error(`Failed to fetch Access certs: ${resp.status}`)
  const { keys } = await resp.json<{ keys: JsonWebKey[] }>()
  cachedKeys = { keys, expires: Date.now() + 5 * 60 * 1000 } // 5 min cache
  return keys
}

async function verifyJwt(
  token: string,
  keys: JsonWebKey[],
  aud: string,
  issuer: string
): Promise<boolean> {
  const parts = token.split('.')
  if (parts.length !== 3) return false

  const header = JSON.parse(atob(parts[0]))
  const payload = JSON.parse(atob(parts[1]))

  // Check expiry and audience
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp && payload.exp < now) return false
  if (payload.iss !== issuer) return false

  const audClaim = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audClaim.includes(aud)) return false

  // Find matching key
  const key = keys.find((k) => k.kid === header.kid)
  if (!key) return false

  // Verify signature
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    key,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  const signature = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, data)
}
