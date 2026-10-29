# Notes on working with the AI

Honest log of where the AI helped, where it needed correcting, and what is unverified. This is for the "documenting the process" goal, and for future me.

## Where it helped

- **Fast feasibility answers.** Which APIs expose free/busy (Google, Microsoft Graph), what's hard about real calendar integration (OAuth review, sync correctness, privacy, trust).
- **The code/LLM split.** Suggested early and it held through every later change.
- **Priority vs flexibility.** The AI proposed splitting these when I described Josh. It's what makes the bump scenario work.
- **Fact schema + structured extraction** pattern, including keeping `source_text` and `replace_ids` for updates.
- **Scoping.** Took "AI calendar tool" from weeks to days by cutting everything that wasn't the assistant logic.
- **Building and testing.** Wrote the app, the mock layer, fixtures, and two check scripts. `check:flow` has 25 assertions and passes.

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

## What has and hasn't been run

| Thing | Run? |
|---|---|
| `npm run build` | yes, passes |
| `npm run check` (candidate slots for each scenario) | yes |
| `npm run check:flow` (25 assertions, full mock pipeline via Vite's module loader) | yes, passes |
| Every component server-rendered with realistic props | yes (one real issue found and fixed: `useSyncExternalStore` needs a server snapshot) |
| The app clicked through in a real browser | **no**, the AI has no browser |
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
