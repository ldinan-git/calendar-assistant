# The mock layer

## Why

The real thing is an LLM. For a class demo that has to run offline, deterministically, with no API key, every LLM response in default mode is canned. The app doesn't know the difference: all LLM access goes through one function.

```js
callLLM(task, input)  // task: "extract" | "analyze" | "parse" | "route" | "rank" | "advice"
```

`VITE_LLM_MODE=mock` (default) answers locally. `VITE_LLM_MODE=live` sends the same input to the Anthropic API with the prompt from `src/api/prompts.js`.

Every call, in either mode, is recorded in a trace: task, input, output, what answered it, latency. The Summary tab renders it.

## Two kinds of mock

The first version of this repo mocked every task with hand-written JSON files keyed by regexes. That worked for three scripted prompts and fell apart as soon as the calendar had real data in it (fixtures were keyed by event id, and every new combination of taught facts needed a new file). So the mock is now split by what the task looks like:

| Task | Input | Mock | Where |
|---|---|---|---|
| `extract` (teaching) | one sentence from a short list of demo sentences | **Fixture file**, picked by regex in `manifest.json` | `responses/extract/*.json` |
| `analyze` | whole calendar + taught facts | **Deterministic function** | `src/api/mockBrain.js` |
| `parse` | free-form request | **Deterministic function** | `mockBrain.js` |
| `route` | free-form chat message | **Deterministic function** | `mockBrain.js` |
| `rank` | candidate slots computed by code | **Deterministic function** | `mockBrain.js` |
| `advice` | invite + issues computed by code | **Deterministic function** | `mockBrain.js` |

The functions return the exact JSON shape the live prompts ask for, so the UI, the trace and the data flow behave identically. They are small rule-based stand-ins, not an attempt to be smart: `analyze` maps titles and Outlook categories to a type, then applies taught facts; `rank` prefers slots without warnings and writes its reasoning from the callouts code already computed.

`extract` stays as fixtures on purpose. The teaching sentences are a fixed demo script, and seeing a real JSON file with the structure the live model must produce is useful documentation.

## `extract` fixtures

`responses/manifest.json` holds ordered rules: the first regex that matches the user's sentence wins, else `_fallback.json` (saves an `other` fact echoing the user's text).

| File | Triggered by | Produces |
|---|---|---|
| `jake.json` | sentence starting "Jake" | a `person` fact (partner, high priority) **and** a `buffer_rule` with `trigger.attendee: "Jake"` (15 min each side) |
| `alyssa.json` | "Alyssa ..." | `person`: peer, flexibility high |
| `brad.json` | "Brad ..." | `person`: client, `never_reschedule: true` |
| `sarah.json` | "Sarah ..." | `person`: direct manager, priority high |
| `priya.json` | "Priya ..." | `person`: data scientist, India, timezone `Asia/Kolkata` |
| `flight_buffer.json` | any sentence with "flight" | `buffer_rule` on `event_type: flight`, 60 min before, label "Airport soft hold" |
| `_fallback.json` | everything else | plain `other` note |

Teaching the same thing twice replaces the earlier fact (matched by person name or rule trigger) instead of stacking a duplicate. `App.jsx` does this, not the LLM.

## Known limits (honest list)

1. **The mock "NLU" is regexes.** `mockRoute` and `mockParse` recognise the demo phrasings and reasonable variants ("an hour", "Thursday", "about the Helix deck"). Odd phrasings fall through to a generic chat reply or a default 30 minute meeting. That is the mock, not the product.
2. **`rank` reasoning is templated.** It reads well but it is assembled from callouts, so it never says anything the code didn't already compute. A live model will say more, and sometimes something wrong. That's why live `rank` output is still mapped back onto code-verified candidates (`matchRankedOptions`).
3. **Teaching only knows six sentences.** Anything else is saved as a plain note and nothing reads it as a rule. The live prompt handles arbitrary sentences, mock mode does not.
4. **`analyze` is heuristic.** Event types come from titles and the Outlook `Flights` category. A flight titled "Trip to Denver" with no category would be missed. A live model might catch it, or might not.
5. **Mock mode has never been compared against live output.** Live mode has not been run.

---

## Update: providers, and what the mock is now for

The mock is no longer the default. `callLLM` has three providers, chosen in the app header:

| Provider | Needs | Notes |
|---|---|---|
| **Ollama** (default) | Ollama running on `localhost:11434` with a model pulled | Requests go through a priority queue (chat before background), are validated by `src/api/validate.js`, retried once, and fall back to the mock for that call if still unusable |
| **Claude API** | `VITE_ANTHROPIC_API_KEY` | Also rates every event (`analyze`) |
| **Mock** | nothing | Teaching from `responses/extract/*.json`, everything else from `mockBrain.js` |

The mock still matters in three ways: it is the offline provider, it is the per-call fallback, and parts of it (`routeEntities`, `mockReasoning`, the deterministic `analyze`) run even with a real model because they are facts, not judgment. Mock teaching now covers the demo sentences, including Priya's working hours; anything else is saved as a plain note.
