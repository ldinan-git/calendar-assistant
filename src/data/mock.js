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
export const INCOMING = [
  { from: "Brad", title: "Northwind: scope check-in", attendees: ["You", "Brad"], day: 2, start: t(14), end: t(14, 30) },
  { from: "Jake", title: "Quick sync on terms", attendees: ["You", "Jake"], day: 4, start: t(11, 30), end: t(12) },
];

/** Plain-English context to teach the assistant. The chat bot and the Knowledge base use these as suggestions. */
export const TEACH_EXAMPLES = [
  "Jake is a partner. Keep buffers around meetings with him.",
  "Alyssa is my main peer. Her meetings can be rescheduled with ease.",
  "Brad is a client. Never reschedule a meeting with him.",
  "Sarah is my direct manager.",
  "Priya is a data scientist in India, on a completely different schedule.",
  "When you see a flight, hold the hour before it so I can get to the airport.",
];

export const ASK_EXAMPLES = [
  "Schedule a meeting with Jake, Alyssa, and Brad",
  "I need 30 minutes with Priya. What times work?",
  "Set up 45 minutes with Jake and Sarah this week",
];
