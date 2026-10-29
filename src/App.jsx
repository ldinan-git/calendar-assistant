import { useState } from "react";
import Workspace from "./Workspace.jsx";
import LLMSettings from "./components/LLMSettings.jsx";
import TraceDrawer from "./components/TraceDrawer.jsx";
import { ALL_PROMPTS } from "./data/demoScript.js";

// One app, two starting states. index.html mounts mode "final", fresh.html mounts mode "fresh".
export default function App({ mode }) {
  const [trace, setTrace] = useState(false);
  const fresh = mode === "fresh";
  return (
    <div className="mg">
      <header className="mg-top">
        <div className="mg-brand">
          <h1>margin</h1>
          <p>Calendar assistant. Week of Nov 2, times in Central.</p>
        </div>
        <span className={"mg-mode " + (fresh ? "" : "live")}>{fresh ? "New: blank slate" : "Finished product"}</span>
        <div className="mg-top-right">
          <LLMSettings />
          <button className="mg-btn small ghost" onClick={() => setTrace((t) => !t)}>{trace ? "Hide" : "Show"} LLM trace</button>
        </div>
      </header>
      {trace && <TraceDrawer onClose={() => setTrace(false)} />}
      <Workspace mode={mode} quick={ALL_PROMPTS} />
      <footer className="mg-foot">
        <a href={fresh ? "/" : "/fresh.html"}>Open the {fresh ? "finished" : "new"} app</a>
        <a href="/demo.html">Demo script</a>
        <a href="/summary.html">Walkthrough and docs</a>
      </footer>
    </div>
  );
}
