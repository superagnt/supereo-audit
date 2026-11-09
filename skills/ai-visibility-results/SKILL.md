---
name: ai-visibility-results
description: Read supereo's results for a brand and explain them plainly. How often each AI engine (ChatGPT, Gemini, Google AI Mode, AI Overviews, Perplexity and Claude) recommends it, with sample sizes and ranges; who the engines pick instead; every answer and the pages it cites; the fixes worth making first; and the verdicts of supereo's tests on the changes that shipped. Use when someone asks how their brand is doing in AI answers, who ChatGPT recommends instead of them, which pages AI cites, what to fix first, or whether a change worked.
license: MIT
---

# Read supereo's results

**Tools:** `list_workspaces`, `get_visibility`, `list_questions`, `list_answers`, `get_cited_pages`, `get_fix_candidates`, `get_brand_brief`, `list_changes`, `get_experiment`, `get_track_record`, `get_plan`, `list_recommendations`, `get_scenario_map`, `get_pages_to_beat`, `backlink_gap`, `list_you_do_items` and `get_page_reads`, from supereo's MCP server. Each one only reads, and all of them are free.

Answer from what supereo holds for the brand, in supereo's own numbers.

## 1. Get the tools

They come from supereo's MCP server, `https://supereo.app/api/mcp`, signed in as the person. Some clients load MCP tools only when asked: search your tools for `get_visibility` before you decide it isn't there. If it isn't, connect the server:

- Claude Code: `claude mcp add --scope user --transport http supereo https://supereo.app/api/mcp`, then `/mcp` to sign in. The tools load in the next session.
- Claude (claude.ai, the desktop app, and Claude Code signed in with a Claude account): add it as a connector with [this link](https://claude.ai/customize/connectors/yours?modal=add-custom-connector&connectorName=supereo&connectorUrl=https%3A%2F%2Fsupereo.app%2Fapi%2Fmcp&open_in_browser=1), then connect and sign in.
- Any other agent: https://supereo.app/install has the steps for each one.

Sign-in happens in the person's browser. There is no API key, so never ask for one.

## 2. Pick the site

`list_workspaces` lists the person's workspaces, one per site. When they have more than one, pass the site as `site` to every tool below. A site with no audit has no results yet: run the ai-visibility-audit skill first.

## 3. Know which kind of number you have

Each tool says which, and so must you:

- **A site supereo tracks** (on a supereo plan): its panel of buyer questions is asked on all six engines three times a week. Each engine's number is a rate out of 100 over the last 4 weeks, with its 95% range and a badge. Give the range with the rate, every time.
- **Any other site**: its free audit asked each question once on each engine. Those are counts of single answers ("recommended in 14 of 17 answers"), not rates: never turn them into percentages, and never compare them with a tracked rate as if they were one.
- **Demand** on a question is a directional read of the Google searches closest to it, never a count of questions people ask AI.
- **A test's early signal** is never a verdict. Only a written verdict says whether a change worked.

## 4. Read what the person asked about

- **The headline**: `get_visibility`: each engine's number, with its sample size or range, and who it recommends instead. Visitors confirmed from AI come with it once the site is connected at Cloudflare or Vercel in supereo; before that it says not connected, which is no zero.
- **The questions**: `list_questions`: the buyer questions, numbered, with the engines that recommended the brand on each; on a tracked site also each question's id and its demand.
- **The answers**: `list_answers`: each answer in full, with the pages it cites and supereo's judgment (mentions the brand, recommends it, cites its site). Narrow it: `list_answers` with `question_id` or `question`, `engine`, or `since` and `until` for dates. Ten come at a time, up to 40, and `total` says how many match.
- **The pages to beat**: `get_cited_pages`: the pages each engine cites, the brand's own against its competitors' and everyone else's. Narrow it: `get_cited_pages` with `question` or `engine`. A `question` is an audit's question number, which `list_questions` with `audit_id` gives.
- **What to fix**: `get_fix_candidates`: every recommendation of the saved audit, best first, with the exact change, where it goes and the evidence behind it. A strong one rests on hard evidence in the audit itself.
- **The brand's facts**: `get_brand_brief`: what supereo knows about the brand, every fact with the page that states it and the date it was checked.
- **Changes and tests**: `list_changes` (every change on record, and the recommendations no change answers yet), `get_experiment` (one test: its early signal while it runs, its verdict with its range once written) and `get_track_record` (verdicts by fix type, and whether past wins are holding).
- **What supereo is doing**: `get_plan` (supereo's plan for the brand and the steps it asked the team to take) and `list_recommendations` (the changes it plans, each with its page, its wording and its status).
- **The first-run analysis**, on a plan: `get_scenario_map` (the buyers' scenarios, their demand and priority, and who leads each), `get_pages_to_beat`, `backlink_gap` (the "best X" and "X alternatives" pages worth a pitch) and `list_you_do_items` (the steps only the team can take).
- **AI reads of the site**, once Cloudflare or Vercel is connected in supereo: `get_page_reads` (which AI companies read each page, confirmed apart from unconfirmed and spoofed).

## 5. Report

Lead with the headline numbers and what kind they are. Then who the engines pick instead, and the pages they cite for them. Then the first fixes, each with its evidence. Quote supereo's numbers as they come, with their sample sizes and ranges, and link the report or the change's page when an answer gives one.

Don't round up, don't estimate what supereo didn't measure, and don't promise what a change will do: supereo measures that with a test, against control questions.

## Where to go from here

- Change which buyer questions are tracked: the track-questions skill.
- Make one of supereo's recommended changes yourself: the ship-recommendation skill.
