// "What do I know about these people?" Pure code: joins the knowledge base with the directory profile.
// The same lines go to the user (as the bot's reminder) and to the LLM (as `context_notes`).
//
// The knowledge base is one list of entries: { id, text, facts }. `text` is what the user said, `facts` is the
// structured form the scheduler reads (buffer rules, flexibility, never_reschedule). Everything the LLM is asked
// about context gets the plain `text`.

import { fmt, WORK_START, WORK_END } from "./time.js";
import { withinWorkingHours, tzShort, USER_TZ } from "./tz.js";

export const kbFacts = (kb) => kb.flatMap((e) => e.facts || []);
export const personFact = (facts, name) => facts.find((f) => f.type === "person" && f.name === name);
const mentions = (text, name) => new RegExp(`\\b${name}\\b`, "i").test(text);
export const kbMentions = (kb, name) => kb.filter((e) => mentions(e.text, name));

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

const tidy = (s) => s.replace(/[.\s]+$/, "");

export function profileLine(name, kb, directory) {
  const d = directory[name];
  const said = kbMentions(kb, name).map((e) => tidy(e.text));
  const parts = [...said];
  if (d) {
    const where = d.office ? `${d.office} (${tzShort(d.tz)})` : tzShort(d.tz);
    const w = overlapWindow(d);
    if (!d.fromCalendar && !d.fromContext) {
      parts.push("no calendar added yet, so I assume they keep your hours");
    } else if (!w) {
      parts.push(`${where}: no overlap with your working hours${d.fromContext ? "" : ". If their real hours differ from their calendar settings, tell me"}`);
    } else if (w.start > WORK_START || w.end < WORK_END) {
      parts.push(`${where}: only ${fmt(w.start)} to ${fmt(w.end)} CT overlaps your day`);
    } else if (d.tz !== USER_TZ) {
      parts.push(where);
    } else if (!said.length && (d.title || d.office)) {
      parts.push([d.title, d.office].filter(Boolean).join(", "));
    }
  }
  if (!said.length) parts.push("I haven't been told how to treat their meetings yet");
  return { name, text: [...new Set(parts)].join(". ") };
}

export const contextNotes = (names, kb, directory) => names.map((n) => profileLine(n, kb, directory));

export function flightRuleNote(facts) {
  const r = facts.find((f) => f.type === "buffer_rule" && f.trigger && f.trigger.event_type === "flight");
  if (!r) return null;
  const b = r.buffer_before_min || 0;
  const a = r.buffer_after_min || 0;
  return `Your flights: hold ${b} min before${a ? ` and ${a} min after` : ""}`;
}

/** Same person/rule taught twice: the newer fact replaces the older one. */
export const factKey = (f) =>
  f.type === "person" ? `person:${f.name}` : f.type === "buffer_rule" ? `rule:${JSON.stringify(f.trigger)}` : `${f.type}:${f.summary}`;

/* ------------------------------ who the teammates are, as far as we know ------------------------------ */
const DEFAULT_HOURS = { tz: USER_TZ, days: [1, 2, 3, 4, 5], start: WORK_START, end: WORK_END };
const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/**
 * Profile of every teammate on the roster, built from two sources that can disagree:
 *   the imported calendar (job title, office, time zone and working hours from Outlook's mailbox settings), and
 *   what the user taught (`location`, `timezone`, `working_hours` on the person fact).
 * Teaching wins: calendars are often wrong about real working patterns (a default 9 to 6 nobody changed).
 * With neither, a teammate is assumed to keep the user's own hours.
 */
export function effectiveDirectory(roster, calendarImported, facts, base) {
  const out = {};
  roster.forEach((name) => {
    const b = calendarImported[name] ? base[name] : null;
    const f = personFact(facts, name) || {};
    const wh = f.working_hours;
    out[name] = {
      name,
      title: (b && b.title) || (f.attributes && f.attributes.role) || "",
      office: (b && b.office) || f.location || "",
      tz: f.timezone || (b && b.tz) || (wh && wh.timezone) || USER_TZ,
      hours: wh ? { tz: wh.timezone, days: [1, 2, 3, 4, 5], start: toMin(wh.start), end: toMin(wh.end) } : b ? b.hours : DEFAULT_HOURS,
      fromCalendar: !!b,
      fromContext: !!wh,
    };
  });
  return out;
}
