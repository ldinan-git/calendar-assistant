export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
export const DATES = ["Nov 2", "Nov 3", "Nov 4", "Nov 5", "Nov 6"];
export const GRID_START = 8 * 60;
export const GRID_END = 23 * 60;
export const PPM = 0.8; // pixels per minute in the calendar grid
export const WORK_START = 9 * 60;
export const WORK_END = 17 * 60;

export const t = (h, m = 0) => h * 60 + m;
export const uid = () => Math.random().toString(36).slice(2, 8);

export const fmt = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

export const slotLabel = (s) => `${DAYS[s.day]} ${fmt(s.start)} to ${fmt(s.end)}`;
