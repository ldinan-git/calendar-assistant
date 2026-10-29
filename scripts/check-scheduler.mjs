// Prints candidate slots for the demo scenarios, using the analyze fixtures as the "LLM" ratings.
// Used to author responses/rank/*.json (which reference slots by day+start) and as a smoke test.
//   node scripts/check-scheduler.mjs
import { readFileSync } from "node:fs";
import { INITIAL_EVENTS, OTHER_BUSY } from "../src/data/mock.js";
import { computeZones, computeFlags, genCandidates, summarizeIssues } from "../src/lib/scheduler.js";
import { DAYS, slotLabel } from "../src/lib/time.js";

const load = (f) => JSON.parse(readFileSync(new URL(`../responses/${f}`, import.meta.url), "utf8"));
const flightRule = { type: "buffer_rule", trigger: { event_type: "flight" }, buffer_before_min: 60, buffer_after_min: 60, severity: "warning" };

function scenario(name, analysisFile, facts, req) {
  const analysis = load(analysisFile);
  const zones = computeZones(INITIAL_EVENTS, facts, analysis);
  const cands = genCandidates({ ...req, events: INITIAL_EVENTS, otherBusy: OTHER_BUSY, analysis, zones });
  console.log(`\n=== ${name} ===`);
  console.log("zones:", zones.map((z) => `${DAYS[z.day]} ${z.start}-${z.end}`).join(", ") || "none");
  cands.forEach((c) =>
    console.log(
      `${c.id.padEnd(4)} day=${c.day} start=${String(c.start).padEnd(5)} ${slotLabel(c).padEnd(26)}` +
        ` before=${c.gapBefore} after=${c.gapAfter} b2b=${c.b2b} zone=${c.zone ? "Y" : "-"}` +
        (c.bumps.length ? ` BUMP ${c.bumps[0].title} -> ${slotLabel(c.bumps[0].newSlot)}` : "")
    )
  );
}

const all = [0, 1, 2, 3, 4];
scenario("Jake 45, jake+josh+flight", "analyze/jake_josh.json", [flightRule], { attendees: ["Jake"], dur: 45, days: all });
scenario("Jake 45, no facts", "analyze/base.json", [], { attendees: ["Jake"], dur: 45, days: all });
scenario("Priya+Josh Thu 30, jake+josh+flight", "analyze/jake_josh.json", [flightRule], { attendees: ["Priya", "Josh"], dur: 30, days: [3] });
scenario("Priya 60 (roadmap), jake+josh+flight", "analyze/jake_josh.json", [flightRule], { attendees: ["Priya"], dur: 60, days: all });
scenario("Jake 30 (quick sync), jake+josh+flight", "analyze/jake_josh.json", [flightRule], { attendees: ["Jake"], dur: 30, days: all });

const zones = computeZones(INITIAL_EVENTS, [flightRule], load("analyze/jake_josh.json"));
console.log("\n=== Heads-up on the starting week ===");
summarizeIssues(INITIAL_EVENTS, computeFlags(INITIAL_EVENTS, zones), DAYS).forEach((i) => console.log(`[${i.kind}] ${i.text}`));
