// Pure scheduling logic. No React, no LLM calls.
// Rule of thumb for this repo: code owns facts and time math, the LLM owns judgment.

import { WORK_START, WORK_END } from "./time.js";

export const overlaps = (a, b) => a.day === b.day && a.start < b.end && b.start < a.end;

/** All busy intervals for a person: events they attend + free/busy blocks from their own calendar. */
export function busyList(person, events, otherBusy, ignore = new Set()) {
  const list = events
    .filter((e) => !e.pending && !ignore.has(e.id) && e.attendees.includes(person))
    .map((e) => ({ day: e.day, start: e.start, end: e.end, ev: e }));
  (otherBusy[person] || []).forEach((b) => list.push({ ...b, ev: null }));
  return list;
}

/**
 * Expand buffer rules (taught facts of type buffer_rule) into time windows.
 * The LLM supplies `analysis[eventId].type` (e.g. "flight"); code does the window math.
 */
export function computeZones(events, facts, analysis) {
  const rules = facts.filter((f) => f.type === "buffer_rule" && f.trigger && f.trigger.event_type);
  const zones = [];
  rules.forEach((r) => {
    events.forEach((e) => {
      if (e.pending) return;
      const type = analysis[e.id] && analysis[e.id].type;
      if (type && type.toLowerCase() === String(r.trigger.event_type).toLowerCase()) {
        zones.push({
          ruleId: r.id,
          eventId: e.id,
          title: e.title,
          day: e.day,
          start: Math.max(e.start - (r.buffer_before_min || 0), 0),
          end: e.end + (r.buffer_after_min || 0),
          severity: r.severity || "warning",
        });
      }
    });
  });
  return zones;
}

/** Per-event flags for the user's calendar: overlaps, back-to-backs (<15 min gap), buffer zone hits. */
export function computeFlags(events, zones) {
  const mine = events.filter((e) => e.attendees.includes("You"));
  const flags = {};
  mine.forEach((e) => {
    const f = { conflict: [], b2bWith: [], zone: null };
    mine.forEach((o) => {
      if (o.id === e.id) return;
      if (overlaps(e, o)) f.conflict.push(o);
      else if (o.day === e.day) {
        const gap = o.start >= e.end ? o.start - e.end : e.start - o.end;
        if (gap < 15) f.b2bWith.push(o);
      }
    });
    f.zone = zones.find((z) => z.eventId !== e.id && z.day === e.day && e.start < z.end && z.start < e.end) || null;
    flags[e.id] = f;
  });
  return flags;
}

/** Deduplicated list of human-readable issues for the "Heads-up" panel. */
export function summarizeIssues(events, flags, dayNames) {
  const items = [];
  const seen = new Set();
  events
    .filter((e) => !e.pending && e.attendees.includes("You"))
    .forEach((e) => {
      const f = flags[e.id];
      if (!f) return;
      f.conflict.forEach((o) => {
        const k = "c" + [e.id, o.id].sort().join("|");
        if (!seen.has(k)) {
          seen.add(k);
          items.push({ kind: "conflict", text: `${e.title} overlaps ${o.title} on ${dayNames[e.day]}` });
        }
      });
      f.b2bWith.forEach((o) => {
        const k = "b" + [e.id, o.id].sort().join("|");
        if (!seen.has(k)) {
          seen.add(k);
          items.push({ kind: "b2b", text: `${e.title} and ${o.title} are back-to-back on ${dayNames[e.day]}` });
        }
      });
      if (f.zone) items.push({ kind: "buffer", text: `${e.title} sits inside the buffer around ${f.zone.title}` });
    });
  return items;
}

/** Where could a bumped event go instead? First free slot for all its attendees, not in a buffer zone. */
export function findReplacement(ev, proposed, events, zones, otherBusy) {
  const dur = ev.end - ev.start;
  const ignore = new Set([ev.id]);
  const order = [];
  for (let i = 0; i < 5; i++) order.push((ev.day + i) % 5);
  for (const day of order) {
    for (let s = WORK_START; s + dur <= WORK_END; s += 30) {
      const slot = { day, start: s, end: s + dur };
      if (day === ev.day && s === ev.start) continue;
      if (overlaps(slot, proposed)) continue;
      if (zones.some((z) => z.day === day && s < z.end && z.start < s + dur)) continue;
      const free = ev.attendees.every((p) => !busyList(p, events, otherBusy, ignore).some((b) => overlaps(slot, b)));
      if (free) return slot;
    }
  }
  return null;
}

/**
 * Generate candidate slots for a new meeting.
 * A slot is a candidate if everyone is free, OR the only clash is one of the user's events that the
 * LLM rated flexibility "high" (and isn't a flight). Those are "bump" candidates.
 */
export function genCandidates({ attendees, dur, days, events, otherBusy, analysis, zones }) {
  const people = ["You", ...attendees];
  const mine = events.filter((e) => !e.pending && e.attendees.includes("You"));
  const all = [];
  days.forEach((day) => {
    for (let s = WORK_START; s + dur <= WORK_END; s += 30) {
      const slot = { day, start: s, end: s + dur };
      const conflicts = [];
      let hard = false;
      people.forEach((p) =>
        busyList(p, events, otherBusy).forEach((b) => {
          if (overlaps(slot, b)) {
            if (b.ev) conflicts.push(b.ev);
            else hard = true;
          }
        })
      );
      if (hard) continue;
      const uniq = [...new Map(conflicts.map((e) => [e.id, e])).values()];
      let bumps = [];
      if (uniq.length) {
        if (uniq.length > 1) continue;
        const a = analysis[uniq[0].id];
        if (!a || a.flexibility !== "high" || a.type === "flight") continue;
        bumps = [uniq[0]];
      }
      const zone = zones.find((z) => z.day === day && s < z.end && z.start < s + dur) || null;
      if (zone && zone.severity === "hard") continue;
      const ignore = new Set(bumps.map((b) => b.id));
      const dayEvents = mine.filter((e) => e.day === day && !ignore.has(e.id));
      const before = dayEvents.filter((e) => e.end <= s).map((e) => s - e.end);
      const after = dayEvents.filter((e) => e.start >= s + dur).map((e) => e.start - (s + dur));
      const gapBefore = before.length ? Math.min(...before) : null;
      const gapAfter = after.length ? Math.min(...after) : null;
      const b2b = (gapBefore !== null && gapBefore < 15) || (gapAfter !== null && gapAfter < 15);
      const score =
        (zone ? 50 : 0) +
        (b2b ? 25 : 0) +
        (bumps.length ? 35 : 0) -
        Math.min(gapBefore === null ? 60 : gapBefore, 60) / 6 -
        Math.min(gapAfter === null ? 60 : gapAfter, 60) / 6;
      all.push({ ...slot, gapBefore, gapAfter, b2b, zone, bumps, score });
    }
  });
  all.sort((a, b) => a.score - b.score);

  // keep a spread: max 4 per day, no overlapping picks within a day
  const perDay = {};
  const picked = [];
  for (const c of all) {
    perDay[c.day] = perDay[c.day] || [];
    if (perDay[c.day].length >= 4) continue;
    if (perDay[c.day].some((x) => Math.abs(x.start - c.start) < dur)) continue;
    if (c.bumps.length) {
      const ns = findReplacement(c.bumps[0], c, events, zones, otherBusy);
      if (!ns) continue;
      c.bumps = [{ ...c.bumps[0], newSlot: ns }];
    }
    perDay[c.day].push(c);
    picked.push(c);
  }
  return picked.slice(0, 14).map((c, i) => ({ ...c, id: "c" + (i + 1) }));
}

/**
 * Map the LLM's ranked options back onto candidates. The LLM may reference a candidate by `candidate_id`
 * (live mode) or by `slot: {day, start}` (hardcoded fixtures, which can't know candidate ids in advance).
 */
export function matchRankedOptions(cands, options) {
  return (options || [])
    .map((o) => {
      const c = o.slot
        ? cands.find((x) => x.day === o.slot.day && x.start === o.slot.start)
        : cands.find((x) => x.id === o.candidate_id);
      return c ? { ...c, ...o, id: c.id } : null;
    })
    .filter(Boolean)
    .slice(0, 3);
}

/** Side-by-side lane assignment so overlapping events render next to each other. */
export function computeLanes(list) {
  const sorted = [...list].sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds = [];
  const info = {};
  sorted.forEach((e) => {
    let l = laneEnds.findIndex((end) => end <= e.start);
    if (l === -1) {
      l = laneEnds.length;
      laneEnds.push(e.end);
    } else laneEnds[l] = e.end;
    info[e.id] = { lane: l };
  });
  sorted.forEach((e) => {
    let max = info[e.id].lane;
    sorted.forEach((o) => {
      if (o.start < e.end && e.start < o.end) max = Math.max(max, info[o.id].lane);
    });
    info[e.id].lanes = max + 1;
  });
  return info;
}
