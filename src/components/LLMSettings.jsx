import { useEffect, useSyncExternalStore } from "react";
import { getSettings, subscribeSettings, setProvider, setModel, probeOllama } from "../api/llm.js";

export default function LLMSettings() {
  const s = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  useEffect(() => {
    probeOllama();
  }, []);
  const o = s.ollama;
  let status = "";
  let cls = "";
  if (s.provider === "mock") {
    status = "No model: canned responses";
  } else if (s.provider === "ollama") {
    if (!o.checked) status = "Checking Ollama…";
    else if (o.up) {
      status = "Ollama connected";
      cls = "ok";
    } else {
      status = "Ollama not reachable: answers fall back to the mock";
      cls = "bad";
    }
  } else {
    status = "Anthropic API (key in .env.local)";
  }
  return (
    <div className="mg-llm" role="group" aria-label="Language model">
      <label className="mg-small" htmlFor="provider">Model</label>
      <select id="provider" value={s.provider} onChange={(e) => setProvider(e.target.value)}>
        <option value="ollama">Ollama (local)</option>
        <option value="anthropic">Claude API</option>
        <option value="mock">Mock</option>
      </select>
      {s.provider === "ollama" && o.up && (
        <select aria-label="Ollama model" value={s.model} onChange={(e) => setModel(e.target.value)}>
          {o.models.map((m) => (<option key={m}>{m}</option>))}
        </select>
      )}
      <span className={"mg-llm-status " + cls}>{status}</span>
      {s.provider === "ollama" && o.checked && !o.up && <button className="mg-btn small ghost" onClick={probeOllama}>Retry</button>}
    </div>
  );
}
