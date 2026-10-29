import { PERSON_COLORS, CALENDAR_STYLE, CAL_IDS, TEAM, INITIAL_EVENTS } from "../data/mock.js";
import { tzShort } from "../lib/tz.js";
import AddTeammate from "./AddTeammate.jsx";

export default function CalendarsPanel({ events, unsynced, imported, roster, dir, onToggleCal, onToggleTeam, onAddTeammate, onRemoveTeammate, onImportAll, onSync, syncMsg }) {
  const total = (id) => INITIAL_EVENTS.filter((e) => e.calendar === id).length;
  const anyOff = CAL_IDS.some((c) => !imported.cals[c]) || roster.some((p) => !imported.team[p]);
  return (
    <section className="mg-card">
      <div className="mg-trace-head">
        <h2>Calendars</h2>
        {anyOff && <button className="mg-btn small ghost" onClick={onImportAll}>{roster.length ? "Add all calendars" : "Add my calendars"}</button>}
      </div>
      <h3 className="mg-sub">Yours, merged into one view</h3>
      <ul className="mg-cals">
        {CAL_IDS.map((id) => (
          <li key={id}>
            <i className="sw" style={{ background: CALENDAR_STYLE[id].color }} />
            <span>{CALENDAR_STYLE[id].label}</span>
            <span className="mg-small">{imported.cals[id] ? `${events.filter((e) => e.calendar === id && !e.pending).length} events` : `${total(id)} to import`}</span>
            <button
              className={"mg-pill" + (imported.cals[id] ? " on" : "")}
              style={imported.cals[id] ? { background: CALENDAR_STYLE[id].color, borderColor: CALENDAR_STYLE[id].color } : { borderColor: CALENDAR_STYLE[id].color, color: CALENDAR_STYLE[id].color }}
              onClick={() => onToggleCal(id)}
              aria-pressed={!!imported.cals[id]}
            >
              {imported.cals[id] ? "Connected" : "Add"}
            </button>
          </li>
        ))}
      </ul>
      <div className={"mg-sync" + (unsynced.length ? " gap" : "")}>
        {unsynced.length > 0 ? (
          <>
            <p>
              <b>{unsynced.length} events</b> are on one calendar only, so colleagues can't see you're busy:{" "}
              <span className="mg-small">{unsynced.slice(0, 4).map((e) => e.title).join(", ")}{unsynced.length > 4 ? ", ..." : ""}</span>
            </p>
            <button className="mg-btn small" onClick={onSync}>Sync now</button>
          </>
        ) : (
          <p>{events.length ? "Every event shows up as at least a Busy block on all three calendars." : "Add a calendar to see which events colleagues can't see."}</p>
        )}
        {syncMsg && <p className="mg-msg">{syncMsg}</p>}
      </div>

      <h3 className="mg-sub">Your team</h3>
      {roster.length === 0 && <p className="mg-empty">No teammates yet.</p>}
      <ul className="mg-cals">
        {roster.map((p) => (
          <li key={p}>
            <i className="sw" style={{ background: PERSON_COLORS[p] }} />
            <span>{p}</span>
            <span className="mg-small">{imported.team[p] ? `${TEAM[p].events.length} events, ${tzShort(dir[p].tz)}` : "no calendar"}</span>
            <button
              className={"mg-pill" + (imported.team[p] ? " on" : "")}
              style={imported.team[p] ? { background: PERSON_COLORS[p], borderColor: PERSON_COLORS[p] } : { borderColor: PERSON_COLORS[p], color: PERSON_COLORS[p] }}
              onClick={() => onToggleTeam(p)}
              aria-pressed={!!imported.team[p]}
            >
              {imported.team[p] ? "Calendar added" : "Add calendar"}
            </button>
            <button className="mg-x" aria-label={"Remove " + p} onClick={() => onRemoveTeammate(p)}>×</button>
          </li>
        ))}
      </ul>
      <AddTeammate roster={roster} onAdd={onAddTeammate} />
    </section>
  );
}
