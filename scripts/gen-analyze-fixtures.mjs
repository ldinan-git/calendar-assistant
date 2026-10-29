// One-off generator for responses/analyze/*.json.
// The fixtures are what an LLM *would* return for the "rate my week" call, hand-authored here once
// so there's a single place to edit. Output files are committed; this script is only for regenerating.
import { writeFileSync } from "node:fs";

const standup = { priority: "medium", flexibility: "low", type: "standup", reason: "Recurring team standup" };

const base = {
  e1: standup, e4: standup, e7: standup, e10: standup, e13: standup,
  e2: { priority: "medium", flexibility: "medium", type: "internal_meeting", reason: "Working session on the proposal" },
  e3: { priority: "medium", flexibility: "medium", type: "one_on_one", reason: "Routine 1:1" },
  e5: { priority: "low", flexibility: "high", type: "social", reason: "Casual catch-up, easy to move" },
  e6: { priority: "high", flexibility: "low", type: "internal_meeting", reason: "Title suggests partner involvement" },
  e8: { priority: "high", flexibility: "low", type: "client_meeting", reason: "External client call" },
  e9: { priority: "high", flexibility: "low", type: "flight", reason: "Fixed flight, cannot move" },
  e11: { priority: "medium", flexibility: "medium", type: "focus_block", reason: "Focus time for the proposal" },
  e12: { priority: "medium", flexibility: "medium", type: "internal_meeting", reason: "Cross-team design sync" },
  e14: { priority: "medium", flexibility: "medium", type: "one_on_one", reason: "Regular check-in" },
};

const jake = {
  e6: { priority: "high", flexibility: "low", type: "internal_meeting", reason: "Jake is a partner" },
  e14: { priority: "high", flexibility: "low", type: "one_on_one", reason: "Jake is a partner" },
};

const josh = {
  e3: { priority: "low", flexibility: "high", type: "one_on_one", reason: "Josh is flexible, can reschedule" },
  e5: { priority: "low", flexibility: "high", type: "social", reason: "Josh is flexible, can reschedule" },
};

const out = {
  "base.json": base,
  "jake.json": { ...base, ...jake },
  "josh.json": { ...base, ...josh },
  "jake_josh.json": { ...base, ...jake, ...josh },
};

for (const [name, body] of Object.entries(out)) {
  writeFileSync(new URL(`../responses/analyze/${name}`, import.meta.url), JSON.stringify(body, null, 2) + "\n");
}
console.log("wrote", Object.keys(out).join(", "));
