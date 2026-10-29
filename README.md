# margin

An AI calendar assistant you teach in plain English and drive from a chat box. Class project, built with Claude.

Tell it "Jake is a partner, keep buffers around meetings with him" and "Brad is a client, never reschedule", then say "schedule a meeting with Jake, Alyssa, and Brad". It checks everyone's calendar and time zone, applies what it knows, flags problems, books the meeting on the right calendar with a video link, and syncs it to all three of your calendars.

**No real LLM calls by default.** Teaching is answered by canned files in `/responses`, everything else by small deterministic stand-ins in `src/api/mockBrain.js`. Flip to live mode when you have an API key.

## Run

```bash
npm install
npm run dev            # open http://localhost:5173
```

Tabs: **Calendar** (`/#/`) and **Summary** (`/#/summary`: walkthrough, live trace of every LLM call, rendered docs).

## Try this

1. In the chat, open **Teach it about your team** and click **Teach it all six**. Watch the **What I know** cards fill in and the calendar re-rate.
2. Click "Schedule a meeting with Jake, Alyssa, and Brad". Read the context it applies, hover the options to preview them, then click **Book this**.
3. In **Calendars**, click **Sync now** to see personal and club events mirrored as private Busy blocks.
4. Click "I need 30 minutes with Priya. What times work?" and notice the 9 to 11 AM window and her local time.
5. **Simulate an incoming invite** (Brad lands inside your airport soft hold).

## The four features

| Feature | Where |
|---|---|
| Calendar import and sync | Three of your own calendars merged into one view; five teammate calendars (Outlook / Graph format) you can connect or disconnect; "N events invisible to colleagues" with a Sync now button |
| Individual rules | Taught `buffer_rule` facts: a 60 minute soft hold before flights, 15 minute buffers around Jake |
| Knowledge base | Profile cards per person (role, time zone, working hours, what you taught) plus your own rules |
| Promptable actions | One chat box: teach, ask for times, book, recall ("what do you know about Jake?"), sync |

The team (diagram in `documentation/09-team-structure.md`): Jake (partner, New York), Sarah (direct manager), Alyssa (peer), Priya (data scientist, Bengaluru), Brad (client, Seattle).

## Layout

```
src/
  api/llm.js           callLLM(task, input): mock or live, plus the trace
  api/mockBrain.js     deterministic stand-ins for analyze / parse / route / rank / advice
  api/prompts.js       the six system prompts
  lib/scheduler.js     pure scheduling logic (no React, no LLM)
  lib/graph.js         Outlook / Graph responses -> internal events
  lib/tz.js            time zones and working hours (Intl only)
  lib/context.js       "what do I know about these people?" in plain text
  lib/booking.js       which calendar, which video provider, join link
  data/graph/*.json    sample Outlook calendars: you (3), Jake, Alyssa, Brad, Sarah, Priya, directory
  data/mock.js         wires the sample data together
  components/          calendar grid, chat, people cards, calendars panel, side panels
  views/SummaryView.jsx
responses/             canned teaching responses + manifest.json
documentation/         design notes, decisions, team diagram, AI collaboration log
summary/walkthrough.md the walkthrough shown on the Summary tab
scripts/               gen-graph-data.mjs, check-mock-flow.mjs
```

## Checks

```bash
npm run check:flow   # 51 assertions through the whole mock pipeline
npm run build
npm run gen:data     # regenerate the sample Outlook data
```

## Live mode

```bash
cp .env.example .env.local
# set VITE_LLM_MODE=live and VITE_ANTHROPIC_API_KEY=...
```

The key is exposed to the browser. Local demos only. Live mode has not been run yet. See `documentation/08-ai-collaboration-notes.md`.

## Docs

Start at `documentation/00-index.md`.
