// The agent's "fix my calendar" logic. Pure code: which of two clashing events to keep, where to move the other,
// and who needs to be told. The model's taught facts decide the rating (priority, flexibility) that this reads;
// the decision itself is arithmetic and is tested.
//
// Two kinds of problem are handled:
//   conflict  two events overlap (often across different calendars: work, personal, club)
//   hold      a meeting sits inside a flight's soft hold

import { findReplacement, overlaps, computeFlags } from "./scheduler.js";
import { slotLabel } from "./time.js";

const LEVEL = { none: 0, low: 1, medium: 2, high: 3 };
const list = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);

const rating = (analysis, e) => analysis[e.id] || { priority: "medium", flexibility: "medium", type: "other", reason: "" };
const movable = (analysis, e) => {
  const r = rating(analysis, e);
  return r.flexibility !== "none" && r.type !== "flight";
};
/** Higher = keep. Priority first, then how hard it is to move, then how many people it affects. */
const keepScore = (analysis, e) => {
  const r = rating(analysis, e);
  return LEVEL[r.priority] * 100 + (3 - LEVEL[r.flexibility]) * 10 + Math.min(e.attendees.length, 9);
};

const CAL_NAME = { "cal-work": "work", "cal-personal": "personal", "cal-org": "club" };

function build({ keep, move, newSlot, analysis, kind }) {
  const others = move.attendees.filter((a) => a !== "You");
  const kr = rating(analysis, keep);
  const mr = rating(analysis, move);
  // quote the rating's reason only when it says something (a taught fact), not the generic default
  const said = (r) => (r.reason && !/^Default for/.test(r.reason) ? ` (${r.reason})` : "");
  const why =
    kind === "hold"
      ? `${move.title} sits inside the flight soft hold, and a flight can't move`
      : `Keeping ${keep.title}${said(kr)}. ${move.title} is easier to move${said(mr)}`;
  const from = slotLabel(move);
  const to = newSlot ? slotLabel(newSlot) : null;
  return {
    id: `${kind}:${move.id}`,
    kind,
    keep: { id: keep.id, title: keep.title, when: slotLabel(keep), calendar: CAL_NAME[keep.calendar] },
    move: { id: move.id, title: move.title, from, calendar: CAL_NAME[move.calendar], with: others },
    newSlot,
    to,
    reason: why,
    note: others.length && newSlot ? `Hi ${list(others)}, I have a conflict at ${from}. Could we move ${move.title} to ${to}? Thank you.` : "",
    canApply: !!newSlot,
  };
}

/**
 * Propose fixes for every overlap and every flight-hold hit. Planning is sequential: each move is planned against
 * the calendar as it will look after the earlier moves, so two fixes never land on the same slot.
 */
export function proposeFixes({ events, analysis, zones, otherBusy, directory }) {
  const mine = events.filter((e) => !e.pending && e.attendees.includes("You"));
  let plan = mine.map((e) => ({ ...e }));
  const moved = new Set();
  const proposals = [];

  const pairs = [];
  mine.forEach((a, i) => mine.slice(i + 1).forEach((b) => overlaps(a, b) && pairs.push([a, b])));
  pairs.sort((x, y) => x[0].day - y[0].day || x[0].start - y[0].start);

  const place = (move, keep, kind) => {
    const current = plan.find((e) => e.id === move.id);
    const slot = findReplacement(current, keep, plan, zones, otherBusy, directory);
    proposals.push(build({ keep, move, newSlot: slot, analysis, kind }));
    if (slot) {
      plan = plan.map((e) => (e.id === move.id ? { ...e, ...slot } : e));
      moved.add(move.id);
    }
  };

  pairs.forEach(([a, b]) => {
    if (moved.has(a.id) || moved.has(b.id)) return;
    let keep = keepScore(analysis, a) >= keepScore(analysis, b) ? a : b;
    let move = keep === a ? b : a;
    if (!movable(analysis, move) && movable(analysis, keep)) [keep, move] = [move, keep];
    if (!movable(analysis, move)) {
      proposals.push({ id: `stuck:${a.id}:${b.id}`, kind: "conflict", keep: { id: a.id, title: a.title, when: slotLabel(a) }, move: { id: b.id, title: b.title, from: slotLabel(b), with: [] }, newSlot: null, to: null, reason: `${a.title} and ${b.title} overlap and neither can move. This one needs you.`, note: "", canApply: false });
      return;
    }
    place(move, keep, "conflict");
  });

  // meetings inside a flight's soft hold
  const flags = computeFlags(plan, zones);
  plan.forEach((e) => {
    const f = flags[e.id];
    if (!f || !f.zone || f.zone.kind !== "flight" || moved.has(e.id) || !movable(analysis, e)) return;
    const flight = plan.find((x) => x.id === f.zone.eventId);
    if (flight) place(e, flight, "hold");
  });
  return proposals;
}
