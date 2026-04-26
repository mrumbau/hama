import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/app.css";
import TokenPreview from "./pages/TokenPreview";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Argus: #root not found");

// Tag 2 only renders the token-preview review page.
// Tag 3 wires up wouter routing and replaces this with the proper app shell.
createRoot(rootEl).render(
  <StrictMode>
    <TokenPreview />
  </StrictMode>,
);
