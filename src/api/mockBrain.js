// Mock "LLM" for the tasks that take free-form input: analyze, parse, route, recall, rank, advice.
//
// A fixture file can only answer inputs you predicted. These tasks see arbitrary calendars, sentences and
// candidate slots, so in mock mode they're answered by small deterministic functions that produce the same
// JSON shape the live prompts ask for. They are intentionally simple and don't try to be smart: the point is
// that the UI, the trace and the data flow behave exactly as they will with a real model.
// `extract` (teaching) is still answered by hand-authored fixtures in /responses/extract.
//
// These functions are also the fallback when a real model's answer is unusable (see llm.js), and
// routeEntities() is used even with a real model: code, not the model, reads names and calendars from text.

const RANK = { none: 0, low: 1, medium: 2, high: 3 };
const maxOf = (a, b) => (RANK[a] >= RANK[b] ? a : b);
const minOf = (a, b) => (RANK[a] <= RANK[b] ? a : b);

/* ------------------------------ analyze ------------------------------ */
const FLIGHT_TITLE = /^[A-Z]{2}\s?\d{2,4}\b/;

const BASE = {
  flight: ["high", "none"],
  client_meeting: ["high", "low"],
  standup: ["low", "low"],
  one_on_one: ["medium", "medium"],
  focus_block: ["medium", "high"],
  social: ["low", "high"],
  internal_meeting: ["medium", "medium"],
  other: ["low", "medium"],
};

function typeOf(e, isClient) {
  if ((e.categories || []).includes("Flights") || FLIGHT_TITLE.test(e.title)) return "flight";
  if (/standup/i.test(e.title)) return "standup";
  if (/^(focus|deep work)/i.test(e.title)) return "focus_block";
  if (/lunch|coffee|dinner|speaker/i.test(e.title)) return "social";
  if (/dentist|gym|tour/i.test(e.title)) return "other";
  const others = e.attendees.filter((a) => a !== "You");
  if (others.some(isClient)) return "client_meeting";
  if (others.length === 1 && /1:1/.test(e.title)) return "one_on_one";
  return "internal_meeting";
}

export function mockAnalyze({ taught_facts = [], people = {}, events = [] }) {
  const facts = taught_facts.filter((f) => f && f.type === "person" && f.name);
  const fact = (n) => facts.find((f) => f.name === n);
  const isClient = (n) => {
    const f = fact(n);
    if (f) return /client/i.test(JSON.stringify(f.attributes || {}) + f.summary);
    return people[n] && /client/i.test(people[n].title || "");
  };
  const out = {};
  events.forEach((e) => {
    const type = typeOf(e, isClient);
    let [priority, flexibility] = BASE[type];
    const others = e.attendees.filter((a) => a !== "You");
    const withFacts = others.map(fact).filter(Boolean);
    let reason = `Default for ${type.replace(/_/g, " ")}`;
    withFacts.forEach((f) => {
      if (f.priority) priority = maxOf(priority, f.priority);
    });
    if (withFacts.length) {
      const flex = withFacts.map((f) => (f.never_reschedule ? "none" : f.flexibility || "medium")).reduce(minOf);
      flexibility = withFacts.length === others.length ? flex : minOf(flexibility, flex);
      const lead = withFacts.find((f) => (f.never_reschedule ? "none" : f.flexibility) === flex) || withFacts[0];
      const role = (lead.attributes && lead.attributes.role) || "contact";
      reason = lead.never_reschedule ? `${lead.name} is a ${role}, never reschedule` : `${lead.name} (${role}), flexibility ${lead.flexibility || "medium"}`;
    }
    if (type === "flight") {
      flexibility = "none";
      reason = "Flight: fixed";
    }
    out[e.id] = { priority, flexibility, type, reason };
  });
  return out;
}

/* ------------------------------ parse ------------------------------ */
const DAY_WORDS = { monday: 0, mon: 0, tuesday: 1, tue: 1, tues: 1, wednesday: 2, wed: 2, thursday: 3, thu: 3, thur: 3, thurs: 3, friday: 4, fri: 4 };

const nameIn = (lower, name) => new RegExp(`\\b${name.toLowerCase()}\\b`).test(lower);
const joinNames = (n) => (n.length <= 1 ? n.join("") : n.slice(0, -1).join(", ") + " & " + n[n.length - 1]);

export function mockParse({ text, people }) {
  const lower = text.toLowerCase();
  const attendees = people.filter((p) => nameIn(lower, p));
  let dur = null;
  let m;
  if ((m = lower.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/))) dur = Math.round(Number(m[1]) * 60);
  else if ((m = lower.match(/(\d+)\s*(?:minutes?|mins?)\b/))) dur = Number(m[1]);
  else if (/half an hour|half hour/.test(lower)) dur = 30;
  else if (/\b(an|one) hour\b/.test(lower)) dur = 60;
  else if (/\bquick\b/.test(lower)) dur = 15;
  const days = [...new Set(Object.entries(DAY_WORDS).filter(([w]) => new RegExp(`\\b${w}\\b`).test(lower)).map(([, d]) => d))].sort();
  const t = text.match(/\b(?:about|regarding|re:)\s+(.+?)\s*[.?!]*$/i) || text.match(/\bfor\s+(?!\d)([A-Za-z][^.?!]*?)\s*[.?!]*$/i);
  const title = t ? t[1].replace(/^(a|the)\s+/i, "").replace(/\s+(this|next) week$/i, "").replace(/^./, (c) => c.toUpperCase()) : attendees.length ? `Sync with ${joinNames(attendees)}` : "Meeting";
  return {
    title,
    duration_min: dur || (attendees.length >= 3 ? 45 : 30),
    attendees,
    days: days.length ? days : [0, 1, 2, 3, 4],
  };
}

/* ------------------------------ route (what does the user want?) ------------------------------ */
const CAL_WORDS = [
  ["cal-work", /\b(work|firm|office)\b/],
  ["cal-personal", /\b(personal|outlook\.com|home)\b/],
  ["cal-org", /\b(club|org|organi[sz]ation|school|consulting club)\b/],
];

const teachLike = (l, people) => {
  const startsWithName = new RegExp(`^(${people.join("|")})\\b`, "i").test(l);
  const declarative = /(\bis\b|\bare\b|'s\b|\bnever\b|\balways\b|\bkeep\b|\bprefers?\b)/.test(l) && !/\?/.test(l);
  return (startsWithName && declarative) || /when you see|^i (try|prefer|like|don'?t|never|always)\b|\bnever reschedule\b/.test(l);
};

/** Names, calendars and option numbers come from the text itself, by code. A model only decides the intent. */
export function routeEntities(text, people) {
  const l = text.toLowerCase();
  const names = people.filter((p) => nameIn(l, p));
  let calendars = CAL_WORDS.filter(([, re]) => re.test(l)).map(([id]) => id);
  if (!calendars.length && /\b(my|all)\b.*\bcalendars\b/.test(l)) calendars = CAL_WORDS.map(([id]) => id);
  const everyone = /\b(teammates|team|everyone|everybody|all of them)\b/.test(l);
  const optMatch = l.match(/\b(?:option|number|#)\s*(\d)\b/) || l.match(/\b(first|second|third|1st|2nd|3rd|best|top)\b/);
  const option = optMatch ? ({ first: 1, "1st": 1, best: 1, top: 1, second: 2, "2nd": 2, third: 3, "3rd": 3 }[optMatch[1]] || Number(optMatch[1])) : null;
  return { names, calendars, option, importNames: everyone && !names.length ? people : names };
}

export function mockRoute({ text, people, has_options }) {
  const l = text.toLowerCase().trim();
  const { names, calendars, option, importNames } = routeEntities(text, people);

  // several lines pasted at once, all of them statements about people or rules: teaching
  const lines = text.split(/\n+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (lines.length > 1 && lines.every((x) => teachLike(x, people))) return { intent: "teach", names };

  // adding people to the team list is separate from adding their calendars
  if (/\b(add|invite)\b/.test(l) && /\b(teammates?|team members?|to my team|to the team|my team)\b/.test(l) && !/\bcalendars?\b/.test(l)) return { intent: "team", names: importNames };
  if (/\b(import|connect|bring in|load|add)\b/.test(l) && /\b(calendars?|teammates?|team|everyone|everybody)\b/.test(l)) return { intent: "import", calendars, names: importNames };
  if (/\b(fix|resolve|clean up|sort out|deal with)\b.*\b(conflicts?|double.?book\w*|overlaps?|clashes?)\b|\bwhat conflicts\b|\bany conflicts\b/.test(l)) return { intent: "resolve", names };
  if (/\b(brief me|briefing|summari[sz]e my|overview of my|how('s| is) my week|what does my week look like)\b/.test(l)) return { intent: "brief", names };
  if (/\b(sync|mirror)\b/.test(l)) return { intent: "sync", names };
  if (/what do you (know|remember)|tell me about|who is|who are|remind me|what('s| is) the context|what have i told you|who should|which of (my|the)/.test(l)) return { intent: "recall", names };
  if (teachLike(l, people)) return { intent: "teach", names };
  if (has_options && (option || /^(yes|yep|yeah|sure|perfect|confirm)\b|\b(do it|book it|book that|go ahead|looks good|sounds good|that works)\b/.test(l))) return { intent: "book", option: option || 1, names };
  if (/\b(schedule|set up|setup|find|book|need|get|arrange|plan|want|what times|when can|when are|meet|meeting|call|catch up|lunch|coffee)\b/.test(l) && (names.length || /meeting/.test(l))) return { intent: "schedule", names };
  return { intent: "chat", names };
}

/* ------------------------------ recall (ask the knowledge base) ------------------------------ */
export function mockRecall({ knowledge_base = [], context_notes = [] }) {
  if (!knowledge_base.length && !context_notes.length) return { answer: "I haven't been taught anything yet. Tell me who is who, or how you like your calendar handled." };
  if (context_notes.length) return { answer: context_notes.map((n) => `${n.name}: ${n.text}.`).join("\n") };
  return { answer: "Here is everything you've told me:\n" + knowledge_base.map((t) => `- ${t}`).join("\n") };
}

/* ------------------------------ brief (week briefing) ------------------------------ */
export function mockBrief({ facts: f }) {
  const s = [];
  if (!f.meetings) return { brief: "Your calendar is empty. Connect a calendar and I'll brief you." };
  s.push(`You have ${f.meetings} events this week${f.busiest_day ? `, busiest on ${f.busiest_day}` : ""}.`);
  if (f.conflicts.length) s.push(`${f.conflicts.length} of them clash: ${list(f.conflicts.slice(0, 3))}${f.conflicts.length > 3 ? ", and more" : ""}. I can fix these.`);
  else s.push("Nothing overlaps.");
  if (f.flights.length) s.push(`You're flying: ${list(f.flights)}.`);
  if (f.meetings_inside_flight_holds.length) s.push(`${list(f.meetings_inside_flight_holds)} sits inside a flight's soft hold.`);
  if (f.important_meetings.length) s.push(`Most important: ${list(f.important_meetings.slice(0, 3))}.`);
  if (f.teammates_out.length) s.push(`${list(f.teammates_out)}.`);
  if (f.events_colleagues_cannot_see) s.push(`${f.events_colleagues_cannot_see} of your events are invisible to colleagues until you sync.`);
  return { brief: s.join(" ") };
}

/* ------------------------------ rank ------------------------------ */
const list = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);

/** Plain-language reasoning built only from facts code already computed. Also used to replace model text that cites numbers it wasn't given. */
export function mockReasoning(c) {
  const bits = [];
  if (c.warning_count === 0 && c.moves.length === 0) bits.push("Everyone is free and inside working hours");
  c.callout_texts.filter((t) => /^Inside your|travelling|Only \d+ min/.test(t)).forEach((t) => bits.push(t));
  if (c.back_to_back) bits.push("it runs back-to-back with another meeting of yours");
  c.moves.forEach((m) => bits.push(`moving ${m.title} costs little${m.why_flexible ? ` (${m.why_flexible})` : ""}`));
  const tz = Object.entries(c.local_times || {}).map(([n, t]) => `${n} ${t}`);
  if (tz.length) bits.push(`local time: ${list(tz)}`);
  const first = bits[0].charAt(0).toUpperCase() + bits[0].slice(1);
  return [first, ...bits.slice(1)].join("; ") + ".";
}

export function mockRank({ meeting, candidates, context_notes = [] }) {
  const scored = candidates
    .map((c, i) => ({ c, i, cost: c.warning_count * 2 + c.moves.length * 3 + i * 0.01 }))
    .sort((a, b) => a.cost - b.cost);
  const picked = [];
  const days = new Set();
  scored.forEach((s) => {
    const d = s.c.when.slice(0, 3);
    if (picked.length < 3 && !days.has(d)) {
      picked.push(s);
      days.add(d);
    }
  });
  scored.forEach((s) => picked.length < 3 && !picked.includes(s) && picked.push(s));

  const others = meeting.attendees;
  const options = picked.map(({ c }, idx) => {
    const reasoning = mockReasoning(c);
    const who = list(others) || "you";
    const bump = c.moves[0];
    return {
      candidate_id: c.id,
      headline: idx === 0 ? (c.warning_count || c.moves.length ? "Best of a tight week" : "Cleanest option") : c.moves.length ? "Works if one meeting moves" : c.warning_count ? "Works with a caveat" : "Solid backup",
      reasoning,
      invite_message: `Hi ${who}, could we meet for ${meeting.title} on ${c.when}? I'll send the video link with the invite.`,
      bump_message: bump ? `Hi${bump.with.length ? " " + list(bump.with) : ""}, could we move ${bump.title} to ${bump.moves_to}? I need the original slot for ${meeting.title}. Thank you!` : "",
    };
  });
  const reminder = context_notes.length ? `Here is what I'm applying for ${meeting.title}, then my top picks.` : "";
  return { reminder, options };
}

/* ------------------------------ advice (incoming invite) ------------------------------ */
export function mockAdvice({ invite, issues = [], conflicting_meetings = [], sender_context }) {
  const ctx = (sender_context && sender_context.text) || "";
  const client = /client/i.test(ctx);
  const never = /never/i.test(ctx);
  const hold = issues.find((i) => /^Inside your/.test(i));
  const overlap = issues.find((i) => /^Overlaps/.test(i));
  const b2b = issues.find((i) => /^Back-to-back/.test(i));
  const flexible = conflicting_meetings.find((c) => c.rating && (c.rating.flexibility === "high" || c.rating.flexibility === "medium"));
  if (!issues.length) return { advice: "Accept. Nothing conflicts and no rules are in play." };
  const parts = [];
  if (client || never) parts.push(`${invite.from} is a client and you don't move their meetings, so accept`);
  else parts.push("Accept only if you can fix the issues below");
  if (overlap && flexible) parts.push(`Move ${conflicting_meetings[0].title}, which is flexible`);
  else if (overlap) parts.push(`${overlap}, so ask for a new time`);
  if (hold) parts.push(`${hold.replace("Inside your ", "It lands inside your ")}, so check you can still make the flight`);
  if (b2b && !hold) parts.push(`${b2b}, so build in a short gap`);
  return { advice: parts.join(". ") + "." };
}

export function mockTask(task, input) {
  switch (task) {
    case "analyze": return mockAnalyze(input);
    case "parse": return mockParse(input);
    case "route": return mockRoute(input);
    case "recall": return mockRecall(input);
    case "brief": return mockBrief(input);
    case "rank": return mockRank(input);
    case "advice": return mockAdvice(input);
    default: throw new Error(`mockBrain: unknown task ${task}`);
  }
}
