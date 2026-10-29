import { useMemo, useState } from "react";
import { PERSON_COLORS, TEAM, CALENDAR_STYLE } from "../data/mock.js";
import { DAYS, DATES, fmt } from "../lib/time.js";
import { commonFree, nonWorkingRanges, teamBusy } from "../lib/scheduler.js";
import { tzShort, localTimeLabel, USER_TZ } from "../lib/tz.js";
import { overlapWindow, kbMentions } from "../lib/context.js";
import TimeGrid from "./TimeGrid.jsx";
import AddTeammate from "./AddTeammate.jsx";

const clock = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${m >= 720 && m < 1440 ? "PM" : "AM"}`;
const hoursText = (d) => `${clock(d.hours.start)} to ${clock(d.hours.end)} ${tzShort(d.hours.tz)}`;

export default function TeamView({ events, imported, roster, dir, kb, onAddTeammate, onImportTeam, onAsk, answers, asking }) {
  const [mode, setMode] = useState("single"); // single | compare
  const [chosen, setChosen] = useState(null);
  const [picked, setPicked] = useState({});
  const [day, setDay] = useState(1);
  const [showMine, setShowMine] = useState(false);
  const selected = chosen && roster.includes(chosen) ? chosen : roster[0] || null;

  const mine = useMemo(() => events.filter((e) => e.attendees.includes("You") && !e.pending), [events]);
  const otherBusy = useMemo(() => teamBusy(TEAM, imported.team), [imported.team]);
  const isPicked = (p) => (p in picked ? picked[p] : true);

  const personEvents = (p) => [
    ...(imported.team[p] ? TEAM[p].events : []).map((e) => ({ id: e.id, title: e.title, day: e.day, start: e.start, end: e.end })),
    ...events.filter((e) => e.local && e.attendees.includes(p)).map((e) => ({ id: e.id, title: e.title, day: e.day, start: e.start, end: e.end })),
  ];

  /* ---------- one person, whole week ---------- */
  const single = () => {
    if (!selected) return <p className="mg-empty">Add a teammate to see their week. Try "Add Jake as a teammate" in the assistant.</p>;
    const d = dir[selected];
    const color = PERSON_COLORS[selected];
    const evs = personEvents(selected);
    const columns = DAYS.map((name, di) => ({
      key: name,
      head: name,
      sub: DATES[di],
      shade: nonWorkingRanges(d, di),
      events: [
        ...evs.filter((e) => e.day === di).map((e) => ({ ...e, color })),
        ...(showMine ? mine.filter((e) => e.day === di).map((e) => ({ id: "m" + e.id, title: e.title, start: e.start, end: e.end, color: "#9AA6B5", faded: true })) : []),
      ],
    }));
    const win = overlapWindow(d);
    const said = kbMentions(kb, selected).length;
    return (
      <>
        <div className="mg-person-detail">
          <h2 style={{ color }}>{selected}{d.title && <span className="mg-rel">{d.title}</span>}</h2>
          <p className="mg-small">
            {d.office ? `${d.office}, ` : ""}{tzShort(d.tz)}. Working hours {hoursText(d)}
            {d.fromContext ? " (from what you taught)" : d.fromCalendar ? " (from their calendar settings)" : " (assumed, no calendar or context yet)"}.
            {win ? ` Overlaps your day ${fmt(win.start)} to ${fmt(win.end)} CT.` : " No overlap with your working hours."}
          </p>
          <div className="mg-row">
            {!imported.team[selected] && <button className="mg-btn small" onClick={() => onImportTeam(selected)}>Add calendar</button>}
            <button className="mg-btn small ghost" disabled={asking === selected} onClick={() => onAsk(selected)}>{asking === selected ? "Asking…" : `Ask the knowledge base (${said})`}</button>
            <label className="mg-check"><input type="checkbox" checked={showMine} onChange={(e) => setShowMine(e.target.checked)} /> Overlay my calendar</label>
          </div>
          {answers[selected] && <p className="mg-answer">{answers[selected]}</p>}
        </div>
        {!imported.team[selected] && <p className="mg-empty">{selected}'s calendar isn't added yet, so only the shaded working hours are known.</p>}
        <TimeGrid columns={columns} />
        <p className="mg-small mg-tznote">Shown in your time (CT). Grey rows are outside {selected}'s working hours.</p>
      </>
    );
  };

  /* ---------- compare, one day ---------- */
  const compare = () => {
    const people = ["You", ...roster].filter((p) => (p === "You" ? isPicked("You") : isPicked(p)));
    const youDir = { You: { hours: { tz: USER_TZ, days: [1, 2, 3, 4, 5], start: 540, end: 1020 } } };
    const D = { ...dir, ...youDir };
    const free = commonFree({ people, day, events: mine, otherBusy, directory: D });
    const columns = people.map((p) => {
      const isYou = p === "You";
      return {
        key: p,
        head: p,
        sub: isYou ? "CT" : tzShort(dir[p].tz),
        shade: nonWorkingRanges(D[p], day),
        bands: free,
        events: isYou
          ? mine.filter((e) => e.day === day).map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, color: (CALENDAR_STYLE[e.calendar] || {}).color || "#4D7AA6" }))
          : personEvents(p).filter((e) => e.day === day).map((e) => ({ ...e, color: PERSON_COLORS[p] })),
      };
    });
    const noCal = people.filter((p) => p !== "You" && !imported.team[p]);
    return (
      <>
        <div className="mg-row mg-days">
          {DAYS.map((d, i) => (
            <button key={d} className={"mg-pill" + (day === i ? " on" : "")} style={{ borderColor: "#16202E", color: day === i ? "#fff" : "#16202E", background: day === i ? "#16202E" : "transparent" }} onClick={() => setDay(i)}>{d} {DATES[i]}</button>
          ))}
        </div>
        {noCal.length > 0 && <p className="mg-empty">No calendar added yet for {noCal.join(", ")}, so only their working hours are used.</p>}
        <div className="mg-free">
          <b>Free for everyone selected, inside everyone's working hours</b>
          {people.length < 2 ? <p className="mg-small">Pick at least one teammate.</p> : free.length === 0 ? <p className="mg-small">No shared time on {DAYS[day]}.</p> : (
            <ul>
              {free.map((r, i) => (
                <li key={i}>
                  {fmt(r.start)} to {fmt(r.end)} CT
                  <span className="mg-small"> {people.filter((p) => p !== "You" && dir[p].tz !== USER_TZ).map((p) => `${p} ${localTimeLabel(day, r.start, dir[p].tz)} ${tzShort(dir[p].tz)}`).join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <TimeGrid columns={columns} />
        <p className="mg-small mg-tznote">Everything is shown in your time (CT). Grey rows are outside that person's working hours; green is time everyone selected is free.</p>
      </>
    );
  };

  return (
    <div className="mg-team">
      <aside className="mg-card mg-team-list">
        <div className="mg-seg" role="tablist" aria-label="Teammates view">
          <button className={mode === "single" ? "on" : ""} onClick={() => setMode("single")}>One person</button>
          <button className={mode === "compare" ? "on" : ""} onClick={() => setMode("compare")}>Compare</button>
        </div>
        <ul>
          {mode === "compare" && (
            <li>
              <label className="mg-check">
                <input type="checkbox" checked={isPicked("You")} onChange={(e) => setPicked((s) => ({ ...s, You: e.target.checked }))} />
                <i className="sw" style={{ background: "#16202E" }} /> You
              </label>
            </li>
          )}
          {roster.map((p) => (
            <li key={p} className={mode === "single" && selected === p ? "sel" : ""}>
              {mode === "compare" ? (
                <label className="mg-check">
                  <input type="checkbox" checked={isPicked(p)} onChange={(e) => setPicked((s) => ({ ...s, [p]: e.target.checked }))} />
                  <i className="sw" style={{ background: PERSON_COLORS[p] }} /> {p}
                </label>
              ) : (
                <button className="mg-person-btn" onClick={() => setChosen(p)}>
                  <i className="sw" style={{ background: PERSON_COLORS[p] }} />
                  <span><b>{p}</b><br /><span className="mg-small">{[dir[p].title, tzShort(dir[p].tz)].filter(Boolean).join(", ")}{imported.team[p] ? "" : ", no calendar"}</span></span>
                </button>
              )}
            </li>
          ))}
        </ul>
        {roster.length === 0 && <p className="mg-empty">No teammates yet.</p>}
        <AddTeammate roster={roster} onAdd={onAddTeammate} />
      </aside>
      <section className="mg-card mg-team-main">{mode === "single" ? single() : compare()}</section>
    </div>
  );
}
