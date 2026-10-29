# Notes on working with the AI

Honest log of where the AI helped, where it needed correcting, and what is unverified. This is for the "documenting the process" goal, and for future me.

## Where it helped

- **Fast feasibility answers.** Which APIs expose free/busy (Google, Microsoft Graph), what's hard about real calendar integration (OAuth review, sync correctness, privacy, trust).
- **The code/LLM split.** Suggested early and it held through every later change.
- **Priority vs flexibility.** The AI proposed splitting these when I described Josh. It's what makes the bump scenario work.
- **Fact schema + structured extraction** pattern, including keeping `source_text` and `replace_ids` for updates.
- **Scoping.** Took "AI calendar tool" from weeks to days by cutting everything that wasn't the assistant logic.
- **Building and testing.** Wrote the app, the mock layer, fixtures, and a check script. `check:flow` now has 51 assertions and passes.
- **Asking before building (second build).** Given the four-feature brief, the AI read the existing repo first, then asked four questions (evolve vs rewrite, mock vs live, how much calendar data, how deep time zones go) before touching code.
- **Finding its own mock was the wrong shape.** With a realistic calendar the old fixture-per-scenario mock could not work (fixtures keyed by event id), so the free-form tasks became deterministic functions (D20).
- **Catching its own pronoun slip.** The first teaching fixtures wrote "her" and "his" for Sarah and Priya, who the user never described that way. Found while reading the bot's output in the browser and changed to neutral wording. Jake, Alyssa and Brad use the pronouns the user used.

## Where it was wrong or needed steering

- **Turn 4: it proposed hardcoded rules for priority** (partner +50, etc.), which is exactly what I didn't want ("AI-enabled, not rules-based"). I pushed back in turn 6 and the architecture changed. Lesson: when the AI proposes a deterministic shortcut, check whether it dodges the point of the project.
- **Over-eager "want me to build it?"** The AI offered to build the prototype about five times before I said yes. Not wrong, just noisy.

## Unverified claims (check before citing in a write-up)

These came from the AI's memory, not from a source it checked in this session.

| Claim | Where | Status |
|---|---|---|
| Google requires a security review "sometimes a paid audit" for apps reading calendar data | turn 2 | **Probably overstated.** Calendar scopes are, as far as I recall, "sensitive" scopes (verification required), and the paid third-party assessment applies to "restricted" scopes (Gmail, Drive). Verify in Google's OAuth docs |
| "Testing" mode OAuth apps allow up to 100 test users, no verification | turn 3 | Believed correct. There's also a limit on refresh-token lifetime for testing apps (about 7 days) that the AI did not mention. Verify |
| Graph `getSchedule` needs `Calendars.Read` or `Schedule.Read.All` | turn 1 | Exact permission names unverified. Check the Graph docs |
| Reclaim, Clockwise, Motion cover parts of this | turn 2 | Product landscape changes fast. Check what each does today before comparing |
| Time estimates (weekend / 3 to 5 days / 2 to 4 weeks) | turns 3, 12 | Estimates, not measurements |
| Header `anthropic-dangerous-direct-browser-access` for browser calls | `llm.js` | From memory, never exercised. Verify in the API docs before using live mode |
| Default model name `claude-sonnet-5-5` | `.env.example`, `llm.js` | Taken from the AI's product notes in this session. Verify against the current model list |
| Graph event field names, `mailboxSettings.workingHours` shape, Windows time zone names ("Central Standard Time") | `scripts/gen-graph-data.mjs`, `src/lib/graph.js` | Written from memory of the Graph v1.0 docs, not checked against a real response. Real responses may differ (e.g. `Prefer: outlook.timezone` header, recurrence expansion, `Z` suffixes). Compare against one real `calendarView` call before trusting the adapter |
| "Diwali week" on Priya's Friday | `priya.json` | The AI believes Diwali 2026 falls on Sunday Nov 8. It is decoration in the sample data, not a calendar fact to cite |
| Flight times and routes (LGA to ORD, ORD to SFO, ...) | sample data | Invented. Block lengths are plausible, schedules are not real |

## What has and hasn't been run

| Thing | Run? |
|---|---|
| `npm run build` | yes, passes |
| `npm run check:flow` (51 assertions, full mock pipeline via Vite's module loader) | yes, passes |
| The app in a real browser (the Claude desktop app's preview pane) | **partly**: teach all six, ask for Jake + Alyssa + Brad, book option 1, Sync now, simulate Brad's invite, ask for Priya, no console errors. **Not clicked:** booking a bump option, the Import toggle, narrow and mobile layouts, the Summary tab after the rewrite |
| Team diagram (`team-structure.svg`) | rendered in the browser and checked; two labels were clipped and shortened |
| Live mode against the real API | **no** |
| The earlier single-file artifact prototype | written but never run by the AI. This repo supersedes it |

## Prompts that worked well (for reuse)

- "Is this a knowledge base?": asking the AI to name the architecture back to me exposed a mismatch early.
- "Could I say '...'?": giving a concrete example sentence and asking if the system would handle it. Each one found a missing schema field (flexibility, buffer rules).
- "So the engine can suggest...?": restating the scenario in my own words and asking the AI to confirm, which forced it to walk through the data flow.
- "How hard is this to build? Assume no real integration": adding the constraint explicitly changed the estimate from weeks to days.

## What I'd do differently next time

- Ask for a **written plan with the code/LLM boundary** before any code. Here it emerged from conversation, which was fine, but the boundary is the main design artifact.
- Ask the AI to **list its assumptions** at the end of each feasibility answer, so the unverified table above builds itself.
- Start the **eval set on day one**. The place this project is weakest is "does the LLM actually use the facts", and nothing in the mock layer tests that.
- Keep **verbatim prompts and responses** in the repo as they happen, instead of reconstructing the log at the end.

## Third build: a real local model (what running it for real showed)

Written after running the demo script against `llama3.2` (3B, CPU only) through Ollama, which the mock could never have shown:

- It returned **120 and 120 minutes** for "an hour before and an hour after". Fix: code reads the amount and sides from the sentence (`sayMinutes`).
- Asked to import one calendar, it returned **all five teammates**. Fix: the model only picks an intent; code reads names, calendars and option numbers (`routeEntities`).
- Its explanations cited **times that weren't in the data** ("available at 10:00 AM ET"). Fix: reasoning with an ungrounded time is replaced by the code-written line. Wrong *claims* that reuse real times are not caught; the wording of a 3B model is still sometimes wrong or clumsy.
- It returned **one option** instead of three. Fix: code tops up from its own ranking.
- Rating all events with it took **75 to 83 seconds**, every event failed validation, and it queued ahead of chat. Fix: rating is rules by default (D26), and chat calls jump the queue.
- Changing `num_ctx` between requests made Ollama **reload the model and stall every request**. Found by running a benchmark next to the app. Fix: never set it.
- Teaching: it extracted all five people correctly, including Priya's working hours in Eastern. It gave Brad priority "low" (fixed in code: never-reschedule implies high).

What is still unverified: other models, the Claude API provider (never run), and anything on a GPU. Timings in the demo script are from one machine.

See also `11-steering-log.md` (the full account of where I steered and where Claude was wrong) and `12-prompt-iterations.md` (prompt text before and after, with the real outputs that broke them).
