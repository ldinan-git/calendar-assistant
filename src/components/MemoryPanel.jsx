import { PEOPLE, PERSON_COLORS, RELATIONSHIP, DIRECTORY } from "../data/mock.js";
import { fmt } from "../lib/time.js";
import { overlapWindow } from "../lib/context.js";
import { tzShort, USER_TZ } from "../lib/tz.js";

const factMeta = (f) =>
  [
    f.priority && `priority ${f.priority}`,
    f.never_reschedule ? "never reschedule" : f.flexibility && `flexibility ${f.flexibility}`,
    f.trigger && f.trigger.event_type && `applies to ${f.trigger.event_type}s`,
    f.buffer_before_min != null && `${f.buffer_before_min} min before, ${f.buffer_after_min != null ? f.buffer_after_min : 0} after`,
  ]
    .filter(Boolean)
    .join(", ");

function Fact({ f, onDelete }) {
  return (
    <li>
      <div>
        <div className="mg-fact-sum">{f.summary || f.source_text}</div>
        <div className="mg-fact-meta">{f.type.replace("_", " ")}{factMeta(f) ? ": " + factMeta(f) : ""}</div>
      </div>
      <button className="mg-x" aria-label={"Delete: " + (f.summary || f.type)} onClick={() => onDelete(f.id)}>×</button>
    </li>
  );
}

function PersonCard({ name, facts, onDelete }) {
  const d = DIRECTORY[name];
  const mine = facts.filter((f) => f.name === name || (f.trigger && f.trigger.attendee === name));
  const win = d.tz !== USER_TZ ? overlapWindow(d) : null;
  return (
    <div className="mg-person" style={{ borderLeftColor: PERSON_COLORS[name] }}>
      <div className="mg-person-head">
        <b>{name}</b>
        <span className="mg-rel">{RELATIONSHIP[name]}</span>
      </div>
      <div className="mg-small">
        {d.title}, {d.office} ({tzShort(d.tz)})
        {win ? `. Overlap with you: ${fmt(win.start)} to ${fmt(win.end)} CT` : ""}
      </div>
      {mine.length === 0 ? (
        <p className="mg-small mg-nofact">No context taught yet.</p>
      ) : (
        <ul className="mg-facts">{mine.map((f) => (<Fact key={f.id} f={f} onDelete={onDelete} />))}</ul>
      )}
    </div>
  );
}

export default function MemoryPanel({ facts, onDelete }) {
  const rules = facts.filter((f) => f.type !== "person" && !(f.trigger && f.trigger.attendee));
  return (
    <section className="mg-card">
      <h2>What I know</h2>
      <p className="mg-small mg-lead">Context you teach in the chat attaches to a person or a rule. Every suggestion uses it.</p>
      <div className="mg-people">
        {PEOPLE.map((p) => (<PersonCard key={p} name={p} facts={facts} onDelete={onDelete} />))}
      </div>
      <h3 className="mg-sub">Your rules</h3>
      {rules.length === 0 && <p className="mg-empty">None yet, like "when you see a flight, hold the hour before".</p>}
      <ul className="mg-facts">{rules.map((f) => (<Fact key={f.id} f={f} onDelete={onDelete} />))}</ul>
      {facts.length > 0 && (
        <details className="mg-json">
          <summary>View saved JSON</summary>
          <pre>{JSON.stringify(facts, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}
