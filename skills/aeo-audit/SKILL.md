---
name: aeo-audit
description: Audit whether AI crawlers and answer engines can read a website, with supereo's free MCP tools. Checks robots.txt for each AI crawler (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot) and Google's Google-Extended token, the site's llms.txt, the page's HTML without JavaScript, and what the site serves each crawler's user agent. Use when someone asks whether ChatGPT, Claude or Perplexity can read their site, why AI answers don't cite their pages, or for a technical AEO or GEO audit of a site or page.
license: MIT
---

# AEO audit

**Tools:** `check_ai_access`, `audit_page` and `fetch_as_bot`, from supereo's MCP server or the supereo-audit CLI, which calls the same three. All three are free.

Find what keeps AI engines from reading a page, with supereo's three free, read-only tools: `check_ai_access`, `audit_page` and `fetch_as_bot`. They read robots.txt, llms.txt and the page itself, and change nothing.

## 1. Get the tools

- If `check_ai_access`, `audit_page` and `fetch_as_bot` are among your tools (supereo's MCP server at `https://supereo.app/api/mcp`, or `supereo-audit mcp`), call them directly.
- Otherwise run the CLI, which calls the same tools (Node 20 or later):

  ```bash
  npx -y github:superagnt/supereo-audit <site or page> --json
  ```

  If it says the person isn't signed in, ask them to run `npx -y github:superagnt/supereo-audit login` in their own terminal. It opens supereo's sign-in in their browser; it's free, and supereo emails a code. Then run the audit again.

## 2. Run the audit

Audit the page the person asks about, or the home page when they name only a site.

1. `check_ai_access` with the `url` of the page: robots.txt's verdict for each crawler on that path, the rule that decided it, and whether the site serves an llms.txt.
2. `audit_page` with the `url`, and `query` when the page should answer a particular question: the page's HTML without JavaScript, the way crawlers that don't run it read the page, with flags for what keeps AI from reading it.
3. `fetch_as_bot` with the `url`, `bot` and `max_html_chars` at 1000 (unless you need the HTML), once per crawler that matters:
   - ChatGPT's search: `OAI-SearchBot` and `ChatGPT-User` (OpenAI trains on `GPTBot`'s fetches)
   - Claude: `Claude-SearchBot` and `Claude-User` (Anthropic trains on `ClaudeBot`'s)
   - Perplexity: `PerplexityBot` and `Perplexity-User`

The CLI runs all three steps at once: by default as GPTBot, OAI-SearchBot, ClaudeBot and PerplexityBot, or `--bots all` for all eight. Each page fetch counts toward supereo's 120 an hour per person, so audit the pages that matter rather than a whole site.

## 3. Read the results

- **A crawler blocked in robots.txt.** `rule` is the line that decided it, and `group` the user agent it sits under (`*` when no group names the crawler). Blocking a training crawler (GPTBot, ClaudeBot) is a choice some sites make on purpose. Blocking a search crawler (OAI-SearchBot, Claude-SearchBot, PerplexityBot) keeps the page out of that engine's search results, which its answers draw on. The fetchers a person's question triggers (ChatGPT-User, Claude-User, Perplexity-User) follow robots.txt differently from company to company, so read their `fetch_as_bot` results too. Google-Extended isn't a crawler but Google's token for Gemini: blocking it keeps the page out of Gemini's training and its grounded answers, not out of Google Search.
- **Issues from `audit_page`**:
  - **javascript_shell**: the content needs JavaScript, and AI crawlers don't run it. Render the page on the server or ahead of time.
  - **noindex**: the page asks not to be indexed.
  - **canonical_elsewhere**: its canonical points at another URL, so that one is what gets cited.
  - **ai_crawlers_blocked**: robots.txt blocks the crawlers it names.
  - **robots_unknown**: robots.txt couldn't be read, and crawlers assume the worst then.
  - **no_h1**: the page has no H1 heading.
  - **no_date** or **not_fresh**: no date found on the page (its text, structured data, meta tags or Last-Modified header), or the newest is more than 30 days old. Engines favor pages that show when they were updated.
  - **not_readable**: the page didn't answer 2xx HTML.
- **`fetch_as_bot`**: a crawler that gets a 4xx or 5xx while others get 200, or much less HTML than the others, is being turned away or sent a challenge page, usually by the CDN's or firewall's bot settings. Only `fetch_as_bot` sends a crawler's user agent: `audit_page` and the robots.txt and llms.txt reads send an ordinary browser's. supereo fetches from its own address, so a site that checks crawler IP addresses may still answer the real crawler differently.
- **llms.txt** is optional. Say whether it's served, and don't claim it changes how engines rank or cite a page.

## 4. Report

Lead with what blocks reading, then the rest, each with its evidence from the tools (the rule, the status, the flag) and the fix. Don't guess beyond what the tools returned.

These tools tell you whether AI can read a page. How often ChatGPT, Gemini, Perplexity, Claude and Google actually recommend the brand, and who they pick instead, is supereo's free audit: the ai-visibility-audit skill runs it from your agent over supereo's MCP server, and https://supereo.app runs it in a browser (about 2 minutes, no card).
