import { PEOPLE, PERSON_COLORS, CALENDAR_STYLE, CAL_IDS, TEAM } from "../data/mock.js";
import { tzShort } from "../lib/tz.js";

export default function CalendarsPanel({ events, unsynced, connected, onToggle, onSync, syncMsg }) {
  const count = (id) => events.filter((e) => e.calendar === id && !e.pending).length;
  return (
    <section className="mg-card">
      <h2>Calendars</h2>
      <h3 className="mg-sub">Yours, merged into one view</h3>
      <ul className="mg-cals">
        {CAL_IDS.map((id) => (
          <li key={id}>
            <i className="sw" style={{ background: CALENDAR_STYLE[id].color }} />
            <span>{CALENDAR_STYLE[id].label}</span>
            <span className="mg-small">{count(id)} events</span>
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
          <p>Every event shows up as at least a Busy block on all three calendars.</p>
        )}
        {syncMsg && <p className="mg-msg">{syncMsg}</p>}
      </div>
      <h3 className="mg-sub">Team calendars (Outlook)</h3>
      <ul className="mg-cals">
        {PEOPLE.map((p) => (
          <li key={p}>
            <i className="sw" style={{ background: PERSON_COLORS[p] }} />
            <span>{p}</span>
            <span className="mg-small">{TEAM[p].events.filter((e) => !e.shared).length + TEAM[p].events.filter((e) => e.shared).length} events, {tzShort(TEAM[p].tz)}</span>
            <button className={"mg-pill" + (connected[p] ? " on" : "")} style={connected[p] ? { background: PERSON_COLORS[p], borderColor: PERSON_COLORS[p] } : { borderColor: PERSON_COLORS[p], color: PERSON_COLORS[p] }} onClick={() => onToggle(p)} aria-pressed={connected[p]}>
              {connected[p] ? "Connected" : "Import"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
