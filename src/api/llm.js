// One entry point for every LLM call in the app: callLLM(task, input).
//
// Providers (chosen in the header, remembered in localStorage):
//   ollama     a local model through http://localhost:11434 (default, no key needed)
//   anthropic  the Anthropic API straight from the browser (demo only, the key is exposed)
//   mock       canned `extract` fixtures + the deterministic functions in mockBrain.js, no model at all
//
// A real model, especially a small local one, sometimes returns the wrong shape or nothing. So every answer is
// checked by validate.js, retried once, and if it is still unusable that one call falls back to the mock and is
// marked "fell back" in the trace. The app never crashes on a bad model answer, and the trace tells the truth.

import { PROMPTS } from "./prompts.js";
import { mockTask, mockReasoning } from "./mockBrain.js";
import { fixtureExtract } from "./fixtures.js";
import { check } from "./validate.js";

const env = import.meta.env || {};
const DELAY = Number(env.VITE_MOCK_DELAY_MS ?? 400);
const OLLAMA_URL = env.VITE_OLLAMA_URL || "http://localhost:11434";
const STORE = "pascal-llm";

/* ------------------------------ settings (provider, model) ------------------------------ */
const hasStorage = typeof localStorage !== "undefined";
const saved = (() => {
  try { return hasStorage ? JSON.parse(localStorage.getItem(STORE)) || {} : {}; } catch { return {}; }
})();
const envProvider = { live: "anthropic", anthropic: "anthropic", mock: "mock", ollama: "ollama" }[env.VITE_LLM_MODE];

let settings = {
  provider: saved.provider || envProvider || "ollama",
  model: saved.model || env.VITE_OLLAMA_MODEL || "",
  ollama: { checked: false, up: false, models: [] }, // result of the last probe
};
let snapshot = settings;
const settingListeners = new Set();
const emitSettings = () => {
  snapshot = { ...settings };
  settingListeners.forEach((l) => l());
  if (hasStorage) localStorage.setItem(STORE, JSON.stringify({ provider: settings.provider, model: settings.model }));
};
export const getSettings = () => snapshot;
export const subscribeSettings = (fn) => {
  settingListeners.add(fn);
  return () => settingListeners.delete(fn);
};
export function setProvider(p) {
  settings.provider = p;
  emitSettings();
}
export function setModel(m) {
  settings.model = m;
  emitSettings();
}

/** Ask Ollama which models it has. Picks one if none is chosen yet. Safe to call repeatedly. */
export async function probeOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    settings.ollama = { checked: true, up: true, models };
    if (!models.includes(settings.model)) settings.model = models.find((m) => /llama3|qwen|mistral|gemma|phi/i.test(m)) || models[0] || "";
  } catch {
    settings.ollama = { checked: true, up: false, models: [] };
  }
  emitSettings();
  return settings.ollama;
}

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
  await wait(task === "analyze" ? 0.2 : 1);
  if (task === "extract") return fixtureExtract(input.user_message);
  return { out: mockTask(task, input), file: `src/api/mockBrain.js (${task})` };
}

/* ------------------------------ what the model sees ------------------------------ */
// The app passes everything code knows; the model gets a trimmed, plainer view of it.
function userMessage(task, input) {
  switch (task) {
    case "extract": return input.user_message;
    case "parse": return input.text;
    case "route": return JSON.stringify({ text: input.text, has_options: !!input.has_options });
    case "analyze":
      return JSON.stringify({
        knowledge_base: input.knowledge_base,
        events: input.events.map((e) => ({ id: e.id, title: e.title, with: e.attendees.filter((a) => a !== "You") })),
      });
    case "rank":
      // trimmed on purpose: on a CPU, every prompt token costs time. context_notes already contain the knowledge base lines.
      return JSON.stringify({
        request: input.request,
        context_notes: input.context_notes,
        candidates: input.candidates.slice(0, 6).map((c) => ({
          id: c.id, when: c.when, warnings: c.callout_texts.filter((t, i) => i < 3 && !/^Everyone free/.test(t)), moves: c.moves.map((m) => m.title),
        })),
      });
    case "recall": return JSON.stringify({ question: input.question, knowledge_base: input.knowledge_base, context_notes: input.context_notes });
    default: return JSON.stringify(input);
  }
}

function parseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const s = clean.search(/[\[{]/);
  const e = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
  return JSON.parse(clean.slice(s, e + 1));
}

/* ------------------------------ ollama ------------------------------ */
// A local model answers one request at a time. Without a queue, background work (rating the calendar) makes
// a chat message wait behind it. So requests go through a priority queue: chat calls first, rating after.
const jobs = [];
let running = false;
let seq = 0;
function enqueue(priority, fn) {
  return new Promise((resolve, reject) => {
    jobs.push({ priority, seq: seq++, fn, resolve, reject });
    jobs.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
    pump();
  });
}
async function pump() {
  if (running) return;
  const job = jobs.shift();
  if (!job) return;
  running = true;
  try {
    job.resolve(await job.fn());
  } catch (e) {
    job.reject(e);
  }
  running = false;
  pump();
}

const ollamaChat = (task, user) => enqueue(task === "analyze" ? 1 : 0, () => ollamaRequest(task, user));

async function ollamaRequest(task, user) {
  if (!settings.model) await probeOllama();
  if (!settings.ollama.up) throw new Error(`Ollama is not reachable at ${OLLAMA_URL}`);
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(180000),
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      format: "json",
      keep_alive: "30m",
      // no num_ctx on purpose: asking for a different context size than the loaded model has forces Ollama to reload it, and it can stall
      options: { temperature: 0.2, num_predict: 700 },
      messages: [
        { role: "system", content: PROMPTS[task] },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  return parseJSON(data.message.content);
}

/* ------------------------------ anthropic ------------------------------ */
async function anthropicChat(task, user) {
  const key = env.VITE_ANTHROPIC_API_KEY;
  if (!key) throw new Error("the Claude API provider needs VITE_ANTHROPIC_API_KEY in .env.local");
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
      model: env.VITE_ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 2000,
      system: PROMPTS[task],
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const data = await res.json();
  return parseJSON((data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n"));
}

/** One model call, validated, retried once. Throws if the model never produces a usable answer. */
async function modelCall(task, input, provider) {
  const chat = provider === "ollama" ? ollamaChat : anthropicChat;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return check(task, await chat(task, userMessage(task, input)), input);
    } catch (e) {
      lastErr = e;
      if (/not reachable|needs VITE_|API 4\d\d|Ollama 404/.test(String(e.message))) break; // retrying won't help
    }
  }
  throw lastErr;
}

const TIME = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/gi;
const normTime = (t) => t.toLowerCase().replace(/\s/g, "").replace(/^0/, "");

/**
 * A small model will explain a slot using times it made up. If its reasoning cites a time that isn't anywhere in
 * that candidate's data (or the request), the reasoning is replaced with the code-written version.
 */
export function groundRank(out, input) {
  let swapped = 0;
  out.options.forEach((o) => {
    const c = input.candidates.find((x) => x.id === o.candidate_id);
    if (!c) return;
    const allowed = new Set(((JSON.stringify(c) + " " + input.request).match(TIME) || []).map(normTime));
    const cited = ((o.reasoning || "") + " " + (o.headline || "")).match(TIME) || [];
    if (cited.some((t) => !allowed.has(normTime(t)))) {
      o.reasoning = mockReasoning(c);
      swapped++;
    }
  });
  return swapped;
}

const ANALYZE_BATCH = 6;

async function callModel(task, input, provider) {
  const label = provider === "ollama" ? `Ollama ${settings.model}` : "Anthropic API";
  if (task === "rank") {
    const out = await modelCall(task, input, provider);
    const swapped = groundRank(out, input);
    // a small model often returns one option; fill up to three from the code-ranked candidates
    const want = Math.min(3, input.candidates.length);
    const had = out.options.length;
    if (had < want) {
      const extra = mockTask("rank", input).options.filter((o) => !out.options.some((x) => x.candidate_id === o.candidate_id));
      out.options.push(...extra.slice(0, want - had));
    }
    const notes = [];
    if (swapped) notes.push(`${swapped} reasoning line(s) cited times that weren't in the data, so code wrote them instead`);
    if (had < want) notes.push(`the model gave ${had} option(s); code added ${out.options.length - had} more from its own ranking`);
    return { out, file: label, fellBack: notes.length ? notes.join("; ") : null };
  }
  if (task !== "analyze") return { out: await modelCall(task, input, provider), file: label, fellBack: null };

  // analyze: the deterministic rating (type, reason) is the baseline. The model's job is the judgment part,
  // priority and flexibility, and only for events that involve other people (standups, flights and solo blocks
  // aren't worth the tokens). Small batches, because a 3B model can't hold 28 events.
  const out = mockTask("analyze", input);
  const judged = input.events.filter((e) => e.attendees.some((a) => a !== "You") && !/standup/i.test(e.title) && !(e.categories || []).includes("Flights"));
  let rated = 0;
  let error = null;
  for (let i = 0; i < judged.length; i += ANALYZE_BATCH) {
    const chunk = { ...input, events: judged.slice(i, i + ANALYZE_BATCH) };
    try {
      const got = await modelCall("analyze", chunk, provider);
      Object.entries(got).forEach(([id, r]) => {
        out[id] = { ...out[id], priority: r.priority, flexibility: r.flexibility };
        rated++;
      });
    } catch (e) {
      error = e;
    }
  }
  const missed = judged.length - rated;
  return {
    out,
    file: label,
    fellBack: missed ? `${missed} of ${judged.length} judged events kept the deterministic rating (${error ? error.message : "model skipped them"})` : null,
  };
}

/* ------------------------------ public ------------------------------ */
export async function callLLM(task, input) {
  const started = performance.now();
  const provider = settings.provider;
  const base = { id: Math.random().toString(36).slice(2, 8), at: new Date(), task, mode: provider, input };
  try {
    // Rating the calendar is rules plus taught facts by default. A 3B model on a CPU took over a minute per pass,
    // failed validation, and queued behind every chat message. A stronger model can opt in (VITE_LLM_ANALYZE=1).
    const ratesWithModel = provider === "anthropic" || env.VITE_LLM_ANALYZE === "1";
    if (provider === "mock" || (task === "analyze" && !ratesWithModel)) {
      const { out, file } = await callMock(task, input);
      record({ ...base, file, output: out, ms: Math.round(performance.now() - started) });
      return out;
    }
    try {
      const { out, file, fellBack } = await callModel(task, input, provider);
      record({ ...base, file, fellBack, output: out, ms: Math.round(performance.now() - started) });
      return out;
    } catch (e) {
      const { out, file } = await callMock(task, input);
      record({ ...base, file, fellBack: `model failed (${e.message}), answered by the mock instead`, output: out, ms: Math.round(performance.now() - started) });
      return out;
    }
  } catch (err) {
    record({ ...base, file: null, error: String(err.message || err), ms: Math.round(performance.now() - started) });
    throw err;
  }
}
