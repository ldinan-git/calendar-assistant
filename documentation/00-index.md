# Documentation index

Project: **margin**, an AI calendar assistant you teach in plain English. Class project, built with Claude. Started 2026-10-29.

This folder is a working dump, not a polished write-up. The point is to show the process of working with AI: what was asked, what came back, what was kept, what was thrown out, and what is still unverified.

| File | What's in it |
|---|---|
| `01-conversation-log.md` | The chat that produced the idea, turn by turn, with the user's messages verbatim |
| `02-architecture.md` | Layers, module map, data flow, which parts are code vs LLM |
| `03-fact-schema.md` | The JSON schema for taught facts, examples, open questions |
| `04-mock-layer.md` | How `/responses` and `manifest.json` stand in for the LLM, and where that breaks |
| `05-prompts.md` | The five prompts, why they look the way they do |
| `06-decisions.md` | Short decision records (what we chose, what we rejected, why) |
| `07-ideas-backlog.md` | Ideas the AI had that aren't built yet |
| `08-ai-collaboration-notes.md` | Where the AI helped, where it was wrong or unverified, how to use it better next time |

Other places:
- `/summary/walkthrough.md`: the walkthrough shown on the app's Summary tab
- `/responses`: the hardcoded LLM outputs
- `/scripts`: fixture generator and the two check scripts

## How to run

```bash
npm install
npm run dev          # http://localhost:5173, Summary tab at /#/summary
npm run check        # prints candidate slots for each demo scenario
npm run check:flow   # 25 assertions through the full mock pipeline
```

Live mode (optional, calls the real API from the browser, local demos only):
```bash
cp .env.example .env.local   # set VITE_LLM_MODE=live and VITE_ANTHROPIC_API_KEY
```
Live mode has not been run yet.

## Status at time of writing

- Works (verified by build + `check:flow` + server-rendering every component): mock pipeline, scheduler logic, all UI components render with realistic props.
- Not verified: actually clicking through the UI in a browser. The AI cannot do that from its sandbox. First thing to do after `npm run dev` is to click through the demo script in `summary/walkthrough.md`.
- Not built: live mode has never been exercised; no schema validation of LLM output; no tests for the UI.
