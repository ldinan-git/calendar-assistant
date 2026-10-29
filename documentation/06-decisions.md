# Decisions

Short records. Format: what we chose, what we rejected, why. Newest at the bottom.

## D1. Teammates are free/busy only
- **Chose:** other people's calendars have no titles, just busy blocks.
- **Rejected:** full event detail for everyone.
- **Why:** matches what real APIs give you (Google `freeBusy`, Graph `getSchedule`), and it keeps teammates' private information away from the LLM.

## D2. No knowledge base / RAG
- **Chose:** put all calendar data and all taught facts directly in each prompt.
- **Rejected:** vector store over events and notes.
- **Why:** a week of events is a few KB. RAG would add moving parts for no benefit. Revisit if notes grow into months of history.

## D3. Taught facts, not coded rules for priority
- **Chose:** the user teaches "Jake is a partner" in English; an LLM extracts JSON; the LLM reads it back later to rate events.
- **Rejected:** hardcoded scoring (partner +50, external +30...), which was the AI's own first proposal.
- **Why:** the user's goal was an AI-enabled assistant, not a configurable rules engine. Facts no one anticipated ("protect Thursdays") should still work.
- **Cost:** results depend on the model actually using the facts. Needs evals when live.

## D4. Split `priority` from `flexibility`
- **Chose:** two independent fields on person facts and on every event rating.
- **Rejected:** a single "importance" number.
- **Why:** "who do I bump" and "what matters" are different questions. Enables the Josh-for-Jake scenario.

## D5. Code owns time math, LLM owns judgment
- **Chose:** `scheduler.js` generates and verifies candidate slots; the LLM only chooses among them.
- **Rejected:** giving the LLM raw calendars and asking for a time.
- **Why:** LLMs are unreliable at time arithmetic, and unit tests can only cover code. Also gives a free guardrail (`matchRankedOptions` drops anything code didn't verify).

## D6. Buffer rules = LLM classifies, code does geometry
- **Chose:** the LLM tags events with a `type`; `computeZones` expands rule windows from that.
- **Rejected:** keyword-matching titles in code ("flight", "UA ###"), or asking the LLM to decide whether a slot is inside a buffer.
- **Why:** classification of messy titles is an LLM strength, interval overlap is not.

## D7. Everything through `callLLM(task, input)`
- **Chose:** a single choke point, with mock/live switch and a trace.
- **Why:** makes the mock layer honest (the app can't tell), gives the Summary tab its live trace for free, and gives one place to add validation, caching, retries, or recording later.

## D8. Hardcoded responses live in `/responses` and are routed by `manifest.json`
- **Chose:** JSON files + a declarative manifest with regex rules and required fact tags.
- **Rejected:** a big `if` ladder in code; inline strings in components.
- **Why:** the user asked for a `/responses` folder; the manifest keeps the "fake NLU" in data, readable in one place, and easy to extend without touching code.

## D9. Rank fixtures reference slots by `{day, start}`, not candidate id
- **Chose:** `matchRankedOptions` accepts either form.
- **Why:** candidate ids (`c1`...) depend on state, fixtures can't know them.

## D10. Fixtures are keyed by which facts are present
- **Chose:** `requireTags` on rank/advice rules, so reasoning never cites a fact the user didn't teach.
- **Cost:** fixture count grows with fact combinations (see `04-mock-layer.md`). Acceptable at demo scale.

## D11. Sending is simulated
- **Chose:** add to local state and show a "Sent" log with the email account used.
- **Rejected for now:** `.ics` export, real Google Calendar `events.insert`.
- **Why:** no integrations needed for the class demo. Real send is the riskiest feature (an AI emailing people), so the approve step stays regardless.

## D12. Summary tab is part of the app, not just a markdown file
- **Chose:** `#/summary` renders `summary/walkthrough.md`, the live trace, and every file in `/documentation`.
- **Why:** the user wants to show the process. A live trace of mock calls alongside the walkthrough makes "what's going on" inspectable, not just described.

## D13. Hash routing, no router library
- **Chose:** `window.location.hash` with a 10-line hook.
- **Why:** two views, zero dependencies, works from any static host.

## D14. Browser-only; live mode calls the API directly
- **Chose:** `anthropic-dangerous-direct-browser-access` header, key in `.env.local`.
- **Why:** class demo on a laptop. **Never deploy this way**, the key is visible to anyone who loads the page. A server route is the first step toward real.
