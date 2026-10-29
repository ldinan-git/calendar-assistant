// "What do I know about these people?" Pure code: joins taught facts with the directory profile.
// The same lines go to the user (as the bot's reminder) and to the LLM (as `context_notes`).

import { fmt, WORK_START, WORK_END } from "./time.js";
import { withinWorkingHours, tzShort, USER_TZ } from "./tz.js";

export const personFact = (facts, name) => facts.find((f) => f.type === "person" && f.name === name);
export const bufferFacts = (facts, name) => facts.filter((f) => f.type === "buffer_rule" && f.trigger && f.trigger.attendee === name);

/** "9:00 AM to 11:00 AM CT": when this person's working hours overlap the user's 9 to 5, or null if they never do. */
export function overlapWindow(person) {
  if (!person) return null;
  let lo = null;
  let hi = null;
  for (let m = WORK_START; m < WORK_END; m += 30) {
    if (withinWorkingHours(person.hours, 2, m, m + 30)) {
      if (lo === null) lo = m;
      hi = m + 30;
    }
  }
  return lo === null ? null : { start: lo, end: hi };
}

export function profileLine(name, facts, directory) {
  const f = personFact(facts, name);
  const d = directory[name];
  const parts = [];
  if (f) parts.push(f.summary || f.source_text);
  bufferFacts(facts, name).forEach((b) => parts.push(b.summary || `buffer ${b.buffer_before_min || 0}/${b.buffer_after_min || 0} min`));
  if (d && d.tz !== USER_TZ) {
    const w = overlapWindow(d);
    const narrow = !w || w.start > WORK_START || w.end < WORK_END;
    parts.push(
      !w
        ? `${d.office} (${tzShort(d.tz)}): no overlap with your working hours`
        : narrow
          ? `${d.office} (${tzShort(d.tz)}): only ${fmt(w.start)} to ${fmt(w.end)} CT overlaps your day`
          : `${d.office} (${tzShort(d.tz)})`
    );
  } else if (d && d.tz === USER_TZ && f == null) {
    parts.push(`${d.title}, ${d.office}`);
  }
  if (!f) parts.push("you haven't told me how to treat their meetings yet");
  return { name, text: [...new Set(parts)].map((p) => p.replace(/[.\s]+$/, "")).join(". ") };
}

export const contextNotes = (names, facts, directory) => names.map((n) => profileLine(n, facts, directory));

export function flightRuleNote(facts) {
  const r = facts.find((f) => f.type === "buffer_rule" && f.trigger && f.trigger.event_type === "flight");
  return r ? `Your flights: hold ${r.buffer_before_min || 0} min before departure` : null;
}
