// Shape checks for LLM output. A small local model will sometimes return valid JSON in the wrong shape,
// so every task's output is cleaned here before the app touches it. `check(task, out, input)` returns a
// cleaned object or throws; llm.js then retries once and finally falls back to the mock for that call.

import { TYPES, TEAM } from "./prompts.js";
import { routeEntities } from "./mockBrain.js";

const TYPE_LIST = TYPES.split(", ");
const PEOPLE = TEAM.split(", ");
const LEVELS = ["high", "medium", "low"];
const FACT_TYPES = ["person", "preference", "focus_block", "buffer_rule", "project", "other"];

const str = (v, d = "") => (typeof v === "string" ? v : d);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const lvl = (v, allowNone = false) => {
  const s = str(v).toLowerCase();
  return LEVELS.includes(s) || (allowNone && s === "none") ? s : null;
};
const TZ_ALIAS = {
  et: "America/New_York", est: "America/New_York", edt: "America/New_York", eastern: "America/New_York",
  ct: "America/Chicago", cst: "America/Chicago", central: "America/Chicago",
  pt: "America/Los_Angeles", pst: "America/Los_Angeles", pacific: "America/Los_Angeles",
  ist: "Asia/Kolkata", india: "Asia/Kolkata",
};
const tzOf = (v) => {
  const s = str(v).trim();
  if (TZ_ALIAS[s.toLowerCase()]) return TZ_ALIAS[s.toLowerCase()];
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: s });
    return s;
  } catch {
    return null;
  }
};
const hhmm = (v) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str(v).trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
};
/**
 * Code owns numbers. A small model will turn "an hour before and an hour after" into 120 and 120. When the
 * user's own sentence states one amount ("an hour", "30 minutes", "2 hours") and which side it applies to,
 * the buffer minutes are read from the sentence instead of trusted from the model.
 */
export function sayMinutes(text, rule) {
  const t = str(text).toLowerCase();
  let amt = null;
  let m;
  if (/half an hour|half hour/.test(t)) amt = 30;
  else if ((m = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/.exec(t))) amt = Math.round(Number(m[1]) * 60);
  else if ((m = /\b(?:an|one|1)\s*hour\b/.exec(t))) amt = 60;
  else if ((m = /(\d+)\s*(?:minutes?|mins?)\b/.exec(t))) amt = Number(m[1]);
  if (!amt) return;
  const both = /\b(around|each side|each way|either side|both sides|both ways|before and after|before and an? )/.test(t);
  const before = /\bbefore\b/.test(t);
  const after = /\bafter\b/.test(t);
  if (both || (before && after)) {
    rule.buffer_before_min = amt;
    rule.buffer_after_min = amt;
  } else if (before) {
    rule.buffer_before_min = amt;
    rule.buffer_after_min = 0;
  } else if (after) {
    rule.buffer_before_min = 0;
    rule.buffer_after_min = amt;
  }
}

const fail = (msg) => {
  throw new Error("invalid model output: " + msg);
};

function checkExtract(out, input = {}) {
  if (!out || !Array.isArray(out.facts)) fail("extract needs a facts array");
  const facts = out.facts
    .filter((f) => f && FACT_TYPES.includes(f.type))
    .map((f) => {
      const g = { ...f, summary: str(f.summary) || str(f.source_text), source_text: str(f.source_text) };
      if (g.type === "person") {
        if (!str(g.name)) return null;
        g.priority = lvl(g.priority) || "medium";
        g.flexibility = lvl(g.flexibility) || "medium";
        if (g.never_reschedule !== true) delete g.never_reschedule;
        else g.priority = "high"; // someone you never reschedule is, by definition, not low priority
        g.attributes = g.attributes && typeof g.attributes === "object" ? g.attributes : {};
        // where they are and when they actually work: keep only what parses, so a bad guess can't poison scheduling
        const wh = g.working_hours;
        const st = wh && hhmm(wh.start);
        const en = wh && hhmm(wh.end);
        const wtz = wh && tzOf(wh.timezone);
        if (st && en && wtz && st < en) g.working_hours = { start: st, end: en, timezone: wtz };
        else delete g.working_hours;
        const ptz = g.timezone && tzOf(g.timezone);
        if (ptz) g.timezone = ptz;
        else delete g.timezone;
        if (typeof g.location !== "string") delete g.location;
      }
      if (g.type === "buffer_rule") {
        const t = g.trigger || {};
        if (!t.event_type && !t.attendee) return null;
        g.buffer_before_min = num(g.buffer_before_min) ?? 0;
        g.buffer_after_min = num(g.buffer_after_min) ?? 0;
        sayMinutes(input.user_message, g);
        if (!g.buffer_before_min && !g.buffer_after_min) return null;
        g.severity = g.severity === "hard" ? "hard" : "warning";
      }
      return g;
    })
    .filter(Boolean);
  if (!facts.length) fail("no usable facts");
  return { facts, replace_ids: Array.isArray(out.replace_ids) ? out.replace_ids : [], confirmation: str(out.confirmation, "Saved.") };
}

function checkAnalyze(out, input) {
  if (!out || typeof out !== "object") fail("analyze needs an object");
  const res = {};
  input.events.forEach((e) => {
    const r = out[e.id];
    if (!r || typeof r !== "object") return;
    // compact form ["high","low"] or object form {priority, flexibility}
    const [p, f] = Array.isArray(r) ? r : [r.priority, r.flexibility];
    const priority = lvl(p);
    const flexibility = lvl(f, true);
    if (!priority || !flexibility) return;
    res[e.id] = { priority, flexibility };
  });
  if (!Object.keys(res).length) fail("analyze rated nothing");
  return res; // events the model skipped are left out; the caller fills them in
}

function checkParse(out) {
  if (!out || typeof out !== "object") fail("parse needs an object");
  const attendees = (Array.isArray(out.attendees) ? out.attendees : []).map((a) => PEOPLE.find((p) => p.toLowerCase() === str(a).trim().toLowerCase())).filter(Boolean);
  const days = (Array.isArray(out.days) ? out.days : []).map(num).filter((d) => d !== null && d >= 0 && d <= 4);
  return {
    title: str(out.title, "Meeting") || "Meeting",
    duration_min: num(out.duration_min) >= 10 && num(out.duration_min) <= 240 ? num(out.duration_min) : 30,
    attendees: [...new Set(attendees)],
    days: days.length ? [...new Set(days)] : [0, 1, 2, 3, 4],
  };
}

const INTENTS = ["schedule", "teach", "recall", "book", "team", "import", "sync", "resolve", "brief", "chat"];
function checkRoute(out, input) {
  if (!out || !INTENTS.includes(out.intent)) fail("unknown intent");
  // the model only decides the intent; names, calendars and option numbers are read from the text by code
  const e = routeEntities(input.text, PEOPLE);
  const intent = out.intent === "book" && !input.has_options ? "chat" : out.intent;
  const option = e.option || ([1, 2, 3].includes(num(out.option)) ? num(out.option) : null);
  return { intent, names: intent === "import" ? e.importNames : e.names, calendars: e.calendars, option };
}

function checkRank(out, input) {
  if (!out || !Array.isArray(out.options)) fail("rank needs options");
  const ids = new Set(input.candidates.map((c) => c.id));
  const seen = new Set();
  const options = out.options
    .filter((o) => o && ids.has(o.candidate_id) && !seen.has(o.candidate_id) && seen.add(o.candidate_id))
    .map((o) => ({
      candidate_id: o.candidate_id,
      headline: str(o.headline, "Option"),
      reasoning: str(o.reasoning, ""),
      invite_message: str(o.invite_message, ""),
      bump_message: str(o.bump_message, ""),
    }));
  if (!options.length) fail("no option referred to a real candidate");
  return { reminder: str(out.reminder), options: options.slice(0, 3) };
}

const checkRecall = (out) => (out && str(out.answer).trim() ? { answer: out.answer.trim() } : fail("recall needs an answer"));
const checkBrief = (out) => (out && str(out.brief).trim() ? { brief: out.brief.trim() } : fail("brief needs text"));
const checkAdvice = (out) => (out && str(out.advice).trim() ? { advice: out.advice.trim() } : fail("advice needs text"));

export function check(task, out, input) {
  switch (task) {
    case "extract": return checkExtract(out, input);
    case "analyze": return checkAnalyze(out, input);
    case "parse": return checkParse(out);
    case "route": return checkRoute(out, input);
    case "rank": return checkRank(out, input);
    case "recall": return checkRecall(out);
    case "advice": return checkAdvice(out);
    case "brief": return checkBrief(out);
    default: return out;
  }
}
