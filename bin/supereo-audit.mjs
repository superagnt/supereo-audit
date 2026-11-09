#!/usr/bin/env node
/**
 * supereo-audit: what AI crawlers can read on a page, with supereo's free MCP
 * tools. `supereo-audit acme.com` audits a site, `login` signs in once, and
 * `mcp` serves the same tools to an MCP client on stdio.
 */

import { parseArgs } from 'node:util'
import { LOGIN_COMMAND, NotSignedIn, login, logout } from '../lib/auth.mjs'
import { VERSION, connect, serverUrl } from '../lib/mcp.mjs'
import { formatReport, pageUrlOf, printable, runAudit } from '../lib/report.mjs'
import { serve } from '../lib/serve.mjs'
import { BOTS, DEFAULT_BOTS } from '../lib/tools.mjs'

const HELP = `supereo-audit ${VERSION}: what AI crawlers can read on a page, with supereo's free MCP tools.

Usage
  supereo-audit <site or page>    audit a site's home page, or one page
  supereo-audit login             sign in to supereo once (opens your browser)
  supereo-audit logout            forget the sign-in on this machine
  supereo-audit mcp               serve the three tools to an MCP client on stdio

Options
  --bots <list>       the AI crawlers to fetch the page as, comma-separated, or all
                      (default: ${DEFAULT_BOTS.join(',')})
  --query <question>  the question the page should answer
  --json              print the tools' answers as JSON
  --server <url>      supereo's MCP server (default https://supereo.app/api/mcp; only
                      supereo's own sites, or a server on this machine)
  --no-browser        with login: print the sign-in address instead of opening it
  --no-color          plain text
  --version, --help

Crawlers
  ${BOTS.join(', ')}

Environment
  SUPEREO_ACCESS_TOKEN  an access token to use instead of the stored sign-in
  SUPEREO_MCP_URL       the server, as --server
  SUPEREO_CONFIG_DIR    where the sign-in is kept (default: your config folder's supereo/)

Each page fetch counts toward supereo's 120 an hour per person. The audit only
reads: robots.txt, llms.txt and the page itself.
`

const say = (line) => process.stderr.write(`${line}\n`)
/** A message that may carry a server's or a page's words, made safe to print. */
const sayError = (message) => say(`supereo-audit: ${printable(message)}`)

class UsageError extends Error {}

const parse = () => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        bots: { type: 'string' },
        query: { type: 'string' },
        json: { type: 'boolean', default: false },
        server: { type: 'string' },
        'no-browser': { type: 'boolean', default: false },
        'no-color': { type: 'boolean', default: false },
        version: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
  } catch (err) {
    throw new UsageError(err.message)
  }
}

const botsOf = (value) => {
  if (!value) return DEFAULT_BOTS
  if (value.trim().toLowerCase() === 'all') return BOTS
  const asked = value.split(',').map((bot) => bot.trim()).filter(Boolean)
  if (!asked.length) throw new UsageError(`--bots names no crawler. Choose from ${BOTS.join(', ')}, or "all".`)
  const known = new Map(BOTS.map((bot) => [bot.toLowerCase(), bot]))
  const unknown = asked.filter((bot) => !known.has(bot.toLowerCase()))
  if (unknown.length) throw new UsageError(`Unknown crawler${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Choose from ${BOTS.join(', ')}, or "all".`)
  return [...new Set(asked.map((bot) => known.get(bot.toLowerCase())))]
}

/** A connection as you; in a terminal, a missing sign-in starts one. */
const connectAsYou = async (server, { browser }) => {
  try {
    return await connect(server)
  } catch (err) {
    const canSignIn = err instanceof NotSignedIn && !process.env.SUPEREO_ACCESS_TOKEN && process.stdin.isTTY && process.stderr.isTTY
    if (!canSignIn) throw err
    say("You're not signed in to supereo yet. The audit's tools are free; signing in once lets supereo run them as you.")
    await login(server, { browser, log: say })
    return connect(server)
  }
}

const main = async () => {
  const { values, positionals } = parse()
  if (values.version) {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }
  const [command, ...rest] = positionals
  if (values.help || !command) {
    process.stdout.write(HELP)
    return values.help ? 0 : 2
  }
  const server = serverUrl(values.server)

  if (command === 'login') {
    await login(server, { browser: !values['no-browser'], log: say })
    const connection = await connect(server)
    say(`Signed in. ${printable(connection.serverInfo?.title ?? connection.serverInfo?.name ?? 'supereo')} answered at ${server}.`)
    return 0
  }
  if (command === 'logout') {
    say(logout(server) ? 'Signed out of supereo on this machine.' : "You weren't signed in to supereo on this machine.")
    return 0
  }
  if (command === 'mcp') {
    await serve(server)
    return 0
  }
  if (rest.length) throw new UsageError(`One site or page at a time; got ${positionals.join(' ')}.`)

  let page
  try {
    page = pageUrlOf(command)
  } catch (err) {
    throw new UsageError(err.message)
  }
  const bots = botsOf(values.bots)
  const connection = await connectAsYou(server, { browser: !values['no-browser'] })
  const data = await runAudit(connection, { page, bots, query: values.query })
  if (values.json) process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
  else process.stdout.write(formatReport(data, { color: Boolean(process.stdout.isTTY) && !values['no-color'] && !process.env.NO_COLOR }))
  const parts = [data.checkAiAccess, data.auditPage, ...data.fetchAsBot]
  return parts.every((part) => part.error) ? 1 : 0
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (err) => {
    if (err instanceof UsageError) {
      sayError(err.message)
      say('Run supereo-audit --help for usage.')
      process.exitCode = 2
      return
    }
    sayError(err.message)
    if (err instanceof NotSignedIn && process.env.SUPEREO_ACCESS_TOKEN) say('Unset SUPEREO_ACCESS_TOKEN to use the sign-in stored on this machine.')
    else if (err instanceof NotSignedIn && !err.message.includes(LOGIN_COMMAND)) say(`Sign in with: ${LOGIN_COMMAND}`)
    process.exitCode = 1
  },
)
