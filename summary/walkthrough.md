# What is going on in this app

**margin** is a calendar assistant you *teach* and then *talk to*. You tell it things in plain English ("Jake is a partner"), it stores them as JSON facts, and every time it rates your week or suggests a meeting time it reads those facts. Code handles the time math and time zones. The LLM handles judgment and language.

This page is a walkthrough. The rest of the Summary tab shows a live trace of every LLM call and renders everything in `/documentation`.

> Right now **no real LLM is being called.** Teaching is answered by canned JSON in `/responses`; the other tasks by small rule-based functions in `src/api/mockBrain.js`. The app doesn't know the difference: it calls `callLLM(task, input)` and gets JSON back. Flip `VITE_LLM_MODE=live` to hit the real API with the same prompts.

## The shape of it

```
 you type in the chat
        |
        v
  React UI (App.jsx)  ---->  callLLM(task, input)  ---->  mock: responses/ + mockBrain.js
        ^                          |                      live: Anthropic API + prompts.js
        |                          v
        |                    JSON back
        |                          |
        +---- scheduler.js (pure code: busy lists, working hours, soft holds, flags, candidate slots)
        +---- graph.js / tz.js (Outlook responses and time zones, converted once at the edge)
```

Two rules the whole design leans on:

1. **Code owns facts and time math.** "Who's free at 2pm", "is this inside Priya's working hours", "is this within an hour of a flight", "where could Alyssa's meeting move to". LLMs are unreliable at this, and code is testable (`npm run check:flow`).
2. **The LLM owns judgment and language.** "Is this meeting important", "which of these slots is best and why", "write the note to Alyssa".

## The six LLM tasks

| Task | When it fires | Output | Mock |
|---|---|---|---|
| `route` | every chat message | `schedule`, `teach`, `recall`, `book`, `sync` or `chat` | `mockBrain.js` |
| `extract` | you teach it something | structured fact(s) | `responses/extract/*.json` |
| `analyze` | on load, whenever facts or events change | per-event priority, flexibility, type, reason | `mockBrain.js` |
| `parse` | you ask for a meeting | title, duration, attendees, days | `mockBrain.js` |
| `rank` | after code generates candidate slots | a reminder, plus top 3 with reasoning and draft messages | `mockBrain.js` |
| `advice` | an invite arrives | one short recommendation | `mockBrain.js` |

## The data

- **Your calendars.** Three Outlook-style responses (work, personal, club) in `src/data/graph/`. They merge into one master view. Events are colored by priority and have a colored left edge for the calendar they live on.
- **Team calendars.** Jake, Alyssa, Brad, Sarah and Priya each have a full Graph `calendarView` response in their own time zone. Jake is packed and flies five times. Alyssa has a light week. Priya is on a late shift in Bengaluru and is out Friday. Toggle **Show busy time** to see them over your week.
- **Mirrors.** Work events are already mirrored as private "Busy" blocks on your other calendars. Personal and club events are not. That gap is what **Sync now** fixes.
- **Time zones.** Every event carries its own zone. `graph.js` converts everything to Central once, so nothing downstream thinks about zones.

## Walkthrough, step by step

### 0. On load
- Your three calendars merge into one view. **Calendars** says "10 events are on one calendar only, so colleagues can't see you're busy" (Maya lunch, dentist, the Denver flight...).
- `analyze` runs with no facts and rates the week by title and Outlook category. The two flights are typed `flight` because Outlook tagged them with the `Flights` category.
- **Heads-up** already shows real problems found by code with no AI: Friday's club recruiting panel double-books the team retro (two calendars, one slot), and several back-to-backs.

### 1. Teach it your team
- Open **Teach it about your team** in the chat and click **Teach it all six** (or click the sentences one at a time).
- Each teach is an `extract` call. The result is a fact attached to a person card in **What I know**: Jake (partner, plus a 15 minute buffer rule), Alyssa (flexible peer), Brad (client, `never_reschedule`), Sarah (direct manager), Priya (India), and your flight rule.
- Facts changed, so `analyze` re-fires. Brad's meetings become `flexibility: none`, Alyssa's become `high`.
- No LLM is involved in the next part. `computeZones()` turns the flight rule into a hatched **Soft hold** the hour before Wednesday's 3 PM flight. The **Steerco debrief** at 2:15 PM now shows a soft hold flag, and Heads-up says so.

### 2. "Schedule a meeting with Jake, Alyssa, and Brad"
1. `route` says `schedule`. `parse` turns it into `{title, 45 min, [Jake, Alyssa, Brad], Mon to Fri}`.
2. `genCandidates()` (code) walks every 30 minute start. A slot survives only if everyone is free **and inside their own working hours** (Brad's 9 to 5 Pacific is 11 AM to 7 PM Central). It also keeps slots whose only clash is one of your work meetings rated flexibility `high` (that is how an Alyssa meeting shows up as a bump), but never a meeting with Brad or a flight. For Jake it also checks the gap in **his** calendar, because you taught it buffers.
3. Code writes the callouts per slot: soft hold hits, back-to-backs, Jake or Brad travelling that day, and each person's local time.
4. `rank` gets the candidates plus the context notes and returns a reminder and the top three. The bot shows the context it is applying, then three cards. Hover a card to preview it on the calendar.

### 3. Book it
- Say "book option 2", click **Book this**, or just say "sounds good". Code does the rest and explains each choice in the bot's message:
  - **Calendar:** work, because a colleague or client is invited (a club title would go to the club calendar).
  - **Video:** Zoom if a client is invited (they can join without a firm account), Teams for internal meetings.
  - **Sync:** a Busy block is written to the other two calendars immediately.
  - **Invites:** each attendee, with the time in their own zone. A bump also sends a note to the person whose meeting moved.

### 4. Sync, import, recall
- **Sync now** mirrors every one-calendar-only event as a private Busy block on the other calendars. Heads-up for colleagues is fixed.
- **Import / Connected** on a teammate controls whether the assistant can see their calendar. If you disconnect Jake, the bot says it is assuming he is free.
- Ask "what do you know about Jake?" and the bot lists the profile it holds for him.

### 5. Priya
- "I need 30 minutes with Priya. What times work?" Her late shift only overlaps your day from 9 to 11 AM Central, so that is all you get, each card shows the IST time, and Friday has nothing (she is out of office).

### 6. Incoming invite
- **Simulate an incoming invite** adds a pending invite from Brad for Wednesday 2:00 PM. Code flags it: it overlaps the Steerco debrief and sits inside your airport soft hold. `advice` says Brad is a client so accept, move the debrief (it is flexible), and check you can still make the flight. **Find another time** feeds the invite back into the chat.

## What is fake, on purpose

- **LLM responses**: canned or rule-based, see `documentation/04-mock-layer.md`.
- **Calendars**: Outlook-shaped JSON files, not the Graph API. Nothing is written back to Outlook.
- **Sending and booking**: simulated in local state. Video links are random.
- **One week, one DST state**: Nov 2 to 6 2026, after the US clocks changed.
- **Teaching**: only the six demo sentences have fixtures. Anything else is saved as a plain note.

## What is real

- The scheduling logic in `src/lib/scheduler.js`, including time zone and working-hours checks
- The Graph adapter and time zone conversion
- The data flow, the trace, the mock/live switch
- The prompts in `src/api/prompts.js`
- The fact schema

## Demo script

1. Calendar tab: point out the sync gap and the Friday double booking (no AI taught yet).
2. Teach it all six. Show the person cards and the Wednesday soft hold.
3. "Schedule a meeting with Jake, Alyssa, and Brad". Read the reminder, hover options, note the callouts and local times. Book one.
4. Show the Booked message (calendar, Zoom, mirrors, invites), then **Sync now**.
5. Ask for 30 minutes with Priya. Then simulate Brad's invite.
6. **Summary** tab: every step above is a row in the trace, with what answered it.
