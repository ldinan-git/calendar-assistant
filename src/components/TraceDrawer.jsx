import { useSyncExternalStore } from "react";
import { getTrace, subscribeTrace, clearTrace, getSettings, subscribeSettings } from "../api/llm.js";

/** Every model call the app made, with what went in, what came out, and what answered it. */
export default function TraceDrawer({ onClose }) {
  const trace = useSyncExternalStore(subscribeTrace, getTrace, getTrace);
  const s = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  return (
    <section className="mg-card mg-trace-drawer">
      <div className="mg-trace-head">
        <h2>LLM trace ({s.provider}{s.provider === "ollama" ? `, ${s.model}` : ""})</h2>
        <div className="mg-row" style={{ margin: 0 }}>
          <button className="mg-btn small ghost" onClick={clearTrace} disabled={!trace.length}>Clear</button>
          <button className="mg-btn small ghost" onClick={onClose}>Close</button>
        </div>
      </div>
      <p className="mg-small">
        Every call goes through <code>callLLM(task, input)</code>. With Ollama or the Claude API the model answers; if its answer is unusable the call falls back to the mock and the row says so.
      </p>
      {trace.length === 0 && <p className="mg-empty">No calls yet.</p>}
      <ol className="mg-trace">
        {trace.map((t) => (
          <li key={t.id} className={t.error ? "err" : t.fellBack ? "warn" : ""}>
            <details>
              <summary>
                <b>{t.task}</b>
                <span className="mg-small"> {t.at.toLocaleTimeString()}, {(t.ms / 1000).toFixed(1)} s, {t.error ? "error: " + t.error : "answered by " + (t.file || "nothing")}{t.fellBack ? " (fell back: " + t.fellBack + ")" : ""}</span>
              </summary>
              <div className="mg-trace-body">
                <div><h4>Input</h4><pre>{JSON.stringify(t.input, null, 2)}</pre></div>
                <div><h4>Output</h4><pre>{t.error ? t.error : JSON.stringify(t.output, null, 2)}</pre></div>
              </div>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
