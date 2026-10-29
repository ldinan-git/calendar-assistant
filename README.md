# Tessera

An AI calendar agent you set up in plain English and drive from one chat box. It doesn't just answer: it finds your conflicts, proposes fixes you can apply, briefs your week, and books meetings. Class project, built with Claude.

Connect your calendars, add your teammates and their calendars, tell it how each person works ("Brad is a client, never reschedule", "Priya is in Bengaluru and only works 8 AM to 12 PM ET"), then say "schedule a meeting with Jake, Alyssa, and Brad". It checks everyone's calendar and time zone, applies what it knows, flags problems, books the meeting on the right calendar with a video link, and syncs it to all your calendars.

A real model is connected: **Ollama** (local, no key) by default, the Claude API optionally, or no model at all (Mock).

## Run

```bash
ollama pull llama3.2     # once, if you don't have a model
npm install
npm run dev
```

Four standalone pages, no tabs:

| Page | What it is |
|---|---|
| http://localhost:5173/ | **The finished product.** Calendars connected, team added, context taught, synced |
| http://localhost:5173/fresh.html | **The new app.** The same code starting blank, for showing setup |
| http://localhost:5173/demo.html | **The demo script**, five parts, with a Copy button on every prompt |
| http://localhost:5173/summary.html | The walkthrough and every doc, rendered |

The demo script takes you from the new app to the finished product. It's also in `documentation/10-demo-script.md`.

## The five parts of the pitch

1. **Import my calendars.** Work, personal and a club calendar merge into one view, with a checkbox per calendar and a Sync that makes personal events visible to colleagues as private Busy blocks
2. **Add my own context.** "When you see a flight, hold an hour before and an hour after it." Soft holds appear next to every flight, and anything inside one is flagged
3. **Add team members and their calendars.** People and calendars are separate steps. A Teammates tab shows one person's week or compares several side by side with the shared free time
4. **Add context to the knowledge base.** One list the assistant reads. Teams are messy: Priya's calendar says 9 to 6 in India, but they work 8 AM to 12 PM Eastern. One sentence fixes what the calendar gets wrong
5. **Let it work for you.** Ask it to brief your week and fix your conflicts (it keeps the more important event, finds a new time that works for everyone, drafts the note, and applies it when you click). Then schedule meetings One sentence, with options, callouts and local times, then booking on the right calendar with a Zoom or Teams link, mirrored to all calendars

The knowledge base lives inside the assistant (open **Knowledge base** at the top of the chat), not on the home screen.

## Models

The product shows no model controls: it quietly uses a local Ollama model if one is running, and otherwise falls back to its built-in rules. For developers, add `?dev=1` to any page's address to get a model picker (**Ollama (local)**, **Claude API**, **Mock**), the **LLM trace**, and links between the pages.

- Everything a model returns is checked by code (`src/api/validate.js`): shape, names, numbers and times. A bad answer is retried once, repaired, or replaced by the mock for that one call, and the LLM trace (with `?dev=1`) says which.
- On a CPU a 3B model is slow (seconds per answer, up to a minute for teaching five sentences) and its wording is sometimes clumsy. That's the model, not the app. A bigger Ollama model or the Claude API is better. Set `VITE_LLM_ANALYZE=1` to let a strong model rate every event too.
- Code, not the model, owns facts: availability, working hours, time zones, buffer minutes, who is never rescheduled, names and calendars read from your sentence.

Copy `.env.example` to `.env.local` for the Claude API key or to change the default.

## Layout

```
index.html, fresh.html, demo.html, summary.html     the four pages
src/
  entries/             one tiny entry per page
  App.jsx              header, model picker, LLM trace
  Workspace.jsx        the app itself; mode "fresh" or "final" is only the starting state
  api/llm.js           callLLM(task, input): Ollama / Anthropic / mock, queue, retry, fallback, trace
  api/validate.js      checks and repairs model output
  api/prompts.js       the seven system prompts (written for a small model)
  api/mockBrain.js     rule-based stand-ins, also the fallback; reads names and calendars from text
  api/fixtures.js      canned teaching responses (mock mode, and to pre-fill the finished app)
  lib/scheduler.js     pure scheduling logic (no React, no LLM)
  lib/context.js       knowledge base + effective directory (calendar settings overridden by what you taught)
  lib/graph.js, tz.js  Outlook responses and time zones
  lib/booking.js       which calendar, which video provider, join link
  data/graph/*.json    sample Outlook calendars: you (3), Jake, Alyssa, Brad, Sarah, Priya, directory
  data/demoScript.js   the demo script (one source for the page and the markdown)
  components/, views/
responses/             canned teaching responses + manifest.json
documentation/         design notes, decisions, team diagram, demo script, AI collaboration log
scripts/               gen-graph-data.mjs, gen-demo-doc.mjs, check-mock-flow.mjs
```

## Checks

```bash
npm run check:flow   # 109 assertions: data, time zones, knowledge base, validators, scheduling, booking
npm run build
npm run gen:data     # regenerate the sample Outlook data
npm run gen:demo     # regenerate documentation/10-demo-script.md from the script data
```

## Docs

Start at `documentation/00-index.md`. The team diagram is `documentation/09-team-structure.md`.
