// Pure scheduling logic. No React, no LLM calls.
// Rule of thumb for this repo: code owns facts and time math, the LLM owns judgment.
//
// All times are minutes since midnight in the user's zone, day 0..4 = Mon..Fri.
// Other people's calendars are converted into that zone by lib/graph.js before they get here.

import { WORK_START, WORK_END, fmt } from "./time.js";
import { withinWorkingHours, localTimeLabel, tzShort, USER_TZ } from "./tz.js";

export const overlaps = (a, b) => a.day === b.day && a.start < b.end && b.start < a.end;

/** Free/busy lists for the team, from their full calendars. Meetings already on the user's calendar are skipped (the user's events cover them). */
export function teamBusy(team, connected = {}) {
  const out = {};
  Object.entries(team).forEach(([p, info]) => {
    out[p] = connected[p] === false
      ? []
      : info.events
          .filter((e) => !e.shared)
          .map((e) => ({ day: e.day, start: e.start, end: e.end, title: e.title, flight: e.categories.includes("Flights") }));
  });
  return out;
}

/** All busy intervals for a person: events they attend + blocks from their own calendar. */
export function busyList(person, events, otherBusy, ignore = new Set()) {
  const list = events
    .filter((e) => !e.pending && !ignore.has(e.id) && e.attendees.includes(person))
    .map((e) => ({ day: e.day, start: e.start, end: e.end, ev: e }));
  (otherBusy[person] || []).forEach((b) => list.push({ ...b, ev: null }));
  return list;
}

/**
 * Expand buffer rules (taught facts of type buffer_rule) into time windows on the user's calendar.
 * A rule triggers on an event type (the LLM supplies `analysis[eventId].type`, e.g. "flight") or on an attendee
 * ("Jake"). These windows are the automatic "soft holds".
 */
export function computeZones(events, facts, analysis) {
  const rules = facts.filter((f) => f.type === "buffer_rule" && f.trigger && (f.trigger.event_type || f.trigger.attendee));
  const zones = [];
  rules.forEach((r) => {
    events.forEach((e) => {
      if (e.pending || !e.attendees.includes("You")) return;
      const type = analysis[e.id] && analysis[e.id].type;
      const byType = r.trigger.event_type && type && type.toLowerCase() === String(r.trigger.event_type).toLowerCase();
      const byPerson = r.trigger.attendee && e.attendees.includes(r.trigger.attendee);
      if (!byType && !byPerson) return;
      // the hold sits on either side of the event itself, which is already visible on the calendar
      const base = {
        ruleId: r.id,
        eventId: e.id,
        title: e.title,
        label: r.label || (byType && r.trigger.event_type === "flight" ? "Airport soft hold" : `Buffer around ${e.title}`),
        kind: byType ? r.trigger.event_type : "person",
        day: e.day,
        severity: r.severity || "warning",
      };
      if (r.buffer_before_min) zones.push({ ...base, start: Math.max(e.start - r.buffer_before_min, 0), end: e.start });
      if (r.buffer_after_min) zones.push({ ...base, start: e.end, end: Math.min(e.end + r.buffer_after_min, 24 * 60) });
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
      if (f.zone) items.push({ kind: "buffer", text: `${e.title} sits inside the ${f.zone.label.toLowerCase()} (${f.zone.title})` });
    });
  return items;
}

const everyoneWorking = (people, directory, day, start, end) =>
  people.every((p) => p === "You" || withinWorkingHours(directory[p] && directory[p].hours, day, start, end));

/** Where could a bumped event go instead? First free slot for all its attendees, in everyone's working hours, not in a buffer zone. */
export function findReplacement(ev, proposed, events, zones, otherBusy, directory = {}) {
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
      if (!everyoneWorking(ev.attendees, directory, day, s, s + dur)) continue;
      const free = ev.attendees.every((p) => !busyList(p, events, otherBusy, ignore).some((b) => overlaps(slot, b)));
      if (free) return slot;
    }
  }
  return null;
}

/** Everything worth saying about a candidate slot, in plain text, for the card and for the LLM. */
function buildCallouts(c, { attendees, team, directory, bufferGaps }) {
  const out = [];
  if (c.zone) out.push({ kind: "warn", text: `Inside your ${c.zone.label.toLowerCase()} (${c.zone.title})` });
  if (c.b2b) out.push({ kind: "warn", text: "Back-to-back with another meeting of yours" });
  bufferGaps.forEach((g) =>
    out.push({ kind: "warn", text: `Only ${g.gap} min of space for ${g.person} next to "${g.title}", and you asked for buffers with ${g.person}` })
  );
  attendees.forEach((p) => {
    const flights = ((team[p] && team[p].events) || []).filter(
      (e) => e.categories.includes("Flights") && e.day === c.day && c.end + 180 > e.start && c.start < e.end + 180
    );
    flights.forEach((f) => out.push({ kind: "warn", text: `${p} is travelling that day: ${f.title}, ${fmt(f.start)} to ${fmt(f.end)} CT` }));
  });
  c.bumps.forEach((b) => out.push({ kind: "move", text: `Moves ${b.title} to ${fmt(b.newSlot.start)} on a ${["Mon", "Tue", "Wed", "Thu", "Fri"][b.newSlot.day]}` }));
  const zonesSeen = new Set();
  attendees.forEach((p) => {
    const tz = directory[p] && directory[p].tz;
    if (tz && tz !== USER_TZ && !zonesSeen.has(tz)) {
      zonesSeen.add(tz);
      out.push({ kind: "info", text: `${p}: ${localTimeLabel(c.day, c.start, tz)} ${tzShort(tz)}` });
    }
  });
  if (!out.some((x) => x.kind === "warn" || x.kind === "move")) out.unshift({ kind: "ok", text: "Everyone free, no warnings" });
  return out.filter((x, i) => out.findIndex((y) => y.text === x.text) === i);
}

/**
 * Generate candidate slots for a new meeting.
 * A slot is a candidate if everyone is free and inside their working hours, OR the only clash is one of the
 * user's work events that the LLM rated flexibility "high" (and isn't a flight). Those are "bump" candidates.
 * Meetings with someone whose facts include a buffer rule also get a gap check in that person's own calendar.
 */
export function genCandidates({ attendees, dur, days, events, otherBusy, analysis, zones, directory = {}, team = {}, facts = [] }) {
  const people = ["You", ...attendees];
  const mine = events.filter((e) => !e.pending && e.attendees.includes("You"));
  const personRules = facts.filter((f) => f.type === "buffer_rule" && f.trigger && f.trigger.attendee && attendees.includes(f.trigger.attendee));
  const all = [];
  days.forEach((day) => {
    for (let s = WORK_START; s + dur <= WORK_END; s += 30) {
      const slot = { day, start: s, end: s + dur };
      if (!everyoneWorking(people, directory, day, s, s + dur)) continue;
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
        if (!a || a.flexibility !== "high" || a.type === "flight" || uniq[0].calendar !== "cal-work") continue;
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

      // gap check inside each buffer-hungry person's own calendar
      const bufferGaps = [];
      personRules.forEach((r) => {
        const p = r.trigger.attendee;
        const need = Math.max(r.buffer_before_min || 0, r.buffer_after_min || 0);
        let worst = null;
        busyList(p, events, otherBusy).forEach((b) => {
          if (b.day !== day) return;
          const gap = b.end <= s ? s - b.end : b.start >= s + dur ? b.start - (s + dur) : null;
          if (gap !== null && gap < need && (!worst || gap < worst.gap)) worst = { person: p, gap, title: (b.ev && b.ev.title) || b.title || "another meeting" };
        });
        if (worst) bufferGaps.push(worst);
      });

      const score =
        (zone ? 50 : 0) +
        (b2b ? 25 : 0) +
        (bumps.length ? 35 : 0) +
        bufferGaps.length * 30 -
        Math.min(gapBefore === null ? 60 : gapBefore, 60) / 6 -
        Math.min(gapAfter === null ? 60 : gapAfter, 60) / 6;
      all.push({ ...slot, gapBefore, gapAfter, b2b, zone, bumps, bufferGaps, score });
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
      const ns = findReplacement(c.bumps[0], c, events, zones, otherBusy, directory);
      if (!ns) continue;
      c.bumps = [{ ...c.bumps[0], newSlot: ns }];
    }
    perDay[c.day].push(c);
    picked.push(c);
  }
  return picked.slice(0, 14).map((c, i) => {
    const cand = { ...c, id: "c" + (i + 1) };
    cand.callouts = buildCallouts(cand, { attendees, team, directory, bufferGaps: c.bufferGaps });
    return cand;
  });
}

/**
 * Map the LLM's ranked options back onto candidates. The LLM may reference a candidate by `candidate_id`
 * (live mode) or by `slot: {day, start}` (fixtures, which can't know candidate ids in advance).
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

/**
 * Windows where everyone in `people` is free and inside their own working hours, on one day.
 * Used by the Teammates compare view. Returns merged [{start, end}] in the user's zone.
 */
export function commonFree({ people, day, events, otherBusy, directory, from = 7 * 60, to = 19 * 60, step = 30 }) {
  const out = [];
  for (let s = from; s + step <= to; s += step) {
    const slot = { day, start: s, end: s + step };
    const ok = people.every(
      (p) =>
        withinWorkingHours(directory[p] && directory[p].hours, day, s, s + step) &&
        !busyList(p, events, otherBusy).some((b) => overlaps(slot, b))
    );
    if (!ok) continue;
    const last = out[out.length - 1];
    if (last && last.end === s) last.end = s + step;
    else out.push({ start: s, end: s + step });
  }
  return out;
}

/** Ranges inside [from, to) where this person is outside their working hours (for shading). */
export function nonWorkingRanges(person, day, from = 7 * 60, to = 19 * 60, step = 30) {
  const out = [];
  for (let s = from; s + step <= to; s += step) {
    if (withinWorkingHours(person && person.hours, day, s, s + step)) continue;
    const last = out[out.length - 1];
    if (last && last.end === s) last.end = s + step;
    else out.push({ start: s, end: s + step });
  }
  return out;
}
