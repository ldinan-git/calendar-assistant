import { useSyncExternalStore, useMemo } from "react";
import { marked } from "marked";
import walkthrough from "../../summary/walkthrough.md?raw";
import { getTrace, subscribeTrace, clearTrace, llmMode } from "../api/llm.js";

// every markdown file in /documentation, rendered below the walkthrough
const docFiles = import.meta.glob("../../documentation/*.md", { eager: true, query: "?raw", import: "default" });

const md = (src) => ({ __html: marked.parse(src) });

export default function SummaryView() {
  const trace = useSyncExternalStore(subscribeTrace, getTrace, getTrace);
  const docs = useMemo(
    () => Object.entries(docFiles).sort(([a], [b]) => a.localeCompare(b)).map(([path, src]) => ({ name: path.split("/").pop(), src })),
    []
  );

  return (
    <div className="mg-summary">
      <section className="mg-card mg-prose">
        <div dangerouslySetInnerHTML={md(walkthrough)} />
      </section>

      <section className="mg-card">
        <div className="mg-trace-head">
          <h2>Live trace of LLM calls ({llmMode} mode)</h2>
          <button className="mg-btn small ghost" onClick={clearTrace} disabled={!trace.length}>Clear</button>
        </div>
        <p className="mg-small">
          Every call goes through <code>callLLM(task, input)</code>. In mock mode teaching is answered by a file in <code>/responses</code> and everything else by <code>src/api/mockBrain.js</code>.
          Go to the Calendar tab, teach it something, ask for a meeting, then come back here.
        </p>
        {trace.length === 0 && <p className="mg-empty">No calls yet this session.</p>}
        <ol className="mg-trace">
          {trace.map((t) => (
            <li key={t.id} className={t.error ? "err" : ""}>
              <details>
                <summary>
                  <b>{t.task}</b>
                  <span className="mg-small"> {t.at.toLocaleTimeString()}, {t.ms} ms, {t.error ? "error: " + t.error : t.file ? "answered by " + t.file : "answered by the live API"}</span>
                </summary>
                <div className="mg-trace-body">
                  <div>
                    <h4>Input</h4>
                    <pre>{JSON.stringify(t.input, null, 2)}</pre>
                  </div>
                  <div>
                    <h4>Output</h4>
                    <pre>{t.error ? t.error : JSON.stringify(t.output, null, 2)}</pre>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ol>
      </section>

      <section className="mg-card">
        <h2>Documentation</h2>
        <p className="mg-small">Everything in <code>/documentation</code>, rendered. Click to expand.</p>
        {docs.map((d) => (
          <details key={d.name} className="mg-doc">
            <summary>{d.name}</summary>
            <div className="mg-prose" dangerouslySetInnerHTML={md(d.src)} />
          </details>
        ))}
      </section>
    </div>
  );
}
