---
name: track-questions
description: Manage the buyer questions supereo tracks for a brand on ChatGPT, Gemini, Google AI Mode, AI Overviews, Perplexity and Claude. Lists the tracked questions with their demand (the Google searches closest to each, about how many a month, the trend and a band), estimates demand for new ones, adds, rewrites or removes questions, and asks one again now. Use when someone wants to track a new buyer question, asks which questions supereo tracks or how often buyers search for them, or wants to change their tracked panel.
license: MIT
---

# Track buyer questions

**Tools:** `list_workspaces`, `list_questions`, `list_answers`, `estimate_demand`, `add_question`, `add_questions`, `replace_question`, `remove_question`, `rerun_question` and `get_next_step`, from supereo's MCP server. `estimate_demand` and `rerun_question` are paid; the rest are free.

supereo measures how often AI recommends a brand on a panel of buyer questions. This skill reads that panel and changes it, the way the Questions page in supereo does.

## 1. Get the tools

They come from supereo's MCP server, `https://supereo.app/api/mcp`, signed in as the person. Some clients load MCP tools only when asked: search your tools for `list_questions` before you decide it isn't there. If it isn't, connect the server:

- Claude Code: `claude mcp add --scope user --transport http supereo https://supereo.app/api/mcp`, then `/mcp` to sign in. The tools load in the next session.
- Claude (claude.ai, the desktop app, and Claude Code signed in with a Claude account): add it as a connector with [this link](https://claude.ai/customize/connectors/yours?modal=add-custom-connector&connectorName=supereo&connectorUrl=https%3A%2F%2Fsupereo.app%2Fapi%2Fmcp&open_in_browser=1), then connect and sign in.
- Any other agent: https://supereo.app/install has the steps for each one.

When the person has several sites (`list_workspaces`), pass the site as `site` to every tool below.

## 2. How the panel works

- A site supereo tracks has a panel of up to 40 buyer questions, each asked on all six engines three times a week. Its rates come from the panel's last 4 weeks of answers.
- Tracking starts by itself once the brand has a supereo plan. A site with only its free audit has the audit's questions, which `list_questions` lists without ids, and no panel to change: `get_next_step` gives the person the link to start a plan.
- Every change makes a new panel version. Only the questions it touches start again; every other question's counts carry on.
- A question that doesn't name the brand counts toward how often AI recommends it. One that names the brand reports apart, with the branded questions.

## 3. Read the panel

`list_questions`: each question with its id, its position, whether it names the brand, its last 4 weeks of answers, and its demand: the Google searches closest to it, about how many searches they get a month together, their 12-month trend, and a band (very low under 50 a month, low 50 to 500, medium 500 to 5,000, high over 5,000). `list_answers` with a `question_id` gives that question's answers in full.

## 4. Choose new questions

- Write each one the way a buyer asks an AI: a whole question from the buyer's side ("Which email API should a small SaaS team use for password resets?"), never a keyword.
- Leave the brand's name out of a question meant to measure how often AI recommends it.
- Before you add them, read their demand with `estimate_demand`, up to 20 candidates at once: each one's closest searches, their monthly total, the trend and the band. It's paid: it runs with a plan and counts against the account's daily allowance, so say so and get the person's yes first.
- Say what demand is: a directional read of Google searches, never a count of questions asked of AI. Put it as "about 1,300 Google searches a month for the closest searches", name those searches, and say when they were read.

## 5. Change the panel, with a yes first

Show the person exactly what will change and get their yes before each change. Then:

- `add_question`: one question. supereo asks it on all six engines now, then three times a week like the rest.
- `add_questions`: several at once, as one version. Nothing is added when one of them can't be (a repeat, one already on the panel, or past 40): the answer names which.
- `replace_question` with its `question_id`: rewrites one. The old question retires, its answers still readable by its id, and the new text starts a new series in its place.
- `remove_question` with its `question_id`: supereo stops asking it, and rates stop counting it. A test that holds it keeps asking it until the test ends.

Each one answers with the demand of the questions it adds: pass that on to the person.

## 6. Ask one again now

It's paid, so say which question and which engines it would ask, and get the person's yes first. Then `rerun_question` with its `question_id`, and `engines` to name some, or all six: the new answers show on the question as reruns, and never count in a rate. An engine that asked it in the last 30 minutes is skipped, and the answer says when it can run again. It takes a minute or two, and counts against the account's daily allowance.

## Where to go from here

- What the answers say and who the engines recommend: the ai-visibility-results skill.
- Make one of supereo's recommended changes yourself: the ship-recommendation skill.
