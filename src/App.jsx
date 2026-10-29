import { useState, useEffect, useMemo, useRef } from "react";
import { callLLM, llmMode } from "./api/llm.js";
import { INITIAL_EVENTS, OTHER_BUSY, INCOMING, PEOPLE, PERSON_COLORS, EMAILS } from "./data/mock.js";
import { DAYS, slotLabel, uid } from "./lib/time.js";
import { computeZones, computeFlags, genCandidates, matchRankedOptions, summarizeIssues } from "./lib/scheduler.js";
import CalendarView from "./components/CalendarView.jsx";
import MemoryPanel from "./components/MemoryPanel.jsx";
import AssistantPanel from "./components/AssistantPanel.jsx";
import { InvitePanel, HeadsUpPanel, SentPanel } from "./components/SidePanels.jsx";
import SummaryView from "./views/SummaryView.jsx";

const STORE_KEY = "margin-state-v1";

function useHash() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const on = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const route = hash.startsWith("#/summary") ? "summary" : "calendar";

  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [facts, setFacts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY))?.facts || []; } catch { return []; }
  });
  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY))?.notes || {}; } catch { return {}; }
  });
  const [analysis, setAnalysis] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [overlay, setOverlay] = useState({ Jake: false, Josh: false, Priya: false });
  const [selected, setSelected] = useState(null);

  const [teachInput, setTeachInput] = useState("");
  const [teaching, setTeaching] = useState(false);
  const [teachMsg, setTeachMsg] = useState("");

  const [askInput, setAskInput] = useState("");
  const [reqBusy, setReqBusy] = useState("");
  const [reqError, setReqError] = useState("");
  const [reqMeta, setReqMeta] = useState(null);
  const [options, setOptions] = useState([]);
  const [hover, setHover] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [draft, setDraft] = useState({ invite: "", bump: "", email: EMAILS[0] });
  const [sent, setSent] = useState([]);

  const [invite, setInvite] = useState(null);
  const [inviteCount, setInviteCount] = useState(0);

  const runId = useRef(0);

  /* persist taught facts + notes */
  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ facts, notes }));
  }, [facts, notes]);

  /* LLM call #1: rate the week (priority, flexibility, type) whenever events, notes or facts change */
  const eventsKey = JSON.stringify(
    events.filter((e) => !e.pending).map((e) => [e.id, e.title, e.day, e.start, e.end, e.attendees, notes[e.id] || ""])
  );
  const factsKey = JSON.stringify(facts);

  useEffect(() => {
    const id = ++runId.current;
    setAnalyzing(true);
    const timer = setTimeout(async () => {
      try {
        const out = await callLLM("analyze", {
          taught_facts: facts,
          events: events
            .filter((e) => !e.pending)
            .map((e) => ({ id: e.id, title: e.title, when: slotLabel(e), attendees: e.attendees, notes: notes[e.id] || undefined })),
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

  const zones = useMemo(() => computeZones(events, facts, analysis), [events, facts, analysis]);
  const flags = useMemo(() => computeFlags(events, zones), [events, zones]);
  const headsUp = useMemo(() => summarizeIssues(events, flags, DAYS), [events, flags]);

  /* LLM call #2: turn what the user says into a structured fact */
  async function teach(text) {
    if (!text.trim() || teaching) return;
    setTeaching(true);
    setTeachMsg("");
    try {
      const out = await callLLM("extract", {
        existing_facts: facts.map((f) => ({ id: f.id, type: f.type, summary: f.summary })),
        user_message: text,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      const fresh = (out.facts || []).map((f) => ({ ...f, id: uid(), created_at: stamp, source_text: f.source_text || text }));
      const remove = new Set(out.replace_ids || []);
      setFacts((prev) => [...prev.filter((f) => !remove.has(f.id)), ...fresh]);
      setTeachMsg(out.confirmation || "Saved.");
      setTeachInput("");
    } catch (e) {
      console.error(e);
      setTeachMsg("That didn't save. Try rephrasing it.");
    } finally {
      setTeaching(false);
    }
  }

  /* LLM calls #3 and #4: parse the request, then rank code-generated candidate slots */
  async function runRequest(text) {
    if (!text.trim() || reqBusy) return;
    setReqBusy("Reading your request");
    setReqError("");
    setOptions([]);
    setChosen(null);
    setHover(null);
    try {
      const parsed = await callLLM("parse", { text });
      const attendees = (parsed.attendees || []).filter((n) => PEOPLE.includes(n));
      const dur = Number(parsed.duration_min) || 30;
      const days = (parsed.days && parsed.days.length ? parsed.days : [0, 1, 2, 3, 4]).filter((d) => d >= 0 && d <= 4);
      const meta = { title: parsed.title || "Meeting", attendees, dur };
      setReqMeta(meta);

      setReqBusy("Checking everyone's calendars");
      const cands = genCandidates({ attendees, dur, days, events, otherBusy: OTHER_BUSY, analysis, zones });
      if (!cands.length) {
        setReqError("No open time works for everyone in that range. Try more days or a shorter meeting.");
        return;
      }

      setReqBusy("Ranking the options");
      let opts = [];
      try {
        const out = await callLLM("rank", {
          request: text,
          meeting: meta,
          taught_facts: facts.map((f) => f.summary || f.source_text),
          candidates: cands.map((c) => ({
            id: c.id,
            when: slotLabel(c),
            free_minutes_before: c.gapBefore,
            free_minutes_after: c.gapAfter,
            back_to_back: c.b2b,
            inside_buffer_of: c.zone ? c.zone.title : null,
            moves: c.bumps.map((b) => ({
              title: b.title,
              with: b.attendees.filter((a) => a !== "You"),
              why_flexible: analysis[b.id] && analysis[b.id].reason,
              moves_to: slotLabel(b.newSlot),
            })),
          })),
        });
        opts = matchRankedOptions(cands, out.options);
      } catch (e) {
        console.warn("rank failed or has no fixture, falling back to code order:", e.message);
      }
      if (!opts.length) {
        opts = cands.slice(0, 3).map((c) => ({
          ...c,
          headline: slotLabel(c),
          reasoning: "Everyone is free. Ranked by breathing room around your other meetings (code fallback, no LLM ranking).",
          invite_message: `Hi, could we meet for ${meta.title}?`,
          bump_message: "",
        }));
      }
      setOptions(opts);
    } catch (e) {
      console.error(e);
      setReqError("Something went wrong reading that request. Try rephrasing it.");
    } finally {
      setReqBusy("");
    }
  }

  function choose(o) {
    setChosen(o);
    setHover(null);
    setDraft({ invite: o.invite_message || "", bump: o.bump_message || "", email: EMAILS[0] });
  }

  /* "send" is simulated: update local state, log what would have gone out */
  function send() {
    const o = chosen;
    const m = reqMeta;
    const newEv = { id: uid(), title: m.title, attendees: ["You", ...m.attendees], day: o.day, start: o.start, end: o.end, isNew: true };
    setEvents((prev) => [
      ...prev.map((e) => {
        const b = o.bumps.find((x) => x.id === e.id);
        return b ? { ...e, day: b.newSlot.day, start: b.newSlot.start, end: b.newSlot.end, moved: true } : e;
      }),
      newEv,
    ]);
    const lines = [`${m.title}, ${slotLabel(o)}. Sent to ${m.attendees.join(", ") || "yourself"} from ${draft.email}.`];
    o.bumps.forEach((b) => {
      const who = b.attendees.filter((a) => a !== "You").join(" and ");
      lines.push(`${b.title} moved to ${slotLabel(b.newSlot)}.${who ? ` Note sent to ${who}.` : ""}`);
    });
    setSent((prev) => [{ id: uid(), lines }, ...prev]);
    setOptions([]);
    setChosen(null);
    setHover(null);
  }

  /* LLM call #5: advice on an incoming invite. Issues are computed by code first. */
  async function simulateInvite() {
    const inc = INCOMING[inviteCount];
    if (!inc || invite) return;
    setInviteCount((n) => n + 1);
    const ev = { id: uid(), title: inc.title, attendees: inc.attendees, day: inc.day, start: inc.start, end: inc.end, pending: true, from: inc.from };
    const next = [...events, ev];
    const f = computeFlags(next, computeZones(next, facts, analysis))[ev.id];
    const issues = [];
    f.conflict.forEach((c) => issues.push(`Overlaps ${c.title}`));
    f.b2bWith.forEach((c) => issues.push(`Back-to-back with ${c.title}`));
    if (f.zone) issues.push(`Inside the buffer around ${f.zone.title}`);
    setEvents(next);
    setInvite({ event: ev, issues, advice: "", loading: true });
    try {
      const out = await callLLM("advice", {
        taught_facts: facts.map((x) => x.summary || x.source_text),
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
    const q = `Find ${ev.end - ev.start} minutes with ${ev.attendees.filter((a) => a !== "You").join(" and ")} for ${ev.title}`;
    setEvents((prev) => prev.filter((e) => e.id !== ev.id));
    setInvite(null);
    setAskInput(q);
    runRequest(q);
  }

  function reset() {
    setEvents(INITIAL_EVENTS);
    setFacts([]);
    setNotes({});
    setAnalysis({});
    setOptions([]);
    setChosen(null);
    setInvite(null);
    setInviteCount(0);
    setSent([]);
    setTeachMsg("");
    setReqError("");
    setSelected(null);
  }

  const ghost = hover || chosen;
  const selEvent = events.find((e) => e.id === selected);

  return (
    <div className="mg">
      <header className="mg-top">
        <div className="mg-brand">
          <h1>margin</h1>
          <p>Calendar assistant. Week of Nov 2.</p>
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
            <MemoryPanel
              facts={facts}
              onDelete={(id) => setFacts((p) => p.filter((x) => x.id !== id))}
              input={teachInput}
              setInput={setTeachInput}
              busy={teaching}
              message={teachMsg}
              onTeach={teach}
            />
          </aside>

          <main className="mg-col-mid">
            <section className="mg-card mg-calcard">
              <div className="mg-legend">
                <span><i className="sw high" />High priority</span>
                <span><i className="sw med" />Medium</span>
                <span><i className="sw low" />Low</span>
                <span><i className="sw zone" />Buffer zone</span>
                <span><i className="sw pend" />Pending or preview</span>
              </div>
              <CalendarView
                events={events}
                analysis={analysis}
                flags={flags}
                zones={zones}
                overlay={overlay}
                selected={selected}
                onSelect={setSelected}
                ghost={ghost}
                ghostTitle={reqMeta && reqMeta.title}
              />
            </section>

            <section className="mg-card mg-detail">
              {!selEvent && <p className="mg-empty">Select an event to see why it is rated the way it is and to add notes.</p>}
              {selEvent && (
                <>
                  <div className="mg-detail-head">
                    <div>
                      <h2>{selEvent.title}</h2>
                      <p className="mg-small">{slotLabel(selEvent)} with {selEvent.attendees.filter((a) => a !== "You").join(", ") || "no one else"}</p>
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
          </main>

          <aside className="mg-col-side">
            <AssistantPanel
              input={askInput}
              setInput={setAskInput}
              busy={reqBusy}
              error={reqError}
              options={options}
              onRun={runRequest}
              onHover={setHover}
              chosen={chosen}
              onChoose={choose}
              onBack={() => { setChosen(null); setHover(null); }}
              meta={reqMeta}
              draft={draft}
              setDraft={setDraft}
              onSend={send}
            />
            <InvitePanel
              invite={invite}
              inviteCount={inviteCount}
              onSimulate={simulateInvite}
              onAccept={acceptInvite}
              onDecline={declineInvite}
              onFindAnother={findAnotherTime}
            />
            <HeadsUpPanel items={headsUp} />
            <SentPanel sent={sent} />
          </aside>
        </div>
      )}
    </div>
  );
}
