// Facts for the week briefing. Code gathers and counts; a model (or the mock) only turns them into a paragraph.

import { DAYS, fmt, slotLabel } from "./time.js";
import { computeFlags } from "./scheduler.js";

const list = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);

export function briefFacts({ events, analysis, zones, roster, imported, team, unsynced }) {
  const mine = events.filter((e) => !e.pending && e.attendees.includes("You"));
  const flags = computeFlags(mine, zones);
  const rate = (e) => analysis[e.id] || { priority: "medium", flexibility: "medium", type: "other" };

  const conflicts = [];
  mine.forEach((a, i) => mine.slice(i + 1).forEach((b) => a.day === b.day && a.start < b.end && b.start < a.end && conflicts.push(`${a.title} overlaps ${b.title} on ${DAYS[a.day]}`)));

  const flights = mine
    .filter((e) => rate(e).type === "flight")
    .map((e) => `${e.title}, ${slotLabel(e)}`);
  const holdHits = mine.filter((e) => flags[e.id] && flags[e.id].zone && flags[e.id].zone.kind === "flight").map((e) => `${e.title} (${DAYS[e.day]} ${fmt(e.start)})`);

  const important = mine
    .filter((e) => rate(e).priority === "high" && rate(e).type !== "flight" && rate(e).type !== "standup" && e.attendees.some((a) => a !== "You"))
    .slice(0, 6)
    .map((e) => `${e.title}, ${slotLabel(e)}, with ${list(e.attendees.filter((a) => a !== "You"))}`);

  const perDay = DAYS.map((d, i) => ({ d, n: mine.filter((e) => e.day === i).length }));
  const busiest = perDay.reduce((a, b) => (b.n > a.n ? b : a), { d: "", n: -1 });

  const out = [];
  roster.forEach((p) => {
    if (!imported.team[p]) return;
    (team[p].events || []).filter((e) => e.showAs === "oof" && e.end - e.start >= 720).forEach((e) => out.push(`${p} is out of office ${DAYS[e.day]}`));
  });

  return {
    meetings: mine.length,
    busiest_day: busiest.n > 0 ? `${busiest.d} (${busiest.n} events)` : null,
    conflicts,
    flights,
    meetings_inside_flight_holds: holdHits,
    important_meetings: important,
    teammates_out: [...new Set(out)],
    events_colleagues_cannot_see: unsynced,
  };
}
