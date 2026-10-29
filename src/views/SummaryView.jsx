import { useMemo } from "react";
import { marked } from "marked";
import walkthrough from "../../summary/walkthrough.md?raw";

// every markdown file in /documentation, rendered below the walkthrough
const docFiles = import.meta.glob("../../documentation/*.md", { eager: true, query: "?raw", import: "default" });

const md = (src) => ({ __html: marked.parse(src) });

export default function SummaryView() {
  const docs = useMemo(
    () => Object.entries(docFiles).sort(([a], [b]) => a.localeCompare(b)).map(([path, src]) => ({ name: path.split("/").pop(), src })),
    []
  );
  return (
    <div className="mg">
      <header className="mg-top">
        <div className="mg-brand"><h1>Pascal</h1><p>Walkthrough and docs</p></div>
        <nav className="mg-foot" style={{ margin: 0 }}>
          <a href="/">Finished app</a><a href="/fresh.html">New app</a><a href="/demo.html">Demo script</a>
        </nav>
      </header>
      <div className="mg-summary">
        <section className="mg-card mg-prose">
          <div dangerouslySetInnerHTML={md(walkthrough)} />
        </section>
        <section className="mg-card">
          <h2>Documentation</h2>
          <p className="mg-small">Everything in <code>/documentation</code>, rendered. Click to expand. The live trace of model calls is in the app itself (Show LLM trace).</p>
          {docs.map((d) => (
            <details key={d.name} className="mg-doc">
              <summary>{d.name}</summary>
              <div className="mg-prose" dangerouslySetInnerHTML={md(d.src)} />
            </details>
          ))}
        </section>
      </div>
    </div>
  );
}
