// Adapter: Microsoft Graph (Outlook) responses to the app's internal shape.
//
// Internal event: { id, uid, title, attendees: ["You", "Jake", ...], day: 0..4, start, end (minutes, user zone),
//                   calendar, location, joinUrl, provider, series, categories, isPrivate, body }
// Everything downstream (scheduler, UI) works in the user's zone, so this is the only place that knows about
// Graph field names and Windows time zone names. Swapping the JSON for real `GET /me/calendarView` calls
// means changing only where `raw` comes from.

import { graphToUtc, toUserSlot, ianaOf } from "./tz.js";

const DAY_NUM = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** Directory response to profiles keyed by display first name, with working hours in the person's own zone. */
export function buildDirectory(raw) {
  const people = {};
  const byAddress = {};
  raw.value.forEach((u) => {
    const first = u.displayName.split(" ")[0];
    const name = first === "Luke" ? "You" : first;
    const wh = u.mailboxSettings.workingHours;
    people[name] = {
      name,
      fullName: u.displayName,
      email: u.mail,
      title: u.jobTitle,
      office: u.officeLocation,
      tz: ianaOf(u.mailboxSettings.timeZone),
      hours: { tz: ianaOf(wh.timeZone.name), days: wh.daysOfWeek.map((d) => DAY_NUM[d]), start: toMin(wh.startTime), end: toMin(wh.endTime) },
    };
    byAddress[u.mail.toLowerCase()] = name;
  });
  return { people, byAddress };
}

const nameOf = (dir, addr, fallback) => dir.byAddress[String(addr || "").toLowerCase()] || fallback || null;

/** Split a UTC interval into per-day segments of the user's week (0..4). */
function segments(startUtc, endUtc) {
  const a = toUserSlot(startUtc);
  const b = toUserSlot(endUtc - 1); // inclusive of the last minute
  const out = [];
  for (let d = Math.max(a.day, 0); d <= Math.min(b.day, 4); d++) {
    out.push({ day: d, start: d === a.day ? a.min : 0, end: d === b.day ? b.min + 1 : 24 * 60 });
  }
  return out;
}

/** One Graph event to zero or more internal events (one per day it touches, clipped to Mon..Fri). */
export function normalizeEvent(g, dir, { owner, calendar }) {
  const startUtc = graphToUtc(g.start);
  const endUtc = graphToUtc(g.end);
  const names = new Set([owner]);
  const org = nameOf(dir, g.organizer && g.organizer.emailAddress.address);
  if (org) names.add(org);
  (g.attendees || []).forEach((a) => {
    const n = nameOf(dir, a.emailAddress.address);
    if (n) names.add(n);
  });
  const base = {
    uid: g.iCalUId,
    title: g.subject,
    attendees: [...names],
    organizer: org,
    calendar,
    location: (g.location && g.location.displayName) || "",
    joinUrl: (g.onlineMeeting && g.onlineMeeting.joinUrl) || g.onlineMeetingUrl || null,
    provider: g.onlineMeetingProvider === "teamsForBusiness" ? "teams" : g.onlineMeetingUrl && /zoom/.test(g.onlineMeetingUrl) ? "zoom" : null,
    series: g.type === "occurrence",
    categories: g.categories || [],
    isPrivate: g.sensitivity === "private",
    allDay: !!g.isAllDay,
    showAs: g.showAs,
    body: g.bodyPreview || "",
    importance: g.importance,
  };
  return segments(startUtc, endUtc).map((s, i) => ({ ...base, id: i ? `${g.id}#${i}` : g.id, ...s }));
}

/**
 * Everything the app needs from the sample responses.
 *   events:    the user's own master calendar (all three calendars merged, mirrors removed)
 *   mirrors:   Map(sourceEventId -> Set(calendar ids it has been mirrored to))
 *   team:      per person: profile + their events in the user's zone
 */
export function loadWorld({ me, calendars, personCalendars, directory }) {
  const dir = buildDirectory(directory);
  const cals = calendars.value.map((c) => ({ id: c.id, name: c.name, color: c.hexColor }));
  const events = [];
  const mirrors = new Map();
  const calIds = Object.keys(me);

  calIds.forEach((calId) => {
    me[calId].value.forEach((g) => {
      if ((g.categories || []).includes("Synced") && g.transactionId) {
        if (!mirrors.has(g.transactionId)) mirrors.set(g.transactionId, new Set());
        mirrors.get(g.transactionId).add(calId);
        return;
      }
      if (g.isAllDay) return;
      const [first] = normalizeEvent(g, dir, { owner: "You", calendar: calId });
      if (first) events.push({ ...first, graphId: g.id });
    });
  });

  const uids = new Set(events.map((e) => e.uid));
  const team = {};
  Object.entries(personCalendars).forEach(([name, raw]) => {
    const list = [];
    raw.value.forEach((g) => {
      if (g.showAs === "free") return;
      normalizeEvent(g, dir, { owner: name, calendar: "theirs" }).forEach((e) => list.push({ ...e, shared: uids.has(e.uid) }));
    });
    team[name] = { ...dir.people[name], events: list };
  });

  return { dir, calendars: cals, events, mirrors, team };
}

/** The mix of calendars an event is already visible on. Colleagues only see work, so personal/org-only events are gaps. */
export function unsyncedEvents(events, mirrors, calIds, synced = new Set()) {
  return events.filter((e) => {
    if (synced.has(e.id)) return false;
    const have = new Set([e.calendar, ...(mirrors.get(e.graphId || e.id) || [])]);
    return calIds.some((c) => !have.has(c));
  });
}
