# What is going on in this app

**margin** is a calendar assistant you *set up* and then *talk to*. You connect calendars, add teammates, and tell it things in plain English ("Jake is a partner"). It keeps what you said in one knowledge base, with a structured form that code can use, and every time it suggests a meeting time it reads all of it. Code handles the time math, time zones and every number. A language model handles judgment and language.

There are two copies of the app, with the same code and different starting states:

- `/` the **finished product**: calendars connected, team added, everything taught and synced
- `/fresh.html` the **new app**: blank, for showing setup

The **demo script** (`/demo.html`, also `documentation/10-demo-script.md`) takes you from the new app to the finished one in five parts. This page explains what is going on underneath.

## The shape of it

```
 you type in the assistant
        |
        v
  Workspace.jsx  ---->  callLLM(task, input)  ---->  Ollama (local) | Claude API | mock
        ^                       |                          |
        |                       v                          v
        |              validate.js: check shape, names, numbers, times;
        |              retry once, repair, or fall back to the mock for that call
        |                       |
        +---- scheduler.js (pure code: busy lists, working hours, soft holds, flags, candidate slots)
        +---- context.js (knowledge base + who each teammate is)
        +---- graph.js / tz.js (Outlook responses and time zones, converted once at the edge)
```

Two rules the whole design leans on:

1. **Code owns facts and numbers.** Who's free at 2pm, whether that is inside Priya's working hours, how many minutes "an hour before and after" is, which names and calendars you mentioned, whether a meeting is with someone you never reschedule. Models get these wrong, and code is testable (`npm run check:flow`).
2. **The model owns judgment and language.** What you meant, which of several valid slots is best, what to say to the person whose meeting moves.

## The data

- **Your calendars.** Three Outlook-style responses (work, personal, club). They merge into one master view, with a checkbox per calendar. Flights arrive on the personal calendar with the Outlook "Flights" category.
- **Teammates are separate from their calendars.** You add a person, then separately add their calendar. A person with no calendar is assumed to keep your hours until you say otherwise.
- **Team calendars.** Jake, Alyssa, Brad, Sarah and Priya each have a full Graph `calendarView` response in their own time zone. Jake is packed and flies five times. Alyssa has a light week. Priya is out on Friday.
- **Mirrors.** Work events are already mirrored as private "Busy" blocks on your other calendars. Personal and club events are not, and that gap is what **Sync** fixes.
- **Calendars are often wrong about people.** Priya's calendar says 9 AM to 6 PM India time, which never overlaps your day. In reality they work 8 AM to 12 PM Eastern. What you taught wins over what the calendar settings say (`effectiveDirectory`). This is the point of the knowledge base.

## The seven model tasks

| Task | When it fires | What the model decides |
|---|---|---|
| `route` | every chat message | schedule, teach, recall, book, add a teammate, add calendars, sync, or chat. (Names, calendars and option numbers are read from the text by code.) |
| `extract` | you teach it something | structured facts from one sentence: person, working hours, buffer rule |
| `parse` | you ask for a meeting | title, duration, who, which days |
| `rank` | after code has built candidate slots | the best three, with reasoning and draft messages |
| `recall` | you ask what it knows | an answer from the knowledge base |
| `advice` | an invite arrives | accept, decline, or ask for a new time |
| `analyze` | events or facts change | priority and flexibility per event. **Rules plus taught facts by default**; a strong model can do it too (`VITE_LLM_ANALYZE=1`) |

## What code does around the model

- **Retry, repair, fall back.** Output is checked. A bad answer is retried once, then repaired where possible, then that one call falls back to the mock. The trace says "fell back".
- **Numbers from your words.** "An hour before and an hour after" becomes 60 and 60 even if a small model said 120 and 120.
- **Times it wasn't given.** If the model explains a slot with a time that isn't in that slot's data, code writes the explanation instead.
- **Top-up.** If the model returns one option, code adds the next best from its own ranking.
- **One request at a time.** A local model can only answer one request at a time, so chat messages jump the queue ahead of anything in the background.

## What is fake, on purpose

- **Calendars**: Outlook-shaped JSON files, not the Graph API. Nothing is written back to Outlook.
- **Booking and sending**: simulated in local state. Video links are random.
- **One week, one DST state**: Nov 2 to 6 2026, after the US clocks changed.
- **Mock mode** (no model): the teaching sentences are canned and the rest is rule-based.

## What is real

- The scheduling logic, including time zone and working-hours checks
- The Graph adapter and time zone conversion
- The model integration, with validation and fallback, and the trace
- The prompts in `src/api/prompts.js`
- The knowledge base and the effective directory
