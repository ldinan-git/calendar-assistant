// Writes documentation/10-demo-script.md from src/data/demoScript.js, so the page and the doc never disagree.
//   npm run gen:demo
import { createServer } from "vite";
import { writeFileSync } from "node:fs";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { DEMO, SETUP } = await server.ssrLoadModule("/src/data/demoScript.js");
  const out = [
    "# Demo script: from the new app to the finished product",
    "",
    "Generated from `src/data/demoScript.js` by `npm run gen:demo`. The same script is on the page `/demo.html` with copy buttons. Edit the data file, not this one.",
    "",
    "Follow the steps in order; later steps depend on earlier ones. A code block is a prompt to paste into the assistant. Everything else is a click or a point to make. Open the new app at `/fresh.html` and keep the finished app at `/` next to it.",
    "",
    "## Before you start",
    "",
    ...SETUP.map((s) => `- ${s}`),
    "",
  ];
  for (const part of DEMO) {
    out.push(`## ${part.title}`, "", `_${part.pitch}_`, "");
    part.steps.forEach((s, i) => {
      out.push(`### ${i + 1}. ${s.title}`, "");
      if (s.do) out.push(s.do, "");
      if (s.prompt) out.push("```text", s.prompt, "```", "");
      if (s.expect) out.push(`**You should see:** ${s.expect}`, "");
      if (s.say) out.push(`> Say: ${s.say}`, "");
    });
  }
  writeFileSync(new URL("../documentation/10-demo-script.md", import.meta.url), out.join("\n"));
  console.log("wrote documentation/10-demo-script.md");
} finally {
  await server.close();
}
