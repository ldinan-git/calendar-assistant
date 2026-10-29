// Turning a chosen slot into a real event: which calendar it goes on, which video provider, where it gets mirrored.
// Code, not LLM: these are rules with a right answer, and each decision comes with a reason the bot can show.

import { CALENDAR_STYLE } from "../data/mock.js";

const rand = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const slug = (n) => Array.from({ length: n }, () => "abcdefghijkmnpqrstuvwxyz"[Math.floor(Math.random() * 24)]).join("");

export function pickCalendar(title, attendees) {
  if (/club|case comp|recruit|panel|speaker/i.test(title)) return { calId: "cal-org", reason: "the title looks like a club event" };
  if (!attendees.length && /lunch|dinner|dentist|gym|personal|tour/i.test(title)) return { calId: "cal-personal", reason: "it is a personal event" };
  return { calId: "cal-work", reason: "it involves colleagues or a client" };
}

export function pickProvider(calId, attendees, directory) {
  const external = attendees.some((a) => /client/i.test((directory[a] && directory[a].title) || ""));
  if (calId === "cal-work") return external ? { provider: "zoom", reason: "a client is invited, so a Zoom link they can join without a firm account" } : { provider: "teams", reason: "it is internal, so Teams from the work calendar" };
  if (calId === "cal-personal") return { provider: "meet", reason: "personal calendar default" };
  return { provider: "zoom", reason: "club default" };
}

export function joinLink(provider) {
  if (provider === "zoom") return `https://zoom.us/j/${rand(10)}?pwd=${slug(12)}`;
  if (provider === "meet") return `https://meet.google.com/${slug(3)}-${slug(4)}-${slug(3)}`;
  return `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${slug(20)}%40thread.v2/0`;
}

export const PROVIDER_LABEL = { zoom: "Zoom", teams: "Microsoft Teams", meet: "Google Meet" };
export const calLabel = (id) => (CALENDAR_STYLE[id] ? CALENDAR_STYLE[id].label : id);
