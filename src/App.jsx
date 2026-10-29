import { useState, useEffect } from "react";
import Workspace from "./Workspace.jsx";
import LLMSettings from "./components/LLMSettings.jsx";
import TraceDrawer from "./components/TraceDrawer.jsx";
import { probeOllama } from "./api/llm.js";
import { ALL_PROMPTS } from "./data/demoScript.js";

// Developer controls (model picker, LLM trace, links to the other pages) stay out of the product.
// Add ?dev=1 to any page's URL to show them.
const DEV = new URLSearchParams(window.location.search).has("dev");

// One app, two starting states. index.html mounts mode "final", fresh.html mounts mode "fresh".
export default function App({ mode }) {
  const [trace, setTrace] = useState(false);
  const fresh = mode === "fresh";
  useEffect(() => {
    probeOllama(); // quietly: if no local model is running, every answer falls back to the built-in rules
  }, []);
  return (
    <div className="mg">
      <header className="mg-top">
        <div className="mg-brand">
          <h1>Pascal</h1>
          <p>Your calendar agent. Week of Nov 2, times in Central.</p>
        </div>
        {DEV && (
          <div className="mg-top-right">
            <LLMSettings />
            <button className="mg-btn small ghost" onClick={() => setTrace((t) => !t)}>{trace ? "Hide" : "Show"} LLM trace</button>
          </div>
        )}
      </header>
      {DEV && trace && <TraceDrawer onClose={() => setTrace(false)} />}
      <Workspace mode={mode} quick={DEV ? ALL_PROMPTS : []} />
      {DEV && (
        <footer className="mg-foot">
          <a href={fresh ? "/?dev=1" : "/fresh.html?dev=1"}>Open the {fresh ? "finished" : "new"} app</a>
          <a href="/demo.html">Demo script</a>
          <a href="/summary.html">Walkthrough and docs</a>
        </footer>
      )}
    </div>
  );
}
