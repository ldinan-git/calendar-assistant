// Code-side guardrails on whatever rated the calendar (a model or the mock).
// Code owns facts: an Outlook "Flights" category is a flight, and a person the user said never to reschedule
// is never flexible, whatever a small model decided.

import { personFact } from "./context.js";

export function guard(ev, rating, facts) {
  const r = { priority: "medium", flexibility: "medium", type: "other", reason: "", ...rating };
  if ((ev.categories || []).includes("Flights")) {
    r.type = "flight";
    r.flexibility = "none";
    r.reason = r.reason || "Flight: fixed";
  }
  const never = ev.attendees.filter((a) => a !== "You").find((n) => (personFact(facts, n) || {}).never_reschedule);
  if (never) {
    r.flexibility = "none";
    r.priority = "high";
    r.reason = `${never} is never rescheduled`;
  }
  return r;
}

/** Key that changes when a rating could change: the event itself, its notes, or anything taught. */
export const ratingKey = (ev, notes, factsKey) => `${ev.title}|${ev.day}|${ev.start}|${ev.end}|${ev.attendees.join(",")}|${notes || ""}|${factsKey}`;
