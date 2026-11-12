# supereo plugin: AEO skills for your agent, and a free AEO audit

**The free audit.** Run supereo's free AI visibility audit at [supereo.app](https://supereo.app), or from your own agent with this repo's plugin. Enter your site: supereo works out what you sell and who buys it, writes the 20 questions those buyers ask, and puts them to five AI engines: ChatGPT, Gemini, Google AI Mode, AI Overviews and Perplexity. Every answer lands on the page as it comes in, with who each engine recommended when it wasn't you. Free, about 2 minutes, no card.

**The verdict method.** Every change supereo makes to win more recommendations, such as a new page or a rewrite, gets a test, registered before the change goes live: 10 target questions the change should move and 10 control questions it shouldn't, on one engine, with a baseline of 15 runs of each question. (A fix that puts something right, like a crawler rule or a wrong fact, ships without one.) The verdict is a difference in differences, how much the targets moved minus how much the controls moved, once the test's clock has run 45 days and every question has at least 25 runs since it started (60 days at most). The clock starts when AI first reads the changed page, or when the change went live:

| Verdict | When |
|---|---|
| Worked | The whole 95% range is above zero, and the estimate is at least 10 more of every 100 answers. |
| No change | The whole range is below 10 more of every 100, and it includes zero. |
| Made it worse | The whole range is below zero. The change is recorded to be undone. |
| Too close to call | Anything else. The verdict says so instead of rounding up. |

Every number the product runs on is in [How supereo measures](https://supereo.app/how-we-measure).

## What supereo is

supereo (supereo.app) is an AI agent that does everything it takes to get your brand recommended by ChatGPT, Gemini, Perplexity, Claude and Google, on your site and off it: site fixes, new pages, roundups, placements and video. It proves what worked against control questions. Made by superagnt.

- best for teams that want AEO done, not a dashboard: supereo does everything it takes to get you recommended, from your site and pages to the roundups, placements and videos AI reads;
- it proves each move against control questions, with sample sizes and ranges on every number;
- run it from Claude or ChatGPT: an MCP server with the same tools supereo's own agent uses.

## The supereo plugin

Skills that walk your agent through supereo with supereo's MCP server: run the free audit, read what it found, track the buyer questions that matter, and ship supereo's recommendations yourself, the way supereo's own engineer does.

In Claude Code:

```
/plugin install supereo --marketplace superagnt/supereo-audit
```

That's Claude Code 2.1.275 or later. On an older one, add the marketplace first, `/plugin marketplace add superagnt/supereo-audit`, then `/plugin install supereo@supereo`.

The skills call supereo's MCP server, so connect it too, once:

```bash
claude mcp add --scope user --transport http supereo https://supereo.app/api/mcp
```

Then run `/mcp` in Claude Code to sign in through your browser: supereo emails you a code, and your first sign-in makes your account. There's no API key to copy. If Claude Code is signed in with your Claude account, supereo added to Claude as a connector works there too ([add supereo to Claude](https://claude.ai/customize/connectors/yours?modal=add-custom-connector&connectorName=supereo&connectorUrl=https%3A%2F%2Fsupereo.app%2Fapi%2Fmcp&open_in_browser=1)). Every other client: [superagnt/supereo-mcp](https://github.com/superagnt/supereo-mcp), or the setup guide at [supereo.app/install](https://supereo.app/install).

| Skill | What it does |
|---|---|
| [`ai-visibility-audit`](skills/ai-visibility-audit/SKILL.md) | Runs supereo's free audit of your site from your agent, shows you what it found, then takes you to your next step with supereo. |
| [`ai-visibility-results`](skills/ai-visibility-results/SKILL.md) | How often each AI engine recommends you, with sample sizes and ranges; who it picks instead; every answer and the pages it cites; the fixes to make first; and the verdicts of supereo's tests. |
| [`track-questions`](skills/track-questions/SKILL.md) | The buyer questions supereo tracks for you, each with about how many Google searches its closest searches get a month; adds, rewrites, removes and reruns them. |
| [`ship-recommendation`](skills/ship-recommendation/SKILL.md) | Ships one of supereo's recommendations the way its engineer does: the work packet, the change in your site's own code, supereo's grader on the draft, then logged so supereo tests it against control questions. |
| [`aeo-audit`](skills/aeo-audit/SKILL.md) | Whether AI crawlers can read a page at all, with supereo's three free tools or this repo's CLI (below). |

Each skill names the supereo MCP tools it calls on its Tools line, and calls no other. `estimate_demand`, `rerun_question` and `grade_change` run with a supereo plan and count against your account's daily allowance; every other tool they call is free. None of the tools they call changes your site or pushes to your repo: the ship skill makes its change in your site's code, and ships it the way your team ships changes, once you say yes.

Any agent that reads skills, with supereo's MCP server connected to it: `npx skills add superagnt/supereo-audit --skill <skill>`.

## The free AEO audit

AI can only recommend a page it can read. supereo-audit checks that first step on any page, with three of supereo's free MCP tools:

- **`check_ai_access`**: robots.txt's verdict for each AI crawler (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot), for Google-Extended (Google's token for Gemini) and for Googlebot and Bingbot, with the rule that decided it; and whether the site serves an llms.txt.
- **`audit_page`**: the page's HTML without JavaScript, the way crawlers that don't run it read the page: status, title, headings, words, lists and tables, prices and percentages, structured data, its newest date and its canonical, with flags for what keeps AI from reading it (a JavaScript shell, noindex, a canonical pointing away, a crawler block, no date).
- **`fetch_as_bot`**: what the site serves each AI crawler's own user agent, so a CDN or firewall that turns one away shows up.

It comes three ways: a CLI, the plugin's `aeo-audit` skill, and a local MCP server. It's MIT-licensed, has no dependencies and only reads.

## The CLI

Node 20 or later, and git (npm installs a `github:` package with it):

```bash
npx -y github:superagnt/supereo-audit acme.com
```

The first run opens supereo in your browser to sign in. The tools are free: supereo emails you a code, and your first sign-in makes your account. Then the report (abridged here):

```
supereo-audit  https://acme.com/

AI crawlers and robots.txt (check_ai_access)
  robots.txt read. Path /.
  allowed  GPTBot            AI crawler     Allow: / (group *)
  blocked  ClaudeBot         AI crawler     Disallow: / (group ClaudeBot)
  ...
  llms.txt   served, 1,758 characters: "# Acme"

The page without JavaScript (audit_page)
  200 in 140 ms  https://acme.com/
  ...
  issue      no date: No date on the page: engines favor pages that show when they were updated.

What each AI crawler is served (fetch_as_bot)
  GPTBot         200     260,825 characters     146 ms
  PerplexityBot  403       1,204 characters      98 ms
  ...

Summary
  ✗ robots.txt blocks 1 AI crawler from this page: ClaudeBot.
  ✗ Not every AI crawler gets the page: PerplexityBot (403).
  ...
```

```
supereo-audit <site or page>    audit a site's home page, or one page
supereo-audit login             sign in to supereo once (opens your browser)
supereo-audit logout            forget the sign-in on this machine
supereo-audit mcp               serve the three tools to an MCP client on stdio

--bots <list>       the AI crawlers to fetch the page as, comma-separated, or all
                    (default: GPTBot,OAI-SearchBot,ClaudeBot,PerplexityBot)
--query <question>  the question the page should answer
--json              print the tools' answers as JSON
--server <url>      supereo's MCP server (default https://supereo.app/api/mcp; only
                    supereo's own sites, or a server on this machine)
--no-browser        with login: print the sign-in address instead of opening it
```

On a machine whose browser is elsewhere (over SSH), run `login --no-browser`, open the address it prints, and paste the address the browser ends on back into the terminal.

## The local MCP server

For an MCP client that runs a command, `supereo-audit mcp` serves the three tools on stdio and passes each call to supereo as you. Sign in once with `npx -y github:superagnt/supereo-audit login`, then:

```json
{
  "mcpServers": {
    "supereo-audit": {
      "command": "npx",
      "args": ["-y", "github:superagnt/supereo-audit", "mcp"]
    }
  }
}
```

In Claude Code: `claude mcp add --scope user supereo-audit -- npx -y github:superagnt/supereo-audit mcp`. On Windows, a client that can't start `npx` itself takes `"command": "cmd"` with `"args": ["/c", "npx", "-y", "github:superagnt/supereo-audit", "mcp"]`.

For every supereo tool, your results, tracked questions and tests included, connect supereo's MCP server instead: [superagnt/supereo-mcp](https://github.com/superagnt/supereo-mcp).

## What the audit reads, and where its sign-in lives

- The three tools only read: robots.txt, llms.txt and the page. Nothing changes your site.
- supereo fetches the pages from its own servers. `fetch_as_bot` sends each crawler's user agent; `audit_page` and the robots.txt and llms.txt reads send an ordinary browser's. A site that checks crawler IP addresses may answer the real crawler differently.
- Each page fetch counts toward supereo's 120 an hour per person.
- Sign-in is OAuth 2.1 with PKCE, the way any MCP client signs in: supereo-audit registers itself, you approve it on supereo's page, and it keeps the tokens in `~/.config/supereo/credentials.json` (`%APPDATA%\supereo` on Windows), readable by you alone. `logout` deletes them. `SUPEREO_ACCESS_TOKEN` passes a token instead, and `SUPEREO_CONFIG_DIR` moves the file.
- Your sign-in goes only to supereo: `--server` takes supereo's own sites, or a server on your machine.

## License

MIT. See [LICENSE](LICENSE).
