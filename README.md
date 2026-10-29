# margin

An AI calendar assistant you teach in plain English. Class project, built with Claude.

Say "Jake is a partner" or "when you see a flight, add an hour buffer" and it remembers, rates your week with those facts, warns you about buffer violations, and suggests meeting times (including which flexible meeting to bump).

**No real LLM calls by default.** Every response comes from a hardcoded file in `/responses`. Flip to live mode when you have an API key.

## Run

```bash
npm install
npm run dev            # open http://localhost:5173
```

Tabs: **Calendar** (`/#/`) and **Summary** (`/#/summary`: walkthrough, live trace of every LLM call, rendered docs).

## Try this

1. Calendar tab: in "What I know", click the first three example sentences.
2. In "Ask for a meeting", click "Set up 45 minutes with Jake this week". Hover the options. The third one bumps Josh.
3. Choose it, send it, then click "Simulate an incoming invite".
4. Open the Summary tab and look at the trace.

## Layout

```
src/
  api/llm.js           callLLM(task, input): mock or live, plus the trace
  api/prompts.js       the five system prompts
  lib/scheduler.js     pure scheduling logic (no React, no LLM)
  lib/time.js          day/time helpers
  data/mock.js         hardcoded calendars, free/busy, demo invites
  components/          calendar grid, memory panel, assistant panel, side panels
  views/SummaryView.jsx
responses/             hardcoded LLM outputs + manifest.json routing
documentation/         design notes, decisions, ideas, AI collaboration log
summary/walkthrough.md the walkthrough shown on the Summary tab
scripts/               fixture generator, check scripts
```

## Checks

```bash
npm run check        # candidate slots for each demo scenario
npm run check:flow   # 25 assertions through the whole mock pipeline
npm run build
```

## Live mode

```bash
cp .env.example .env.local
# set VITE_LLM_MODE=live and VITE_ANTHROPIC_API_KEY=...
```

The key is exposed to the browser. Local demos only. Live mode has not been run yet. See `documentation/08-ai-collaboration-notes.md`.

## Docs

Start at `documentation/00-index.md`.
