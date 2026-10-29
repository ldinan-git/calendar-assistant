// One entry point for every LLM call in the app: callLLM(task, input).
//
//   mock (default): `extract` is answered by a hand-authored file in /responses (picked by manifest.json);
//                   analyze, parse, route, rank and advice by the small deterministic functions in mockBrain.js
//   live:           every task goes to the Anthropic API with the prompt from prompts.js
//
// Every call is recorded in a trace that the /summary tab displays.

import manifest from "../../responses/manifest.json";
import { PROMPTS } from "./prompts.js";
import { mockTask } from "./mockBrain.js";

const fixtures = import.meta.glob("../../responses/**/*.json", { eager: true, import: "default" });

const MODE = import.meta.env.VITE_LLM_MODE || "mock";
const DELAY = Number(import.meta.env.VITE_MOCK_DELAY_MS ?? 600);

/* ------------------------------ trace ------------------------------ */
let trace = [];
const listeners = new Set();
export const getTrace = () => trace;
export const clearTrace = () => {
  trace = [];
  listeners.forEach((l) => l());
};
export const subscribeTrace = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
function record(entry) {
  trace = [entry, ...trace].slice(0, 100);
  listeners.forEach((l) => l());
}

/* ------------------------------ mock ------------------------------ */
const wait = (scale = 1) => new Promise((r) => setTimeout(r, DELAY * scale * (0.6 + Math.random() * 0.8)));

async function callMock(task, input) {
  if (task === "extract") {
    const rule = manifest.extract.rules.find((r) => new RegExp(r.match, "i").test(input.user_message));
    const file = rule ? rule.file : manifest.extract.fallback;
    const data = fixtures[`../../responses/${file}`];
    if (!data) throw new Error(`mock: manifest points at ${file} but it is not in /responses`);
    await wait();
    const out = structuredClone(data);
    // the generic fallback should still echo what the user actually typed
    if (file === manifest.extract.fallback) out.facts[0].source_text = input.user_message;
    return { out, file: `responses/${file}` };
  }
  await wait(task === "analyze" ? 0.3 : 0.8);
  return { out: mockTask(task, input), file: `src/api/mockBrain.js (${task})` };
}

/* ------------------------------ live ------------------------------ */
function parseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const s = clean.search(/[\[{]/);
  const e = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
  return JSON.parse(clean.slice(s, e + 1));
}

async function callLive(task, input) {
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!key) throw new Error("live mode needs VITE_ANTHROPIC_API_KEY in .env.local");
  const user = task === "parse" ? input.text : JSON.stringify(input);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      // browser-direct calls expose the key. Fine for a local class demo, not for anything deployed.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: import.meta.env.VITE_ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 2000,
      system: PROMPTS[task],
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { out: parseJSON(text), file: null };
}

/* ------------------------------ public ------------------------------ */
export async function callLLM(task, input) {
  const started = performance.now();
  const base = { id: Math.random().toString(36).slice(2, 8), at: new Date(), task, mode: MODE, input };
  try {
    const { out, file } = MODE === "live" ? await callLive(task, input) : await callMock(task, input);
    record({ ...base, file, output: out, ms: Math.round(performance.now() - started) });
    return out;
  } catch (err) {
    record({ ...base, file: null, error: String(err.message || err), ms: Math.round(performance.now() - started) });
    throw err;
  }
}

export const llmMode = MODE;
