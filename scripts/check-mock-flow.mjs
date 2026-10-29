// End-to-end check of the mock pipeline without a browser:
// Graph data -> teach -> analyze -> route -> parse -> candidates -> rank -> book -> sync -> advice.
// Loads the app modules through Vite so JSON imports and import.meta.glob work exactly like in the app.
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
  const M = await server.ssrLoadModule("/src/data/mock.js");
  const S = await server.ssrLoadModule("/src/lib/scheduler.js");
  const C = await server.ssrLoadModule("/src/lib/context.js");
  const B = await server.ssrLoadModule("/src/lib/booking.js");
  const G = await server.ssrLoadModule("/src/lib/graph.js");
  const { slotLabel, DAYS } = await server.ssrLoadModule("/src/lib/time.js");
  const { withinWorkingHours } = await server.ssrLoadModule("/src/lib/tz.js");
  const ev = M.INITIAL_EVENTS;
  const byTitle = (t) => ev.find((e) => e.title === t);

  // 1. Graph data and time zones
  ok(ev.length >= 25 && M.CAL_IDS.length === 3, `your three calendars merge into ${ev.length} events, mirrors removed`);
  ok(!ev.some((e) => e.title === "Busy"), "synced Busy mirrors are hidden from the master view");
  ok(Object.keys(M.TEAM).join() === "Jake,Alyssa,Brad,Sarah,Priya", "five teammate calendars loaded");
  const jakeFlights = M.TEAM.Jake.events.filter((e) => e.categories.includes("Flights"));
  ok(jakeFlights.length >= 4, `Jake has ${jakeFlights.length} flight events`);
  ok(M.TEAM.Jake.events.length > M.TEAM.Alyssa.events.length * 1.5, "Jake is much busier than Alyssa");
  const priyaStandup = M.TEAM.Priya.events.find((e) => e.title === "Team standup" && e.day === 0);
  ok(priyaStandup && priyaStandup.start === 540, "Priya's 8:30 PM IST standup lands at 9:00 AM Central");
  const brad = M.TEAM.Brad.events.find((e) => e.title === "Northwind weekly status");
  ok(brad && brad.start === 660 && brad.shared, "Brad's 9:00 AM PT meeting is 11:00 AM Central and recognised as the same meeting as yours");
  const jakeThu = M.TEAM.Jake.events.find((e) => e.title === "Meridian board meeting");
  ok(jakeThu && jakeThu.day === 3 && jakeThu.start === 11 * 60 + 30, "Jake's Thursday events (entered in Pacific time) convert correctly");
  ok(withinWorkingHours(M.DIRECTORY.Priya.hours, 0, 540, 600) && !withinWorkingHours(M.DIRECTORY.Priya.hours, 0, 720, 780), "Priya works 9-11 AM Central, not noon");
  const unsynced = G.unsyncedEvents(ev, M.MIRRORS, M.CAL_IDS);
  ok(unsynced.length >= 8 && unsynced.every((e) => e.calendar !== "cal-work"), `${unsynced.length} personal/club events are invisible to colleagues`);
  ok(G.unsyncedEvents(ev, M.MIRRORS, M.CAL_IDS, new Set(unsynced.map((e) => e.id))).length === 0, "Sync now closes every gap");

  // 2. teach
  const facts = [];
  for (const text of M.TEACH_EXAMPLES) {
    const out = await callLLM("extract", { existing_facts: [], user_message: text });
    facts.push(...out.facts.map((f, i) => ({ ...f, id: "f" + facts.length + i })));
  }
  ok(facts.filter((f) => f.type === "person").length === 5, "five people taught");
  ok(facts.some((f) => f.type === "buffer_rule" && f.trigger.event_type === "flight" && f.buffer_before_min === 60), "flight rule: 60 min soft hold");
  ok(facts.some((f) => f.trigger && f.trigger.attendee === "Jake"), "Jake buffer rule");
  ok(facts.find((f) => f.name === "Brad").never_reschedule === true, "Brad: never reschedule");
  const fb = await callLLM("extract", { existing_facts: [], user_message: "my cat is named Pixel" });
  ok(fb.facts[0].source_text === "my cat is named Pixel", "extract fallback echoes the user's text");

  // 3. analyze
  const input = (f) => ({
    taught_facts: f,
    people: Object.fromEntries(Object.entries(M.DIRECTORY).map(([n, d]) => [n, { title: d.title }])),
    events: ev.map((e) => ({ id: e.id, title: e.title, attendees: e.attendees, categories: e.categories })),
  });
  const base = await callLLM("analyze", input([]));
  const full = await callLLM("analyze", input(facts));
  const flight = byTitle("UA 482 ORD to DEN");
  ok(full[flight.id].type === "flight" && full[flight.id].flexibility === "none", "Outlook 'Flights' category => type flight, never moves");
  ok(full[byTitle("Northwind weekly status").id].flexibility === "none", "meeting with Brad: flexibility none");
  ok(full[byTitle("1:1 with Alyssa").id].flexibility === "high", "1:1 with Alyssa: flexible");
  ok(base[byTitle("1:1 with Alyssa").id].flexibility === "medium", "same meeting without taught facts: medium");
  ok(full[byTitle("Partner review: Helix workplan").id].priority === "high", "partner review is high priority");

  // 4. soft holds and flags
  const zones = S.computeZones(ev, facts, full);
  const hold = zones.find((z) => z.kind === "flight");
  ok(hold && hold.day === 2 && hold.start === 840 && hold.end === 900, "flight rule: Wed 2:00-3:00 PM soft hold before the 3 PM flight");
  ok(zones.some((z) => z.kind === "person"), "Jake buffer zones exist around meetings with him");
  ok(S.computeZones(ev, [], full).length === 0, "no rules, no zones");
  const flags = S.computeFlags(ev, zones);
  ok(flags[byTitle("Steerco debrief").id].zone, "Steerco debrief (2:15 PM Wed) is flagged: inside the airport hold");
  const issues = S.summarizeIssues(ev, flags, DAYS);
  ok(issues.some((i) => i.kind === "conflict" && /recruiting panel/i.test(i.text)), "cross-calendar double booking found: club panel vs team retro");

  // 5. route + parse
  const route = (text, has_options = false) => callLLM("route", { text, people: M.PEOPLE, has_options });
  ok((await route("Schedule a meeting with Jake, Alyssa, and Brad")).intent === "schedule", "route: schedule a meeting");
  ok((await route("I need 30 minutes with Priya. What times work?")).intent === "schedule", "route: need 30 minutes with Priya");
  ok((await route("Brad is a client. Never reschedule a meeting with him.")).intent === "teach", "route: teaching Brad is not a scheduling request");
  ok((await route("When you see a flight, hold the hour before it")).intent === "teach", "route: flight rule is teaching");
  ok((await route("What do you know about Jake?")).intent === "recall", "route: recall");
  const bk = await route("book option 2", true);
  ok(bk.intent === "book" && bk.option === 2, "route: book option 2");
  ok((await route("sounds good, do it", true)).intent === "book", "route: confirmation words book the first option");
  const p3 = await callLLM("parse", { text: "Schedule a meeting with Jake, Alyssa, and Brad", people: M.PEOPLE });
  ok(p3.attendees.join() === "Jake,Alyssa,Brad" && p3.duration_min === 45 && p3.days.length === 5, "parse: three attendees, 45 min default, whole week");
  const p1 = await callLLM("parse", { text: "Find an hour with Sarah on Thursday about the Helix deck", people: M.PEOPLE });
  ok(p1.duration_min === 60 && p1.days.join() === "3" && /helix deck/i.test(p1.title), "parse: 'an hour', Thursday, title from 'about'");

  // 6. the headline scenario
  const run = async (attendees, dur, days = [0, 1, 2, 3, 4], f = facts) =>
    S.genCandidates({ attendees, dur, days, events: ev, otherBusy: S.teamBusy(M.TEAM), analysis: full, zones: S.computeZones(ev, f, full), directory: M.DIRECTORY, team: M.TEAM, facts: f });
  const cands = await run(["Jake", "Alyssa", "Brad"], 45);
  ok(cands.length >= 3, `Jake + Alyssa + Brad: ${cands.length} candidate slots`);
  ok(!cands.some((c) => c.day === 2 && c.start >= 840 && c.start < 900), "no candidate inside the Wed airport hold");
  ok(cands.every((c) => c.start >= 660 && c.end <= 17 * 60 - 0 && c.start + 0 >= 600), "all candidates are inside Brad's Pacific working hours (11 AM CT onward)");
  ok(cands.every((c) => c.bumps.every((b) => !b.attendees.includes("Brad") && !b.attendees.includes("Jake"))), "never proposes moving a meeting with Brad or Jake");
  ok(cands.every((c) => c.callouts.some((x) => x.kind === "info" && /Jake|Brad/.test(x.text))), "every card shows Jake's and Brad's local time");
  const ranked = await callLLM("rank", {
    request: "Schedule a meeting with Jake, Alyssa, and Brad",
    meeting: { title: "Sync: Jake, Alyssa & Brad", attendees: ["Jake", "Alyssa", "Brad"], dur: 45 },
    context_notes: C.contextNotes(["Jake", "Alyssa", "Brad"], facts, M.DIRECTORY),
    candidates: cands.map((c) => ({
      id: c.id, when: slotLabel(c), back_to_back: c.b2b, warning_count: c.callouts.filter((x) => x.kind === "warn").length,
      callout_texts: c.callouts.map((x) => x.text), local_times: {}, moves: c.bumps.map((b) => ({ title: b.title, with: [], moves_to: slotLabel(b.newSlot) })),
    })),
  });
  const opts = S.matchRankedOptions(cands, ranked.options);
  ok(opts.length === 3, "rank maps onto 3 real candidates");
  const notes = C.contextNotes(["Jake", "Alyssa", "Brad"], facts, M.DIRECTORY).map((n) => n.text).join(" ");
  ok(ranked.reminder && /partner/i.test(notes) && /never/i.test(notes), "reminder text exists and the context notes recall Jake is a partner and Brad is never moved");

  // 7. Priya: the time zone problem
  const pc = await run(["Priya"], 30);
  ok(pc.length > 0 && pc.every((c) => c.start >= 540 && c.end <= 660), `Priya: ${pc.length} slots, all between 9 and 11 AM Central`);
  ok(pc.every((c) => c.callouts.some((x) => /IST/.test(x.text))), "Priya's slots show her local time in IST");
  ok(C.contextNotes(["Priya"], facts, M.DIRECTORY)[0].text.includes("9:00 AM to 11:00 AM"), "Priya's context note states the 9-11 AM overlap");
  const fri = await run(["Priya"], 30, [4]);
  ok(fri.length === 0, "Priya is out of office Friday: no slots");

  // 8. booking and sync
  const cal = B.pickCalendar("Sync: Jake, Alyssa & Brad", ["Jake", "Alyssa", "Brad"]);
  const prov = B.pickProvider(cal.calId, ["Jake", "Alyssa", "Brad"], M.DIRECTORY);
  ok(cal.calId === "cal-work" && prov.provider === "zoom" && /^https:\/\/zoom\.us\/j\/\d{10}/.test(B.joinLink("zoom")), "client in the meeting => work calendar + Zoom link");
  ok(B.pickProvider("cal-work", ["Sarah"], M.DIRECTORY).provider === "teams", "internal meeting => Teams");

  // 9. incoming invite from Brad lands in the airport hold and on the debrief
  const inc = M.INCOMING[0];
  const pend = { id: "inv", title: inc.title, attendees: inc.attendees, day: inc.day, start: inc.start, end: inc.end, pending: true };
  const next = [...ev, pend];
  const f = S.computeFlags(next, S.computeZones(next, facts, full))["inv"];
  ok(f.zone && f.conflict.length === 1, "Brad's invite: inside the airport hold and overlapping the Steerco debrief");
  const adv = await callLLM("advice", {
    invite: { from: "Brad" }, issues: ["Overlaps Steerco debrief", "Inside your airport soft hold (UA 482 ORD to DEN)"],
    conflicting_meetings: [{ title: "Steerco debrief", rating: full[byTitle("Steerco debrief").id] }], sender_context: C.profileLine("Brad", facts, M.DIRECTORY),
  });
  ok(/client/i.test(adv.advice) && /soft hold/i.test(adv.advice), "advice: Brad is a client, mentions the soft hold");

  ok(getTrace().length > 15 && getTrace().every((t) => t.mode === "mock"), `trace recorded ${getTrace().length} calls, all mock`);
} catch (e) {
  console.error(e);
  failed++;
} finally {
  await server.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
