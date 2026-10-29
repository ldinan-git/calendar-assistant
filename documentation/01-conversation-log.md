# Conversation log (dump)

Date of this session: 2026-10-29. Tool: Claude (chat interface), then this repo.
User messages are **verbatim** (typos left in). AI answers are summarized, with the claims that mattered kept. The point of this file is to show how the design moved from a vague idea to the current architecture, and who pushed it where.

---

## Turn 1: can I even get a teammate's calendar?

**User:**
> is there any way to get an export of a team member's calendar? as in is there an api that can pull it? just when it's free or not

**AI:** Yes, it depends on the calendar system.
- Google Calendar: `POST /calendar/v3/freeBusy` returns only busy blocks for one or more calendars, no event details. Needs the calendar shared with you (even "see only free/busy") or same Workspace domain.
- Microsoft 365: Graph `POST /me/calendar/getSchedule` returns free/busy for users in your org. Needs calendar permissions.
- Calendly has an availability API (shows open slots, not raw busy time).
- Simplest no-code option: an ICS feed shared as free/busy only.

**Outcome:** the idea that teammates are *free/busy only* came from here, and it stuck. In the app, `OTHER_BUSY` has no event titles for teammates, mirroring the real APIs. It is also a privacy decision: the LLM never sees what a teammate is doing, only when they're unavailable.

---

## Turn 2: how hard is an AI calendar tool?

**User:**
> how hard would it be to build and AI-augmented calendar tool? As in, it would keep track of all ofnyour calendars, you could include teammates whose calendars are pulled when you want to schedule meetings, and you can add notes to yours to provide more depth than just anninvite? Calendars can get messy at work

**AI:** "Moderate." MVP in a few weeks for one developer; polished product much harder, and the hard parts aren't the AI.
- Easy: pulling free/busy, storing notes against event IDs, the LLM layer (suggest times, summarize a messy week, turn notes into prep briefs).
- Hard: OAuth and approvals (Google security review, Microsoft admin consent), sync correctness (recurring events, exceptions, time zones, cancellations), privacy (opt-in, notes separated from shared data), trust (an AI that moves meetings needs a confirm step).
- Suggested path: start read-only, then AI suggestions, only later write to calendars.
- Mentioned Reclaim, Clockwise, Motion as existing products covering parts of this.

**Note for later:** some of those claims came from memory and should be verified before they go in a write-up. See `08-ai-collaboration-notes.md`.

---

## Turn 3: scope

**User:**
> It is just for a school project

**AI:** Then skip the hard parts. One integration (Google only), OAuth app in "Testing" mode with teammates as test users, free/busy only, SQLite for notes, small stack, LLM for suggestions and summaries. Timeline 2 to 4 weeks, OAuth being the fiddliest part.

---

## Turn 4: the "assistant" framing (the user sets the real goal)

**User:**
> It doesn't need to be "real". Hardcoding some things is fine. I think a big thing is a "calendar assistant". So you can pull from many calendars at once, see the schedule, prioriitize certain meetings with intelligence (ex. say Jake is a partner so any invite he is on has him on is high priority), suggest new meetings at optimal times (buffers from other meetings, or at least flagging back to backs), etc.

**AI:** Now "very doable, a few days". Hardcode calendars as JSON and spend the time on assistant logic. Proposed a split:
- Code (deterministic): merge calendars, detect conflicts, flag back-to-backs, find mutually free slots, score priority.
- LLM (judgment): explain why a meeting matters, summarize the week, pick between candidate slots with reasoning.
- First-pass priority scoring as *rules* (partner +50, external +30, notes attached +10, recurring low-attendance -10).

**Outcome:** the code/LLM split survived to the final design (it's rule 1 in the walkthrough). The *rules-based scoring* did not survive, see turn 6.

---

## Turn 5: is this a knowledge base?

**User:**
> so do you have some sort of backend knowledge base with an LLM on top? is that the structure of this?

**AI:** Close, but not really a knowledge base. More of a data layer + rules engine + LLM. RAG is for searching large piles of text; a week of calendar data is tiny and fits in the prompt. Time math ("who's free at 2pm") belongs in code, not the LLM. RAG would only become relevant if there were lots of notes to search ("what did we decide about the budget last time I met Jake?").

**Outcome:** no vector DB, no RAG. Decision recorded in `06-decisions.md`.

---

## Turn 6: the pivot from rules to taught facts

**User:**
> but I also want to be able to say "Jake is anpartner" and store it somewhere. This is mean to be AI-enabled not riles-based

**AI:** That's a memory layer. The user types a fact, the LLM extracts it into structured form, it's saved, and every later call injects all stored facts into the prompt. The LLM then decides priority and ranks slots using them. Nice side effect: facts the author never wrote a rule for also work ("I'm trying to protect Thursdays for the proposal"). Suggested a "What I know about you" panel with delete buttons, confirmations of what was saved, and handling contradictions. Kept a thin code layer underneath for time arithmetic only.

**This was the most important correction in the whole conversation.** The AI's previous answer had hardcoded `partner: +50`. The user rejected that: the point is that the user teaches it in natural language and the LLM interprets. That changed the architecture from "rules engine + LLM explainer" to "LLM judgment over a user-taught fact store, with code underneath for facts and time".

---

## Turn 7: facts as JSON from an LLM

**User:**
> could the facts be stores as JSONs created from an LLM

**AI:** Yes, standard pattern: structured extraction. Fixed small schema, keep `source_text` so the original wording is never lost, add `id` and `created_at` for update/delete, handle contradictions by asking whether a new fact replaces an old one, validate before saving, strip markdown fences, and show the user what was saved. Gave example JSON for person, time_preference, and focus_block facts.

**Outcome:** `03-fact-schema.md`.

---

## Turn 8: priority vs flexibility

**User:**
> then could I say "Josh is a team member who is my friend, anything with him can be rescheduled"

**AI:** Yes, and it has two parts: a relationship and an implication. Suggested splitting `priority` from `flexibility`: a meeting can be low priority but hard to move (a fixed-time webinar) or high priority but movable. That makes "who do I bump?" separate from "what matters most?".

**Outcome:** both fields exist on every `person` fact and on every event rating.

---

## Turn 9: bumping

**User:**
> so then the engine can suggest moving time with Josh to meet with Jake?

**AI:** Yes. Code detects the clash, the LLM reads the facts and decides Jake wins and Josh moves, code finds where Josh can go instead, the LLM proposes it with reasoning. Judgment in the LLM, time math in code, so it never suggests a slot that's taken. Present as a card with approve/dismiss, don't move things automatically. Optional: auto-draft the message to Josh.

**Outcome:** `findReplacement()` in `scheduler.js`; the bump option and `bump_message` in the rank output.

---

## Turn 10: the interface

**User:**
> I'm thinking the interface then shows you a calendar and you can prompt and it will automatically give you options, create new invites, and send them through the email you choose

**AI:** Flow: calendar view, prompt box, option cards with reasoning, pick one, draft invite and message, email-account dropdown, send. Three levels for "send": simulated (confirmation + event appears), ICS/email draft, or real `events.insert` with `sendUpdates=all`. Recommended simulated, keep the approve step either way.

---

## Turn 11: constraint rules (flights)

**User:**
> can you also add rules like "when you see a flight, add an hour buffer "warning" period so if someone schedules or I try to schedule a meeting you let let me know

**AI:** A third kind of fact: a `buffer_rule`. The LLM tags events by type (messy titles like "UA 482", "Travel to NYC" are an LLM-shaped problem), code expands the window and checks every proposal against it. Severity `warning` shows a flag, `hard` would exclude the slot. Same schema can express "30 minutes after any client meeting", "no meetings the day before a deadline".

**Outcome:** this is the cleanest example of the code/LLM split in the app: the LLM does *classification* (is this event a flight?), code does *geometry* (what's the window, does this slot hit it).

---

## Turn 12: how hard, with no integrations?

**User:**
> How hard is this to build? Assume no real integration with outlook or google, just dor a class project

**AI:** Easy to moderate: 3 to 5 days for a solid demo, a weekend for bare bones. Easy: mock calendars, calendar view, memory panel, simulated send. Medium: fact extraction, slot finder, buffer rules, options cards. Trickiest: getting the LLM to reliably *use* the stored facts in reasoning. Suggested a build order and what to cut if short on time.

---

## Turn 13: build it, and should I move to Claude Code?

**User:**
> Ok can we build this? Should I shift to Claude Code?

**AI:** Recommended building the first version in the chat as an artifact (API pre-wired, no key setup), then moving to Claude Code if a real repo is needed. Built a single-file React prototype called "margin" with: mock calendars for 4 people, taught-facts panel, LLM-rated priorities, buffer zones, option cards, simulated send, simulated incoming invite. **It was written but not run by the AI**, which said so.

---

## Turn 14: this repo

**User:**
> Hm this is interesting, but I actually do want to build this with code. I am a software engineer. I'm thinking the goal is to have hardcoded API responses and link those to the application. There can be a /responses folder. I also need a /documentation folder where you share any ideas you have - the goal of this is to show that I'm working with AI and documenting the process. This chat is a great place to start with documentation. Then I want a /summary tab that is a walkthrough of what is going on. .MD format is fine, and I prefer more of a dump than polish to start.

**AI:** Built this project:
- Vite + React app, scheduling logic pulled out into pure modules (`src/lib/scheduler.js`)
- `/responses`: hardcoded LLM outputs plus `manifest.json` routing
- `callLLM(task, input)` as the only place that talks to an LLM, with a mock/live switch and a trace
- `/documentation` (this folder)
- `/summary` tab: walkthrough + live trace + rendered docs
- Two test scripts: `npm run check` (prints candidate slots) and `npm run check:flow` (25 assertions through the mock pipeline)

Design choices made at this step are in `06-decisions.md`.

---

## Shape of the collaboration (quick read)

| Who | Contributed |
|---|---|
| User | The product idea; the scoping ("doesn't need to be real"); the key correction (AI-enabled, not rules-based); the fact JSON idea; the Josh/Jake bump scenario; the flight-buffer rule; the decision to build it as real code with hardcoded responses |
| AI | Feasibility and API facts; the code/LLM split; priority vs flexibility; memory-layer framing; fact schema; the bump flow; the build order; the artifact prototype; this repo |

The user steered on *what the product is*. The AI mostly steered on *how to structure it*. The one place the AI's first answer was wrong for the user's goal was turn 4, and the user caught it.
