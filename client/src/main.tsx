import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/app.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Argus: #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <main>
      <h1>Argus</h1>
      <p>Day 1 scaffolding. Phase 1+2 (tokens + brutalist/minimalist specs) lands tomorrow.</p>
    </main>
  </StrictMode>,
);
