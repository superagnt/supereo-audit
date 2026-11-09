/**
 * `supereo-audit mcp`: a local MCP server on stdio with supereo's three free
 * tools, for clients that run a command rather than connect to a URL. It
 * lists the tools itself and passes each call to supereo's server as you,
 * signed in with `supereo-audit login`. Only JSON-RPC goes to stdout.
 */

import { createInterface } from 'node:readline'
import { LOGIN_COMMAND, NotSignedIn } from './auth.mjs'
import { PROTOCOL_VERSION, VERSION, connect } from './mcp.mjs'
import { TOOL_NAMES, TOOLS } from './tools.mjs'

const SUPPORTED_VERSIONS = [PROTOCOL_VERSION, '2025-06-18', '2025-03-26', '2024-11-05']

const INSTRUCTIONS =
  "supereo's three free AEO tools, run as you on supereo (https://supereo.app): check_ai_access (robots.txt and llms.txt for each AI crawler), " +
  "audit_page (a page's on-page signals as an AI crawler without JavaScript gets them) and fetch_as_bot (what a site serves one AI crawler's user agent). " +
  `They only read. Sign in once in a terminal with: ${LOGIN_COMMAND}`

const errorReply = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

export const serve = (server) =>
  new Promise((resolve) => {
    let connection = null
    const connectionFor = () => {
      connection ??= connect(server).catch((err) => {
        connection = null
        throw err
      })
      return connection
    }

    const callTool = async (params) => {
      const name = params?.name
      try {
        return await (await connectionFor()).callTool(name, params?.arguments ?? {})
      } catch (err) {
        // A sign-in that ended is read again on the next call, after a login in a terminal.
        if (err instanceof NotSignedIn) connection = null
        return { content: [{ type: 'text', text: err instanceof NotSignedIn ? err.message : `supereo couldn't run ${name}: ${err.message}` }], isError: true }
      }
    }

    const handle = async (message) => {
      const { id, method, params } = message ?? {}
      // Notifications (initialized, cancelled) and answers to requests this server never sends need no answer.
      if (typeof method !== 'string' || id === undefined || id === null) return null
      switch (method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: SUPPORTED_VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : PROTOCOL_VERSION,
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: 'supereo-audit', title: 'supereo audit', version: VERSION },
              instructions: INSTRUCTIONS,
            },
          }
        case 'ping':
          return { jsonrpc: '2.0', id, result: {} }
        case 'tools/list':
          return { jsonrpc: '2.0', id, result: { tools: TOOLS } }
        case 'tools/call':
          if (!TOOL_NAMES.has(params?.name)) return errorReply(id, -32602, `Unknown tool: ${params?.name}`)
          return { jsonrpc: '2.0', id, result: await callTool(params) }
        default:
          return errorReply(id, -32601, `Method not found: ${method}`)
      }
    }

    const write = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
    const inFlight = new Set()
    const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
    lines.on('line', (line) => {
      if (!line.trim()) return
      let message
      try {
        message = JSON.parse(line)
      } catch {
        write(errorReply(null, -32700, 'Parse error'))
        return
      }
      const task = handle(message)
        .then((reply) => reply && write(reply))
        .catch((err) => {
          process.stderr.write(`supereo-audit: ${err.message}\n`)
          if (message?.id !== undefined && message?.id !== null) write(errorReply(message.id, -32603, 'Internal error'))
        })
        .finally(() => inFlight.delete(task))
      inFlight.add(task)
    })
    lines.on('close', () => {
      Promise.allSettled([...inFlight]).then(() => resolve())
    })
  })
