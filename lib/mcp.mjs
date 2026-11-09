/**
 * A small MCP client for supereo's server: JSON-RPC over MCP's Streamable
 * HTTP transport, signed in with the token from auth.mjs. supereo's server is
 * stateless, so each request stands alone; the answer is plain JSON, or an
 * event stream from servers that send one.
 */

import { readFileSync } from 'node:fs'
import { LOGIN_COMMAND, NotSignedIn, accessToken } from './auth.mjs'

const DEFAULT_SERVER = 'https://supereo.app/api/mcp'
export const PROTOCOL_VERSION = '2025-11-25'
export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

/** The longest a call may take: supereo answers a page fetch within 20 seconds. */
const CALL_TIMEOUT_MS = 90_000

/**
 * The server named in --server or SUPEREO_MCP_URL, else supereo's own. Your
 * sign-in is a supereo session, so it goes only to supereo's sites (https)
 * or to a server on this machine.
 */
export const serverUrl = (flag) => {
  const value = flag || process.env.SUPEREO_MCP_URL || DEFAULT_SERVER
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${value} isn't a URL. The server is an address like ${DEFAULT_SERVER}.`)
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol)
  const supereo = url.protocol === 'https:' && (url.hostname === 'supereo.app' || url.hostname.endsWith('.supereo.app'))
  if (!local && !supereo) throw new Error(`${value} isn't supereo's. supereo-audit sends your sign-in only to https://supereo.app, or to a server on this machine.`)
  return url.toString()
}

/** The message in an error answer: supereo's envelope, a JSON-RPC error, or the text itself. */
const errorText = (text) => {
  try {
    const body = JSON.parse(text)
    const message = body?.error?.message ?? body?.message
    if (typeof message === 'string') return message
  } catch {
    // Not JSON.
  }
  return text.trim().slice(0, 200)
}

/** The JSON-RPC answer to request `id` in an event stream. */
const fromEventStream = (text, id) => {
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n')
    if (!data) continue
    try {
      const message = JSON.parse(data)
      if (message?.id === id) return message
    } catch {
      // Not a JSON-RPC message.
    }
  }
  throw new Error('The server ended its answer without replying.')
}

/** One POST. A 401 is thrown with `status` so the caller can refresh and retry. */
const post = async (server, token, message, protocolVersion) => {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  if (token) headers.authorization = `Bearer ${token}`
  if (protocolVersion) headers['mcp-protocol-version'] = protocolVersion
  let res
  try {
    // No redirects: the token goes to the server named, nowhere else.
    res = await fetch(server, { method: 'POST', headers, body: JSON.stringify(message), redirect: 'error', signal: AbortSignal.timeout(CALL_TIMEOUT_MS) })
  } catch (err) {
    throw new Error(`Couldn't reach ${server}: ${err.name === 'TimeoutError' ? `no answer in ${CALL_TIMEOUT_MS / 1000} seconds` : (err.cause?.message ?? err.message)}`)
  }
  const text = await res.text()
  if (res.status === 401) {
    const err = new Error(errorText(text) || 'Unauthorized')
    err.status = 401
    throw err
  }
  if (!('id' in message)) return null
  if (!res.ok) throw new Error(`${server} answered ${res.status}${text ? `: ${errorText(text)}` : ''}`)
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) return fromEventStream(text, message.id)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${server} answered something that isn't JSON-RPC.`)
  }
}

/**
 * A connection to `server` as you: initialized once, then `callTool(name,
 * args)` answers each tool's result (content, structuredContent, isError).
 * A token the server turns down is refreshed once, by one refresh shared by
 * every call in flight.
 */
export const connect = async (server) => {
  let token = await accessToken(server)
  let refreshing = null
  const renewed = async (used) => {
    if (process.env.SUPEREO_ACCESS_TOKEN) throw new NotSignedIn('supereo turned down SUPEREO_ACCESS_TOKEN: it is wrong or has expired.')
    if (token !== used) return token
    refreshing ??= accessToken(server, { rejected: used })
      .then((next) => (token = next))
      .finally(() => {
        refreshing = null
      })
    return refreshing
  }
  const request = async (message, protocolVersion) => {
    const used = token
    try {
      return await post(server, used, message, protocolVersion)
    } catch (err) {
      if (err.status !== 401) throw err
    }
    try {
      return await post(server, await renewed(used), message, protocolVersion)
    } catch (err) {
      if (err.status === 401) throw new NotSignedIn(`supereo turned down your sign-in. Sign in again with: ${LOGIN_COMMAND}`)
      throw err
    }
  }

  const init = await request({
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'supereo-audit', version: VERSION } },
  })
  if (init.error) throw new Error(`The server refused to start a session: ${init.error.message}`)
  const protocolVersion = init.result?.protocolVersion ?? PROTOCOL_VERSION
  await request({ jsonrpc: '2.0', method: 'notifications/initialized' }, protocolVersion)

  let id = 0
  return {
    serverInfo: init.result?.serverInfo ?? null,
    callTool: async (name, args) => {
      const reply = await request({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }, protocolVersion)
      if (reply.error) throw new Error(`${name}: ${reply.error.message}`)
      return reply.result
    },
  }
}

/** A tool result's error line, or null when it answered. */
export const refusalOf = (result) => (result?.isError ? (result.content ?? []).map((part) => part.text ?? '').join(' ').trim() || 'The tool failed.' : null)
