// Generates the Outlook / Microsoft Graph style sample responses in src/data/graph/.
//   node scripts/gen-graph-data.mjs
//
// Each file imitates what GET /me/calendars/{id}/calendarView?startDateTime=...&endDateTime=... returns
// (an OData envelope with a `value` array of event resources), with times in the calendar owner's zone.
// The week is Mon Nov 2 to Fri Nov 6 2026. Edit the compact definitions below, then re-run.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "graph");
mkdirSync(OUT, { recursive: true });

const DATES = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];

const TZ = {
  CT: "Central Standard Time",
  ET: "Eastern Standard Time",
  PT: "Pacific Standard Time",
  IST: "India Standard Time",
};
const P = {
  you: { name: "Luke Dinan", address: "luke.dinan@firmname.example" },
  jake: { name: "Jake Morrison", address: "jake.morrison@firmname.example" },
  alyssa: { name: "Alyssa Chen", address: "alyssa.chen@firmname.example" },
  sarah: { name: "Sarah Patel", address: "sarah.patel@firmname.example" },
  priya: { name: "Priya Raman", address: "priya.raman@firmname.example" },
  brad: { name: "Brad Whitfield", address: "brad.whitfield@northwindco.example" },
};

/* ------------------------------ helpers ------------------------------ */
const hash = (s) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36).padStart(7, "0");
};
const graphId = (s) => "AAMkAGE1" + hash(s) + hash(s + "x").toUpperCase() + "AAA=";
const dt = (day, hhmm, tz) => ({ dateTime: `${DATES[day]}T${hhmm}:00.0000000`, timeZone: tz });
const attendee = (p) => ({
  type: "required",
  status: { response: "accepted", time: "2026-10-26T15:02:11Z" },
  emailAddress: { name: P[p].name, address: P[p].address },
});
const TEAMS_URL = (key) => `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${hash(key)}%40thread.v2/0`;
const ZOOM_URL = (key) => `https://zoom.us/j/${String(parseInt(hash(key + "z"), 36)).padStart(10, "4").slice(0, 10)}`;

/**
 * One Graph event resource, from `owner`'s calendar. `o`:
 *   day (0-4), s / e "HH:MM" in `tz`, subject, organizer (default owner),
 *   people (everyone involved, organizer included; omit for solo events),
 *   loc, online ("teams" | "zoom"), series (recurring occurrence), cat (categories), priv, show (showAs),
 *   imp, body, allDay, key (stable key: same key => same iCalUId across everyone's calendar)
 */
function event(owner, tz, o) {
  const key = o.key || `${o.subject}|${o.day}|${o.s}`;
  const organizer = o.organizer || owner;
  const attendees = (o.people || []).filter((p) => p !== organizer).map(attendee);
  const zoom = o.online === "zoom";
  const online = o.online
    ? {
        isOnlineMeeting: true,
        onlineMeetingProvider: zoom ? "unknown" : "teamsForBusiness",
        onlineMeetingUrl: zoom ? ZOOM_URL(key) : null,
        onlineMeeting: zoom ? null : { joinUrl: TEAMS_URL(key) },
      }
    : { isOnlineMeeting: false, onlineMeetingProvider: "unknown", onlineMeetingUrl: null, onlineMeeting: null };
  const start = o.allDay ? { dateTime: `${DATES[o.day]}T00:00:00.0000000`, timeZone: tz } : dt(o.day, o.s, tz);
  const end = o.allDay ? { dateTime: `${DATES[o.day + 1] || "2026-11-07"}T00:00:00.0000000`, timeZone: tz } : dt(o.day, o.e, tz);
  return {
    "@odata.etag": `W/"${hash(key + "etag")}"`,
    id: graphId(`${owner}|${key}`),
    createdDateTime: "2026-10-22T14:11:03.4120000Z",
    lastModifiedDateTime: "2026-10-27T09:41:57.0030000Z",
    changeKey: hash(key + "ck"),
    categories: o.cat || [],
    transactionId: o.transactionId || null,
    originalStartTimeZone: tz,
    originalEndTimeZone: tz,
    iCalUId: `040000008200E00074C5B7101A82E008${hash(key).toUpperCase()}`,
    reminderMinutesBeforeStart: o.cat && o.cat.includes("Travel") ? 120 : 15,
    isReminderOn: !o.allDay,
    hasAttachments: false,
    subject: o.subject,
    bodyPreview: o.body || "",
    importance: o.imp || "normal",
    sensitivity: o.priv ? "private" : "normal",
    isAllDay: !!o.allDay,
    isCancelled: false,
    isOrganizer: organizer === owner,
    responseRequested: true,
    seriesMasterId: o.series ? graphId(`${o.subject}|series`) : null,
    showAs: o.show || "busy",
    type: o.series ? "occurrence" : "singleInstance",
    webLink: `https://outlook.office365.com/owa/?itemid=${graphId(key)}&exvsurl=1&path=/calendar/item`,
    ...online,
    responseStatus: { response: organizer === owner ? "organizer" : "accepted", time: "2026-10-27T09:41:57Z" },
    body: { contentType: "text", content: o.body || "" },
    start,
    end,
    location: { displayName: o.loc || "", locationType: "default" },
    locations: o.loc ? [{ displayName: o.loc }] : [],
    recurrence: null,
    attendees,
    organizer: { emailAddress: { name: P[organizer].name, address: P[organizer].address } },
  };
}

const envelope = (ctx, events) => ({
  "@odata.context": `https://graph.microsoft.com/v1.0/$metadata#users('${ctx}')/calendarView`,
  value: events,
});
const write = (name, data) => writeFileSync(join(OUT, name), JSON.stringify(data, null, 2) + "\n");

/* ------------------------------ shared meetings (times in CT, "you" perspective) ------------------------------ */
// Defined once. Each person's calendar re-times them into their own zone, keeping the same `key`.
const SHARED = {
  standup: (d) => ({
    day: d, s: "09:00", e: "09:30", subject: "Team standup", organizer: "sarah", online: "teams", series: true, key: `standup|${d}`,
    people: ["sarah", "alyssa", "you", ...(d < 4 ? ["priya"] : [])], body: "Daily 30 minute sync. Blockers only.",
  }),
  proposal: { day: 0, s: "09:30", e: "10:30", subject: "Helix proposal working session", organizer: "you", people: ["you", "priya"], online: "teams", key: "proposal-mon", body: "Walk through the data pack and the pricing section." },
  northwind: { day: 0, s: "11:00", e: "12:00", subject: "Northwind weekly status", organizer: "sarah", people: ["sarah", "jake", "brad", "you"], online: "zoom", key: "northwind-weekly", imp: "high", body: "Weekly status with the Northwind steering group. Client attending." },
  oneAly: { day: 0, s: "14:00", e: "15:00", subject: "1:1 with Alyssa", organizer: "you", people: ["you", "alyssa"], loc: "Chicago office, 14B", key: "one-alyssa", body: "Working catch-up." },
  oneSarah: { day: 0, s: "16:00", e: "16:30", subject: "1:1 with Sarah", organizer: "sarah", people: ["sarah", "you"], online: "teams", key: "one-sarah", body: "Staffing, feedback, next week." },
  review: { day: 1, s: "14:30", e: "15:30", subject: "Partner review: Helix workplan", organizer: "sarah", people: ["sarah", "jake", "you"], online: "teams", key: "partner-review", imp: "high", body: "Jake reviewing the workplan and the draft storyline." },
  modelReview: { day: 1, s: "11:00", e: "12:00", subject: "Model review", organizer: "alyssa", people: ["alyssa", "you"], online: "teams", key: "model-review", body: "Review the pricing model assumptions." },
  steerco: { day: 2, s: "11:00", e: "12:00", subject: "Northwind steering committee", organizer: "sarah", people: ["sarah", "jake", "brad", "you"], online: "zoom", key: "northwind-steerco", imp: "high", body: "Monthly steering committee. Client decision on phase 2." },
  debrief: { day: 2, s: "14:15", e: "14:45", subject: "Steerco debrief", organizer: "you", people: ["you", "alyssa", "sarah"], online: "teams", key: "steerco-debrief", body: "Quick internal debrief and follow-ups." },
  helixDeep: { day: 3, s: "10:00", e: "12:00", subject: "Helix workplan deep dive", organizer: "sarah", people: ["sarah", "you"], online: "teams", key: "helix-deep", body: "Two hours on the workplan." },
  handoff: { day: 3, s: "09:30", e: "10:00", subject: "Data handoff with Priya", organizer: "you", people: ["you", "priya"], online: "teams", key: "handoff-thu", body: "Hand over the cleaned dataset." },
  checkin: { day: 4, s: "11:00", e: "11:30", subject: "Weekly check-in with Jake", organizer: "jake", people: ["jake", "you"], online: "teams", key: "jake-checkin", imp: "high", body: "Standing weekly check-in." },
  retro: { day: 4, s: "14:00", e: "15:00", subject: "Team retro", organizer: "sarah", people: ["sarah", "alyssa", "you"], loc: "Chicago office, 14B", key: "team-retro", body: "Retro on the Helix sprint." },
};

/* ------------------------------ you (CT): three calendars ------------------------------ */
const Y = (o) => event("you", TZ.CT, o);

const workYou = [
  ...[0, 1, 2, 3, 4].map((d) => Y(SHARED.standup(d))),
  Y(SHARED.proposal),
  Y(SHARED.northwind),
  Y(SHARED.oneAly),
  Y(SHARED.oneSarah),
  Y({ day: 1, s: "09:30", e: "11:00", subject: "Focus: Helix storyline", key: "focus-tue", body: "Heads down on the storyline." }),
  Y(SHARED.modelReview),
  Y(SHARED.review),
  Y(SHARED.steerco),
  Y(SHARED.debrief),
  Y(SHARED.handoff),
  Y(SHARED.helixDeep),
  Y(SHARED.checkin),
  Y(SHARED.retro),
];

const personalYou = [
  Y({ day: 0, s: "12:30", e: "13:30", subject: "Lunch with Maya", loc: "Fulton Market", key: "lunch-maya", priv: true }),
  Y({ day: 0, s: "08:00", e: "08:45", subject: "Dentist", loc: "Loop Dental", key: "dentist", priv: true }),
  // Outbound: Mon 5:00 PM CT, ORD to LGA. Lands 7:10 PM CT. Arrives in New York for the Tue to Thu client work.
  Y({ day: 0, s: "17:00", e: "19:10", subject: "UA 482 ORD to LGA", loc: "O'Hare Terminal 1", cat: ["Travel", "Flights"], key: "ua482", imp: "high", body: "United Airlines UA 482. Departs ORD 5:00 PM CT, arrives LGA 8:10 PM ET. Confirmation K7QX2M. Added automatically from your email." }),
  // Return: Thu evening
  Y({ day: 3, s: "18:30", e: "21:05", subject: "UA 1127 LGA to ORD", loc: "LaGuardia Terminal B", cat: ["Travel", "Flights"], key: "ua1127", imp: "high", body: "United Airlines UA 1127. Departs LGA 7:30 PM ET, arrives ORD 9:05 PM CT. Confirmation K7QX2M." }),
  Y({ day: 4, s: "16:00", e: "17:00", subject: "Apartment tour", loc: "River North", key: "apt-tour", priv: true }),
];

const orgYou = [
  Y({ day: 1, s: "16:00", e: "17:00", subject: "Case competition prep", online: "zoom", key: "case-prep" }),
  Y({ day: 2, s: "12:00", e: "13:00", subject: "Consulting Club speaker lunch", online: "zoom", key: "club-lunch" }),
  Y({ day: 4, s: "14:00", e: "15:00", subject: "Consulting Club recruiting panel", loc: "Harper Center Auditorium", key: "club-panel" }),
];

// Mirrors: "Busy" placeholders that sync a source event onto the other calendars so colleagues who only
// see one calendar still see you as busy. Work events are fully mirrored; personal and org events are
// deliberately NOT, so the app has real gaps to find and fix.
const mirrorsOf = (list) =>
  list
    .filter((e) => !e.isAllDay)
    .map((src) =>
      Y({
        day: DATES.indexOf(src.start.dateTime.slice(0, 10)),
        s: src.start.dateTime.slice(11, 16),
        e: src.end.dateTime.slice(11, 16),
        subject: "Busy",
        cat: ["Synced"],
        priv: true,
        transactionId: src.id,
        key: `mirror|${src.id}`,
      })
    );

write("me_calendars.json", {
  "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users('luke.dinan%40firmname.example')/calendars",
  value: [
    { id: "cal-work", name: "Work (Firm)", color: "lightBlue", hexColor: "#4D7AA6", canEdit: true, canShare: true, isDefaultCalendar: true, owner: P.you },
    { id: "cal-personal", name: "Personal", color: "lightGreen", hexColor: "#2E7D5B", canEdit: true, canShare: true, isDefaultCalendar: false, owner: { name: P.you.name, address: "luke.dinan@outlook.example" } },
    { id: "cal-org", name: "Consulting Club (School)", color: "lightOrange", hexColor: "#C9742F", canEdit: true, canShare: false, isDefaultCalendar: false, owner: { name: P.you.name, address: "luke.dinan@school.example" } },
  ],
});
write("me_work.json", envelope("luke.dinan@firmname.example", workYou));
write("me_personal.json", envelope("luke.dinan@outlook.example", [...personalYou, ...mirrorsOf(workYou)]));
write("me_org.json", envelope("luke.dinan@school.example", [...orgYou, ...mirrorsOf(workYou)]));

/* ------------------------------ Jake (ET, Partner): packed, lots of flights ------------------------------ */
const J = (o) => event("jake", TZ.ET, o);
const JP = (o) => event("jake", TZ.PT, o); // in San Francisco Thursday, his calendar is in Pacific time
const et = (shared, s, e) => J({ ...shared, s, e }); // shared meeting, re-timed into Jake's zone
write(
  "jake.json",
  envelope("jake.morrison@firmname.example", [
    // Mon: flies in for the Northwind weekly
    J({ day: 0, s: "06:30", e: "09:05", subject: "DL 2417 LGA to ORD", loc: "LaGuardia Terminal C", cat: ["Travel", "Flights"], key: "dl2417", body: "Delta DL 2417. Departs LGA 6:30 AM ET, arrives ORD 8:05 AM CT." }),
    J({ day: 0, s: "10:00", e: "10:30", subject: "Car to client site", key: "jake-car-mon" }),
    et(SHARED.northwind, "12:00", "13:00"),
    J({ day: 0, s: "14:00", e: "15:30", subject: "Practice leadership sync", online: "teams", key: "practice-sync", body: "Monthly practice leadership sync." }),
    J({ day: 0, s: "16:45", e: "17:45", subject: "Candidate dinner prep", key: "jake-cand-prep" }),
    // Tue
    J({ day: 1, s: "08:00", e: "09:00", subject: "Partner call: firm P&L", online: "teams", key: "pl-call" }),
    J({ day: 1, s: "10:00", e: "11:30", subject: "Recruiting committee", loc: "Chicago office, 30F", key: "recruiting-cttee" }),
    J({ day: 1, s: "13:00", e: "14:00", subject: "Investor prep: Helix Capital", online: "teams", key: "helix-investor", imp: "high" }),
    et(SHARED.review, "15:30", "16:30"),
    J({ day: 1, s: "18:30", e: "21:00", subject: "Client dinner: Meridian", loc: "Girl & the Goat", key: "meridian-dinner", imp: "high" }),
    // Wed: steerco, then flies to SFO
    J({ day: 2, s: "09:00", e: "10:00", subject: "Staffing review", online: "teams", key: "staffing-review" }),
    et(SHARED.steerco, "12:00", "13:00"),
    J({ day: 2, s: "15:15", e: "19:40", subject: "UA 1642 ORD to SFO", loc: "O'Hare Terminal 1", cat: ["Travel", "Flights"], key: "ua1642", imp: "high", body: "United UA 1642. Departs ORD 2:15 PM CT (3:15 PM ET), arrives SFO 4:40 PM PT." }),
    // Thu: San Francisco
    JP({ day: 3, s: "08:00", e: "09:00", subject: "Breakfast with Meridian CFO", loc: "Ferry Building", key: "meridian-cfo" }),
    JP({ day: 3, s: "09:30", e: "15:00", subject: "Meridian board meeting", loc: "Meridian HQ, SF", key: "meridian-board", imp: "high", body: "Presenting to the board. Do not move." }),
    JP({ day: 3, s: "16:00", e: "17:00", subject: "Investor call: Helix Capital", online: "zoom", key: "helix-call" }),
    JP({ day: 3, s: "21:50", e: "23:59", subject: "UA 2050 SFO to EWR (red-eye)", loc: "SFO Terminal 3", cat: ["Travel", "Flights"], key: "ua2050", body: "United UA 2050. Departs SFO 9:50 PM PT, arrives EWR 6:15 AM ET Fri." }),
    // Fri: back east
    J({ day: 4, s: "06:15", e: "06:30", subject: "Landed EWR, car home", key: "jake-landed", show: "free" }),
    et(SHARED.checkin, "12:00", "12:30"),
    J({ day: 4, s: "14:00", e: "15:30", subject: "Principals call", online: "teams", key: "principals-call" }),
    J({ day: 4, s: "18:00", e: "20:40", subject: "DL 905 LGA to PBI", loc: "LaGuardia Terminal C", cat: ["Travel", "Flights"], key: "dl905", body: "Delta DL 905. Departs LGA 6:00 PM ET, arrives PBI 8:40 PM ET." }),
  ])
);

/* ------------------------------ Alyssa (CT, peer): lighter week ------------------------------ */
const A = (o) => event("alyssa", TZ.CT, o);
write(
  "alyssa.json",
  envelope("alyssa.chen@firmname.example", [
    ...[0, 1, 2, 3, 4].map((d) => A(SHARED.standup(d))),
    A(SHARED.oneAly),
    A(SHARED.modelReview),
    A({ day: 2, s: "13:00", e: "14:00", subject: "Lunch and learn: pricing analytics", loc: "Chicago office, Commons", key: "lunch-learn" }),
    A(SHARED.debrief),
    A({ day: 3, s: "15:00", e: "15:30", subject: "Coffee chat with new analyst", key: "coffee-analyst" }),
    A(SHARED.retro),
  ])
);

/* ------------------------------ Sarah (CT, direct manager) ------------------------------ */
const S = (o) => event("sarah", TZ.CT, o);
write(
  "sarah.json",
  envelope("sarah.patel@firmname.example", [
    ...[0, 1, 2, 3, 4].map((d) => S(SHARED.standup(d))),
    S(SHARED.northwind),
    S({ day: 0, s: "13:00", e: "14:00", subject: "Staffing meeting", online: "teams", key: "staffing-mtg" }),
    S(SHARED.oneSarah),
    S({ day: 1, s: "10:00", e: "11:00", subject: "Engagement managers sync", online: "teams", key: "em-sync" }),
    S(SHARED.review),
    S(SHARED.steerco),
    S(SHARED.debrief),
    S({ day: 2, s: "13:00", e: "14:00", subject: "Interview: associate candidate", loc: "Chicago office, 14A", key: "interview" }),
    S(SHARED.helixDeep),
    S({ day: 3, s: "14:00", e: "15:00", subject: "Team 1:1 with Alyssa", people: ["sarah", "alyssa"], online: "teams", key: "sarah-aly" }),
    S({ day: 4, s: "12:30", e: "13:30", subject: "Lunch with mentor", key: "sarah-mentor", priv: true }),
    S(SHARED.retro),
  ])
);

/* ------------------------------ Brad (PT, client at Northwind) ------------------------------ */
const B = (o) => event("brad", TZ.PT, o);
write(
  "brad.json",
  envelope("brad.whitfield@northwindco.example", [
    B({ ...SHARED.northwind, s: "09:00", e: "10:00" }),
    B({ day: 1, s: "10:00", e: "11:00", subject: "Budget review (internal)", online: "teams", key: "brad-budget" }),
    B({ ...SHARED.steerco, s: "09:00", e: "10:00" }),
    B({ day: 2, s: "13:00", e: "14:00", subject: "Board prep", loc: "Northwind HQ, Seattle", key: "brad-board" }),
    B({ day: 3, s: "11:00", e: "12:00", subject: "Vendor demo: logistics platform", online: "zoom", key: "brad-vendor" }),
    B({ day: 4, s: "09:00", e: "10:00", subject: "Ops weekly", online: "teams", key: "brad-ops" }),
  ])
);

/* ------------------------------ Priya (IST, data scientist in Bengaluru) ------------------------------ */
// Her calendar settings say 9 AM to 6 PM IST (the default nobody changed). In reality she works 8 AM to 12 PM Eastern, which only the knowledge base knows. 9:00 AM CT is 8:30 PM IST.
// 9:00 AM CT is 8:30 PM IST.
const R = (o) => event("priya", TZ.IST, o);
write(
  "priya.json",
  envelope("priya.raman@firmname.example", [
    ...[0, 1, 2, 3].map((d) => R({ ...SHARED.standup(d), s: "20:30", e: "21:00" })),
    R({ ...SHARED.proposal, s: "21:00", e: "22:00" }),
    R({ day: 0, s: "11:00", e: "12:30", subject: "Data pipeline refactor", online: "teams", key: "pipeline-refactor" }),
    R({ day: 0, s: "15:00", e: "16:00", subject: "India analytics team sync", online: "teams", key: "india-sync" }),
    R({ day: 1, s: "13:00", e: "14:00", subject: "Lunch", key: "priya-lunch", show: "free" }),
    R({ day: 2, s: "16:00", e: "17:30", subject: "Model training review", online: "teams", key: "model-training" }),
    R({ ...SHARED.handoff, s: "21:00", e: "21:30" }),
    R({ day: 3, s: "15:00", e: "18:00", subject: "Deep work: feature engineering", key: "priya-deep" }),
    R({ day: 4, subject: "Out of office: Diwali week", allDay: true, show: "oof", key: "priya-oof" }),
  ])
);

/* ------------------------------ directory: profiles + mailbox settings ------------------------------ */
const wh = (tz, start, end) => ({
  daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  startTime: `${start}:00.0000000`,
  endTime: `${end}:00.0000000`,
  timeZone: { name: tz },
});
write("directory.json", {
  "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users",
  value: [
    { id: "u-you", displayName: P.you.name, mail: P.you.address, jobTitle: "Summer Associate", officeLocation: "Chicago", mailboxSettings: { timeZone: TZ.CT, workingHours: wh(TZ.CT, "09:00", "17:00") } },
    { id: "u-jake", displayName: P.jake.name, mail: P.jake.address, jobTitle: "Partner", officeLocation: "New York", mailboxSettings: { timeZone: TZ.ET, workingHours: wh(TZ.ET, "08:00", "19:00") } },
    { id: "u-alyssa", displayName: P.alyssa.name, mail: P.alyssa.address, jobTitle: "Associate", officeLocation: "Chicago", mailboxSettings: { timeZone: TZ.CT, workingHours: wh(TZ.CT, "09:00", "17:30") } },
    { id: "u-sarah", displayName: P.sarah.name, mail: P.sarah.address, jobTitle: "Engagement Manager", officeLocation: "Chicago", mailboxSettings: { timeZone: TZ.CT, workingHours: wh(TZ.CT, "08:30", "17:30") } },
    { id: "u-priya", displayName: P.priya.name, mail: P.priya.address, jobTitle: "Data Scientist", officeLocation: "Bengaluru", mailboxSettings: { timeZone: TZ.IST, workingHours: wh(TZ.IST, "09:00", "18:00") } },
    { id: "u-brad", displayName: P.brad.name, mail: P.brad.address, jobTitle: "VP Operations, Northwind Co (client)", officeLocation: "Seattle", mailboxSettings: { timeZone: TZ.PT, workingHours: wh(TZ.PT, "09:00", "17:00") } },
  ],
});

console.log("wrote Graph sample data to", OUT);
