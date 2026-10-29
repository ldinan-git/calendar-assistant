// Canned answers for the `extract` (teaching) task, picked by regex in responses/manifest.json.
// Used by the mock provider, as the fallback when a live model fails, and to pre-fill the finished demo.

import manifest from "../../responses/manifest.json";

const fixtures = import.meta.glob("../../responses/**/*.json", { eager: true, import: "default" });

export function fixtureExtract(text) {
  const rule = manifest.extract.rules.find((r) => new RegExp(r.match, "i").test(text));
  const file = rule ? rule.file : manifest.extract.fallback;
  const data = fixtures[`../../responses/${file}`];
  if (!data) throw new Error(`manifest points at ${file} but it is not in /responses`);
  const out = structuredClone(data);
  if (file === manifest.extract.fallback) out.facts[0].source_text = text;
  return { out, file: `responses/${file}` };
}
