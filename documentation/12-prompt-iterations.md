# Prompt iterations: what I tested, what broke, what changed

The capstone asks for prompts that were tested and refined, with real text and real outputs. This file is that record. The prompt text below is pulled straight from git history (`git show <commit>:src/api/prompts.js`), so it is exactly what ran. Every "observed output" came from running the app against a local model, **llama3.2 (3B) through Ollama, on a CPU**, on 2026-10-29. Timings are from one laptop.

The headline finding: the first prompts were fine for a strong model and wrong for a small one. I did not fix this by hoping for better prompts. Each failure became either a shorter prompt with a worked example, or (more often) a rule in code that no longer trusts the model with that fact. See `06-decisions.md` D25 to D27.

Versions: **v1** = first written (commit `bb21b93`), **v2** = the current prompt, after a small local model was connected and run for real.

---

## 1. Teaching: `extract` (one sentence in, structured facts out)

**Job:** turn "Brad is a client. Never reschedule a meeting with him." into JSON the scheduler can use.

### v1 (written for a strong model)
```text
You turn what a user tells their calendar assistant into structured facts. Return ONLY JSON, no markdown:
{"facts":[...],"replace_ids":[...],"confirmation":"one short friendly sentence confirming what you saved"}
Each fact has: "type" (one of "person","preference","focus_block","buffer_rule","project","other"), "summary" (plain English, under 14 words), "source_text" (the user's own wording for this fact).
Optional fields by type:
- person: "name", "attributes" (object, e.g. role, relationship), "priority" ("high"|"medium"|"low"), "flexibility" ("high"|"medium"|"low", how easily their meetings can be moved)
- preference: "rule" (string), "strength" ("soft"|"strong")
- focus_block: "day", "time", "purpose"
- buffer_rule: "trigger" {"event_type": one of ${TYPES}}, "buffer_before_min" (number), "buffer_after_min" (number), "severity" ("warning"|"hard")
Split a message into several facts only if it holds clearly separate ideas. If a new fact contradicts or updates an existing fact (given with ids), put that id in replace_ids. Only record what the user said. Never invent details.
```

### What happened with the 3B model
Honest note on versions: v1 was **never run against any model** (the first build used canned responses). The first real run used an intermediate prompt, v1.5: v1 plus three worked examples (Jake, Brad, a flight rule) and the new person fields. That is the version that produced the output below. v2 is what that run led to.

Input (exactly as pasted in the demo): `When you see a flight, hold an hour before and an hour after it.`

Observed output saved by the app: **`buffer rule, on every flight, 120 min before, 120 after`**. The model doubled the amount. The sentence says 60 each side.

Other observations from the same session, teaching five sentences in one paste (84 seconds in total): all five people were extracted correctly, including Priya's working hours (`08:00 to 12:00 America/New_York`). But it set Brad's priority to **low**, for a client you never reschedule.

### What I changed
- **Prompt (v2):** shorter, two worked examples (a person with a buffer rule, and a person with working hours and a time zone), and the flight rule spelled out with the arithmetic ("An hour is 60 minutes").
- **Code, because a prompt didn't reliably fix numbers:** `sayMinutes()` in `src/api/validate.js` reads the amount and the sides from the user's own sentence and overrides the model's numbers. A person flagged "never reschedule" is forced to high priority.
- **Tests:** `npm run check:flow` has assertions for both ("an hour before and an hour after" is 60 and 60 whatever the model said; "30 minutes after" is 0 before, 30 after).

### v2 (current)
```text
You turn one sentence a user tells their calendar assistant into structured facts. Reply with ONLY a JSON object:
{"facts":[...],"replace_ids":[],"confirmation":"one short friendly sentence"}
Each fact has "type", "summary" (plain English, under 14 words) and "source_text" (the user's own words).
Types and their extra fields:
- "person": "name", "attributes" {"role": ...}, "location" (a city, only if said), "timezone" (IANA zone of where they are, e.g. "Asia/Kolkata" for Bengaluru), "working_hours" ({"start":"08:00","end":"12:00","timezone":"America/New_York"}, only if the user says when they work; use 24 hour HH:MM and an IANA zone: ET America/New_York, CT America/Chicago, PT America/Los_Angeles, IST Asia/Kolkata), "priority" ("high"|"medium"|"low"), "flexibility" ("high"|"medium"|"low": how easily their meetings can be moved), "never_reschedule" (true ONLY if the user says never move their meetings)
- "buffer_rule": "trigger" ({"event_type":"flight"} OR {"attendee":"<name>"}), "buffer_before_min", "buffer_after_min" (numbers), "severity" "warning", "label" (short name)
- "preference": "rule" (string), "strength" ("soft"|"strong")
- "other": anything else
Rules: only record what the user said, never invent details, never guess anyone's pronouns. If one sentence holds a person fact and a buffer rule, return both facts.

Example input: Jake is a partner. Keep buffers around meetings with him.
Example output: {"facts":[{"type":"person","summary":"Jake is a partner, high priority","name":"Jake","attributes":{"role":"partner"},"priority":"high","flexibility":"low","source_text":"Jake is a partner."},{"type":"buffer_rule","summary":"Keep 15 minutes around meetings with Jake","label":"Partner buffer","trigger":{"attendee":"Jake"},"buffer_before_min":15,"buffer_after_min":15,"severity":"warning","source_text":"Keep buffers around meetings with him."}],"replace_ids":[],"confirmation":"Got it: Jake is a partner, so I will keep buffers around his meetings."}

Example input: Priya is in Bengaluru and only works 8 AM to 12 PM ET.
Example output: {"facts":[{"type":"person","summary":"Priya is in Bengaluru, works 8 AM to 12 PM Eastern","name":"Priya","attributes":{},"location":"Bengaluru","timezone":"Asia/Kolkata","working_hours":{"start":"08:00","end":"12:00","timezone":"America/New_York"},"priority":"medium","flexibility":"medium","source_text":"Priya is in Bengaluru and only works 8 AM to 12 PM ET."}],"replace_ids":[],"confirmation":"Got it: Priya is in Bengaluru but works 8 AM to 12 PM Eastern."}

A flight rule looks like: {"type":"buffer_rule","trigger":{"event_type":"flight"},"buffer_before_min":60,"buffer_after_min":60,"label":"Flight soft hold","severity":"warning",...}. An hour is 60 minutes: "an hour before and an hour after" means buffer_before_min 60 and buffer_after_min 60.
```

---

## 2. Routing: `route` (what does this message want?)

**Job:** every chat message goes through this. "Brad is a client. Never reschedule a meeting with him." is *teaching* even though it contains "meeting". "Book option 2" is a booking only if options are on screen.

### v2 prompt (current)
```text
You route one message sent to a calendar assistant chat. Known people: ${TEAM}. Reply with ONLY JSON:
{"intent":"schedule|teach|recall|book|team|import|sync|resolve|brief|chat","names":["known people mentioned"],"calendars":["work","personal","club"],"option":null}
- schedule: wants a meeting or call arranged, or asks what times work ("Schedule a meeting with Jake", "I need 30 minutes with Priya")
- teach: tells you something about a person or a rule ("Brad is a client", "When you see a flight, hold an hour before")
- recall: asks what you know ("What do you know about Jake?", "Who can I reschedule?")
- book: picks one of the options just offered ("book option 2", "the first one", "sounds good") and has_options is true. "option" is 1 to 3
- team: wants people added to the team list ("Add Jake as a teammate", "Add Jake and Sarah to my team"). No calendar is mentioned
- import: wants calendars imported or connected ("Import my work calendar", "Connect Jake's calendar"). Put the calendars in "calendars" (work, personal, club) and teammates in "names"; "my calendars" means all three; "my team" means all five people
- resolve: wants conflicts or double-bookings found or fixed ("Fix my conflicts", "Do I have any conflicts?")
- brief: wants a summary of their week ("Brief me on my week", "How's my week looking?")
- sync: wants calendars synced so colleagues see them as busy
- chat: anything else
"Brad is a client" is teach even though it mentions a person. "names" and "calendars" may be empty lists.
```

### What happened
Input: `Import my work, personal, and club calendars`

Observed result in the app: it connected the three calendars **and all five teammates' calendars** ("Jake (ET): 21 events ... Priya (IST): 12 events"). The model had filled the `names` list with everyone it knew about.

### What I changed
Not the prompt: the *job split*. The model now decides only the **intent**. Names, which calendar, and "option 2" are read from the text by code (`routeEntities` in `src/api/mockBrain.js`, applied in `validate.js`). A test asserts that a model returning five teammates for "Import my work calendar" still imports one calendar and no people.

Also: with a background job running, a routing call took 7 to 9 seconds; alone it took 1.6 seconds. A local model serves one request at a time, so chat calls now jump a priority queue (`src/api/llm.js`).

---

## 3. Ranking: `rank` (which of these valid slots is best, and why?)

**Job:** code has already found every legal slot. The model picks the best three and explains. It must not do time math.

### v1
```text
You are a calendar assistant helping the user schedule a meeting. You get the request, what the user has taught you, and candidate slots that code has already checked for availability. Do not re-check availability or do time math. Pick the best 3 (or fewer) and rank them, best first. Weigh taught facts and preferences heavily. Prefer slots with breathing room, and avoid back-to-backs and buffer warnings unless nothing else works. Moving another meeting is a last resort unless a taught fact says that person is flexible. Return ONLY JSON:
{"options":[{"candidate_id":"c1","headline":"max 8 words","reasoning":"max 30 words, cite taught facts when used","invite_message":"short note from the user to the attendees, max 35 words","bump_message":"only if the slot moves another meeting: short note to the moved person, max 30 words, otherwise empty string"}]}
```

### v2 (current)
```text
You help the user pick a meeting time. You get the request, the knowledge base (what the user taught you about each person), and candidate slots that code has already checked for availability and working hours. Do not do time math. Choose the best 3 (or fewer) and rank them, best first. Prefer candidates with warning_count 0 and no moves. Use the knowledge base: respect buffers, never propose moving a meeting with someone marked never reschedule, and move meetings with flexible people only when nothing cleaner exists. Mention any warning that remains. Never guess pronouns. Reply with ONLY JSON:
{"reminder":"one or two sentences reminding the user of the context you are applying","options":[{"candidate_id":"c1","headline":"max 6 words","reasoning":"max 25 words","invite_message":"short note from the user to the attendees, max 30 words","bump_message":"only when the slot moves another meeting: a short note to the moved person, otherwise empty string"}]}
"candidate_id" must be copied exactly from the candidates.
```

### What happened
Input: `I need 30 minutes with Priya. What times work?` (after Priya's real hours had been taught).

Observed output (one option returned, not three):

> Best: Tue 10:00 AM to 10:30 AM. **"Priya is available at 10:00 AM ET, but Focus: Helix storyline is scheduled for 12:00 PM on a Tue."**

Wrong: 10:00 AM is Central, not Eastern, and the explanation invents a conflict. For the three-person meeting it produced the reminder *"Meeting with Jake, Alyssa, and Brad, please choose a time that respects buffers..."*, which reads like an instruction to the user, not a reminder.

### What I changed
- The model is sent six candidates, trimmed to ids, times, warnings and moves (every prompt token costs seconds on a CPU; ranking took 52 seconds before trimming and 11 afterwards when nothing else was queued).
- **Grounding check** (`groundRank` in `src/api/llm.js`): if the reasoning cites a clock time that is not in that slot's own data, the model's sentence is thrown away and replaced by one assembled from the facts code already computed.
- **Top-up:** if the model returns fewer than three options, code fills the rest from its own ranking.
- **What this does not fix:** a wrong claim that reuses a real time. The trace shows when code replaced something; a human still has to read the reasoning.

---

## 4. Rating the week: `analyze` (how important is each meeting, and can it move?)

### v1
```text
You are a calendar assistant. "You" is the user. Using the facts the user has taught you plus your own judgment, rate every event. Return ONLY a JSON object keyed by event id:
{"<id>":{"priority":"high|medium|low","flexibility":"high|medium|low","type":"...","reason":"max 8 words"}}
"type" must be one of: ${TYPES}. "flexibility" is how easily the event can be moved (high = easy to reschedule). Taught facts override your own judgment. With no relevant fact, use the title, attendees and notes. Never invent facts.
```

### v2 (compact format for a small model)
```text
You rate calendar events for the user ("You"). Each event lists who else is in it ("with"). Using the knowledge base the user taught you, rate EVERY event. Reply with ONLY a JSON object keyed by event id, each value a two item list [priority, flexibility]:
{"<id>":["high","low"]}
priority is one of high, medium, low. flexibility is how easily the event can be moved: one of high (easy), medium, low, none (never). The knowledge base overrides your own judgment: a partner or client means high priority; someone whose meetings "can be rescheduled with ease" means flexibility high; "never reschedule" means flexibility none. A person the knowledge base doesn't mention gets medium and medium. Never invent facts.
Example: knowledge base ["Dana is a client. Never reschedule.","Lee is a peer. Meetings with Lee can be moved easily."] and events [{"id":"a","title":"Review","with":["Dana"]},{"id":"b","title":"Lunch","with":["Lee"]}] -> {"a":["high","none"],"b":["medium","high"]}
```

### What happened
With the 3B model, rating the week took **75.6 s and 83.0 s** per pass. The trace row reads: *"12 of 12 judged events kept the deterministic rating (invalid model output ...)"*. The model never produced a usable answer, and the calls queued ahead of chat.

### What I changed
I stopped asking it. Rating is **rules plus the facts you taught** by default (instant, tested). A strong model can opt in (`VITE_LLM_ANALYZE=1`, or the Claude API provider). Decision D26. Ratings now also appear instantly as provisional values.

I'm recording this as a result: **for this task a 3B model on a CPU was the wrong tool**, and the rule-based version is better.

---

## 5. Other observations worth citing

| Prompt | Input | Observed |
|---|---|---|
| `recall` | "Who should I be careful about rescheduling?" | Returned only `Brad, Sarah, Priya`: terse, and arguably wrong (Jake's buffers were the other half of the answer). The demo script marks this step skippable. |
| `recall` | "What do you know about Priya?" | Returned the taught sentence verbatim. Correct, but no more useful than a lookup. |
| Provider | `num_ctx` set differently from the loaded model | Ollama reloaded the model and every request stalled for minutes. Found by timing a benchmark next to the app. Fix: never set it. |

## 6. What I'd still do by hand
Read any explanation the model writes before sending it to a client. Check the booked meeting against my real calendar (this prototype only has sample data). Decide who counts as "never reschedule".
