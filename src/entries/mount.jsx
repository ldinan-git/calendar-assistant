import React from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";

export function mount(node) {
  createRoot(document.getElementById("root")).render(<React.StrictMode>{node}</React.StrictMode>);
}
