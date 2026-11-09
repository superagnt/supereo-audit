/**
 * The three free tools of supereo's MCP server (https://supereo.app/api/mcp),
 * in the words its server uses for them: what the CLI calls, and what the
 * local MCP server (`supereo-audit mcp`) offers. They only read: robots.txt,
 * llms.txt and the page itself, fetched by supereo. supereo checks every
 * call's input itself, so these schemas are a guide for the agent, not the
 * gate.
 */

/** The AI crawlers fetch_as_bot can be, each sending that company's own user agent. */
export const BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User']

/** One AI company's crawlers each: the CLI's default for fetch_as_bot. */
export const DEFAULT_BOTS = ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot']

/** Read-only, out on the open web: the annotations supereo's server gives them. */
const READS_THE_WEB = { readOnlyHint: true, openWorldHint: true }

const URL_INPUT = { type: 'string', format: 'uri', maxLength: 2048, description: 'An http or https URL.' }

export const TOOLS = [
  {
    name: 'check_ai_access',
    title: 'Check AI crawler access',
    description:
      "Reads a site's robots.txt and llms.txt now and says, for each AI crawler supereo checks (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, " +
      'Claude-SearchBot, Claude-User, PerplexityBot, Google-Extended) and for Googlebot and Bingbot, whether robots.txt lets it fetch a path, by which ' +
      "rule; and whether the site serves an llms.txt, with its opening lines. For one of your own sites connected in supereo, it adds the blocks seen at " +
      "its Cloudflare or Vercel edge over the last week: AI companies' own requests the edge turned away, apart from spoofers it rightly refused. Free.",
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          minLength: 3,
          maxLength: 2048,
          description: 'The site, like acme.com, or the page whose path to check, like https://acme.com/pricing.',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    annotations: READS_THE_WEB,
  },
  {
    name: 'audit_page',
    title: 'Audit a page',
    description:
      "A page's on-page signals as an AI crawler without JavaScript gets them: status and timing, title, headings, word count, lists and tables, " +
      'prices and percentages, structured data, its newest date, the canonical, robots.txt verdicts and llms.txt; with flags for what keeps AI from ' +
      'reading it (a JavaScript shell, noindex, a canonical pointing away, a crawler block, no date). Free.',
    inputSchema: {
      type: 'object',
      properties: {
        url: URL_INPUT,
        query: {
          type: 'string',
          minLength: 2,
          maxLength: 300,
          description: 'The question the page should answer: its title and opening words are measured against it.',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    annotations: READS_THE_WEB,
  },
  {
    name: 'fetch_as_bot',
    title: 'Fetch a page as an AI crawler',
    description:
      'Fetches a URL now as one AI crawler (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot or ' +
      "Perplexity-User), sending its user agent and no JavaScript, and returns the status, headers and raw HTML (capped). It shows what the site serves " +
      "that user agent from supereo's address: a site that checks crawler IP addresses may answer the real crawler differently. Free.",
    inputSchema: {
      type: 'object',
      properties: {
        url: URL_INPUT,
        bot: { type: 'string', enum: BOTS, description: 'The AI crawler whose user agent to send.' },
        max_html_chars: {
          type: 'integer',
          minimum: 1000,
          maximum: 200000,
          description: 'How much of the HTML to return (default 50,000 characters).',
        },
      },
      required: ['url', 'bot'],
      additionalProperties: false,
    },
    annotations: READS_THE_WEB,
  },
]

export const TOOL_NAMES = new Set(TOOLS.map((tool) => tool.name))
