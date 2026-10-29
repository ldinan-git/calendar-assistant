import { useState, useEffect, useMemo, useRef } from "react";
import { callLLM, llmMode } from "./api/llm.js";
import {
  INITIAL_EVENTS, TEAM, DIRECTORY, MIRRORS, CAL_IDS, INCOMING, PEOPLE, PERSON_COLORS, TEACH_EXAMPLES, CALENDAR_STYLE,
} from "./data/mock.js";
import { DAYS, slotLabel, uid } from "./lib/time.js";
import { computeZones, computeFlags, genCandidates, matchRankedOptions, summarizeIssues, teamBusy } from "./lib/scheduler.js";
import { unsyncedEvents } from "./lib/graph.js";
import { contextNotes, flightRuleNote, profileLine } from "./lib/context.js";
import { localTimeLabel, tzShort, USER_TZ } from "./lib/tz.js";
import { pickCalendar, pickProvider, joinLink, PROVIDER_LABEL, calLabel } from "./lib/booking.js";
import CalendarView from "./components/CalendarView.jsx";
import MemoryPanel from "./components/MemoryPanel.jsx";
import CalendarsPanel from "./components/CalendarsPanel.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import { InvitePanel, HeadsUpPanel, ActivityPanel } from "./components/SidePanels.jsx";
import SummaryView from "./views/SummaryView.jsx";

const STORE_KEY = "margin-state-v2";
const ACCOUNTS = { "cal-work": "luke.dinan@firmname.example", "cal-personal": "luke.dinan@outlook.example", "cal-org": "luke.dinan@school.example" };

const GREETING = {
  id: "greet",
  kind: "bot",
  text: "Hi, I'm margin. Teach me who is who (try \"Teach it all six\" below), then ask for a meeting in plain English. I'll check everyone's calendar and time zone, apply what I know, book it, add the video link, and sync every calendar.",
};

const allConnected = () => Object.fromEntries(PEOPLE.map((p) => [p, true]));
const PEOPLE_INFO = Object.fromEntries(Object.entries(DIRECTORY).map(([n, d]) => [n, { title: d.title, office: d.office, timezone: d.tz }]));
const list = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);

function useHash() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const on = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY))?.[key] || fallback; } catch { return fallback; }
};

export default function App() {
  const hash = useHash();
  const route = hash.startsWith("#/summary") ? "summary" : "calendar";

  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [facts, setFacts] = useState(() => load("facts", []));
  const [notes, setNotes] = useState(() => load("notes", {}));
  const [analysis, setAnalysis] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [overlay, setOverlay] = useState(() => Object.fromEntries(PEOPLE.map((p) => [p, false])));
  const [connected, setConnected] = useState(allConnected);
  const [synced, setSynced] = useState(() => new Set());
  const [syncMsg, setSyncMsg] = useState("");
  const [selected, setSelected] = useState(null);

  const [messages, setMessages] = useState([GREETING]);
  const [chatInput, setChatInput] = useState("");
  const [busy, setBusy] = useState("");
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [current, setCurrent] = useState(null); // { id, meta, options } for the latest offer
  const [hover, setHover] = useState(null);
  const [log, setLog] = useState([]);

  const [invite, setInvite] = useState(null);
  const [inviteCount, setInviteCount] = useState(0);

  const runId = useRef(0);
  const say = (m) => setMessages((prev) => [...prev, { id: uid(), kind: "bot", ...m }]);

  /* persist taught facts + notes */
  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ facts, notes }));
  }, [facts, notes]);

  /* LLM call: rate the week (priority, flexibility, type) whenever events, notes or facts change */
  const eventsKey = JSON.stringify(events.filter((e) => !e.pending).map((e) => [e.id, e.title, e.day, e.start, e.end, e.attendees, notes[e.id] || ""]));
  const factsKey = JSON.stringify(facts);

  useEffect(() => {
    const id = ++runId.current;
    setAnalyzing(true);
    const timer = setTimeout(async () => {
      try {
        const out = await callLLM("analyze", {
          taught_facts: facts,
          people: PEOPLE_INFO,
          events: events
            .filter((e) => !e.pending)
            .map((e) => ({ id: e.id, title: e.title, when: slotLabel(e), attendees: e.attendees, calendar: e.calendar, categories: e.categories, notes: notes[e.id] || undefined })),
        });
        if (id === runId.current) setAnalysis(out);
      } catch (e) {
        console.error("analyze failed:", e);
      } finally {
        if (id === runId.current) setAnalyzing(false);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsKey, factsKey]);

  const otherBusy = useMemo(() => teamBusy(TEAM, connected), [connected]);
  const zones = useMemo(() => computeZones(events, facts, analysis), [events, facts, analysis]);
  const flags = useMemo(() => computeFlags(events, zones), [events, zones]);
  const headsUp = useMemo(() => summarizeIssues(events, flags, DAYS), [events, flags]);
  const unsynced = useMemo(() => unsyncedEvents(events.filter((e) => !e.pending), MIRRORS, CAL_IDS, synced), [events, synced]);
  const overlayBlocks = useMemo(() => {
    const out = {};
    PEOPLE.forEach((p) => {
      out[p] = [
        ...TEAM[p].events.map((e) => ({ day: e.day, start: e.start, end: e.end, title: e.title })),
        ...events.filter((e) => e.local && e.attendees.includes(p)).map((e) => ({ day: e.day, start: e.start, end: e.end, title: e.title })),
      ];
    });
    return out;
  }, [events]);

  /* ------------------------------ teach ------------------------------ */
  async function teach(text) {
    const out = await callLLM("extract", { existing_facts: facts.map((f) => ({ id: f.id, type: f.type, summary: f.summary })), user_message: text });
    const stamp = new Date().toISOString().slice(0, 10);
    const fresh = (out.facts || []).map((f) => ({ ...f, id: uid(), created_at: stamp, source_text: f.source_text || text }));
    const remove = new Set(out.replace_ids || []);
    // teaching the same thing again updates it instead of stacking a duplicate
    const same = (a, b) => a.type === b.type && (a.type === "person" ? a.name === b.name : a.type === "buffer_rule" ? JSON.stringify(a.trigger) === JSON.stringify(b.trigger) : a.summary === b.summary);
    setFacts((prev) => [...prev.filter((f) => !remove.has(f.id) && !fresh.some((n) => same(f, n))), ...fresh]);
    return out.confirmation || "Saved.";
  }

  async function loadDemoContext() {
    setLoadingDemo(true);
    setMessages((m) => [...m, { id: uid(), kind: "user", text: "Teach it all six" }]);
    try {
      const lines = [];
      for (const text of TEACH_EXAMPLES) lines.push(await teach(text));
      say({ text: "Done. Here is what I saved:\n" + lines.join("\n") });
    } finally {
      setLoadingDemo(false);
    }
  }

  /* ------------------------------ schedule ------------------------------ */
  async function runSchedule(text) {
    setBusy("Reading your request");
    setHover(null);
    const parsed = await callLLM("parse", { text, people: PEOPLE });
    const attendees = (parsed.attendees || []).filter((n) => PEOPLE.includes(n));
    if (!attendees.length) {
      say({ text: "Who should be in the meeting? I know " + list(PEOPLE) + "." });
      return;
    }
    const dur = Number(parsed.duration_min) || 30;
    const days = (parsed.days && parsed.days.length ? parsed.days : [0, 1, 2, 3, 4]).filter((d) => d >= 0 && d <= 4);
    const meta = { title: parsed.title || "Meeting", attendees, dur };
    const notesFor = contextNotes(attendees, facts, DIRECTORY);
    const flight = flightRuleNote(facts);
    if (flight) notesFor.push({ name: "You", text: flight.replace("Your flights: ", "") });

    setBusy("Checking everyone's calendars and time zones");
    const cands = genCandidates({ attendees, dur, days, events, otherBusy, analysis, zones, directory: DIRECTORY, team: TEAM, facts });
    const unlinked = attendees.filter((p) => !connected[p]);
    const warn = unlinked.length
      ? `I can't see ${list(unlinked)}'s calendar${unlinked.length > 1 ? "s" : ""} (not imported), so I'm treating ${unlinked.length > 1 ? "them" : unlinked[0]} as free. Import on the left for a real check.`
      : "";
    if (!cands.length) {
      const far = attendees.filter((p) => DIRECTORY[p].tz !== USER_TZ).map((p) => profileLine(p, [], DIRECTORY).text);
      say({
        text: `I couldn't find ${dur} minutes inside everyone's working hours in that range.${far.length ? " " + far.join(". ") + "." : ""} Try more days, a shorter meeting, or leave someone out.`,
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
        taught_facts: facts.map((f) => f.summary || f.source_text),
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
            attendees.filter((p) => DIRECTORY[p].tz !== USER_TZ).map((p) => [p, `${localTimeLabel(c.day, c.start, DIRECTORY[p].tz)} ${tzShort(DIRECTORY[p].tz)}`])
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
        text: `${warn ? warn + " " : ""}${reminder || `${meta.title}, ${dur} minutes, with ${list(attendees)}. Here is what I'm keeping in mind, then my top picks.`}`,
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
    const prov = pickProvider(cal.calId, m.attendees, DIRECTORY);
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
      const d = DIRECTORY[p];
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
    setMessages((prev) => [
      ...prev,
      { id: uid(), kind: "booked", text: `Done. I booked option ${n}.`, booked },
    ]);
    setLog((prev) => [
      { id: uid(), lines: [`${m.title}, ${slotLabel(o)}. Created on ${booked.calendar}, invites sent to ${list(m.attendees)}.`, `Busy blocks written to ${mirroredTo.join(" and ")}.`, ...moves] },
      ...prev,
    ]);
    setCurrent(null);
    setHover(null);
  }

  /* ------------------------------ sync ------------------------------ */
  function syncNow() {
    if (!unsynced.length) return;
    const lines = unsynced.map((e) => `${e.title} (${calLabel(e.calendar)})`);
    setSynced((s) => new Set([...s, ...unsynced.map((e) => e.id)]));
    const msg = `Wrote ${unsynced.length} private Busy blocks to your other calendars.`;
    setSyncMsg(msg);
    setLog((prev) => [{ id: uid(), lines: [msg, lines.join(", ")] }, ...prev]);
    return msg;
  }

  /* ------------------------------ chat router ------------------------------ */
  async function sendChat(text) {
    if (!text.trim() || busy) return;
    setChatInput("");
    setMessages((m) => [...m, { id: uid(), kind: "user", text }]);
    setBusy("Thinking");
    try {
      const r = await callLLM("route", { text, people: PEOPLE, has_options: !!current });
      const names = (r.names || []).filter((n) => PEOPLE.includes(n));
      if (r.intent === "teach") {
        setBusy("Saving that");
        say({ text: await teach(text) });
      } else if (r.intent === "schedule") {
        await runSchedule(text);
      } else if (r.intent === "book") {
        book(r.option || 1);
      } else if (r.intent === "recall") {
        const who = names.length ? names : PEOPLE;
        const f = flightRuleNote(facts);
        say({ text: f ? f : undefined, notes: contextNotes(who, facts, DIRECTORY) });
      } else if (r.intent === "sync") {
        const msg = syncNow();
        say({ text: msg || "Everything is already synced: every event is at least a Busy block on all three calendars." });
      } else {
        say({ text: "I can schedule meetings (\"schedule a meeting with Jake and Sarah\"), learn context (\"Brad is a client\"), tell you what I know (\"what do you know about Jake?\"), and sync your calendars. What would you like?" });
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
    const ev = { id: uid(), title: inc.title, attendees: inc.attendees, day: inc.day, start: inc.start, end: inc.end, pending: true, from: inc.from, calendar: "cal-work", categories: [] };
    const next = [...events, ev];
    const f = computeFlags(next, computeZones(next, facts, analysis))[ev.id];
    const issues = [];
    f.conflict.forEach((c) => issues.push(`Overlaps ${c.title}`));
    f.b2bWith.forEach((c) => issues.push(`Back-to-back with ${c.title}`));
    if (f.zone) issues.push(`Inside your ${f.zone.label.toLowerCase()} (${f.zone.title})`);
    setEvents(next);
    setInvite({ event: ev, issues, advice: "", loading: true });
    try {
      const out = await callLLM("advice", {
        taught_facts: facts.map((x) => x.summary || x.source_text),
        sender_context: profileLine(inc.from, facts, DIRECTORY),
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
    setEvents(INITIAL_EVENTS);
    setFacts([]);
    setNotes({});
    setAnalysis({});
    setMessages([GREETING]);
    setCurrent(null);
    setInvite(null);
    setInviteCount(0);
    setLog([]);
    setSynced(new Set());
    setSyncMsg("");
    setConnected(allConnected());
    setSelected(null);
    setHover(null);
  }

  const ghost = hover;
  const selEvent = events.find((e) => e.id === selected);
  const ghostTitle = current && current.meta.title;

  return (
    <div className="mg">
      <header className="mg-top">
        <div className="mg-brand">
          <h1>margin</h1>
          <p>Calendar assistant. Week of Nov 2, times in Central.</p>
        </div>
        <nav className="mg-tabs" aria-label="Views">
          <a href="#/" className={route === "calendar" ? "on" : ""}>Calendar</a>
          <a href="#/summary" className={route === "summary" ? "on" : ""}>Summary</a>
        </nav>
        <div className="mg-top-right">
          <span className={"mg-mode " + llmMode}>{llmMode === "live" ? "Live API" : "Mock responses"}</span>
          {route === "calendar" && (
            <>
              <div className="mg-overlays" role="group" aria-label="Show teammates' busy time">
                <span className="mg-small">Show busy time</span>
                {PEOPLE.map((p) => (
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
              <span className="mg-status" aria-live="polite">{analyzing ? "Rating your week" : "Week rated"}</span>
            </>
          )}
          <button className="mg-btn ghost" onClick={reset}>Reset demo</button>
        </div>
      </header>

      {route === "summary" && <SummaryView />}

      {route === "calendar" && (
        <div className="mg-main">
          <aside className="mg-col-side">
            <CalendarsPanel
              events={events}
              unsynced={unsynced}
              connected={connected}
              onToggle={(p) => setConnected((c) => ({ ...c, [p]: !c[p] }))}
              onSync={syncNow}
              syncMsg={syncMsg}
            />
            <MemoryPanel facts={facts} onDelete={(id) => setFacts((p) => p.filter((x) => x.id !== id))} />
          </aside>

          <main className="mg-col-mid">
            <section className="mg-card mg-calcard">
              <div className="mg-legend">
                <span><i className="sw high" />High priority</span>
                <span><i className="sw med" />Medium</span>
                <span><i className="sw low" />Low</span>
                <span><i className="sw zone" />Soft hold / buffer</span>
                <span><i className="sw pend" />Pending or preview</span>
                {Object.values(CALENDAR_STYLE).map((c) => (
                  <span key={c.label}><i className="sw bar" style={{ borderLeftColor: c.color }} />{c.label} calendar</span>
                ))}
              </div>
              <CalendarView
                events={events}
                analysis={analysis}
                flags={flags}
                zones={zones}
                overlay={overlay}
                overlayBlocks={overlayBlocks}
                selected={selected}
                onSelect={setSelected}
                ghost={ghost}
                ghostTitle={ghostTitle}
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
                      {selEvent.joinUrl && (
                        <p className="mg-small"><a href={selEvent.joinUrl} target="_blank" rel="noreferrer">Join video call</a></p>
                      )}
                    </div>
                    {analysis[selEvent.id] && (
                      <div className="mg-rating">
                        <span className={"mg-badge p-" + analysis[selEvent.id].priority}>{analysis[selEvent.id].priority} priority</span>
                        <span className="mg-badge plain">{analysis[selEvent.id].flexibility} flexibility</span>
                      </div>
                    )}
                  </div>
                  {analysis[selEvent.id] && <p className="mg-reason">{analysis[selEvent.id].reason}</p>}
                  <label className="mg-label" htmlFor="notes">Your notes (the assistant reads these)</label>
                  <textarea
                    id="notes"
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
              hasFacts={facts.length > 0}
              onLoadDemo={loadDemoContext}
              loadingDemo={loadingDemo}
            />
            <InvitePanel
              invite={invite}
              inviteCount={inviteCount}
              onSimulate={simulateInvite}
              onAccept={acceptInvite}
              onDecline={declineInvite}
              onFindAnother={findAnotherTime}
            />
            <ActivityPanel log={log} />
          </aside>
        </div>
      )}
    </div>
  );
}
