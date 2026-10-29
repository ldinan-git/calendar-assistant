# Architecture

## One-line version

Deterministic scheduling code + an LLM reasoning layer + a store of facts the user taught it in plain English, all driven from one chat box.

## Layers

```
┌──────────────────────────────────────────────────────────────────┐
│ UI (React)                                                        │
│  CalendarView  ChatPanel  MemoryPanel (people cards)              │
│  CalendarsPanel (sync + import)  SidePanels  SummaryView          │
└──────────────┬───────────────────────────────────────────────────┘
               │ App.jsx owns all state and the chat router
┌──────────────▼──────────────┐      ┌───────────────────────────┐
│ scheduler.js  (pure code)    │      │ llm.js: callLLM(task,in)   │
│  teamBusy, busyList          │      │  extract: responses/ +     │
│  computeZones (soft holds)   │      │           manifest.json    │
│  computeFlags, genCandidates │      │  others:  mockBrain.js     │
│  findReplacement, callouts   │      │  live:    Anthropic API +  │
│  matchRankedOptions          │      │           prompts.js       │
│ context.js  booking.js       │      │  trace of every LLM call   │
└──────────────┬──────────────┘      └───────────────────────────┘
               │
┌──────────────▼──────────────┐
│ graph.js + tz.js             │   Outlook responses -> {day, start, end} in the user's zone
│ data/graph/*.json            │   you (work, personal, club), Jake, Alyssa, Brad, Sarah, Priya, directory
│ localStorage                 │   taught facts + event notes
└─────────────────────────────┘
```

## Who owns what

| Concern | Owner | Why |
|---|---|---|
| Is Jake free Tuesday 11:30? Is that inside Priya's working hours? | code | Time math and time zones. LLMs get this wrong, code is testable |
| Does this slot overlap a flight's soft hold? | code | Geometry |
| Where can the bumped meeting go? | code | Needs a correct search over everyone's availability |
| Which calendar does this go on, and Zoom or Teams? | code | Rules with a right answer; the bot states the reason |
| Which of my events are invisible to colleagues? | code | Set difference over mirrors |
| Is this message teaching, scheduling, or a booking? | LLM (`route`) | Messy natural language |
| Is "Trip to Denver" a flight? | LLM (`analyze`) | Messy text classification. Outlook's `Flights` category settles the easy cases |
| Is this meeting important? | LLM, using taught facts | Judgment, and the user's rules are in natural language |
| Which of these 14 valid slots is best? | LLM, using taught facts | Judgment + trade-offs |
| What do I say to Alyssa about the move? | LLM | Language |
| What did the user mean by "Brad is a client, never reschedule"? | LLM | Structured extraction |

The test for any new feature: *if the answer can be wrong in a way a unit test could catch, it belongs in code.*

## Data flow for "Schedule a meeting with Jake, Alyssa, and Brad"

1. `route` (LLM): `schedule`. `parse` (LLM): `{title, duration_min: 45, attendees, days}`
2. `contextNotes` (code): per attendee, the taught facts plus directory profile (title, office, zone, how much of the user's day overlaps theirs)
3. `genCandidates` (code): every 30 minute start where everyone is free and inside their own working hours; also single-clash slots where the clash is a flexible work meeting (bump candidates, with `findReplacement` for where it moves); gap check in Jake's own calendar because of his buffer rule; `callouts` per slot (soft hold, back-to-back, someone travelling that day, local times)
4. code picks a spread of ~14 candidates by a simple score
5. `rank` (LLM): facts + context notes + candidates in; a reminder and the top 3 with reasoning and draft messages out. Options refer to slots by `candidate_id`
6. `matchRankedOptions` (code): maps LLM output back to real candidates, silently dropping anything that doesn't match
7. user says "book option 2" (`route` finds `book`) or clicks **Book this**
8. `book` (code): `pickCalendar`, `pickProvider`, `joinLink`; the event is added, bumps applied, Busy mirrors written to the other calendars, an Activity entry logged, and a Booked card shows each decision with its reason (simulated, nothing leaves the app)

Step 6 is a small guardrail: the LLM can only choose among slots that code already verified, so the worst it can do is choose badly, not invent an impossible time.

## State

All in `App.jsx`:
- `events` (the user's merged calendar, mutated by booking / accept / decline)
- `facts` and `notes` (persisted in localStorage under `margin-state-v2`)
- `analysis` (latest `analyze` result: per-event priority, flexibility, type, reason)
- `connected` (which teammate calendars the assistant may read), `synced` (event ids already mirrored)
- `messages` (the chat), `current` (the options currently on offer), `log` (activity), invite state

Derived with `useMemo`: `otherBusy`, `zones`, `flags`, `headsUp`, `unsynced`, `overlayBlocks`.

## The `analyze` call is the hinge

Everything downstream reads `analysis`:
- priority colors in the calendar
- `type: "flight"` triggers the airport soft hold
- `flexibility: "high"` makes an event bumpable in `genCandidates`; `none` (flights, anything with a `never_reschedule` person) never is
- the `rank` prompt includes `why_flexible` from it

It re-fires whenever events, notes, or facts change (300 ms debounce, stale results discarded via `runId`). In live mode that is the most expensive call, see `07-ideas-backlog.md` for caching ideas.

## Calendars and sync

- Your three calendars (`cal-work`, `cal-personal`, `cal-org`) are separate Graph responses. `loadWorld` merges them into one event list and drops the "Synced" Busy mirrors, remembering which calendars each source event is already mirrored to.
- A source event is **unsynced** if some other calendar has neither the event nor a mirror of it. Colleagues generally see only the work calendar, so personal and club events are the gaps.
- Teammates' calendars are full responses. `iCalUId` identifies the same meeting across calendars, so a meeting already on your calendar is not double counted as the teammate's own busy time (this is what keeps "bump Alyssa's 1:1" possible).
- Connecting or disconnecting a teammate changes `teamBusy`: a disconnected person's own events are ignored, and the bot says it assumed they were free.

## What isn't here (on purpose)

- No backend. Everything runs in the browser.
- No real calendar integration. The JSON in `src/data/graph` imitates Graph `calendarView` responses. Nothing is written back.
- No vector store or RAG. A week of calendar data fits in a prompt.
- No auth, no multi-user.
- One fixed week (Nov 2 to 6 2026). No DST transition inside the week.
- No recurring-event model. Standups are five separate events, marked `type: occurrence`.

## If this became real

1. Replace the sample JSON with calls to `GET /me/calendars/{id}/calendarView` (and `getSchedule` for teammates who don't share detail). `graph.js` is the only file that knows the response shape.
2. Add sync (delta queries / webhooks) so `events` stays correct, and write mirrors and new events back with `POST /me/calendars/{id}/events` (Teams links come from `isOnlineMeeting`; Zoom needs its own API).
3. Move `callLLM` behind a server route so the API key isn't in the browser.
4. Add schema validation on every LLM response (see decisions).
5. Persist facts server-side per user, and ask teammates to opt in to having their calendar read.
