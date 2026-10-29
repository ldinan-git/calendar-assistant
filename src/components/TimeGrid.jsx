import { computeLanes } from "../lib/scheduler.js";
import { fmt } from "../lib/time.js";

/**
 * A generic time grid. Columns can be days (one person's week) or people (one day, compared).
 * column: { key, head, sub, events: [{id, title, start, end, color, faded}], shade: [{start, end}], bands: [{start, end}] }
 * `shade` = outside working hours, `bands` = everyone free.
 */
export default function TimeGrid({ columns, from = 7 * 60, to = 19 * 60, ppm = 0.8 }) {
  const hours = [];
  for (let m = Math.ceil(from / 60) * 60; m < to; m += 60) hours.push(m);
  const top = (m) => (Math.max(m, from) - from) * ppm;
  const height = (a, b) => (Math.min(b, to) - Math.max(a, from)) * ppm;
  return (
    <div className="mg-cal">
      <div className="mg-tg-head" style={{ gridTemplateColumns: `44px repeat(${columns.length}, minmax(96px, 1fr))` }}>
        <div className="mg-small mg-tzlabel">CT</div>
        {columns.map((c) => (
          <div key={c.key} className="mg-dayhead"><b>{c.head}</b> {c.sub}</div>
        ))}
      </div>
      <div className="mg-tg-body" style={{ height: (to - from) * ppm, gridTemplateColumns: `44px repeat(${columns.length}, minmax(96px, 1fr))` }}>
        <div className="mg-gutter">
          {hours.map((m) => (<span key={m} style={{ top: top(m) - 7 }}>{fmt(m).replace(":00", "")}</span>))}
        </div>
        {columns.map((c) => {
          const evs = c.events.filter((e) => e.end > from && e.start < to);
          const lanes = computeLanes(evs);
          return (
            <div className="mg-day" key={c.key}>
              {hours.map((m) => (<div key={m} className="mg-hline" style={{ top: top(m) }} />))}
              {(c.shade || []).map((r, i) => (<div key={"s" + i} className="mg-shade" style={{ top: top(r.start), height: height(r.start, r.end) }} />))}
              {(c.bands || []).map((r, i) => (
                <div key={"b" + i} className="mg-band" style={{ top: top(r.start), height: height(r.start, r.end) }}>
                  <span>Free</span>
                </div>
              ))}
              {evs.map((e) => {
                const L = lanes[e.id] || { lane: 0, lanes: 1 };
                const h = height(e.start, e.end);
                return (
                  <div
                    key={e.id}
                    className={"mg-tg-ev" + (e.faded ? " faded" : "")}
                    title={`${e.title}\n${fmt(e.start)} to ${fmt(e.end)} CT`}
                    style={{ top: top(e.start), height: h - 1, left: `${(L.lane / L.lanes) * 100}%`, width: `calc(${100 / L.lanes}% - 2px)`, background: e.color, }}
                  >
                    <span className="t">{e.title}</span>
                    {h >= 34 && <span className="s">{fmt(e.start)}</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
