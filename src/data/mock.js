import { t } from "../lib/time.js";

export const PEOPLE = ["Jake", "Josh", "Priya"];
export const PERSON_COLORS = { Jake: "#8A4FB3", Josh: "#C9742F", Priya: "#2C8C80" };
export const EMAILS = ["you@company.com (work)", "you@university.edu (school)", "you@gmail.com (personal)"];

// The user's own calendar. Week of Mon Nov 2 2026. day: 0=Mon ... 4=Fri, times are minutes since midnight.
export const INITIAL_EVENTS = [
  { id: "e1", title: "Team standup", attendees: ["You", "Josh", "Priya"], day: 0, start: t(9), end: t(9, 30) },
  { id: "e2", title: "Proposal working session", attendees: ["You", "Priya"], day: 0, start: t(9, 30), end: t(10, 30) },
  { id: "e3", title: "1:1 with Josh", attendees: ["You", "Josh"], day: 0, start: t(14), end: t(15) },
  { id: "e4", title: "Team standup", attendees: ["You", "Josh", "Priya"], day: 1, start: t(9), end: t(9, 30) },
  { id: "e5", title: "Coffee catch-up with Josh", attendees: ["You", "Josh"], day: 1, start: t(14), end: t(15) },
  { id: "e6", title: "Partner review", attendees: ["You", "Jake", "Priya"], day: 1, start: t(14, 30), end: t(15, 30) },
  { id: "e7", title: "Team standup", attendees: ["You", "Josh", "Priya"], day: 2, start: t(9), end: t(9, 30) },
  { id: "e8", title: "Client call: Northwind", attendees: ["You", "Priya"], day: 2, start: t(11), end: t(12) },
  { id: "e9", title: "UA 482 to SFO", attendees: ["You"], day: 2, start: t(15), end: t(17) },
  { id: "e10", title: "Team standup", attendees: ["You", "Josh", "Priya"], day: 3, start: t(9), end: t(9, 30) },
  { id: "e11", title: "Proposal draft block", attendees: ["You"], day: 3, start: t(10), end: t(11) },
  { id: "e12", title: "Design sync", attendees: ["You", "Priya", "Josh"], day: 3, start: t(13), end: t(14) },
  { id: "e13", title: "Team standup", attendees: ["You", "Josh", "Priya"], day: 4, start: t(9), end: t(9, 30) },
  { id: "e14", title: "Weekly check-in", attendees: ["You", "Jake"], day: 4, start: t(11), end: t(11, 30) },
];

// Teammates' calendars as free/busy only (no titles), like the Google freeBusy / Graph getSchedule APIs return.
export const OTHER_BUSY = {
  Jake: [
    { day: 0, start: t(10), end: t(12) },
    { day: 1, start: t(10), end: t(11, 30) },
    { day: 2, start: t(9, 30), end: t(11) },
    { day: 2, start: t(13), end: t(15) },
    { day: 3, start: t(14), end: t(16) },
    { day: 4, start: t(13), end: t(15) },
  ],
  Josh: [
    { day: 1, start: t(11), end: t(12) },
    { day: 2, start: t(10), end: t(11) },
    { day: 3, start: t(15), end: t(16) },
  ],
  Priya: [
    { day: 0, start: t(12), end: t(13) },
    { day: 2, start: t(13), end: t(14) },
    { day: 4, start: t(14), end: t(16) },
  ],
};

// Demo "incoming invites", used one at a time by the Simulate button.
export const INCOMING = [
  { from: "Priya", title: "Roadmap sync", attendees: ["You", "Priya"], day: 2, start: t(14), end: t(15) },
  { from: "Jake", title: "Quick sync on terms", attendees: ["You", "Jake"], day: 3, start: t(11), end: t(11, 30) },
];

export const TEACH_EXAMPLES = [
  "Jake is a partner, anything with him is high priority",
  "Josh is a team member who is my friend, anything with him can be rescheduled",
  "When you see a flight, add an hour buffer warning period",
  "I try to avoid meetings before 10am",
];

export const ASK_EXAMPLES = [
  "Set up 45 minutes with Jake this week",
  "Find 30 minutes with Priya and Josh on Thursday",
];
