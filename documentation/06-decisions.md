# Decisions

Short records. Format: what we chose, what we rejected, why. Newest at the bottom.

## D1. Teammates are free/busy only (superseded by D15)
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

---

The decisions below came with the second build (new cast, Outlook-shaped data, chat-driven booking). D1 and D8 to D10 are superseded or narrowed by them.

## D15. Teammates have full-detail Outlook calendars (supersedes D1)
- **Chose:** each teammate has a full Microsoft Graph `calendarView` response (titles, flights, locations, attendees). The user's three calendars (work, personal, club) merge into one master view.
- **Rejected:** keeping free/busy only.
- **Why:** the premise changed. The assistant should see that Jake is mid-flight, not just that he is "busy", and the user wants every calendar fully synced so colleagues see personal events too (as private Busy blocks). Privacy is handled by the mirror design (D17), not by hiding titles from the assistant.

## D16. Everything is converted into the user's zone once, at the edge
- **Chose:** `lib/graph.js` converts each Graph event (each carries its own Windows time zone name) into `{day, start, end}` in Chicago time. Working hours are checked per person with `Intl` in `lib/tz.js`. The scheduler and UI never see another zone.
- **Rejected:** UTC everywhere and converting in every component; display-only time zones.
- **Why:** the scheduler is the tested core and it works in integer minutes. Converting at the boundary left it unchanged and made Priya's 9 to 11 AM Central overlap fall out of the working-hours check instead of a special case.
- **Cost:** the week is hardcoded to Nov 2 to 6 (so DST changes are not exercised), and anything outside Mon to Fri in the user's zone is dropped.

## D17. Mirrors are "Busy" placeholders, and sync is a visible gap list
- **Chose:** a source event on one calendar is mirrored as a private "Busy" block on the others (Graph `categories: ["Synced"]`, `transactionId` = source id). The sample data deliberately leaves personal and club events unmirrored so the app can show "10 events are invisible to colleagues" and fix them in one click. Bot-booked meetings are mirrored immediately.
- **Rejected:** copying full event details across calendars.
- **Why:** colleagues only see the work calendar, so a flight booked on the personal calendar is invisible to Sarah when she schedules over it. Busy placeholders fix that without leaking titles.

## D18. One chat box, a router, and code-made decisions after the pick
- **Chose:** a single chat input. A `route` task classifies each message (schedule, teach, recall, book, sync). Booking itself is code: which calendar, which video provider, the link, the mirrors, the invites. Each decision comes with a reason the bot shows.
- **Rejected:** separate teach and ask panels (what v1 had); letting the LLM pick the calendar or write the link.
- **Why:** the user wants to do everything by prompting. Calendar and provider choice have right answers and should be testable.

## D19. Soft holds are buffer rules with two triggers
- **Chose:** `buffer_rule` facts trigger on an event type (flights) or an attendee (Jake). Code expands them into zones next to the event, shown hatched on the calendar. For attendee rules the gap is also checked in that person's own calendar.
- **Rejected:** creating real hold events in Outlook.
- **Why:** zones are derived, so changing a rule updates everything with nothing to clean up. Real hold events are the obvious next step once writes to Outlook exist.

## D20. Free-form mock tasks are functions, not fixtures (narrows D8, D9, D10)
- **Chose:** `analyze`, `parse`, `route`, `rank`, `advice` are answered by deterministic functions in `src/api/mockBrain.js` that return the live prompts' JSON shape. Teaching (`extract`) stays as fixture files routed by the manifest.
- **Rejected:** per-scenario fixture files.
- **Why:** fixtures keyed by event id or by combinations of taught facts do not survive a realistic calendar. See `04-mock-layer.md`.
