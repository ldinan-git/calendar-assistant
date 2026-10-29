import { useState } from "react";
import { marked } from "marked";
import { DEMO, SETUP } from "../data/demoScript.js";

const inline = (s) => ({ __html: marked.parseInline(s) });

function Copy({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="mg-btn small"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked: the text is selectable */ }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export default function DemoScript() {
  const [checked, setChecked] = useState({});
  return (
    <div className="mg">
      <header className="mg-top">
        <div className="mg-brand"><h1>Pascal</h1><p>Demo script: from the new app to the finished product</p></div>
        <nav className="mg-foot" style={{ margin: 0 }}>
          <a href="/fresh.html" target="_blank" rel="noreferrer">Open the new app</a>
          <a href="/" target="_blank" rel="noreferrer">Open the finished app</a>
        </nav>
      </header>
      <div className="mg-summary">
        <section className="mg-card mg-prose">
          <p>Do the steps in order; later steps depend on earlier ones. A grey box is a prompt: click <b>Copy</b>, click into the assistant, paste, press Enter. Everything else is a click or something to point at. Tick each step as you go.</p>
          <h3>Before you start</h3>
          <ul>{SETUP.map((s, i) => (<li key={i} dangerouslySetInnerHTML={inline(s)} />))}</ul>
        </section>
        {DEMO.map((part) => (
          <section key={part.id} className="mg-card">
            <h2>{part.title}</h2>
            <p className="mg-small">{part.pitch}</p>
            <ol className="mg-steps">
              {part.steps.map((s, i) => {
                const key = part.id + i;
                return (
                  <li key={key} className={checked[key] ? "done" : ""}>
                    <label className="mg-check mg-step-head">
                      <input type="checkbox" checked={!!checked[key]} onChange={(e) => setChecked((c) => ({ ...c, [key]: e.target.checked }))} />
                      <b>{s.title}</b>
                    </label>
                    {s.do && <p dangerouslySetInnerHTML={inline(s.do)} />}
                    {s.prompt && (
                      <div className="mg-prompt">
                        <pre>{s.prompt}</pre>
                        <Copy text={s.prompt} />
                      </div>
                    )}
                    {s.expect && <p className="mg-small"><b>You should see:</b> {s.expect}</p>}
                    {s.say && <p className="mg-say">Say: {s.say}</p>}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
