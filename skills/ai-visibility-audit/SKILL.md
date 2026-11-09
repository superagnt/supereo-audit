---
name: ai-visibility-audit
description: Run supereo's free AI visibility audit of a site from your agent, show the person what it found, then take them to their next step with supereo. The audit puts the questions a site's buyers ask to six AI engines (ChatGPT, Gemini, Google AI Mode, AI Overviews, Perplexity and Claude) and reports how often each one recommends the brand, who it picks instead and the first fixes, in about a minute, free. Use when someone asks how often ChatGPT or other AI engines recommend their brand, wants an AI visibility, AEO or GEO audit of their site, has just connected supereo, or asks what to do next with supereo.
license: MIT
---

# AI visibility audit

**Tools:** `get_next_step`, `start_audit` and `get_audit`, from supereo's MCP server. All three are free, on every plan.

Run supereo's free audit as the person, show them its results, then walk them to their next step.

## 1. Get the tools

They come from supereo's MCP server, `https://supereo.app/api/mcp`, signed in as the person. Some clients load MCP tools only when asked: search your tools for `start_audit` before you decide it isn't there. If it isn't, connect the server:

- Claude Code: `claude mcp add --scope user --transport http supereo https://supereo.app/api/mcp`, then `/mcp` to sign in. The tools load in the next session.
- Claude (claude.ai, the desktop app, and Claude Code signed in with a Claude account): add it as a connector with [this link](https://claude.ai/customize/connectors/yours?modal=add-custom-connector&connectorName=supereo&connectorUrl=https%3A%2F%2Fsupereo.app%2Fapi%2Fmcp&open_in_browser=1), then connect and sign in. The desktop app loads it once it's refreshed or reopened.
- Any other agent: https://supereo.app/install has the steps for each one.

Sign-in happens in the person's browser: supereo emails them a code, and their first sign-in makes their account. There is no API key, so never ask for one.

## 2. Start where the person is

Call `get_next_step` first, with `site` when they named one. Its `step` says where they are, its `say` what to tell them, and its `do` what you do next. Follow `do` as it's written.

- `start_audit`: no audit yet. If they haven't named their site, ask which one: it's the only thing to ask. Then run the audit (step 3).
- `audit_running`: an audit of theirs is running, maybe of another site. Follow it with `get_audit` (step 3, part 2), then do the rest of what `do` says.
- Any other step: supereo has audited the site already. When they asked for the audit, `get_audit` with `site` reads its latest one: show it as step 4 says, with the day it was checked (`checkedAt`). On a site supereo tracks, its tracked rates are newer than that audit, and the ai-visibility-results skill reads them. Then go on with the step (step 5).

## 3. Run the audit

1. `start_audit` with `site`: a domain such as acme.com, or any URL on it.
   - `running`: it has started. Keep its `auditId`.
   - `in_your_account`: the site is a workspace of theirs already, so no new audit ran. `get_audit` with `site` reads its latest audit: say the day it was checked. An archived workspace stays archived: `get_next_step` gives the person the link to restore it.
   - A refusal is one plain line, such as one audit running at a time, another account holding the site, or a limit for the day. Tell the person that line as it is.
2. `get_audit` with `audit_id`, again and again until its `status` is `done` or `failed`, waiting `progress.checkAgainInSeconds` (about 10 seconds) between calls. The audit takes about a minute, sometimes a few. Now and then tell the person where it is, in the words of `progress.line` ("Asking six AI engines: 85 of 120 answers in."). Never start it again while it runs.
3. `failed`: tell the person `failure` as it is. `start_audit` can run it again later.

## 4. Show the results first

Before you ask the person for anything, show them what the audit found, from `get_audit`'s `results`:

- The headline (`headline`): how often ChatGPT recommended them. Then each engine's count (`engines`): the answers that recommended them out of the answers judged.
- What those numbers are, as `basis` says: one free audit that asked each buyer question once on each engine. They are counts of single answers, so give them as counts ("14 of 17"), never as rates or percentages.
- Who ChatGPT recommended instead (`pickedInstead`), most first.
- The first fix (`firstFix`: what, why and where), and the fact an engine got wrong (`wrongFact`) when there is one.
- The best recommendations (`recommendations`), and the full report (`reportUrl`).
- `stillComing`: answers still landing. They count once they land.

Use supereo's numbers and words as they come, and add nothing they don't hold: no estimates, no rankings, no promises about what a fix will do.

## 5. Then the next step

Call `get_next_step` with `site`. Tell the person its `say`, and do what its `do` says: it names the tool to call or when to give them its `link`, and some steps have nothing to open yet.

- `pick_plan`: while the plans are on sale, `plans` lists each plan with its monthly price and whether this site can take it, and `trial` says whether the checkout starts with a free trial. The person picks the plan and enters their card on Stripe's page themselves: give them the link, and never open the checkout or enter payment details for them.
- `done`: supereo is set up for the site.

Once they've done a step, call `get_next_step` again for the one after it.

## Where to go from here

- Every answer, the pages the engines cite and every fix: the ai-visibility-results skill.
- The buyer questions supereo tracks, and how often buyers search for them: the track-questions skill.
- Making one of supereo's recommended changes yourself: the ship-recommendation skill.
- Whether AI crawlers can read a page at all: the aeo-audit skill.
