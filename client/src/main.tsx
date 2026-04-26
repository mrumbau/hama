import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Redirect, Route, Switch, useLocation } from "wouter";

import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/app.css";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import AppShell from "./pages/AppShell";
import { useAuth } from "./store/auth";

const PUBLIC_ROUTES = new Set(["/", "/login"]);

function ThemeBinder() {
  const [location] = useLocation();
  useEffect(() => {
    document.documentElement.dataset.theme = PUBLIC_ROUTES.has(location) ? "light" : "dark";
  }, [location]);
  return null;
}

function App() {
  const status = useAuth((s) => s.status);
  const init = useAuth((s) => s.init);
  const [location] = useLocation();

  useEffect(() => {
    void init();
  }, [init]);

  if (status === "loading") {
    return null; // hold the splash; reset.css already paints the substrate
  }

  // Auth gate: anything outside PUBLIC_ROUTES requires authentication.
  if (status === "anonymous" && !PUBLIC_ROUTES.has(location)) {
    return <Redirect to="/login" />;
  }

  // Once authenticated, /login redirects into the operator surface.
  if (status === "authenticated" && location === "/login") {
    return <Redirect to="/poi" />;
  }

  return (
    <>
      <ThemeBinder />
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={Login} />
        <Route component={AppShell} />
      </Switch>
    </>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Argus: #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
