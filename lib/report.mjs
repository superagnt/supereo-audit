/**
 * The audit: supereo's three free tools on one page, at once, and what they
 * found, as a report for people or as JSON for agents and scripts.
 */

import { NotSignedIn } from './auth.mjs'
import { refusalOf } from './mcp.mjs'

/** HTML fetch_as_bot sends back per crawler: the report needs the size and status, not the page. */
const HTML_CHARS = 1000

const FREE_AUDIT_URL = 'https://supereo.app'

/** "acme.com" or "https://acme.com/pricing" as the page's URL. */
export const pageUrlOf = (input) => {
  const value = String(input ?? '').trim()
  let url
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`)
  } catch {
    url = null
  }
  if (!url || !['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) {
    throw new Error(`"${value}" isn't a site or page. Give a site like acme.com, or a page like https://acme.com/pricing.`)
  }
  return url.toString()
}

/** A tool's answer: its structured content, or its refusal. */
const outcome = (settled) => {
  if (settled.status === 'rejected') return { error: settled.reason?.message ?? String(settled.reason) }
  const refusal = refusalOf(settled.value)
  if (refusal) return { error: refusal }
  let result = settled.value?.structuredContent
  if (!result) {
    try {
      result = JSON.parse(settled.value?.content?.[0]?.text ?? 'null')
    } catch {
      result = null
    }
  }
  return result ? { result } : { error: 'The tool answered with nothing to read.' }
}

/** Runs check_ai_access, audit_page and fetch_as_bot (once per crawler) on `page`, side by side. */
export const runAudit = async (connection, { page, bots, query }) => {
  const settled = await Promise.allSettled([
    connection.callTool('check_ai_access', { url: page }),
    connection.callTool('audit_page', query ? { url: page, query } : { url: page }),
    ...bots.map((bot) => connection.callTool('fetch_as_bot', { url: page, bot, max_html_chars: HTML_CHARS })),
  ])
  const signedOut = settled.find((s) => s.status === 'rejected' && s.reason instanceof NotSignedIn)
  if (signedOut) throw signedOut.reason
  const [access, audit, ...fetches] = settled.map(outcome)
  return {
    page,
    checkedAt: new Date().toISOString(),
    checkAiAccess: access,
    auditPage: audit,
    fetchAsBot: fetches.map((fetched, i) => ({ bot: bots[i], ...fetched })),
  }
}

// ---------------------------------------------------------------- the text

/**
 * Control characters but tabs and line breaks, and bidi overrides: an escape
 * sequence in a page's title could rewrite the screen or the clipboard, a
 * carriage return the line it's on.
 */
const UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

/**
 * Text a site or a server wrote, as one line safe to print in a terminal: a
 * line break in a page's own data, Unicode's line and paragraph separators
 * included, can't add lines to its report, on screen or in a saved copy.
 */
export const printable = (text) => String(text).replace(/[\t\n\r\u2028\u2029]+/g, ' ').replace(UNSAFE, '')

/** Every string in the tools' answers, printable. */
const printableAll = (value) =>
  typeof value === 'string'
    ? printable(value)
    : Array.isArray(value)
      ? value.map(printableAll)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, printableAll(inner)]))
        : value

const paint = (enabled) => {
  const wrap = (code) => (text) => (enabled ? `\x1b[${code}m${text}\x1b[0m` : text)
  return { bold: wrap('1'), dim: wrap('2'), red: wrap('31'), green: wrap('32'), yellow: wrap('33') }
}

const count = (n) => Number(n ?? 0).toLocaleString('en-US')
const plural = (n, one, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`
const quote = (text, max = 90) => {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  return `"${flat.length > max ? `${flat.slice(0, max - 1)}…` : flat}"`
}
const section = (c, title, tool) => `\n${c.bold(title)} ${c.dim(`(${tool})`)}`

const accessLines = (c, outcomeOf, findings, llmsFirstLine) => {
  const lines = [section(c, 'AI crawlers and robots.txt', 'check_ai_access')]
  if (outcomeOf.error) {
    lines.push(`  ${c.yellow(outcomeOf.error)}`)
    return lines
  }
  const r = outcomeOf.result
  lines.push(`  ${r.robotsTxt?.detail ?? ''} Path ${r.path || '/'}.`)
  const width = Math.max(...(r.crawlers ?? []).map((v) => v.bot.length), 10)
  for (const v of r.crawlers ?? []) {
    const verdict = v.allowed === true ? c.green('allowed') : v.allowed === false ? c.red('blocked') : c.yellow('unknown')
    const group = v.group ? c.dim(` (group ${v.group})`) : ''
    lines.push(`  ${verdict}  ${v.bot.padEnd(width)}  ${v.aiCrawler ? 'AI crawler   ' : 'search engine'}  ${v.rule}${group}`)
  }
  const blocked = (r.crawlers ?? []).filter((v) => v.aiCrawler && v.allowed === false).map((v) => v.bot)
  if (blocked.length) findings.push({ bad: true, text: `robots.txt blocks ${plural(blocked.length, 'AI crawler')} from this page: ${blocked.join(', ')}.` })
  else if ((r.crawlers ?? []).some((v) => v.aiCrawler && v.allowed === true)) findings.push({ bad: false, text: 'robots.txt lets every AI crawler supereo checks fetch this page.' })
  const llms = r.llmsTxt ?? {}
  if (llms.served) {
    lines.push(`  llms.txt   served, ${plural(llms.chars, 'character')}${llmsFirstLine ? `: ${quote(llmsFirstLine, 60)}` : ''}`)
    findings.push({ bad: false, text: 'The site serves an llms.txt.' })
  } else {
    lines.push(`  llms.txt   not served${llms.status ? ` (${llms.status})` : ''}`)
  }
  const edge = r.edge
  if (edge?.connected) {
    const turned = edge.blockedFromOperatorAddresses ?? []
    lines.push(
      `  edge       last ${edge.days} days: ${turned.length ? turned.map((b) => `${b.bot} turned away ${plural(b.deniedRequests, 'time')}`).join('; ') : 'no AI company turned away'}`,
    )
    if (turned.length) findings.push({ bad: true, text: `Your edge turned away ${turned.map((b) => b.bot).join(', ')} from their own addresses.` })
  }
  return lines
}

const issueText = (code) => code.replace(/_/g, ' ')

const pageLines = (c, outcomeOf, findings) => {
  const lines = [section(c, 'The page without JavaScript', 'audit_page')]
  if (outcomeOf.error) {
    lines.push(`  ${c.yellow(outcomeOf.error)}`)
    return lines
  }
  const r = outcomeOf.result
  const moved = r.finalUrl && r.finalUrl !== r.url ? ` → ${r.finalUrl}` : ''
  lines.push(`  ${r.status ?? '?'}${r.ms != null ? ` in ${count(r.ms)} ms` : ''}  ${r.url}${moved}`)
  const s = r.signals
  if (s) {
    lines.push(`  title      ${s.title ? quote(s.title) : c.yellow('none')}${s.titleYear ? c.dim(` (year ${s.titleYear})`) : ''}`)
    lines.push(`  H1         ${s.h1 ? quote(s.h1) : c.yellow('none')} ${c.dim(`(${plural(s.h1Count, 'H1')}, ${count(s.h2)} H2, ${count(s.h3)} H3, ${count(s.questionHeadings)} as questions)`)}`)
    lines.push(
      `  content    ${plural(s.words, 'word')}, ${plural(s.listItems, 'list item')}, ${plural(s.tables, 'table')}, ${plural(s.dollarFigures, 'price')}, ${plural(s.percentFigures, 'percentage')}`,
    )
    lines.push(`  data       ${s.structuredData?.length ? `JSON-LD ${s.structuredData.join(', ')}` : 'no structured data'}`)
    lines.push(`  dated      ${s.newestDate ? `${s.newestDate.date} (${plural(s.newestDate.ageDays, 'day')} old, from ${s.newestDate.source})` : c.yellow('no date found')}`)
    lines.push(`  canonical  ${s.canonical ?? 'none'}${s.noindex ? c.red('  noindex') : ''}`)
    if (s.queryInTitle != null || s.queryInOpening != null) {
      const share = (v) => (v == null ? '?' : `${Math.round(v * 100)}%`)
      lines.push(`  question   ${share(s.queryInTitle)} of its words in the title, ${share(s.queryInOpening)} in the first 60 words`)
    }
    if (s.openingText) lines.push(`  opening    ${quote(s.openingText)}`)
  } else {
    lines.push(`  ${c.yellow('Not a page of HTML supereo could read, so it has no on-page signals.')}`)
  }
  for (const issue of r.issues ?? []) lines.push(`  ${c.red('issue')}      ${issueText(issue.code)}: ${issue.detail}`)
  if (r.issues?.length) findings.push({ bad: true, text: `${plural(r.issues.length, 'thing')} on the page keep${r.issues.length === 1 ? 's' : ''} AI from reading it well: ${r.issues.map((i) => issueText(i.code)).join(', ')}.` })
  else findings.push({ bad: false, text: 'Nothing on the page keeps AI from reading it.' })
  return lines
}

const fetchLines = (c, fetches, findings) => {
  const lines = [section(c, 'What each AI crawler is served', 'fetch_as_bot')]
  const width = Math.max(...fetches.map((f) => f.bot.length), 10)
  const sizes = fetches.filter((f) => f.result).map((f) => f.result.htmlChars)
  const largest = Math.max(0, ...sizes)
  const failed = []
  for (const f of fetches) {
    if (f.error) {
      lines.push(`  ${f.bot.padEnd(width)}  ${c.yellow(f.error)}`)
      failed.push(`${f.bot} (${f.error.replace(/\.$/, '')})`)
      continue
    }
    const r = f.result
    const ok = r.status >= 200 && r.status < 300
    const thin = ok && largest > 0 && r.htmlChars < largest * 0.5
    const status = ok ? c.green(String(r.status)) : c.red(String(r.status))
    const moved = r.finalUrl && r.finalUrl !== r.url ? c.dim(` → ${r.finalUrl}`) : ''
    lines.push(`  ${f.bot.padEnd(width)}  ${status}  ${count(r.htmlChars).padStart(10)} characters  ${count(r.ms).padStart(6)} ms${thin ? c.yellow('  much less HTML than the others') : ''}${moved}`)
    if (!ok) failed.push(`${f.bot} (${r.status})`)
    else if (thin) failed.push(`${f.bot} (much less HTML than the others)`)
  }
  lines.push(c.dim("  Fetched from supereo's address: a site that checks crawler IP addresses may answer the real crawler differently."))
  if (failed.length) findings.push({ bad: true, text: `Not every AI crawler gets the page: ${failed.join(', ')}.` })
  else if (fetches.length) findings.push({ bad: false, text: `${fetches.length === 1 ? 'The AI crawler' : fetches.length === 2 ? 'Both AI crawlers' : `All ${fetches.length} AI crawlers`} got the page.` })
  return lines
}

/** The report for people. */
export const formatReport = (answers, { color = false } = {}) => {
  // llms.txt's first line, found before every string is folded onto one line.
  const llmsFirstLine = answers.checkAiAccess.result?.llmsTxt?.excerpt?.split('\n').find((line) => line.trim())
  const data = printableAll(answers)
  const c = paint(color)
  const findings = []
  const lines = [
    `${c.bold('supereo-audit')}  ${data.page}`,
    c.dim(`checked ${data.checkedAt.replace('T', ' ').slice(0, 16)} UTC with supereo's free MCP tools`),
    ...accessLines(c, data.checkAiAccess, findings, llmsFirstLine ? printable(llmsFirstLine) : null),
    ...pageLines(c, data.auditPage, findings),
    ...(data.fetchAsBot.length ? fetchLines(c, data.fetchAsBot, findings) : []),
    `\n${c.bold('Summary')}`,
    ...findings.sort((a, b) => Number(b.bad) - Number(a.bad)).map((f) => `  ${f.bad ? c.red('✗') : c.green('✓')} ${f.text}`),
    '',
    'These are the reads AI needs first. How often ChatGPT, Gemini, Perplexity, Claude and Google',
    `recommend you, and who they pick instead, is supereo's free audit: ${FREE_AUDIT_URL} (about 2 minutes, no card).`,
  ]
  return `${lines.join('\n')}\n`
}
