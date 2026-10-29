# What is going on in this app

**margin** is a calendar assistant you can *teach*. You tell it things in plain English ("Jake is a partner"), it stores them as JSON facts, and every time it rates your week or suggests a meeting time it reads those facts. Code handles the time math. The LLM handles judgment.

This page is a walkthrough. The rest of the Summary tab shows a live trace of every LLM call and renders everything in `/documentation`.

> Right now **no real LLM is being called.** Every "LLM response" is a hardcoded JSON file in `/responses`, picked by `responses/manifest.json`. The app doesn't know the difference: it calls `callLLM(task, input)` and gets JSON back. Flip `VITE_LLM_MODE=live` to hit the real API with the same prompts.

## The shape of it

```
 you type something
        |
        v
  React UI (App.jsx)  ---->  callLLM(task, input)  ---->  mock: responses/ via manifest.json
        ^                          |                      live: Anthropic API + prompts.js
        |                          v
        |                    JSON back (validated by usage)
        |                          |
        +---- scheduler.js (pure code: busy lists, buffer zones, flags, candidate slots)
```

Two rules the whole design leans on:

1. **Code owns facts and time math.** "Who's free at 2pm", "is this within an hour of a flight", "where could Josh's meeting move to". LLMs are unreliable at this, and code is testable (`npm run check`).
2. **The LLM owns judgment and language.** "Is this meeting important", "which of these slots is best and why", "write the note to Josh".

## The five LLM tasks

| Task | When it fires | Input | Output | Mock fixture |
|---|---|---|---|---|
| `extract` | you teach it something | your sentence + existing facts | structured fact(s) as JSON | `responses/extract/*.json` |
| `analyze` | on load, and whenever facts/events/notes change | taught facts + all events | per-event priority, flexibility, type, reason | `responses/analyze/*.json` (4 variants) |
| `parse` | you ask for a meeting | your sentence | title, duration, attendees, days | `responses/parse/*.json` |
| `rank` | after code generates candidate slots | request + facts + candidates | top 3 with reasoning and draft messages | `responses/rank/*.json` |
| `advice` | an invite arrives | facts + invite + issues found by code | one short recommendation | `responses/advice/*.json` |

## Walkthrough, step by step

### 0. On load
- `INITIAL_EVENTS` and `OTHER_BUSY` (`src/data/mock.js`) are the hardcoded calendars. Yours has full detail. Jake, Josh and Priya are free/busy blocks only, like the real freeBusy APIs.
- `analyze` fires with no facts. The mock returns `analyze/base.json`: sensible default ratings (standups medium, the client call high, the flight is typed `flight`).
- Code finds two issues with no AI involved: the Monday standup runs back-to-back into the proposal session, and Tuesday's Josh coffee overlaps the Jake partner review. See **Heads-up**.

### 1. Teach it "Jake is a partner"
- `extract` returns a `person` fact: priority high, flexibility low. It's saved to localStorage and shown under **What I know**. **View saved JSON** shows the raw structure.
- Facts changed, so `analyze` re-fires. The manifest sees the "jake" tag in the facts and returns `analyze/jake.json`. Jake's meetings turn dark indigo.

### 2. Teach it "Josh is a friend, anything with him can be rescheduled"
- Another `person` fact, this one priority low, flexibility high. `analyze` returns `analyze/jake_josh.json`. Josh's 1:1 and coffee turn pale green.
- This is the split that makes bumping possible: *priority* (does it matter) is different from *flexibility* (can it move).

### 3. Teach it the flight rule
- `extract` returns a `buffer_rule` fact: trigger `flight`, 60 minutes before and after, severity `warning`.
- No LLM involved in the next part. `computeZones()` finds events the LLM typed as `flight` (the Wednesday SFO flight), expands the window to 2pm to 6pm, and the hatched amber **Buffer** zone appears.

### 4. Ask for "Set up 45 minutes with Jake this week"
1. `parse` turns it into `{title, duration 45, attendees [Jake], days Mon to Fri}`.
2. `genCandidates()` (code) walks every 30-minute start time, keeps slots where you and Jake are free, and also keeps slots where the *only* clash is one of your events rated flexibility high. That is how "Monday 2pm, by moving Josh" shows up. For each bump it also finds where the moved meeting could go (`findReplacement`).
3. Code scores candidates (penalize back-to-backs, buffer hits, bumps, reward free time either side) and keeps a spread across days.
4. `rank` gets the candidates plus your taught facts and picks three with reasoning and draft messages. Mock mode finds `rank/jake45_full.json` (or a less specific variant depending on which facts you've taught).
5. Hover an option to preview the slot on the calendar.

### 5. Choose and send
- **Choose this time** opens the draft: message to Jake, message to Josh about the move, and a "send from" email picker.
- **Send invite** is simulated. The event is added to the calendar, Josh's 1:1 moves, and the **Sent** log shows what would have gone out.

### 6. Incoming invite
- **Simulate an incoming invite** adds a pending Priya invite for Wednesday 2pm. Code flags it: back-to-back with the flight, and inside the flight buffer (if you taught the rule).
- `advice` returns a short recommendation. **Find another time** feeds the invite back into the ask flow (steps 4 to 5).

## What is fake, on purpose

- **LLM responses**: hardcoded in `/responses`. They were authored to be what a good model would say for the demo scenarios.
- **Calendars**: hardcoded, no Google or Outlook.
- **Sending**: simulated.
- **New events are unrated**: in mock mode, an event you create after load has no entry in the fixtures, so it shows gray until live mode rates it.
- **Fixture coverage is thin**: anything outside the demo prompts falls back (extract saves a plain note, parse defaults to 30 minutes with nobody, rank falls back to code ordering).

## What is real

- The scheduling logic in `src/lib/scheduler.js`
- The data flow, the trace, the mock/live switch
- The prompts in `src/api/prompts.js`
- The fact schema

## Demo script

1. Calendar tab: point out the two issues in **Heads-up** (no AI taught yet).
2. Click the first three example chips under **What I know** and watch the calendar re-rate.
3. Click "Set up 45 minutes with Jake this week". Hover options. Point out the Josh bump.
4. Choose it, review drafts, send.
5. Simulate an incoming invite, read the advice, click **Find another time**.
6. Come to **Summary**: show the trace. Every step above is a row, with the file that answered it.
