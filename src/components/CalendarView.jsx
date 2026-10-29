import { DAYS, DATES, GRID_START, GRID_END, PPM, fmt, slotLabel } from "../lib/time.js";
import { computeLanes, busyList } from "../lib/scheduler.js";
import { PEOPLE, PERSON_COLORS, OTHER_BUSY } from "../data/mock.js";

export default function CalendarView({ events, analysis, flags, zones, overlay, selected, onSelect, ghost, ghostTitle }) {
  return (
    <div className="mg-cal">
      <div className="mg-cal-head">
        <div />
        {DAYS.map((d, i) => (
          <div key={d} className="mg-dayhead"><b>{d}</b> {DATES[i]}</div>
        ))}
      </div>
      <div className="mg-cal-body" style={{ height: (GRID_END - GRID_START) * PPM }}>
        <div className="mg-gutter">
          {Array.from({ length: 11 }, (_, i) => 8 + i).map((h) => (
            <span key={h} style={{ top: (h * 60 - GRID_START) * PPM - 7 }}>{fmt(h * 60).replace(":00", "")}</span>
          ))}
        </div>
        {DAYS.map((d, di) => {
          const dayEvents = events.filter((e) => e.day === di && e.attendees.includes("You"));
          const lanes = computeLanes(dayEvents);
          return (
            <div className="mg-day" key={d}>
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="mg-hline" style={{ top: i * 60 * PPM }} />
              ))}
              {zones.filter((z) => z.day === di).map((z, i) => (
                <div
                  key={i}
                  className="mg-zone"
                  style={{
                    top: (Math.max(z.start, GRID_START) - GRID_START) * PPM,
                    height: (Math.min(z.end, GRID_END) - Math.max(z.start, GRID_START)) * PPM,
                  }}
                  title={`Buffer around ${z.title}`}
                >
                  <span>Buffer</span>
                </div>
              ))}
              {PEOPLE.filter((p) => overlay[p]).map((p, pi) =>
                busyList(p, events, OTHER_BUSY)
                  .filter((b) => b.day === di)
                  .map((b, bi) => (
                    <div
                      key={p + bi}
                      className="mg-strip"
                      title={`${p} is busy`}
                      style={{
                        background: PERSON_COLORS[p],
                        right: 2 + pi * 6,
                        top: (b.start - GRID_START) * PPM,
                        height: (b.end - b.start) * PPM,
                      }}
                    />
                  ))
              )}
              {dayEvents.map((e) => {
                const a = analysis[e.id];
                const f = flags[e.id] || { conflict: [], b2bWith: [], zone: null };
                const h = (e.end - e.start) * PPM;
                const L = lanes[e.id] || { lane: 0, lanes: 1 };
                const bad = f.conflict.length > 0;
                const warn = f.b2bWith.length > 0 || f.zone;
                return (
                  <button
                    key={e.id}
                    className={`mg-ev p-${a ? a.priority : "none"}${e.pending ? " pending" : ""}${selected === e.id ? " sel" : ""}`}
                    style={{
                      top: (e.start - GRID_START) * PPM,
                      height: h - 1,
                      left: `${(L.lane / L.lanes) * 100}%`,
                      width: `calc(${100 / L.lanes}% - 2px)`,
                    }}
                    onClick={() => onSelect(e.id)}
                    title={`${e.title}\n${slotLabel(e)}${a ? "\n" + a.reason : ""}`}
                  >
                    {(bad || warn) && <i className={"dot " + (bad ? "bad" : "warn")} />}
                    <span className="t">{e.title}</span>
                    {h >= 40 && <span className="s">{fmt(e.start)}</span>}
                    {h >= 58 && (
                      <span className="tags">
                        {e.pending && <em>Pending</em>}
                        {e.moved && <em>Moved</em>}
                        {e.isNew && <em>New</em>}
                        {bad && <em>Conflict</em>}
                        {f.b2bWith.length > 0 && <em>Back-to-back</em>}
                        {f.zone && <em>Buffer</em>}
                      </span>
                    )}
                  </button>
                );
              })}
              {ghost && ghost.day === di && (
                <div className="mg-ghost" style={{ top: (ghost.start - GRID_START) * PPM, height: (ghost.end - ghost.start) * PPM }}>
                  {ghostTitle || "New"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
