# Architecture

## One-line version

Deterministic scheduling code + an LLM reasoning layer + a store of facts the user taught it in plain English.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│ UI (React)                                                   │
│  CalendarView  MemoryPanel  AssistantPanel  SidePanels       │
│  SummaryView (walkthrough + live trace + rendered docs)      │
└──────────────┬──────────────────────────────────────────────┘
               │ App.jsx owns all state
┌──────────────▼──────────────┐      ┌─────────────────────────┐
│ scheduler.js  (pure code)    │      │ llm.js: callLLM(task,in) │
│  busyList, computeZones      │      │  mock: responses/ +      │
│  computeFlags, genCandidates │      │        manifest.json     │
│  findReplacement, lanes      │      │  live: Anthropic API +   │
│  matchRankedOptions          │      │        prompts.js        │
└──────────────┬──────────────┘      │  trace of every call     │
               │                      └─────────────────────────┘
┌──────────────▼──────────────┐
│ data/mock.js                 │   hardcoded calendars, free/busy, demo invites
│ localStorage                 │   taught facts + event notes
└─────────────────────────────┘
```

## Who owns what

| Concern | Owner | Why |
|---|---|---|
| Is Jake free Tuesday 11:30? | code | Time math. LLMs get this wrong, code is testable |
| Does this slot overlap a flight buffer? | code | Geometry |
| Where can the bumped meeting go? | code | Needs a correct search over everyone's availability |
| Is "UA 482 to SFO" a flight? | LLM | Messy text classification |
| Is this meeting important? | LLM, using taught facts | Judgment, and the user's rules are in natural language |
| Which of these 14 valid slots is best? | LLM, using taught facts | Judgment + trade-offs |
| What do I say to Josh about the move? | LLM | Language |
| What did the user mean by "Josh is flexible"? | LLM | Structured extraction |

The test for any new feature: *if the answer can be wrong in a way a unit test could catch, it belongs in code.*

## Data flow for "Set up 45 minutes with Jake this week"

1. `parse` (LLM): text to `{title, duration_min, attendees, days}`
2. `genCandidates` (code): all valid slots, including bump candidates, plus gaps and flags
3. code picks a spread of ~14 candidates by a simple score
4. `rank` (LLM): taught facts + candidates in, top 3 with reasoning and draft messages out. Options refer to slots by `candidate_id` (live) or `{day, start}` (fixtures)
5. `matchRankedOptions` (code): maps LLM output back to real candidates, silently dropping anything that doesn't match
6. user picks one, edits drafts, picks an email, sends (simulated)

Step 5 is a small guardrail: the LLM can only choose among slots that code already verified, so the worst it can do is choose badly, not invent an impossible time.

## State

All in `App.jsx`:
- `events` (the user's calendar, mutated by send / accept / decline)
- `facts` and `notes` (persisted in localStorage under `margin-state-v1`)
- `analysis` (latest `analyze` result: per-event priority, flexibility, type, reason)
- request/options/draft/sent/invite state for the assistant panels

Derived with `useMemo`: `zones`, `flags`, `headsUp`.

## The `analyze` call is the hinge

Everything downstream reads `analysis`:
- priority colors in the calendar
- `type: "flight"` triggers buffer zones
- `flexibility: "high"` makes an event bumpable in `genCandidates`
- the `rank` prompt includes `why_flexible` from it

It re-fires whenever events, notes, or facts change (300 ms debounce, stale results discarded via `runId`). In live mode that is the most expensive call, see `07-ideas-backlog.md` for caching ideas.

## What isn't here (on purpose)

- No backend. Everything runs in the browser.
- No real calendar integration. `OTHER_BUSY` mimics the shape of freeBusy / getSchedule responses.
- No vector store or RAG. A week of calendar data fits in a prompt.
- No auth, no multi-user.
- No time zones. Everything is one implicit local zone.
- No recurring-event model. Standups are five separate events.

## If this became real

1. Replace `data/mock.js` with an adapter that returns the same two shapes (events, otherBusy) from Google/Graph.
2. Add sync (webhooks / sync tokens) so `events` stays correct.
3. Move `callLLM` behind a server route so the API key isn't in the browser.
4. Add schema validation on every LLM response (see decisions).
5. Persist facts server-side per user.
