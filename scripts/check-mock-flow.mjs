// End-to-end check of the pipeline without a browser or a model (mock provider):
// Graph data -> knowledge base -> analyze -> route -> parse -> candidates -> rank -> book -> sync -> advice,
// plus the model-output validators and the Teammates compare helpers.
// Loads the app modules through Vite so JSON imports and import.meta.glob work exactly like in the app.
//   npm run check:flow
import { createServer } from "vite";

process.env.VITE_MOCK_DELAY_MS = "0";
process.env.VITE_LLM_MODE = "mock";
const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failed++;
};
const throws = (fn) => {
  try { fn(); return false; } catch { return true; }
};

try {
  const { callLLM, getTrace, getSettings, groundRank } = await server.ssrLoadModule("/src/api/llm.js");
  const { check } = await server.ssrLoadModule("/src/api/validate.js");
  const M = await server.ssrLoadModule("/src/data/mock.js");
  const S = await server.ssrLoadModule("/src/lib/scheduler.js");
  const C = await server.ssrLoadModule("/src/lib/context.js");
  const A = await server.ssrLoadModule("/src/lib/analysis.js");
  const B = await server.ssrLoadModule("/src/lib/booking.js");
  const G = await server.ssrLoadModule("/src/lib/graph.js");
  const R = await server.ssrLoadModule("/src/lib/resolve.js");
  const BR = await server.ssrLoadModule("/src/lib/brief.js");
  const { slotLabel, DAYS } = await server.ssrLoadModule("/src/lib/time.js");
  const { withinWorkingHours } = await server.ssrLoadModule("/src/lib/tz.js");
  const ev = M.INITIAL_EVENTS;
  const byTitle = (t) => ev.find((e) => e.title === t);
  ok(getSettings().provider === "mock", "checks run against the mock provider");

  // 1. Graph data and time zones
  ok(ev.length >= 25 && M.CAL_IDS.length === 3, `your three calendars merge into ${ev.length} events, mirrors removed`);
  ok(!ev.some((e) => e.title === "Busy"), "synced Busy mirrors are hidden from the master view");
  ok(Object.keys(M.TEAM).join() === "Jake,Alyssa,Brad,Sarah,Priya", "five teammate calendars loaded");
  ok(M.TEAM.Jake.events.filter((e) => e.categories.includes("Flights")).length >= 4, "Jake has 4+ flight events");
  ok(M.TEAM.Jake.events.length > M.TEAM.Alyssa.events.length * 1.5, "Jake is much busier than Alyssa");
  const priyaStandup = M.TEAM.Priya.events.find((e) => e.title === "Team standup" && e.day === 0);
  ok(priyaStandup && priyaStandup.start === 540, "Priya's 8:30 PM IST standup lands at 9:00 AM Central");
  const brad = M.TEAM.Brad.events.find((e) => e.title === "Northwind weekly status");
  ok(brad && brad.start === 660 && brad.shared, "Brad's 9:00 AM PT meeting is 11:00 AM Central and recognised as the same meeting as yours");
  const jakeThu = M.TEAM.Jake.events.find((e) => e.title === "Meridian board meeting");
  ok(jakeThu && jakeThu.day === 3 && jakeThu.start === 11 * 60 + 30, "Jake's Thursday events (entered in Pacific time) convert correctly");
  ok(!withinWorkingHours(M.DIRECTORY.Priya.hours, 0, 540, 600), "Priya's calendar says 9 AM to 6 PM IST, so 9 AM Central is outside her calendar working hours (the messy part)");
  const flight = byTitle("UA 482 ORD to LGA");
  ok(flight && flight.day === 0 && flight.start === 17 * 60 && flight.categories.includes("Flights"), "your flight: Monday 5:00 PM, ORD to LGA, Outlook 'Flights' category");
  ok(byTitle("UA 1127 LGA to ORD").day === 3 && byTitle("UA 1127 LGA to ORD").start === 20 * 60 && byTitle("UA 1127 LGA to ORD").end === 22 * 60, "return flight Thursday 8:00 to 10:00 PM");
  const unsynced = G.unsyncedEvents(ev, M.MIRRORS, M.CAL_IDS);
  ok(unsynced.length === 10 && unsynced.every((e) => e.calendar !== "cal-work"), `${unsynced.length} personal/club events are invisible to colleagues`);
  ok(G.unsyncedEvents(ev, M.MIRRORS, M.CAL_IDS, new Set(unsynced.map((e) => e.id))).length === 0, "Sync now closes every gap");

  // 2. the knowledge base: teach with the same sentences the demo script pastes
  const kb = [];
  for (const text of M.TEACH_EXAMPLES) {
    const out = await callLLM("extract", { existing_facts: [], user_message: text });
    kb.push({ id: "k" + kb.length, text, facts: out.facts.map((f, i) => ({ ...f, id: "f" + kb.length + i })) });
  }
  const facts = C.kbFacts(kb);
  const allOn = Object.fromEntries(M.PEOPLE.map((p) => [p, true]));
  const dir = C.effectiveDirectory(M.PEOPLE, allOn, facts, M.DIRECTORY);
  const dirNoCtx = C.effectiveDirectory(M.PEOPLE, allOn, [], M.DIRECTORY);
  ok(kb.length === 6 && facts.filter((f) => f.type === "person").length === 5, "six sentences (own rule + five people)");
  const fl = facts.find((f) => f.type === "buffer_rule" && f.trigger.event_type === "flight");
  ok(fl && fl.buffer_before_min === 60 && fl.buffer_after_min === 60, "flight rule: 60 min before and 60 min after");
  ok(facts.some((f) => f.trigger && f.trigger.attendee === "Jake"), "Jake buffer rule");
  ok(facts.find((f) => f.name === "Brad").never_reschedule === true, "Brad: never reschedule");
  const fb = await callLLM("extract", { existing_facts: [], user_message: "my cat is named Pixel" });
  ok(fb.facts[0].source_text === "my cat is named Pixel", "extract fallback echoes the user's text");
  ok(C.factKey(facts.find((f) => f.name === "Jake")) === "person:Jake", "same person taught twice has the same key (so it replaces)");

  // 3. analyze (+ code guardrails)
  const input = (f) => ({
    taught_facts: f,
    people: Object.fromEntries(Object.entries(M.DIRECTORY).map(([n, d]) => [n, { title: d.title }])),
    events: ev.map((e) => ({ id: e.id, title: e.title, attendees: e.attendees, categories: e.categories })),
  });
  const base = await callLLM("analyze", input([]));
  const full = await callLLM("analyze", input(facts));
  ok(full[flight.id].type === "flight" && full[flight.id].flexibility === "none", "Outlook 'Flights' category => type flight, never moves");
  ok(full[byTitle("Northwind weekly status").id].flexibility === "none", "meeting with Brad: flexibility none");
  ok(full[byTitle("1:1 with Alyssa").id].flexibility === "high", "1:1 with Alyssa: flexible");
  ok(base[byTitle("1:1 with Alyssa").id].flexibility === "medium", "same meeting without taught facts: medium");
  ok(full[byTitle("Partner review: Helix workplan").id].priority === "high", "partner review is high priority");
  const sloppy = A.guard(flight, { priority: "low", flexibility: "high", type: "other" }, facts);
  ok(sloppy.type === "flight" && sloppy.flexibility === "none", "guard: a model that calls a flight 'flexible' is overruled");
  const bradMtg = byTitle("Northwind weekly status");
  ok(A.guard(bradMtg, { priority: "low", flexibility: "high", type: "client_meeting" }, facts).flexibility === "none", "guard: never_reschedule beats the model");

  // 4. soft holds and flags
  const zones = S.computeZones(ev, facts, full);
  const before = zones.find((z) => z.kind === "flight" && z.day === 0 && z.end === 1020);
  const after = zones.find((z) => z.kind === "flight" && z.day === 0 && z.start === 19 * 60 + 10);
  ok(before && before.start === 960, "flight rule: Monday 4:00-5:00 PM soft hold before the 5 PM departure");
  ok(after && after.end === 20 * 60 + 10, "flight rule: Monday 7:10-8:10 PM soft hold after landing");
  ok(zones.some((z) => z.kind === "flight" && z.day === 3), "the Thursday return flight gets holds too");
  ok(zones.some((z) => z.kind === "person"), "Jake buffer zones exist around meetings with him");
  ok(S.computeZones(ev, [], full).length === 0, "no rules, no zones");
  const flags = S.computeFlags(ev, zones);
  ok(flags[byTitle("1:1 with Sarah").id].zone, "1:1 with Sarah (Mon 4:00 PM) is flagged: inside the pre-flight soft hold");
  const issues = S.summarizeIssues(ev, flags, DAYS);
  ok(issues.some((i) => i.kind === "conflict" && /recruiting panel/i.test(i.text)), "cross-calendar double booking found: club panel vs team retro");

  // 5. route + parse
  const route = (text, has_options = false) => callLLM("route", { text, people: M.PEOPLE, has_options });
  ok((await route("Schedule a meeting with Jake, Alyssa, and Brad")).intent === "schedule", "route: schedule a meeting");
  ok((await route("I need 30 minutes with Priya. What times work?")).intent === "schedule", "route: need 30 minutes with Priya");
  ok((await route("Brad is a client. Never reschedule a meeting with him.")).intent === "teach", "route: teaching Brad is not a scheduling request");
  ok((await route(M.TEACH_EXAMPLES.join("\n"))).intent === "teach", "route: the whole six-line teaching block is teaching");
  ok((await route("What do you know about Jake?")).intent === "recall", "route: recall");
  const imp = await route("Import my work, personal, and club calendars");
  ok(imp.intent === "import" && imp.calendars.join() === "cal-work,cal-personal,cal-org", "route: import all three calendars");
  const imp2 = await route("Import calendars for Jake, Alyssa, Brad, Sarah, and Priya");
  ok(imp2.intent === "import" && imp2.names.length === 5, "route: import five teammates");
  ok((await route("Sync my calendars")).intent === "sync", "route: sync");
  const bk = await route("book option 2", true);
  ok(bk.intent === "book" && bk.option === 2, "route: book option 2");
  ok((await route("sounds good, do it", true)).intent === "book", "route: confirmation words book the first option");
  const p3 = await callLLM("parse", { text: "Schedule a meeting with Jake, Alyssa, and Brad", people: M.PEOPLE });
  ok(p3.attendees.join() === "Jake,Alyssa,Brad" && p3.duration_min === 45 && p3.days.length === 5, "parse: three attendees, 45 min default, whole week");
  const p1 = await callLLM("parse", { text: "Find an hour with Sarah on Thursday about the Helix deck", people: M.PEOPLE });
  ok(p1.duration_min === 60 && p1.days.join() === "3" && /helix deck/i.test(p1.title), "parse: 'an hour', Thursday, title from 'about'");

  // 6. recall reads the knowledge base
  const notes = C.contextNotes(["Jake", "Alyssa", "Brad"], kb, dir);
  const rec = await callLLM("recall", { question: "What do you know about Jake?", names: ["Jake"], knowledge_base: kb.map((e) => e.text), context_notes: C.contextNotes(["Jake"], kb, dir) });
  ok(/partner/i.test(rec.answer) && /buffers/i.test(rec.answer), "recall: Jake is a partner, keep buffers");
  ok(C.contextNotes(["Brad"], [], dir)[0].text.includes("haven't been told"), "no knowledge => the bot says it hasn't been told");

  // 7. the headline scenario
  const run = async (attendees, dur, days = [0, 1, 2, 3, 4], f = facts, d = dir) =>
    S.genCandidates({ attendees, dur, days, events: ev, otherBusy: S.teamBusy(M.TEAM), analysis: full, zones: S.computeZones(ev, f, full), directory: d, team: M.TEAM, facts: f });
  const cands = await run(["Jake", "Alyssa", "Brad"], 45);
  ok(cands.length >= 3, `Jake + Alyssa + Brad: ${cands.length} candidate slots`);
  const inHold = (c) => zones.some((z) => z.kind === "flight" && z.day === c.day && c.start < z.end && z.start < c.end);
  ok(!cands.some((c) => c.day === 0 && inHold(c)), "no candidate inside a flight soft hold");
  ok(cands.every((c) => c.start >= 660), "all candidates are inside Brad's Pacific working hours (11 AM CT onward)");
  ok(cands.every((c) => c.bumps.every((b) => !b.attendees.includes("Brad") && !b.attendees.includes("Jake"))), "never proposes moving a meeting with Brad or Jake");
  ok(cands.every((c) => c.callouts.some((x) => x.kind === "info" && /Jake|Brad/.test(x.text))), "every card shows Jake's and Brad's local time");
  const ranked = await callLLM("rank", {
    request: "Schedule a meeting with Jake, Alyssa, and Brad",
    meeting: { title: "Sync with Jake, Alyssa & Brad", attendees: ["Jake", "Alyssa", "Brad"], dur: 45 },
    knowledge_base: kb.map((e) => e.text),
    context_notes: notes,
    candidates: cands.map((c) => ({
      id: c.id, when: slotLabel(c), back_to_back: c.b2b, warning_count: c.callouts.filter((x) => x.kind === "warn").length,
      callout_texts: c.callouts.map((x) => x.text), local_times: {}, moves: c.bumps.map((b) => ({ title: b.title, with: [], moves_to: slotLabel(b.newSlot) })),
    })),
  });
  ok(S.matchRankedOptions(cands, ranked.options).length === 3, "rank maps onto 3 real candidates");
  ok(ranked.reminder && /partner/i.test(notes.map((n) => n.text).join(" ")) && /never/i.test(notes.map((n) => n.text).join(" ")), "reminder text exists and the notes recall Jake is a partner and Brad is never moved");

  // 8a. teams are messy: with only the calendar, Priya looks unreachable; one sentence of context fixes it
  ok((await run(["Priya"], 30, [0, 1, 2, 3], [], dirNoCtx)).length === 0, "before any context: Priya's calendar (9-6 IST) never overlaps your day, so no slots");
  ok(dirNoCtx.Priya.fromCalendar && !dirNoCtx.Priya.fromContext && dir.Priya.fromContext, "the effective directory knows where each fact came from");
  ok(dir.Priya.hours.tz === "America/New_York" && dir.Priya.hours.start === 480 && dir.Priya.hours.end === 720 && dir.Priya.tz === "Asia/Kolkata", "taught: Priya works 8 AM to 12 PM Eastern but lives in Bengaluru (IST for local times)");
  const noCal = C.effectiveDirectory(["Jake"], { Jake: false }, [], M.DIRECTORY);
  ok(!noCal.Jake.fromCalendar && noCal.Jake.hours.start === 540 && noCal.Jake.tz === "America/Chicago", "a teammate with no calendar and no context is assumed to keep your hours");
  ok(/no calendar added yet/.test(C.profileLine("Jake", [], noCal).text), "profile of an uncalendared teammate says so");
  ok(/real hours differ/.test(C.profileLine("Priya", [], dirNoCtx).text), "profile of a calendar-only Priya suggests telling the assistant their real hours");
  const adds = await route("Add Jake, Alyssa, Brad, Sarah, and Priya as teammates");
  ok(adds.intent === "team" && adds.names.length === 5, "route: add five teammates (separate from their calendars)");
  const addsCal = await route("Add calendars for Jake, Alyssa, Brad, Sarah, and Priya");
  ok(addsCal.intent === "import" && addsCal.names.length === 5, "route: 'add calendars for ...' is an import, not adding people");
  ok((await route("Add Jake as a teammate")).intent === "team", "route: add one teammate");
  ok((await route("Who should I be careful about rescheduling?")).intent === "recall", "route: a question about the team goes to the knowledge base");
  const wh = check("extract", { facts: [{ type: "person", name: "Priya", working_hours: { start: "8:00", end: "12:00", timezone: "ET" }, timezone: "India" }] }, {}).facts[0];
  ok(wh.working_hours.start === "08:00" && wh.working_hours.timezone === "America/New_York" && wh.timezone === "Asia/Kolkata", "validate: 'ET' and 'India' are normalised to IANA zones, 8:00 padded");
  ok(!("working_hours" in check("extract", { facts: [{ type: "person", name: "X", working_hours: { start: "25:00", end: "12:00", timezone: "Mars/Base" } }] }, {}).facts[0]), "validate: unparseable working hours are dropped, not trusted");

  // 8. Priya: the time zone problem
  const pc = await run(["Priya"], 30);
  ok(pc.length > 0 && pc.every((c) => c.start >= 540 && c.end <= 660), `Priya: ${pc.length} slots, all between 9 and 11 AM Central`);
  ok(pc.every((c) => c.callouts.some((x) => /IST/.test(x.text))), "Priya's slots show her local time in IST");
  ok(C.contextNotes(["Priya"], kb, dir)[0].text.includes("9:00 AM to 11:00 AM"), "Priya's context note states the 9-11 AM overlap");
  ok((await run(["Priya"], 30, [4])).length === 0, "Priya is out of office Friday: no slots");

  // 9. Teammates tab helpers
  const nw = S.nonWorkingRanges(dir.Priya, 1);
  ok(nw.length >= 1 && nw.some((r) => r.start <= 12 * 60 && r.end >= 18 * 60), "Priya's afternoon is shaded as outside her working hours");
  const free = S.commonFree({ people: ["You", "Jake", "Alyssa", "Brad"], day: 1, events: ev, otherBusy: S.teamBusy(M.TEAM), directory: { ...dir, You: M.DIRECTORY.You } });
  ok(free.length > 0 && free.every((r) => r.start >= 660 && r.end <= 17 * 60), "compare: common free time for You, Jake, Alyssa, Brad on Tuesday sits inside all working hours");
  ok(S.commonFree({ people: ["You", "Priya"], day: 4, events: ev, otherBusy: S.teamBusy(M.TEAM), directory: dir }).length === 0, "compare: no common time with Priya on Friday");

  // 10. booking and sync
  const cal = B.pickCalendar("Sync with Jake, Alyssa & Brad", ["Jake", "Alyssa", "Brad"]);
  const prov = B.pickProvider(cal.calId, ["Jake", "Alyssa", "Brad"], dir);
  ok(cal.calId === "cal-work" && prov.provider === "zoom" && /^https:\/\/zoom\.us\/j\/\d{10}/.test(B.joinLink("zoom")), "client in the meeting => work calendar + Zoom link");
  ok(B.pickProvider("cal-work", ["Sarah"], dir).provider === "teams", "internal meeting => Teams");

  // 11. incoming invite from Brad lands in the flight hold and on the 1:1
  const inc = M.INCOMING[0];
  const pend = { id: "inv", title: inc.title, attendees: inc.attendees, day: inc.day, start: inc.start, end: inc.end, pending: true };
  const next = [...ev, pend];
  const f = S.computeFlags(next, S.computeZones(next, facts, full))["inv"];
  ok(f.zone && f.conflict.length === 1 && f.conflict[0].title === "1:1 with Sarah", "Brad's invite: inside the pre-flight hold and overlapping the 1:1 with Sarah");
  const adv = await callLLM("advice", {
    invite: { from: "Brad" }, issues: ["Overlaps 1:1 with Sarah", "Inside your flight soft hold (UA 482 ORD to LGA)"],
    conflicting_meetings: [{ title: "1:1 with Sarah", rating: full[byTitle("1:1 with Sarah").id] }], sender_context: C.profileLine("Brad", kb, dir),
  });
  ok(/client/i.test(adv.advice) && /soft hold/i.test(adv.advice), "advice: Brad is a client, mentions the soft hold");

  // 12. model output validators (what keeps a 3B model from breaking the app)
  const e0 = { events: [{ id: "a" }, { id: "b" }] };
  ok(throws(() => check("extract", { facts: [{ type: "banana" }] }, {})), "validate: extract with no usable fact is rejected");
  ok(check("extract", { facts: [{ type: "person", name: "Brad", priority: "HIGH", flexibility: "weird" }] }, {}).facts[0].flexibility === "medium", "validate: extract fixes an out-of-range level");
  ok(throws(() => check("extract", { facts: [{ type: "buffer_rule", trigger: { attendee: "Jake" } }] }, {})), "validate: a buffer rule with no minutes is rejected");
  const an = check("analyze", { a: ["High", "none"], b: ["??", "low"] }, e0);
  ok(an.a.priority === "high" && an.a.flexibility === "none" && !an.b, "validate: analyze accepts the compact [priority, flexibility] form, drops bad ones");
  ok(check("analyze", { a: { priority: "low", flexibility: "high" } }, e0).a.flexibility === "high", "validate: analyze also accepts the object form");
  ok(check("parse", { title: "x", attendees: ["jake", "Nobody"], duration_min: 9999, days: [7, 2] }).attendees.join() === "Jake", "validate: parse keeps only known people");
  ok(check("parse", { attendees: [], duration_min: 9999, days: [7] }).duration_min === 30, "validate: parse repairs an absurd duration");
  ok(throws(() => check("route", { intent: "dance" }, {})), "validate: unknown intent rejected");
  ok(check("route", { intent: "book", option: 2 }, { has_options: false, text: "book option 2" }).intent === "chat", "validate: 'book' with nothing on offer becomes chat");
  const hallucinated = check("route", { intent: "import", names: ["Jake", "Alyssa", "Brad", "Sarah", "Priya"], calendars: ["work", "personal", "club"] }, { text: "Import my work calendar", has_options: false });
  ok(hallucinated.names.length === 0 && hallucinated.calendars.join() === "cal-work", "validate: names and calendars are read from the text, so a model can't import teammates you didn't name");
  ok(throws(() => check("rank", { options: [{ candidate_id: "zzz" }] }, { candidates: [{ id: "c1" }] })), "validate: rank option pointing at a non-existent candidate is rejected");
  ok(check("rank", { options: [{ candidate_id: "c1" }, { candidate_id: "c1" }, { candidate_id: "c9" }] }, { candidates: [{ id: "c1" }] }).options.length === 1, "validate: rank drops duplicates and invented ids");

  // the agent: find every clash, keep the more important event, move the other to a slot that works for everyone
  const fixes = R.proposeFixes({ events: ev, analysis: full, zones, otherBusy: S.teamBusy(M.TEAM), directory: dir });
  const fixOf = (title) => fixes.find((f) => f.move.title === title);
  ok(fixes.length >= 7, `agent: ${fixes.length} proposals for the seeded double-bookings and the flight hold`);
  ok(fixOf("Model sync") && fixOf("Model sync").keep.title === "Helix workplan deep dive" && fixOf("Model sync").move.with.join() === "Alyssa", "agent: keeps the deep dive with Sarah, moves Model sync, and will tell Alyssa");
  ok(fixOf("Case competition prep").keep.title === "Partner review: Helix workplan", "agent: a club event yields to the partner review");
  ok(fixOf("Call with landlord").keep.title === "Northwind steering committee", "agent: a personal call yields to the client steering committee");
  ok(fixOf("Consulting Club recruiting panel").keep.title === "Team retro", "agent: the club panel yields to the team retro (a cross-calendar clash)");
  ok(fixOf("1:1 with Sarah") && fixOf("1:1 with Sarah").kind === "hold", "agent: the 1:1 inside the pre-flight hold is moved out of it");
  ok(!fixes.some((f) => /^UA /.test(f.move.title) || f.move.with.includes("Brad")), "agent: never moves a flight or a meeting with Brad");
  const planned = ev.map((e) => { const f = fixes.find((x) => x.move.id === e.id && x.canApply); return f ? { ...e, ...f.newSlot } : e; });
  const issuesAfter = S.summarizeIssues(planned, S.computeFlags(planned, S.computeZones(planned, facts, full)), DAYS);
  ok(!issuesAfter.some((i) => i.kind === "conflict"), "agent: after applying every fix, no event overlaps another");
  ok(!planned.some((e, i) => !/^UA /.test(e.title) && S.computeFlags(planned, S.computeZones(planned, facts, full))[e.id].zone && S.computeFlags(planned, S.computeZones(planned, facts, full))[e.id].zone.kind === "flight" && fixes.some((f) => f.move.id === e.id)), "agent: moved meetings land outside flight holds");
  const bf = BR.briefFacts({ events: ev, analysis: full, zones, roster: M.PEOPLE, imported: { team: allOn }, team: M.TEAM, unsynced: 10 });
  ok(bf.conflicts.length >= 6 && bf.flights.length === 2 && bf.teammates_out.some((t) => /Priya.*Fri/.test(t)), "brief: counts the conflicts and flights and knows Priya is out Friday");
  const bt = await callLLM("brief", { facts: bf });
  ok(/clash/.test(bt.brief) && /flying/.test(bt.brief), "brief: the written briefing mentions the clashes and the flights");
  ok((await route("Fix my conflicts")).intent === "resolve" && (await route("Do I have any conflicts?")).intent === "resolve", "route: fix conflicts");
  ok((await route("Brief me on my week")).intent === "brief" && (await route("How's my week looking?")).intent === "brief", "route: brief me");

  // code owns numbers: a small model turned "an hour before and after" into 120/120
  const bad = (text, before, after) => check("extract", { facts: [{ type: "buffer_rule", trigger: { event_type: "flight" }, buffer_before_min: before, buffer_after_min: after }] }, { user_message: text }).facts[0];
  ok(bad("When you see a flight, hold an hour before and an hour after it.", 120, 120).buffer_before_min === 60 && bad("When you see a flight, hold an hour before and an hour after it.", 120, 120).buffer_after_min === 60, "validate: 'an hour before and an hour after' is 60 and 60 whatever the model said");
  ok(bad("Hold 30 minutes after every flight", 60, 60).buffer_before_min === 0 && bad("Hold 30 minutes after every flight", 60, 60).buffer_after_min === 30, "validate: '30 minutes after' means 0 before, 30 after");
  ok(bad("Keep buffers around meetings with him", 15, 15).buffer_before_min === 15, "validate: a sentence with no stated amount leaves the model's numbers alone");

  // a model that explains a slot with a time it was never given gets its reasoning replaced by code
  const cand = { id: "c1", when: "Tue 10:00 AM to 10:30 AM", warning_count: 0, moves: [], callout_texts: ["Priya: 9:30 PM IST"], local_times: { Priya: "9:30 PM IST" } };
  const made = { options: [{ candidate_id: "c1", headline: "ok", reasoning: "Priya is free at 3:15 PM so this is best." }] };
  ok(groundRank(made, { request: "x", candidates: [cand] }) === 1 && /Everyone is free/.test(made.options[0].reasoning), "grounding: reasoning citing 3:15 PM (not in the data) is replaced by the code-written line");
  const fine = { options: [{ candidate_id: "c1", headline: "ok", reasoning: "Priya sees 9:30 PM IST, and 10:00 AM works for you." }] };
  ok(groundRank(fine, { request: "x", candidates: [cand] }) === 0, "grounding: reasoning that only cites times from the data is kept");

  ok(getTrace().length > 15 && getTrace().every((t) => t.mode === "mock"), `trace recorded ${getTrace().length} calls, all mock`);
} catch (e) {
  console.error(e);
  failed++;
} finally {
  await server.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
