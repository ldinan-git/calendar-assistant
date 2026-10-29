// Time zone helpers. The whole app is laid out in the user's zone (Chicago); other people's events and
// working hours are converted into it. Uses Intl only, so DST is handled by the platform.

export const USER_TZ = "America/Chicago";
const WEEK_START_UTC = Date.UTC(2026, 10, 2); // Mon Nov 2 2026

const WINDOWS_TO_IANA = {
  "Central Standard Time": "America/Chicago",
  "Eastern Standard Time": "America/New_York",
  "Pacific Standard Time": "America/Los_Angeles",
  "Mountain Standard Time": "America/Denver",
  "India Standard Time": "Asia/Kolkata",
  UTC: "UTC",
};
export const ianaOf = (name) => WINDOWS_TO_IANA[name] || name;

const formatters = {};
const fmtFor = (tz) =>
  (formatters[tz] ||= new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  }));

function partsAt(utcMs, tz) {
  const o = {};
  fmtFor(tz).formatToParts(new Date(utcMs)).forEach((p) => { o[p.type] = Number(p.value); });
  return o;
}

/** Offset of `tz` from UTC at that instant, in ms (negative west of Greenwich). */
function offsetMs(utcMs, tz) {
  const p = partsAt(utcMs, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}

/** Wall-clock time in `tz` to a UTC instant. */
export function zonedToUtc(y, m, d, h, mi, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let utc = guess - offsetMs(guess, tz);
  utc = guess - offsetMs(utc, tz);
  return utc;
}

/** UTC instant to wall-clock parts in `tz`, plus the day index in the demo week (0 = Monday). */
export function utcToZoned(utcMs, tz) {
  const p = partsAt(utcMs, tz);
  const dayUtc = Date.UTC(p.year, p.month - 1, p.day);
  return {
    minutes: p.hour * 60 + p.minute,
    weekday: new Date(dayUtc).getUTCDay(), // 0 = Sunday
    weekIndex: Math.round((dayUtc - WEEK_START_UTC) / 86400000),
  };
}

/** Graph `{dateTime, timeZone}` to a UTC instant. */
export function graphToUtc({ dateTime, timeZone }) {
  const [date, time] = dateTime.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return zonedToUtc(y, m, d, h, mi, ianaOf(timeZone));
}

/** UTC instant to a slot in the user's week: {day, min}. day may fall outside 0..4. */
export function toUserSlot(utcMs) {
  const z = utcToZoned(utcMs, USER_TZ);
  return { day: z.weekIndex, min: z.minutes };
}

/** A user-zone slot (day 0..4, minutes) to a UTC instant. */
export function userSlotToUtc(day, min) {
  const d = new Date(WEEK_START_UTC + day * 86400000);
  return zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), Math.floor(min / 60), min % 60, USER_TZ);
}

/** Is [start, end) on `day` (user zone) inside this person's working hours? */
export function withinWorkingHours(hours, day, start, end) {
  if (!hours) return true;
  const a = utcToZoned(userSlotToUtc(day, start), hours.tz);
  const b = utcToZoned(userSlotToUtc(day, end), hours.tz);
  if (a.weekIndex !== b.weekIndex) return false;
  const wd = a.weekday === 0 ? 7 : a.weekday; // 1 = Monday ... 7 = Sunday
  return hours.days.includes(wd) && a.minutes >= hours.start && b.minutes <= hours.end;
}

/** "8:30 PM" for a user-zone slot time, shown in `tz`. */
export function localTimeLabel(day, min, tz) {
  const z = utcToZoned(userSlotToUtc(day, min), tz);
  const h = Math.floor(z.minutes / 60);
  const m = z.minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

const SHORT = { "America/Chicago": "CT", "America/New_York": "ET", "America/Los_Angeles": "PT", "Asia/Kolkata": "IST", "America/Denver": "MT" };
export const tzShort = (tz) => SHORT[tz] || tz;
