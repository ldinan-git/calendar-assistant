// The app. It runs in one of two modes, each served as its own page (see src/entries):
//   mode "fresh": a blank slate. No calendars, no teammates, nothing taught. For showing how it gets set up.
//   mode "final": everything imported, added, taught and synced. For showing the finished product.
// Same code, different starting state. The demo script walks fresh to final step by step.

import { useState, useEffect, useMemo, useRef } from "react";
import { callLLM } from "./api/llm.js";
import { mockRoute, mockAnalyze } from "./api/mockBrain.js";
import { fixtureExtract } from "./api/fixtures.js";
import {
  INITIAL_EVENTS, TEAM, DIRECTORY, MIRRORS, CAL_IDS, INCOMING, PEOPLE, PERSON_COLORS, TEACH_EXAMPLES, CALENDAR_STYLE,
} from "./data/mock.js";
import { DAYS, slotLabel, uid } from "./lib/time.js";
import { computeZones, computeFlags, genCandidates, matchRankedOptions, summarizeIssues, teamBusy } from "./lib/scheduler.js";
import { unsyncedEvents } from "./lib/graph.js";
import { contextNotes, flightRuleNote, profileLine, kbFacts, factKey, effectiveDirectory, overlapWindow } from "./lib/context.js";
import { guard, ratingKey } from "./lib/analysis.js";
import { localTimeLabel, tzShort, USER_TZ } from "./lib/tz.js";
import { pickCalendar, pickProvider, joinLink, PROVIDER_LABEL, calLabel } from "./lib/booking.js";
import CalendarView from "./components/CalendarView.jsx";
import CalendarsPanel from "./components/CalendarsPanel.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import TeamView from "./components/TeamView.jsx";
import { InvitePanel, HeadsUpPanel, ActivityPanel } from "./components/SidePanels.jsx";

const ACCOUNTS = { "cal-work": "luke.dinan@firmname.example", "cal-personal": "luke.dinan@outlook.example", "cal-org": "luke.dinan@school.example" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
const PEOPLE_INFO = Object.fromEntries(Object.entries(DIRECTORY).map(([n, d]) => [n, { title: d.title, office: d.office, timezone: d.tz }]));
const KNOWN = `I only have sample calendars for ${list(PEOPLE)} in this demo.`;

const GREETING = {
  fresh: "This is a blank slate: no calendars, no teammates, and I don't know anything yet. Set it up from here or from the panels on the left. The demo script has every line to paste.",
  final: "Everything is set up: your three calendars, five teammates and what you've taught me. Ask what I know about anyone, or try \"Schedule a meeting with Jake, Alyssa, and Brad\".",
};

const initialImported = (final) => ({
  cals: Object.fromEntries(CAL_IDS.map((c) => [c, final])),
  team: Object.fromEntries(PEOPLE.map((p) => [p, final])),
});

const factsKeyOf = (facts) => JSON.stringify(facts.map((f) => [f.type, f.name, f.priority, f.flexibility, f.never_reschedule, f.trigger, f.buffer_before_min, f.buffer_after_min]));

/** The finished product starts with the demo sentences already taught, without calling a model. */
function finalKB() {
  const stamp = new Date().toISOString().slice(0, 10);
  return TEACH_EXAMPLES.map((text) => ({
    id: uid(),
    text,
    facts: fixtureExtract(text).out.facts.map((f) => ({ ...f, id: uid(), created_at: stamp })),
  }));
}

/** The finished product looks finished immediately: its ratings are pre-computed, so no model call at load. */
function seedRated(kbInit) {
  const facts = kbFacts(kbInit);
  const fk = factsKeyOf(facts);
  const out = mockAnalyze({ taught_facts: facts, people: PEOPLE_INFO, events: INITIAL_EVENTS.map((e) => ({ id: e.id, title: e.title, attendees: e.attendees, categories: e.categories })) });
  return new Map(INITIAL_EVENTS.map((e) => [e.id, { key: ratingKey(e, "", fk), rating: guard(e, out[e.id], facts), final: true }]));
}

export default function Workspace({ mode, quick }) {
  const FINAL = mode === "final";
  const [view, setView] = useState("calendar");
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [imported, setImported] = useState(() => initialImported(FINAL));
  const [roster, setRoster] = useState(() => (FINAL ? [...PEOPLE] : []));
  const [kb, setKb] = useState(() => (FINAL ? finalKB() : []));
  const [synced, setSynced] = useState(() => new Set(FINAL ? INITIAL_EVENTS.map((e) => e.id) : []));
  const [syncMsg, setSyncMsg] = useState("");
  const [shown, setShown] = useState(() => Object.fromEntries(CAL_IDS.map((c) => [c, true])));
  const [overlay, setOverlay] = useState(() => Object.fromEntries(PEOPLE.map((p) => [p, false])));
  const [notes, setNotes] = useState({});
  const [analysis, setAnalysis] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [selected, setSelected] = useState(null);

  const [messages, setMessages] = useState([{ id: "greet", kind: "bot", text: GREETING[mode] }]);
  const [chatInput, setChatInput] = useState("");
  const [busy, setBusy] = useState("");
  const [current, setCurrent] = useState(null); // the options currently on offer
  const [hover, setHover] = useState(null);
  const [log, setLog] = useState([]);
  const [answers, setAnswers] = useState({});
  const [asking, setAsking] = useState("");
  const [invite, setInvite] = useState(null);
  const [inviteCount, setInviteCount] = useState(0);

  const runId = useRef(0);
  const rated = useRef(null); // event id -> { key, rating }: only new or changed events go back to the model
  if (rated.current === null) rated.current = FINAL ? seedRated(kb) : new Map();
  const say = (m) => setMessages((prev) => [...prev, { id: uid(), kind: "bot", ...m }]);

  const facts = useMemo(() => kbFacts(kb), [kb]);
  const kbTexts = useMemo(() => kb.map((e) => e.text), [kb]);
  // what we know about each teammate: their calendar's settings, overridden by what you taught
  const dir = useMemo(() => effectiveDirectory(roster, imported.team, facts, DIRECTORY), [roster, imported.team, facts]);
  const liveEvents = useMemo(() => events.filter((e) => e.local || imported.cals[e.calendar]), [events, imported.cals]);
  const viewEvents = useMemo(() => liveEvents.filter((e) => shown[e.calendar] !== false), [liveEvents, shown]);

  /* ------------------------------ rating the week ------------------------------ */
  const factsKey = factsKeyOf(facts);
  const eventsKey = JSON.stringify(liveEvents.filter((e) => !e.pending).map((e) => [e.id, e.title, e.day, e.start, e.end, e.attendees, notes[e.id] || ""]));

  useEffect(() => {
    const id = ++runId.current;
    const evs = liveEvents.filter((e) => !e.pending);
    const publish = () => setAnalysis(Object.fromEntries(evs.filter((e) => rated.current.has(e.id)).map((e) => [e.id, rated.current.get(e.id).rating])));
    const stale = (e) => {
      const r = rated.current.get(e.id);
      return !r || r.key !== ratingKey(e, notes[e.id], factsKey);
    };
    // show the deterministic rating at once, so colors and soft holds never wait for a model...
    const fresh = evs.filter(stale);
    if (fresh.length) {
      const base = mockAnalyze({ taught_facts: facts, people: PEOPLE_INFO, events: fresh.map((e) => ({ id: e.id, title: e.title, attendees: e.attendees, categories: e.categories })) });
      fresh.forEach((e) => rated.current.set(e.id, { key: ratingKey(e, notes[e.id], factsKey), rating: guard(e, base[e.id], facts), final: false }));
    }
    // ...then let the model refine whatever isn't final yet
    const todo = evs.filter((e) => !rated.current.get(e.id).final);
    if (!todo.length) {
      publish();
      return undefined;
    }
    publish();
    setAnalyzing(true);
    const timer = setTimeout(async () => {
      try {
        const out = await callLLM("analyze", {
          taught_facts: facts,
          knowledge_base: kbTexts,
          people: Object.fromEntries(Object.entries(dir).map(([n, d]) => [n, { title: d.title, office: d.office, timezone: d.tz }])),
          events: todo.map((e) => ({ id: e.id, title: e.title, when: slotLabel(e), attendees: e.attendees, calendar: e.calendar, categories: e.categories, notes: notes[e.id] || undefined })),
        });
        todo.forEach((e) => {
          // skip events that changed again while the model was thinking: their rating is already stale
          if (rated.current.get(e.id).key === ratingKey(e, notes[e.id], factsKey)) rated.current.set(e.id, { key: ratingKey(e, notes[e.id], factsKey), rating: guard(e, out[e.id], facts), final: true });
        });
      } catch (e) {
        console.error("analyze failed:", e);
      } finally {
        if (id === runId.current) {
          publish();
          setAnalyzing(false);
        }
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsKey, factsKey]);

  const otherBusy = useMemo(() => teamBusy(TEAM, imported.team), [imported.team]);
  const zones = useMemo(() => computeZones(liveEvents, facts, analysis), [liveEvents, facts, analysis]);
  const flags = useMemo(() => computeFlags(liveEvents, zones), [liveEvents, zones]);
  const headsUp = useMemo(() => summarizeIssues(liveEvents, flags, DAYS), [liveEvents, flags]);
  const unsynced = useMemo(() => unsyncedEvents(liveEvents.filter((e) => !e.pending), MIRRORS, CAL_IDS, synced), [liveEvents, synced]);
  const overlayBlocks = useMemo(() => {
    const out = {};
    roster.forEach((p) => {
      out[p] = [
        ...(imported.team[p] ? TEAM[p].events : []).map((e) => ({ day: e.day, start: e.start, end: e.end, title: e.title })),
        ...events.filter((e) => e.local && e.attendees.includes(p)).map((e) => ({ day: e.day, start: e.start, end: e.end, title: e.title })),
      ];
    });
    return out;
  }, [events, imported.team, roster]);

  /* ------------------------------ teammates and calendars ------------------------------ */
  function addTeammates(names) {
    const known = names.filter((n) => PEOPLE.includes(n));
    const fresh = known.filter((n) => !roster.includes(n));
    if (!fresh.length) return `${known.length ? list(known) + (known.length > 1 ? " are" : " is") + " already on your team." : "Who should I add?"} ${KNOWN}`;
    setRoster((r) => [...r, ...fresh]);
    return `Added to your team: ${list(fresh)}. Their calendars aren't connected yet. Add each one separately, like "Add Jake's calendar".`;
  }

  async function doImport({ cals = [], names = [], disconnect = false }) {
    setBusy(disconnect ? "Disconnecting" : "Connecting to Outlook");
    await sleep(disconnect ? 150 : 600);
    const newPeople = disconnect ? [] : names.filter((n) => !roster.includes(n));
    if (newPeople.length) setRoster((r) => [...r, ...newPeople]);
    setImported((p) => ({
      cals: { ...p.cals, ...Object.fromEntries(cals.map((c) => [c, !disconnect])) },
      team: { ...p.team, ...Object.fromEntries(names.map((n) => [n, !disconnect])) },
    }));
    const lines = [
      ...cals.map((c) => `${calLabel(c)} calendar: ${INITIAL_EVENTS.filter((e) => e.calendar === c).length} events`),
      ...names.map((n) => `${n}'s calendar: ${TEAM[n].events.length} events`),
    ];
    say({ text: `${disconnect ? "Disconnected" : "Connected to Outlook"}:\n${lines.join("\n")}${newPeople.length ? `\n(${list(newPeople)} weren't on your team yet, so I added ${newPeople.length > 1 ? "them" : newPeople[0]}.)` : ""}` });
    setBusy("");
  }
  const toggleCal = (id) => doImport({ cals: [id], disconnect: !!imported.cals[id] });
  const toggleTeam = (p) => doImport({ names: [p], disconnect: !!imported.team[p] });
  const importAll = () => doImport({ cals: CAL_IDS.filter((c) => !imported.cals[c]), names: roster.filter((p) => !imported.team[p]) });
  function removeTeammate(p) {
    setRoster((r) => r.filter((x) => x !== p));
    setImported((i) => ({ ...i, team: { ...i.team, [p]: false } }));
  }

  function syncNow() {
    if (!unsynced.length) return null;
    const names = unsynced.map((e) => `${e.title} (${calLabel(e.calendar)})`);
    setSynced((s) => new Set([...s, ...unsynced.map((e) => e.id)]));
    const msg = `Wrote ${unsynced.length} private Busy blocks to your other calendars.`;
    setSyncMsg(msg);
    setLog((prev) => [{ id: uid(), lines: [msg, names.join(", ")] }, ...prev]);
    return `${msg}\n${names.join("\n")}`;
  }

  /* ------------------------------ knowledge base ------------------------------ */
  async function teach(text) {
    const lines = text.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    const confirmations = [];
    for (let i = 0; i < lines.length; i++) {
      setBusy(lines.length > 1 ? `Saving ${i + 1} of ${lines.length}` : "Saving that");
      const out = await callLLM("extract", { existing_facts: facts.map((f) => ({ id: f.id, type: f.type, summary: f.summary })), user_message: lines[i] });
      const stamp = new Date().toISOString().slice(0, 10);
      const fresh = out.facts.map((f) => ({ ...f, id: uid(), created_at: stamp, source_text: f.source_text || lines[i] }));
      const keys = new Set(fresh.map(factKey));
      // teaching the same person or rule again replaces the old fact instead of stacking a duplicate
      setKb((prev) => [
        ...prev
          .map((e) => ({ e, kept: (e.facts || []).filter((f) => !keys.has(factKey(f))) }))
          .filter((x) => !(x.kept.length === 0 && (x.e.facts || []).length > 0))
          .map((x) => ({ ...x.e, facts: x.kept })),
        { id: uid(), text: lines[i], facts: fresh },
      ]);
      confirmations.push(out.confirmation);
    }
    return confirmations.join("\n");
  }

  async function recall(question, names) {
    const who = names.length ? names : roster.length ? roster : PEOPLE;
    return callLLM("recall", { question, names: who, knowledge_base: kbTexts, context_notes: contextNotes(who, kb, dir) });
  }

  async function askAbout(name) {
    setAsking(name);
    try {
      const out = await recall(`What do you know about ${name}?`, [name]);
      setAnswers((a) => ({ ...a, [name]: out.answer }));
    } finally {
      setAsking("");
    }
  }

  /* ------------------------------ schedule ------------------------------ */
  async function runSchedule(text) {
    setBusy("Reading your request");
    setHover(null);
    const parsed = await callLLM("parse", { text, people: PEOPLE });
    const attendees = (parsed.attendees || []).filter((n) => PEOPLE.includes(n));
    if (!attendees.length) {
      say({ text: roster.length ? `Who should be in the meeting? Your team: ${list(roster)}.` : `Who should be in the meeting? Add people first, like "Add Jake as a teammate". ${KNOWN}` });
      return;
    }
    const missing = attendees.filter((p) => !roster.includes(p));
    if (missing.length) {
      say({ text: `${list(missing)} ${missing.length > 1 ? "aren't" : "isn't"} on your team yet. Add ${missing.length > 1 ? "them" : missing[0]} first ("Add ${list(missing)} as ${missing.length > 1 ? "teammates" : "a teammate"}"), then add ${missing.length > 1 ? "their calendars" : "the calendar"} so I can check availability.` });
      return;
    }
    const dur = Number(parsed.duration_min) || 30;
    const days = (parsed.days && parsed.days.length ? parsed.days : [0, 1, 2, 3, 4]).filter((d) => d >= 0 && d <= 4);
    const meta = { title: parsed.title || "Meeting", attendees, dur };
    const notesFor = contextNotes(attendees, kb, dir);
    const flight = flightRuleNote(facts);
    if (flight) notesFor.push({ name: "You", text: flight.replace("Your flights: ", "") });

    setBusy("Checking everyone's calendars and time zones");
    const cands = genCandidates({ attendees, dur, days, events: liveEvents, otherBusy, analysis, zones, directory: dir, team: TEAM, facts });
    const unlinked = attendees.filter((p) => !imported.team[p]);
    const warn = unlinked.length
      ? `I can't see ${list(unlinked)}'s calendar${unlinked.length > 1 ? "s" : ""} (not added), so I'm treating ${unlinked.length > 1 ? "them" : unlinked[0]} as free during their working hours.`
      : "";
    if (!liveEvents.length) say({ text: "Your own calendars aren't connected yet, so I'm only looking at the teammates' calendars." });
    if (!cands.length) {
      const noOverlap = attendees.filter((p) => !overlapWindow(dir[p]));
      say({
        text: `I couldn't find ${dur} minutes inside everyone's working hours in that range.${noOverlap.length ? ` ${list(noOverlap)} ${noOverlap.length > 1 ? "have" : "has"} no overlap with your day at all.` : ""} Try more days, a shorter meeting, or leave someone out. If someone's real hours differ from their calendar, tell me, for example "Priya only works 8 AM to 12 PM ET".`,
        notes: notesFor,
      });
      return;
    }

    setBusy("Ranking the options");
    let opts = [];
    let reminder = "";
    try {
      const out = await callLLM("rank", {
        request: text,
        meeting: meta,
        knowledge_base: kbTexts,
        context_notes: notesFor,
        candidates: cands.map((c) => ({
          id: c.id,
          when: slotLabel(c),
          free_minutes_before: c.gapBefore,
          free_minutes_after: c.gapAfter,
          back_to_back: c.b2b,
          inside_buffer_of: c.zone ? c.zone.title : null,
          warning_count: c.callouts.filter((x) => x.kind === "warn").length,
          callout_texts: c.callouts.map((x) => x.text),
          local_times: Object.fromEntries(
            attendees.filter((p) => dir[p].tz !== USER_TZ).map((p) => [p, `${localTimeLabel(c.day, c.start, dir[p].tz)} ${tzShort(dir[p].tz)}`])
          ),
          moves: c.bumps.map((b) => ({
            title: b.title,
            with: b.attendees.filter((a) => a !== "You"),
            why_flexible: analysis[b.id] && analysis[b.id].reason,
            moves_to: slotLabel(b.newSlot),
          })),
        })),
      });
      opts = matchRankedOptions(cands, out.options);
      reminder = out.reminder || "";
    } catch (e) {
      console.warn("rank failed, falling back to code order:", e.message);
    }
    if (!opts.length) {
      opts = cands.slice(0, 3).map((c) => ({
        ...c,
        headline: slotLabel(c),
        reasoning: "Ranked by breathing room around your other meetings (code fallback, no LLM ranking).",
        invite_message: `Hi, could we meet for ${meta.title}?`,
        bump_message: "",
      }));
    }
    const id = uid();
    setMessages((prev) => [
      ...prev,
      {
        id,
        kind: "options",
        text: `${warn ? warn + " " : ""}${reminder || `${meta.title}, ${dur} minutes, with ${list(attendees)}. Here is what I'm applying, then my top picks.`}`,
        notes: notesFor,
        options: opts,
      },
    ]);
    setCurrent({ id, meta, options: opts });
  }

  /* ------------------------------ book ------------------------------ */
  function book(n) {
    if (!current || !current.options[n - 1]) {
      say({ text: "I don't have options on the table. Ask me for a meeting first." });
      return;
    }
    const o = current.options[n - 1];
    const m = current.meta;
    const cal = pickCalendar(m.title, m.attendees);
    const prov = pickProvider(cal.calId, m.attendees, dir);
    const url = joinLink(prov.provider);
    const ev = {
      id: uid(), uid: uid(), title: m.title, attendees: ["You", ...m.attendees], day: o.day, start: o.start, end: o.end,
      calendar: cal.calId, provider: prov.provider, joinUrl: url, location: "", categories: [], isNew: true, local: true, series: false, isPrivate: false,
    };
    setEvents((prev) => [
      ...prev.map((e) => {
        const b = o.bumps.find((x) => x.id === e.id);
        return b ? { ...e, day: b.newSlot.day, start: b.newSlot.start, end: b.newSlot.end, moved: true } : e;
      }),
      ev,
    ]);
    setSynced((s) => new Set([...s, ev.id]));
    const mirroredTo = CAL_IDS.filter((c) => c !== cal.calId).map(calLabel);
    const invitees = m.attendees.map((p) => {
      const d = dir[p];
      return d.tz === USER_TZ ? `${p} (${localTimeLabel(o.day, o.start, d.tz)} CT)` : `${p} (${localTimeLabel(o.day, o.start, d.tz)} ${tzShort(d.tz)})`;
    });
    const moves = o.bumps.map((b) => {
      const who = b.attendees.filter((a) => a !== "You");
      return `${b.title} moved to ${slotLabel(b.newSlot)}${who.length ? `, note sent to ${list(who)}` : ""}`;
    });
    const booked = {
      title: m.title, when: slotLabel(o), calendar: calLabel(cal.calId), calendarReason: cal.reason, account: ACCOUNTS[cal.calId],
      provider: prov.provider, providerLabel: PROVIDER_LABEL[prov.provider], providerReason: prov.reason, joinUrl: url,
      mirroredTo, invitees, moves, inviteMessage: o.invite_message || "", bumpMessage: o.bump_message || "",
    };
    setMessages((prev) => [...prev, { id: uid(), kind: "booked", text: `Done. I booked option ${n}.`, booked }]);
    setLog((prev) => [
      { id: uid(), lines: [`${m.title}, ${slotLabel(o)}. Created on ${booked.calendar}, invites sent to ${list(m.attendees)}.`, `Busy blocks written to ${mirroredTo.join(" and ")}.`, ...moves] },
      ...prev,
    ]);
    setCurrent(null);
    setHover(null);
  }

  /* ------------------------------ chat router ------------------------------ */
  async function sendChat(text) {
    if (!text.trim() || busy) return;
    setChatInput("");
    setMessages((m) => [...m, { id: uid(), kind: "user", text }]);
    setBusy("Thinking");
    try {
      // a pasted block of several statements is teaching; don't make a small model decide that
      const pre = mockRoute({ text, people: PEOPLE, has_options: !!current });
      const multi = text.split(/\n+/).filter(Boolean).length > 1;
      const r = multi && pre.intent === "teach" ? pre : await callLLM("route", { text, people: PEOPLE, has_options: !!current });
      const names = (r.names || []).filter((n) => PEOPLE.includes(n));
      if (r.intent === "teach") {
        say({ text: await teach(text) });
      } else if (r.intent === "team") {
        say({ text: addTeammates(names) });
      } else if (r.intent === "schedule") {
        await runSchedule(text);
      } else if (r.intent === "book") {
        book(r.option || 1);
      } else if (r.intent === "import") {
        const cals = r.calendars || [];
        if (!cals.length && !names.length) say({ text: "Which calendars? Your work, personal or club calendar, or a teammate's, like Jake's." });
        else await doImport({ cals, names });
      } else if (r.intent === "recall") {
        setBusy("Reading the knowledge base");
        say({ text: (await recall(text, names)).answer });
      } else if (r.intent === "sync") {
        say({ text: syncNow() || (liveEvents.length ? "Everything is already synced: every event is at least a Busy block on all three calendars." : "Connect a calendar first, then I can sync.") });
      } else {
        say({ text: "I can connect calendars, add teammates, learn context (\"Brad is a client\"), schedule meetings (\"schedule a meeting with Jake and Sarah\"), tell you what I know (\"what do you know about Jake?\"), and sync your calendars. What would you like?" });
      }
    } catch (e) {
      console.error(e);
      say({ text: "Something went wrong with that one. Try rephrasing it." });
    } finally {
      setBusy("");
    }
  }

  /* ------------------------------ incoming invites ------------------------------ */
  async function simulateInvite() {
    const inc = INCOMING[inviteCount];
    if (!inc || invite) return;
    setInviteCount((n) => n + 1);
    const ev = { id: uid(), title: inc.title, attendees: inc.attendees, day: inc.day, start: inc.start, end: inc.end, pending: true, local: true, from: inc.from, calendar: "cal-work", categories: [] };
    const next = [...liveEvents, ev];
    const f = computeFlags(next, computeZones(next, facts, analysis))[ev.id];
    const issues = [];
    f.conflict.forEach((c) => issues.push(`Overlaps ${c.title}`));
    f.b2bWith.forEach((c) => issues.push(`Back-to-back with ${c.title}`));
    if (f.zone) issues.push(`Inside your ${f.zone.label.toLowerCase()} (${f.zone.title})`);
    setEvents((prev) => [...prev, ev]);
    setInvite({ event: ev, issues, advice: "", loading: true });
    try {
      const out = await callLLM("advice", {
        knowledge_base: kbTexts,
        sender_context: profileLine(inc.from, kb, { [inc.from]: dir[inc.from] || { tz: USER_TZ, hours: null, fromCalendar: false, fromContext: false } }),
        invite: { from: inc.from, title: inc.title, when: slotLabel(ev), attendees: inc.attendees },
        issues,
        conflicting_meetings: f.conflict.map((c) => ({ title: c.title, rating: analysis[c.id] })),
      });
      setInvite((cur) => (cur && cur.event.id === ev.id ? { ...cur, advice: String(out.advice || "").trim(), loading: false } : cur));
    } catch (e) {
      setInvite((cur) => (cur ? { ...cur, advice: "", loading: false } : cur));
    }
  }
  const acceptInvite = () => {
    setEvents((prev) => prev.map((e) => (e.id === invite.event.id ? { ...e, pending: false } : e)));
    setInvite(null);
  };
  const declineInvite = () => {
    setEvents((prev) => prev.filter((e) => e.id !== invite.event.id));
    setInvite(null);
  };
  function findAnotherTime() {
    const ev = invite.event;
    const q = `Find ${ev.end - ev.start} minutes with ${list(ev.attendees.filter((a) => a !== "You"))} for ${ev.title}`;
    setEvents((prev) => prev.filter((e) => e.id !== ev.id));
    setInvite(null);
    sendChat(q);
  }

  function reset() {
    runId.current++;
    const k = FINAL ? finalKB() : [];
    rated.current = FINAL ? seedRated(k) : new Map();
    setView("calendar");
    setEvents(INITIAL_EVENTS);
    setImported(initialImported(FINAL));
    setRoster(FINAL ? [...PEOPLE] : []);
    setKb(k);
    setSynced(new Set(FINAL ? INITIAL_EVENTS.map((e) => e.id) : []));
    setSyncMsg("");
    setShown(Object.fromEntries(CAL_IDS.map((c) => [c, true])));
    setOverlay(Object.fromEntries(PEOPLE.map((p) => [p, false])));
    setNotes({});
    setAnalysis({});
    setMessages([{ id: "greet", kind: "bot", text: GREETING[mode] }]);
    setCurrent(null);
    setInvite(null);
    setInviteCount(0);
    setLog([]);
    setAnswers({});
    setSelected(null);
    setHover(null);
    setBusy("");
  }

  const selEvent = events.find((e) => e.id === selected);

  return (
    <div className="mg-ws" data-mode={mode}>
      <div className="mg-toolbar">
        <div className="mg-seg" role="tablist" aria-label="View">
          <button className={view === "calendar" ? "on" : ""} onClick={() => setView("calendar")}>Calendar</button>
          <button className={view === "team" ? "on" : ""} onClick={() => setView("team")}>Teammates{roster.length ? ` (${roster.length})` : ""}</button>
        </div>
        {view === "calendar" && roster.length > 0 && (
          <div className="mg-overlays" role="group" aria-label="Show teammates' busy time">
            <span className="mg-small">Show busy time</span>
            {roster.map((p) => (
              <button
                key={p}
                className={"mg-pill" + (overlay[p] ? " on" : "")}
                style={overlay[p] ? { background: PERSON_COLORS[p], borderColor: PERSON_COLORS[p] } : { borderColor: PERSON_COLORS[p], color: PERSON_COLORS[p] }}
                onClick={() => setOverlay((o) => ({ ...o, [p]: !o[p] }))}
                aria-pressed={overlay[p]}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <span className="mg-status" aria-live="polite">{analyzing ? "Rating your week" : liveEvents.length ? "Week rated" : ""}</span>
        <button className="mg-btn ghost" onClick={reset}>Reset to {FINAL ? "finished" : "blank"}</button>
      </div>

      <div className="mg-main" style={view === "team" ? { gridTemplateColumns: "minmax(0,1fr) 390px" } : undefined}>
        {view === "calendar" && (
          <aside className="mg-col-side">
            <CalendarsPanel
              events={liveEvents}
              unsynced={unsynced}
              imported={imported}
              roster={roster}
              dir={dir}
              onToggleCal={toggleCal}
              onToggleTeam={toggleTeam}
              onAddTeammate={(n) => say({ text: addTeammates([n]) })}
              onRemoveTeammate={removeTeammate}
              onImportAll={importAll}
              onSync={() => { const m = syncNow(); if (m) say({ text: m }); }}
              syncMsg={syncMsg}
            />
          </aside>
        )}

        {view === "calendar" ? (
          <main className="mg-col-mid">
            <section className="mg-card mg-calcard">
              <div className="mg-calshow" role="group" aria-label="Calendars shown">
                <span className="mg-small">Show:</span>
                {CAL_IDS.map((id) => (
                  <label key={id} className="mg-check" style={{ opacity: imported.cals[id] ? 1 : 0.45 }}>
                    <input type="checkbox" checked={shown[id]} disabled={!imported.cals[id]} onChange={(e) => setShown((s) => ({ ...s, [id]: e.target.checked }))} />
                    <i className="sw" style={{ background: CALENDAR_STYLE[id].color }} /> {CALENDAR_STYLE[id].label}
                  </label>
                ))}
                <span className="mg-legend-inline">
                  <span><i className="sw high" />High</span>
                  <span><i className="sw med" />Medium</span>
                  <span><i className="sw low" />Low</span>
                  <span><i className="sw zone" />Soft hold</span>
                </span>
              </div>
              {liveEvents.length === 0 && <p className="mg-empty mg-blank">No calendars connected yet. Use "Add" on the left, or type "Import my work, personal, and club calendars" in the assistant.</p>}
              <CalendarView
                events={viewEvents}
                analysis={analysis}
                flags={flags}
                zones={zones}
                overlay={overlay}
                overlayBlocks={overlayBlocks}
                selected={selected}
                onSelect={setSelected}
                ghost={hover}
                ghostTitle={current && current.meta.title}
              />
            </section>

            <section className="mg-card mg-detail">
              {!selEvent && <p className="mg-empty">Select an event to see why it is rated the way it is and to add notes.</p>}
              {selEvent && (
                <>
                  <div className="mg-detail-head">
                    <div>
                      <h2>{selEvent.title}</h2>
                      <p className="mg-small">
                        {slotLabel(selEvent)} CT with {selEvent.attendees.filter((a) => a !== "You").join(", ") || "no one else"}
                        {CALENDAR_STYLE[selEvent.calendar] ? `. ${CALENDAR_STYLE[selEvent.calendar].label} calendar` : ""}
                        {selEvent.location ? `. ${selEvent.location}` : ""}
                      </p>
                      {selEvent.joinUrl && <p className="mg-small"><a href={selEvent.joinUrl} target="_blank" rel="noreferrer">Join video call</a></p>}
                    </div>
                    {analysis[selEvent.id] && (
                      <div className="mg-rating">
                        <span className={"mg-badge p-" + analysis[selEvent.id].priority}>{analysis[selEvent.id].priority} priority</span>
                        <span className="mg-badge plain">{analysis[selEvent.id].flexibility} flexibility</span>
                      </div>
                    )}
                  </div>
                  {analysis[selEvent.id] && <p className="mg-reason">{analysis[selEvent.id].reason}</p>}
                  <label className="mg-label" htmlFor={"notes-" + mode}>Your notes (the assistant reads these)</label>
                  <textarea
                    id={"notes-" + mode}
                    rows={2}
                    value={notes[selEvent.id] || ""}
                    placeholder="Agenda, context, what you need from this meeting"
                    onChange={(e) => setNotes((n) => ({ ...n, [selEvent.id]: e.target.value }))}
                  />
                </>
              )}
            </section>
            <HeadsUpPanel items={headsUp} />
          </main>
        ) : (
          <main className="mg-col-mid">
            <TeamView
              events={liveEvents}
              imported={imported}
              roster={roster}
              dir={dir}
              kb={kb}
              onAddTeammate={(n) => say({ text: addTeammates([n]) })}
              onImportTeam={toggleTeam}
              onAsk={askAbout}
              answers={answers}
              asking={asking}
            />
          </main>
        )}

        <aside className="mg-col-side">
          <ChatPanel
            messages={messages}
            busy={busy}
            input={chatInput}
            setInput={setChatInput}
            onSend={sendChat}
            activeOptionsId={current && current.id}
            onHover={setHover}
            onBook={book}
            quick={quick}
            kb={kb}
            onDeleteKb={(id) => setKb((p) => p.filter((x) => x.id !== id))}
            onClearKb={() => setKb([])}
          />
          {view === "calendar" && (
            <>
              <InvitePanel invite={invite} inviteCount={inviteCount} onSimulate={simulateInvite} onAccept={acceptInvite} onDecline={declineInvite} onFindAnother={findAnotherTime} />
              <ActivityPanel log={log} />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
