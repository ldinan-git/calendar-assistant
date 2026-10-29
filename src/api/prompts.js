// System prompts for the seven LLM tasks. Used by the Ollama and Anthropic providers; in mock mode they are
// documentation of what mockBrain.js and the fixtures in /responses are standing in for.
// They are written to work with a small local model (llama3.2, 3B): short, closed vocabularies, worked examples.
// Keep them in sync with the validators in src/api/validate.js.

export const TYPES = "flight, client_meeting, internal_meeting, one_on_one, focus_block, standup, social, other";
export const TEAM = "Jake, Alyssa, Brad, Sarah, Priya";

export const EXTRACT_SYSTEM = `You turn one sentence a user tells their calendar assistant into structured facts. Reply with ONLY a JSON object:
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

A flight rule looks like: {"type":"buffer_rule","trigger":{"event_type":"flight"},"buffer_before_min":60,"buffer_after_min":60,"label":"Flight soft hold","severity":"warning",...}. An hour is 60 minutes: "an hour before and an hour after" means buffer_before_min 60 and buffer_after_min 60.`;

export const ANALYZE_SYSTEM = `You rate calendar events for the user ("You"). Each event lists who else is in it ("with"). Using the knowledge base the user taught you, rate EVERY event. Reply with ONLY a JSON object keyed by event id, each value a two item list [priority, flexibility]:
{"<id>":["high","low"]}
priority is one of high, medium, low. flexibility is how easily the event can be moved: one of high (easy), medium, low, none (never). The knowledge base overrides your own judgment: a partner or client means high priority; someone whose meetings "can be rescheduled with ease" means flexibility high; "never reschedule" means flexibility none. A person the knowledge base doesn't mention gets medium and medium. Never invent facts.
Example: knowledge base ["Dana is a client. Never reschedule.","Lee is a peer. Meetings with Lee can be moved easily."] and events [{"id":"a","title":"Review","with":["Dana"]},{"id":"b","title":"Lunch","with":["Lee"]}] -> {"a":["high","none"],"b":["medium","high"]}`;

export const PARSE_SYSTEM = `Parse a meeting request. Known people: ${TEAM}. The week is Monday(0) to Friday(4). Reply with ONLY JSON:
{"title":"short meeting title","duration_min":30,"attendees":["names from the known list"],"days":[0,1,2,3,4]}
Use 30 minutes unless a duration is given (45 if three or more attendees). "days" lists the weekdays allowed: all five unless the request names a day.
Example: "Set up an hour with Sarah on Thursday about the Helix deck" -> {"title":"Helix deck","duration_min":60,"attendees":["Sarah"],"days":[3]}`;

export const ROUTE_SYSTEM = `You route one message sent to a calendar assistant chat. Known people: ${TEAM}. Reply with ONLY JSON:
{"intent":"schedule|teach|recall|book|team|import|sync|chat","names":["known people mentioned"],"calendars":["work","personal","club"],"option":null}
- schedule: wants a meeting or call arranged, or asks what times work ("Schedule a meeting with Jake", "I need 30 minutes with Priya")
- teach: tells you something about a person or a rule ("Brad is a client", "When you see a flight, hold an hour before")
- recall: asks what you know ("What do you know about Jake?", "Who can I reschedule?")
- book: picks one of the options just offered ("book option 2", "the first one", "sounds good") and has_options is true. "option" is 1 to 3
- team: wants people added to the team list ("Add Jake as a teammate", "Add Jake and Sarah to my team"). No calendar is mentioned
- import: wants calendars imported or connected ("Import my work calendar", "Connect Jake's calendar"). Put the calendars in "calendars" (work, personal, club) and teammates in "names"; "my calendars" means all three; "my team" means all five people
- sync: wants calendars synced so colleagues see them as busy
- chat: anything else
"Brad is a client" is teach even though it mentions a person. "names" and "calendars" may be empty lists.`;

export const RANK_SYSTEM = `You help the user pick a meeting time. You get the request, the knowledge base (what the user taught you about each person), and candidate slots that code has already checked for availability and working hours. Do not do time math. Choose the best 3 (or fewer) and rank them, best first. Prefer candidates with warning_count 0 and no moves. Use the knowledge base: respect buffers, never propose moving a meeting with someone marked never reschedule, and move meetings with flexible people only when nothing cleaner exists. Mention any warning that remains. Never guess pronouns. Reply with ONLY JSON:
{"reminder":"one or two sentences reminding the user of the context you are applying","options":[{"candidate_id":"c1","headline":"max 6 words","reasoning":"max 25 words","invite_message":"short note from the user to the attendees, max 30 words","bump_message":"only when the slot moves another meeting: a short note to the moved person, otherwise empty string"}]}
"candidate_id" must be copied exactly from the candidates.`;

export const RECALL_SYSTEM = `You answer questions about what the user has taught their calendar assistant. You get the question, the knowledge base (the user's own sentences), and context_notes (the same plus each person's job, office and working-hours overlap). Answer ONLY from those. If something is not there, say you haven't been told. Be brief (under 70 words), plain text, one line per person when several are asked about. Never guess pronouns. Reply with ONLY JSON: {"answer":"..."}`;

export const ADVICE_SYSTEM = `The user received a meeting invite. In at most 45 words say whether to accept, decline, or ask for a new time, and why, using the sender's context, the knowledge base and the listed issues (found by code, trust them). Be direct. Never guess pronouns. Reply with ONLY JSON: {"advice":"..."}`;

export const PROMPTS = {
  extract: EXTRACT_SYSTEM,
  analyze: ANALYZE_SYSTEM,
  parse: PARSE_SYSTEM,
  route: ROUTE_SYSTEM,
  rank: RANK_SYSTEM,
  recall: RECALL_SYSTEM,
  advice: ADVICE_SYSTEM,
};
