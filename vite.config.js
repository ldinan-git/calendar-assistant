import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Four standalone pages, no tabs:
//   /              the finished product
//   /fresh.html    the same app, blank, for showing setup
//   /demo.html     the demo script with copy buttons
//   /summary.html  the walkthrough and the docs
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        fresh: resolve(__dirname, "fresh.html"),
        demo: resolve(__dirname, "demo.html"),
        summary: resolve(__dirname, "summary.html"),
      },
    },
  },
});
