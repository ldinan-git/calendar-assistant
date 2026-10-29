// End-to-end check of the mock pipeline without a browser:
// teach facts -> analyze -> parse -> candidates -> rank -> match options -> advice.
// Loads src/api/llm.js through Vite so import.meta.glob works exactly like in the app.
//   npm run check:flow
import { createServer } from "vite";

process.env.VITE_MOCK_DELAY_MS = "0";
const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failed++;
};

try {
  const { callLLM, getTrace } = await server.ssrLoadModule("/src/api/llm.js");
  const { INITIAL_EVENTS, OTHER_BUSY, TEACH_EXAMPLES, INCOMING } = await server.ssrLoadModule("/src/data/mock.js");
  const S = await server.ssrLoadModule("/src/lib/scheduler.js");
  const { slotLabel } = await server.ssrLoadModule("/src/lib/time.js");

  // 1. teach
  let facts = [];
  for (const text of TEACH_EXAMPLES) {
    const out = await callLLM("extract", { existing_facts: [], user_message: text });
    facts.push(...out.facts.map((f, i) => ({ ...f, id: "f" + facts.length + i })));
  }
  ok(facts.length === 4, "4 example sentences produce 4 facts");
  ok(facts.some((f) => f.type === "buffer_rule" && f.buffer_before_min === 60), "flight rule extracted as buffer_rule, 60 min");
  const fallback = await callLLM("extract", { existing_facts: [], user_message: "my cat is named Pixel" });
  ok(fallback.facts[0].source_text === "my cat is named Pixel", "extract fallback echoes the user's text");

  // 2. analyze, with and without facts
  const evInput = INITIAL_EVENTS.map((e) => ({ id: e.id, title: e.title }));
  const base = await callLLM("analyze", { taught_facts: [], events: evInput });
  const full = await callLLM("analyze", { taught_facts: facts, events: evInput });
  ok(base.e6.priority === "high" && base.e5.flexibility === "high", "base analysis rates the Partner review high and the coffee flexible");
  ok(full.e3.flexibility === "high" && full.e14.priority === "high", "with Jake and Josh facts: Josh 1:1 flexible, Jake check-in high");
  ok(full.e9.type === "flight", "flight is typed flight");

  // 3. buffer zone
  const zones = S.computeZones(INITIAL_EVENTS, facts, full);
  ok(zones.length === 1 && zones[0].day === 2 && zones[0].start === 840 && zones[0].end === 1080, "flight rule makes a Wed 2pm to 6pm zone");
  ok(S.computeZones(INITIAL_EVENTS, [], full).length === 0, "no rule, no zone");

  // 4. ask for a meeting
  const text = "Set up 45 minutes with Jake this week";
  const parsed = await callLLM("parse", { text });
  ok(parsed.duration_min === 45 && parsed.attendees[0] === "Jake", "parse: 45 min with Jake");
  const cands = S.genCandidates({ attendees: parsed.attendees, dur: 45, days: parsed.days, events: INITIAL_EVENTS, otherBusy: OTHER_BUSY, analysis: full, zones });
  ok(cands.some((c) => c.bumps.length === 1 && c.bumps[0].title === "1:1 with Josh"), "candidates include a Josh bump");
  ok(!cands.some((c) => c.day === 2 && c.start >= 840 && c.start < 1080), "no candidate lands in the flight buffer");
  const ranked = await callLLM("rank", { request: text, meeting: parsed, taught_facts: facts.map((f) => f.summary), candidates: [] });
  const opts = S.matchRankedOptions(cands, ranked.options);
  ok(opts.length === 3, "rank fixture maps onto 3 real candidates");
  ok(opts[2].bumps.length === 1 && opts[2].bumps[0].newSlot.start === 630, "third option moves Josh to Mon 10:30, matching the fixture's bump_message");

  // fixture specificity: fewer facts => less specific rank file
  const noFacts = await callLLM("rank", { request: text, taught_facts: [], candidates: [] });
  ok(!JSON.stringify(noFacts).includes("Josh"), "with no facts the generic rank file is used (no Josh mention)");

  // 5. the other scenarios resolve to real candidates
  for (const [req, attendees, dur, days] of [
    ["Find 30 minutes with Priya and Josh on Thursday", ["Priya", "Josh"], 30, [3]],
    ["Find 60 minutes with Priya for Roadmap sync", ["Priya"], 60, [0, 1, 2, 3, 4]],
    ["Find 30 minutes with Jake for Quick sync on terms", ["Jake"], 30, [0, 1, 2, 3, 4]],
  ]) {
    const p = await callLLM("parse", { text: req });
    ok(p.duration_min === dur && p.attendees.join() === attendees.join(), `parse: "${req}"`);
    const c = S.genCandidates({ attendees, dur, days: p.days, events: INITIAL_EVENTS, otherBusy: OTHER_BUSY, analysis: full, zones });
    const r = await callLLM("rank", { request: req, taught_facts: facts.map((f) => f.summary), candidates: [] });
    ok(S.matchRankedOptions(c, r.options).length === 3, `rank fixture resolves 3 candidates for "${req}"`);
  }

  // 6. incoming invite advice
  const inc = INCOMING[0];
  const ev = { id: "inv", title: inc.title, attendees: inc.attendees, day: inc.day, start: inc.start, end: inc.end, pending: true };
  const next = [...INITIAL_EVENTS, ev];
  const f = S.computeFlags(next, S.computeZones(next, facts, full))[ev.id];
  ok(f.zone && f.b2bWith.length === 1 && f.conflict.length === 0, "Roadmap sync: inside flight buffer, back-to-back with the flight, no overlap");
  const adv = await callLLM("advice", { taught_facts: facts.map((x) => x.summary), invite: { title: inc.title }, issues: [] });
  ok(/buffer/i.test(adv.advice), "advice mentions the buffer when the flight rule is taught");
  const adv2 = await callLLM("advice", { taught_facts: [], invite: { title: inc.title }, issues: [] });
  ok(!/buffer/i.test(adv2.advice), "advice without the rule doesn't mention a buffer rule");

  // 7. unknown rank request => no fixture => app falls back to code order
  let threw = false;
  try { await callLLM("rank", { request: "lunch with Priya", taught_facts: [], candidates: [] }); } catch { threw = true; }
  ok(threw, "unmatched rank request throws (App catches this and uses code ordering)");

  ok(getTrace().length > 15 && getTrace().every((t) => t.mode === "mock"), `trace recorded ${getTrace().length} calls, all mock`);
} catch (e) {
  console.error(e);
  failed++;
} finally {
  await server.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
