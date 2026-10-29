import { TEACH_EXAMPLES } from "../data/mock.js";

const factMeta = (f) =>
  [
    f.priority && `priority ${f.priority}`,
    f.flexibility && `flexibility ${f.flexibility}`,
    f.trigger && f.trigger.event_type && `applies to ${f.trigger.event_type}`,
    f.buffer_before_min != null && `${f.buffer_before_min} min before, ${f.buffer_after_min != null ? f.buffer_after_min : 0} after`,
    f.severity,
    f.strength,
  ]
    .filter(Boolean)
    .join(", ");

export default function MemoryPanel({ facts, onDelete, input, setInput, busy, message, onTeach }) {
  return (
    <section className="mg-card">
      <h2>What I know</h2>
      {facts.length === 0 && <p className="mg-empty">Nothing yet. Tell me who matters and how you like your week to run.</p>}
      <ul className="mg-facts">
        {facts.map((f) => (
          <li key={f.id}>
            <div>
              <div className="mg-fact-sum">{f.summary || f.source_text}</div>
              <div className="mg-fact-meta">{f.type.replace("_", " ")}{factMeta(f) ? ": " + factMeta(f) : ""}</div>
            </div>
            <button className="mg-x" aria-label={"Delete fact: " + (f.summary || f.type)} onClick={() => onDelete(f.id)}>×</button>
          </li>
        ))}
      </ul>
      <div className="mg-input-row">
        <textarea
          rows={2}
          value={input}
          placeholder="Tell me something, like “Jake is a partner”"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onTeach(input);
            }
          }}
        />
        <button className="mg-btn" disabled={busy || !input.trim()} onClick={() => onTeach(input)}>
          {busy ? "Saving" : "Teach"}
        </button>
      </div>
      {message && <p className="mg-msg">{message}</p>}
      <div className="mg-chips">
        {TEACH_EXAMPLES.map((x) => (
          <button key={x} className="mg-chip" disabled={busy} onClick={() => onTeach(x)}>{x}</button>
        ))}
      </div>
      {facts.length > 0 && (
        <details className="mg-json">
          <summary>View saved JSON</summary>
          <pre>{JSON.stringify(facts, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}
