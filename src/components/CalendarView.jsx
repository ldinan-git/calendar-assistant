import { DAYS, DATES, GRID_START, GRID_END, PPM, fmt, slotLabel } from "../lib/time.js";
import { computeLanes } from "../lib/scheduler.js";
import { PEOPLE, PERSON_COLORS, CALENDAR_STYLE } from "../data/mock.js";

const clampTop = (s) => (Math.max(s, GRID_START) - GRID_START) * PPM;
const clampH = (s, e) => (Math.min(e, GRID_END) - Math.max(s, GRID_START)) * PPM;

export default function CalendarView({ events, analysis, flags, zones, overlay, overlayBlocks, selected, onSelect, ghost, ghostTitle }) {
  return (
    <div className="mg-cal">
      <div className="mg-cal-head">
        <div className="mg-small mg-tzlabel">CT</div>
        {DAYS.map((d, i) => (
          <div key={d} className="mg-dayhead"><b>{d}</b> {DATES[i]}</div>
        ))}
      </div>
      <div className="mg-cal-body" style={{ height: (GRID_END - GRID_START) * PPM }}>
        <div className="mg-gutter">
          {Array.from({ length: (GRID_END - GRID_START) / 60 + 1 }, (_, i) => GRID_START / 60 + i).map((h) => (
            <span key={h} style={{ top: (h * 60 - GRID_START) * PPM - 7 }}>{fmt(h * 60).replace(":00", "")}</span>
          ))}
        </div>
        {DAYS.map((d, di) => {
          const dayEvents = events.filter((e) => e.day === di && e.attendees.includes("You") && e.end > GRID_START && e.start < GRID_END);
          const lanes = computeLanes(dayEvents);
          return (
            <div className="mg-day" key={d}>
              {Array.from({ length: (GRID_END - GRID_START) / 60 }, (_, i) => (
                <div key={i} className="mg-hline" style={{ top: i * 60 * PPM }} />
              ))}
              {zones.filter((z) => z.day === di && z.end > GRID_START && z.start < GRID_END).map((z, i) => (
                <div key={i} className="mg-zone" style={{ top: clampTop(z.start), height: clampH(z.start, z.end) }} title={`${z.label}: ${z.title}`}>
                  <span>{z.kind === "person" ? "Buffer" : "Soft hold"}</span>
                </div>
              ))}
              {PEOPLE.filter((p) => overlay[p]).map((p, pi) =>
                (overlayBlocks[p] || [])
                  .filter((b) => b.day === di && b.end > GRID_START && b.start < GRID_END)
                  .map((b, bi) => (
                    <div
                      key={p + bi}
                      className="mg-strip"
                      title={`${p}: ${b.title} (${fmt(b.start)} to ${fmt(b.end)} CT)`}
                      style={{ background: PERSON_COLORS[p], right: 2 + pi * 6, top: clampTop(b.start), height: clampH(b.start, b.end) }}
                    />
                  ))
              )}
              {dayEvents.map((e) => {
                const a = analysis[e.id];
                const f = flags[e.id] || { conflict: [], b2bWith: [], zone: null };
                const h = clampH(e.start, e.end);
                const L = lanes[e.id] || { lane: 0, lanes: 1 };
                const bad = f.conflict.length > 0;
                const warn = f.b2bWith.length > 0 || f.zone;
                const cal = CALENDAR_STYLE[e.calendar];
                return (
                  <button
                    key={e.id}
                    className={`mg-ev p-${a ? a.priority : "none"}${e.pending ? " pending" : ""}${selected === e.id ? " sel" : ""}`}
                    style={{
                      top: clampTop(e.start),
                      height: h - 1,
                      left: `${(L.lane / L.lanes) * 100}%`,
                      width: `calc(${100 / L.lanes}% - 2px)`,
                      borderLeft: `4px solid ${cal ? cal.color : "#999"}`,
                    }}
                    onClick={() => onSelect(e.id)}
                    title={`${e.title}\n${slotLabel(e)}${cal ? "\n" + cal.label + " calendar" : ""}${a ? "\n" + a.reason : ""}`}
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
                        {f.zone && <em>{f.zone.kind === "person" ? "Buffer" : "Soft hold"}</em>}
                      </span>
                    )}
                  </button>
                );
              })}
              {ghost && ghost.day === di && (
                <div className="mg-ghost" style={{ top: clampTop(ghost.start), height: clampH(ghost.start, ghost.end) }}>
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
