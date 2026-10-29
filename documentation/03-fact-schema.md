# Fact schema

Facts are what the user teaches the assistant. They're produced by the `extract` LLM call from a plain-English sentence, saved as JSON, and passed back into every later LLM call.

## Common fields (all facts)

| Field | Set by | Notes |
|---|---|---|
| `id` | code | random 6-char string, used for delete and for `replace_ids` |
| `created_at` | code | `YYYY-MM-DD` |
| `type` | LLM | one of `person`, `preference`, `focus_block`, `buffer_rule`, `project`, `other` |
| `summary` | LLM | plain English, under 14 words, shown in the UI |
| `source_text` | LLM (falls back to the user's input) | the user's own wording, never lost |

`source_text` matters: if the structured fields miss nuance, the original sentence is still in the prompt.

## `person`

```json
{
  "type": "person",
  "summary": "Josh is a flexible friend and team member, meetings can move",
  "name": "Josh",
  "attributes": { "role": "team member", "relationship": "friend" },
  "priority": "low",
  "flexibility": "high",
  "source_text": "Josh is a team member who is my friend, anything with him can be rescheduled"
}
```

`priority` and `flexibility` are separate on purpose:

| | flexibility low | flexibility high |
|---|---|---|
| **priority high** | the partner review; the client call | an important meeting you could still shift |
| **priority low** | a fixed-time webinar you don't care about | a friend's coffee catch-up |

Priority answers "what matters?", flexibility answers "who do I bump?".

## `buffer_rule`

```json
{
  "type": "buffer_rule",
  "summary": "Flights get a 1-hour buffer warning on both sides",
  "trigger": { "event_type": "flight" },
  "buffer_before_min": 60,
  "buffer_after_min": 60,
  "severity": "warning",
  "source_text": "When you see a flight, add an hour buffer warning period"
}
```

- `trigger.event_type` must be from the shared vocabulary: `flight, client_meeting, internal_meeting, one_on_one, focus_block, standup, social, other`. The same vocabulary is used by `analyze` when it types events. If the two prompts drift apart, buffer rules silently stop matching.
- `severity: "warning"` shows a flag and lets the user proceed. `"hard"` makes `genCandidates` exclude the slot.
- Code (`computeZones`) turns this into windows. The LLM never does time arithmetic.

## `preference`

```json
{
  "type": "preference",
  "summary": "Avoid meetings before 10am",
  "rule": "avoid meetings before 10:00",
  "strength": "soft",
  "source_text": "I try to avoid meetings before 10am"
}
```

Not enforced by code at all. It's passed to `rank` as text and the LLM weighs it. This is deliberate (the goal is AI-enabled, not rules-based), but it means preferences are only as reliable as the LLM's attention to them.

## `focus_block`, `project`, `other`

Defined in the extraction prompt, no fixtures, nothing reads them yet except as text in prompts.

```json
{ "type": "focus_block", "summary": "Fridays after noon are deep-work time", "day": "Friday", "time": "afternoon", "purpose": "deep work" }
```

## Updates and contradictions

`extract` receives `existing_facts` (id, type, summary) and may return `replace_ids`. The app removes those and adds the new facts. Example: "Actually Jake left the firm" should replace the Jake partner fact. **Not covered by a fixture yet**, only the live prompt handles it.

## Open questions

1. Should facts have **scope or expiry** ("this week only")? Today every fact is permanent until deleted.
2. Should a `person` fact support **aliases** ("Jacob", "J. Smith", an email address)? Matching is by name in text only.
3. Is `strength: soft|strong` enough, or should preferences carry numeric weights?
4. **Groups**: "all clients are high priority" has no schema yet.
5. Where does **confidence** live? The extractor can be wrong. Today the only safety net is the confirmation sentence and the visible fact list.
6. Validate with JSON Schema / zod before saving? Right now a malformed fact would be saved as-is.
