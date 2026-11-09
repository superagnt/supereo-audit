/**
 * Signing in to supereo, the way any MCP client does it (the MCP spec's
 * authorization section, OAuth 2.1). The server's 401 names its protected
 * resource metadata (RFC 9728), which names supereo's authorization server,
 * whose metadata (RFC 8414, or OpenID Connect discovery) gives its endpoints.
 * supereo-audit registers itself there (RFC 7591), opens supereo's sign-in
 * page in your browser with PKCE, takes the code back on a loopback address
 * (RFC 8252), and keeps the tokens in a file only you can read. Nothing here
 * sees your email code: you type it on supereo's own page.
 */

import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

export const LOGIN_COMMAND = 'npx -y github:superagnt/supereo-audit login'

const CLIENT_NAME = 'supereo-audit'
const HTTP_TIMEOUT_MS = 20_000
const SIGN_IN_WAIT_MS = 10 * 60 * 1000
/** A token this close to its expiry is refreshed first. */
const EXPIRY_MARGIN_MS = 60 * 1000

/** No usable sign-in for the server: the message says how to sign in. */
export class NotSignedIn extends Error {
  constructor(message = `You're not signed in to supereo. Sign in once with: ${LOGIN_COMMAND}`) {
    super(message)
    this.name = 'NotSignedIn'
  }
}

const base64url = (bytes) => Buffer.from(bytes).toString('base64url')

/** https, or http to this machine: the only addresses supereo-audit sends anything to or opens. */
const safeUrl = (value, what) => {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`supereo's sign-in gave ${what} that isn't a URL.`)
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return url
  throw new Error(`supereo's sign-in gave ${what} that isn't https (${url.protocol}//${url.host}), so supereo-audit won't use it.`)
}

// ----------------------------------------------------------- the token file

/** Where the tokens live: $SUPEREO_CONFIG_DIR, else the platform's config folder. */
const configDir = () => {
  if (process.env.SUPEREO_CONFIG_DIR) return process.env.SUPEREO_CONFIG_DIR
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'supereo')
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'supereo')
}

const storePath = () => join(configDir(), 'credentials.json')

/** The stored sign-ins. A file that isn't JSON is refused, or, for login and logout (`fresh`), started over. */
const readStore = ({ fresh = false } = {}) => {
  let text
  try {
    text = readFileSync(storePath(), 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return { servers: {} }
    throw new Error(`Couldn't read ${storePath()}: ${err.message}`)
  }
  try {
    const store = JSON.parse(text)
    if (store && typeof store.servers === 'object' && store.servers) return store
  } catch {
    // Read as unreadable below.
  }
  if (fresh) return { servers: {} }
  throw new NotSignedIn(`${storePath()} isn't readable. Sign in again, which starts it over: ${LOGIN_COMMAND}`)
}

/** Written whole to a new file of its own, readable by you alone, then renamed into place. */
const writeStore = (store) => {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 })
  const file = storePath()
  const temp = `${file}.${randomBytes(6).toString('hex')}.tmp`
  try {
    writeFileSync(temp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    renameSync(temp, file)
  } catch (err) {
    try {
      unlinkSync(temp)
    } catch {
      // Never written, or already renamed.
    }
    throw new Error(`Couldn't write ${file}: ${err.message}`)
  }
}

const saveEntry = (server, entry, { fresh = false } = {}) => {
  const store = readStore({ fresh })
  if (entry) store.servers[server] = entry
  else delete store.servers[server]
  writeStore(store)
}

// ---------------------------------------------------------------- discovery

const getJson = async (url) => {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) })
    const text = await res.text()
    try {
      return { status: res.status, body: JSON.parse(text) }
    } catch {
      return { status: res.status, body: null }
    }
  } catch (err) {
    return { status: 0, body: null, error: err.cause?.message ?? err.message }
  }
}

/** What an error body says, from the shapes OAuth servers and gateways use. */
const said = (body) => {
  if (!body || typeof body !== 'object') return null
  const text = body.error_description ?? body.msg ?? body.message ?? (typeof body.error === 'string' ? body.error : body.error?.message)
  return typeof text === 'string' ? text : null
}

/** RFC 9728: the metadata URL the 401 names, then the well-known places for it. */
const resourceMetadataUrls = async (server) => {
  const url = new URL(server)
  const path = url.pathname.replace(/\/$/, '')
  let named = null
  try {
    const res = await fetch(server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'ping' }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
    await res.arrayBuffer()
    named = /resource_metadata="([^"]+)"/i.exec(res.headers.get('www-authenticate') ?? '')?.[1] ?? null
  } catch (err) {
    throw new Error(`Couldn't reach ${server}: ${err.cause?.message ?? err.message}`)
  }
  return [...new Set([named, `${url.origin}/.well-known/oauth-protected-resource${path}`, `${url.origin}/.well-known/oauth-protected-resource`].filter(Boolean))]
}

/** RFC 8414 and OpenID Connect discovery, in the order the MCP spec gives for an issuer with or without a path. */
const authServerMetadataUrls = (issuer) => {
  const url = new URL(issuer)
  const path = url.pathname.replace(/\/$/, '')
  if (!path) return [`${url.origin}/.well-known/oauth-authorization-server`, `${url.origin}/.well-known/openid-configuration`]
  return [
    `${url.origin}/.well-known/oauth-authorization-server${path}`,
    `${url.origin}/.well-known/openid-configuration${path}`,
    `${url.origin}${path}/.well-known/openid-configuration`,
  ]
}

/**
 * The server's resource, its authorization server and that server's
 * metadata, plus what any metadata URL that turned us away said (an
 * authorization server that is switched off says so there).
 */
const discover = async (server) => {
  let resource = null
  for (const url of await resourceMetadataUrls(server)) {
    const { status, body } = await getJson(url)
    if (status === 200 && Array.isArray(body?.authorization_servers) && body.authorization_servers.length > 0) {
      resource = body
      break
    }
  }
  if (!resource) throw new Error(`${server} doesn't publish how to sign in to it (no OAuth protected resource metadata).`)
  if (resource.resource && new URL(resource.resource).origin !== new URL(server).origin) {
    throw new Error(`${server}'s sign-in metadata names another site's resource (${resource.resource}).`)
  }
  const issuer = safeUrl(resource.authorization_servers[0], 'an authorization server').toString().replace(/\/$/, '')
  const refusals = []
  for (const url of authServerMetadataUrls(issuer)) {
    const { status, body, error } = await getJson(url)
    if (status === 200 && body?.authorization_endpoint && body?.token_endpoint) {
      // RFC 8414 section 3.3: metadata for another issuer is not this issuer's.
      if (body.issuer && body.issuer.replace(/\/$/, '') !== issuer) {
        refusals.push(`${url} describes another issuer (${body.issuer})`)
        continue
      }
      for (const [key, what] of [['authorization_endpoint', 'a sign-in page'], ['token_endpoint', 'a token endpoint'], ['registration_endpoint', 'a registration endpoint']]) {
        if (body[key]) safeUrl(body[key], what)
      }
      return { resource: resource.resource ?? server, issuer, metadata: body, refusals }
    }
    const why = said(body) ?? error
    if (why) refusals.push(why)
  }
  throw new Error(`supereo's sign-in server (${issuer}) didn't give its OAuth metadata${refusals.length ? `: ${[...new Set(refusals)].join('; ')}` : ''}.`)
}

// ------------------------------------------------------------------- tokens

const jwtExpiry = (token) => {
  try {
    const exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).exp
    return Number.isFinite(exp) ? exp * 1000 : null
  } catch {
    return null
  }
}

/** The stored half of a token answer: a refresh that sends no new refresh token keeps the old one. */
const fromTokens = (tokens, previousRefresh = null) => ({
  accessToken: tokens.access_token,
  refreshToken: tokens.refresh_token ?? previousRefresh,
  expiresAt: Number.isFinite(tokens.expires_in) ? Date.now() + tokens.expires_in * 1000 : jwtExpiry(tokens.access_token),
})

const tokenRequest = async (endpoint, params, client) => {
  const body = new URLSearchParams({ ...params, client_id: client.clientId })
  if (client.clientSecret) body.set('client_secret', client.clientSecret)
  let res
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(`Couldn't reach supereo's sign-in server: ${err.cause?.message ?? err.message}`)
  }
  const json = await res.json().catch(() => null)
  if (!res.ok || typeof json?.access_token !== 'string') {
    const err = new Error(`supereo's sign-in server turned down the ${params.grant_type === 'refresh_token' ? 'refresh' : 'sign-in'} (${res.status}${said(json) ? `: ${said(json)}` : ''}).`)
    // The grant itself refused (OAuth's codes, or Supabase Auth's), not a proxy's or an outage's error page.
    err.grantRefused =
      (res.status === 400 || res.status === 401) &&
      (['invalid_grant', 'invalid_client', 'unauthorized_client'].includes(json?.error) ||
        /^(?:refresh_token_|session_)|^invalid_credentials$/.test(json?.error_code ?? ''))
    throw err
  }
  return json
}

const ENDED = `Your supereo sign-in has ended. Sign in again with: ${LOGIN_COMMAND}`

/**
 * An access token for `server`: SUPEREO_ACCESS_TOKEN when it's set, else the
 * stored sign-in, refreshed when it's about to expire, or when the server
 * turned down `rejected`. Another supereo-audit (a second MCP client, say)
 * may have refreshed it already: then its newer token is the answer.
 */
export const accessToken = async (server, { rejected = null } = {}) => {
  if (process.env.SUPEREO_ACCESS_TOKEN) return process.env.SUPEREO_ACCESS_TOKEN
  const entry = readStore().servers[server]
  if (!entry?.accessToken) throw new NotSignedIn()
  if (rejected && entry.accessToken !== rejected) return entry.accessToken
  if (!rejected && (entry.expiresAt == null || entry.expiresAt - EXPIRY_MARGIN_MS > Date.now())) return entry.accessToken
  if (!entry.refreshToken) throw new NotSignedIn(ENDED)
  try {
    const params = { grant_type: 'refresh_token', refresh_token: entry.refreshToken }
    if (entry.resource) params.resource = entry.resource
    const tokens = await tokenRequest(entry.tokenEndpoint, params, entry)
    const next = { ...entry, ...fromTokens(tokens, entry.refreshToken) }
    saveEntry(server, next)
    return next.accessToken
  } catch (err) {
    if (!err.grantRefused) throw err
    // Refused because another process used this refresh token first: take what it stored.
    const now = readStore().servers[server]
    if (now?.refreshToken && now.refreshToken !== entry.refreshToken) return now.accessToken
    saveEntry(server, null)
    throw new NotSignedIn(ENDED)
  }
}

/** Forgets the stored sign-in for `server`. Whether there was one. */
export const logout = (server) => {
  const had = Boolean(readStore({ fresh: true }).servers[server])
  saveEntry(server, null, { fresh: true })
  return had
}

// ------------------------------------------------------------------ sign-in

const openInBrowser = (url) => {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]]
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true })
    child.on('error', () => {})
    child.unref()
  } catch {
    // The URL is printed too, for a machine with no browser.
  }
}

const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const resultPage = (ok, message) =>
  `<!doctype html><meta charset="utf-8"><title>supereo-audit</title>` +
  `<body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">` +
  `<h1 style="font-size:1.25rem">${ok ? 'Back to your terminal' : 'Sign-in failed'}</h1><p>${escapeHtml(message)}</p></body>`

/**
 * What a redirect to the callback carries: the code, or why there is none.
 * One that isn't this sign-in's (its state doesn't match) is `stray`: turned
 * away without ending the wait.
 */
const readRedirect = (url, state) => {
  if (url.searchParams.get('state') !== state) return { ok: false, stray: true, message: "That sign-in wasn't started here." }
  const error = url.searchParams.get('error')
  if (error) return { ok: false, message: url.searchParams.get('error_description') || error }
  const code = url.searchParams.get('code')
  return code ? { ok: true, code } : { ok: false, message: 'The redirect carried no authorization code.' }
}

/**
 * A loopback listener on a free port for the redirect. On a machine whose
 * browser is elsewhere, the address the browser ends on can be pasted in
 * instead.
 */
const listen = () =>
  new Promise((resolve, reject) => {
    let deliver = null
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback' || !deliver) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
        return
      }
      const result = deliver(url)
      res.writeHead(result.ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' })
      res.end(resultPage(result.ok, result.ok ? 'supereo-audit is finishing the sign-in in your terminal. You can close this tab.' : result.message))
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        redirectUri: `http://127.0.0.1:${port}/callback`,
        /** The code from the redirect, or from a pasted address; refuses after the wait. */
        code: (state, { paste }) =>
          new Promise((done, fail) => {
            let lines = null
            const finish = (result) => {
              clearTimeout(timer)
              lines?.close()
              deliver = null
              if (result.ok) done(result.code)
              else fail(new Error(`Sign-in failed: ${result.message}`))
            }
            deliver = (url) => {
              const result = readRedirect(url, state)
              if (!result.stray) finish(result)
              return result
            }
            const timer = setTimeout(() => finish({ ok: false, message: 'it took longer than 10 minutes.' }), SIGN_IN_WAIT_MS)
            if (paste) {
              lines = createInterface({ input: process.stdin })
              lines.on('line', (line) => {
                try {
                  const url = new URL(line.trim())
                  if (url.searchParams.has('code') || url.searchParams.has('error')) deliver?.(url)
                } catch {
                  // Not an address: keep waiting.
                }
              })
            }
          }),
        close: () => server.close(),
      })
    })
  })

const register = async (endpoint, redirectUri) => {
  let res
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_name: CLIENT_NAME,
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(`Couldn't reach supereo's sign-in server: ${err.cause?.message ?? err.message}`)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok || typeof body?.client_id !== 'string') {
    throw new Error(`supereo's sign-in server didn't register supereo-audit (${res.status}${said(body) ? `: ${said(body)}` : ''}).`)
  }
  return { clientId: body.client_id, clientSecret: typeof body.client_secret === 'string' ? body.client_secret : undefined }
}

/**
 * Signs in to `server` in the browser and stores the tokens. `log` gets the
 * lines to show (the sign-in address among them); with `browser` false the
 * address is only printed.
 */
export const login = async (server, { browser = true, log }) => {
  const { resource, issuer, metadata, refusals } = await discover(server)
  if (!metadata.registration_endpoint) {
    const why = refusals.length ? ` It says: ${refusals[0].replace(/\.$/, '')}.` : ''
    throw new Error(`supereo's sign-in server isn't taking new apps right now, so supereo-audit can't sign in.${why} Try again later.`)
  }
  // The MCP spec: no S256 in the metadata, no sign-in.
  if (!metadata.code_challenge_methods_supported?.includes?.('S256')) throw new Error("supereo's sign-in server doesn't offer PKCE with S256, so supereo-audit won't sign in there.")

  const callback = await listen()
  try {
    const client = await register(metadata.registration_endpoint, callback.redirectUri)
    const verifier = base64url(randomBytes(32))
    const state = base64url(randomBytes(16))
    const authorize = new URL(metadata.authorization_endpoint)
    const params = {
      response_type: 'code',
      client_id: client.clientId,
      redirect_uri: callback.redirectUri,
      code_challenge: base64url(createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
      state,
      resource,
    }
    for (const [key, value] of Object.entries(params)) authorize.searchParams.set(key, value)

    const paste = Boolean(process.stdin.isTTY)
    log(browser ? 'Opening supereo in your browser to sign in. If it doesn\'t open, go to:' : 'Go to this address in a browser to sign in:')
    log(`  ${authorize}`)
    if (paste) log("If that browser is on another machine, paste the address it ends on here and press Enter.")
    if (browser) openInBrowser(authorize.toString())

    const code = await callback.code(state, { paste })
    const tokens = await tokenRequest(metadata.token_endpoint, { grant_type: 'authorization_code', code, redirect_uri: callback.redirectUri, code_verifier: verifier, resource }, client)
    saveEntry(server, { resource, issuer, tokenEndpoint: metadata.token_endpoint, ...client, ...fromTokens(tokens) }, { fresh: true })
  } finally {
    callback.close()
  }
}
