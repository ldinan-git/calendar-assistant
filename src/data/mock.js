// Demo data. The calendars are Outlook / Microsoft Graph style responses in ./graph (see
// scripts/gen-graph-data.mjs); this file wires them together and holds demo-only constants.
//
// Week of Mon Nov 2 2026. Everything below is already converted into the user's zone (Chicago).

import { loadWorld } from "../lib/graph.js";
import { t } from "../lib/time.js";
import meWork from "./graph/me_work.json";
import mePersonal from "./graph/me_personal.json";
import meOrg from "./graph/me_org.json";
import meCalendars from "./graph/me_calendars.json";
import directory from "./graph/directory.json";
import jake from "./graph/jake.json";
import alyssa from "./graph/alyssa.json";
import brad from "./graph/brad.json";
import sarah from "./graph/sarah.json";
import priya from "./graph/priya.json";

export const PEOPLE = ["Jake", "Alyssa", "Brad", "Sarah", "Priya"];
export const PERSON_COLORS = { Jake: "#8A4FB3", Alyssa: "#C9742F", Brad: "#B7423A", Sarah: "#2C6FA3", Priya: "#2C8C80" };

/** How each person relates to the user. Shown on profile cards and in the team diagram. Not facts: the user teaches those. */
export const RELATIONSHIP = {
  Jake: "Partner",
  Alyssa: "Peer",
  Brad: "Client",
  Sarah: "Direct manager",
  Priya: "Data scientist (India)",
};

export const CALENDAR_STYLE = {
  "cal-work": { label: "Work", color: "#4D7AA6" },
  "cal-personal": { label: "Personal", color: "#2E7D5B" },
  "cal-org": { label: "Club", color: "#C9742F" },
};

export const WORLD = loadWorld({
  me: { "cal-work": meWork, "cal-personal": mePersonal, "cal-org": meOrg },
  calendars: meCalendars,
  personCalendars: { Jake: jake, Alyssa: alyssa, Brad: brad, Sarah: sarah, Priya: priya },
  directory,
});

export const INITIAL_EVENTS = WORLD.events;
export const TEAM = WORLD.team;
export const DIRECTORY = WORLD.dir.people;
export const MIRRORS = WORLD.mirrors;
export const CAL_IDS = WORLD.calendars.map((c) => c.id);

/** Sender / account the user books from. */
export const EMAILS = ["luke.dinan@firmname.example (work)", "luke.dinan@outlook.example (personal)", "luke.dinan@school.example (club)"];

// Demo "incoming invites", used one at a time by the Simulate button.
// Brad's lands Monday 4:15 PM: inside the hour-before hold on your 5 PM flight and on top of your 1:1 with Sarah.
export const INCOMING = [
  { from: "Brad", title: "Northwind: scope check-in", attendees: ["You", "Brad"], day: 0, start: t(16, 15), end: t(16, 45) },
  { from: "Jake", title: "Quick sync on terms", attendees: ["You", "Jake"], day: 4, start: t(11, 30), end: t(12) },
];

/** What to tell the assistant about the team. One sentence per line, so a whole block can be pasted at once. */
/** Your own rules (demo script part 2). */
export const OWN_CONTEXT = ["When you see a flight, hold an hour before and an hour after it."];

/** Context about each teammate (demo script part 4). Teams are messy: Priya's calendar says 9 to 6 in India, but they work 8 to 12 Eastern. */
export const TEAM_CONTEXT = [
  "Jake is a partner. Keep buffers around meetings with him.",
  "Alyssa is my main peer. Her meetings can be rescheduled with ease.",
  "Brad is a client. Never reschedule a meeting with him.",
  "Sarah is my direct manager.",
  "Priya is in Bengaluru and only works 8 AM to 12 PM ET.",
];

export const TEACH_EXAMPLES = [...OWN_CONTEXT, ...TEAM_CONTEXT];

export const ASK_EXAMPLES = [
  "Schedule a meeting with Jake, Alyssa, and Brad",
  "I need 30 minutes with Priya. What times work?",
  "Set up 45 minutes with Jake and Sarah this week",
];
