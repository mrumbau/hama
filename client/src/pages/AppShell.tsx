import { useEffect, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";

import { useAuth } from "../store/auth";
import { api, ApiError } from "../lib/api";
import { cn } from "../lib/cn";
import PoiList from "./PoiList";
import PoiNew from "./PoiNew";
import PoiDetail from "./PoiDetail";
import Patrol from "./Patrol";
import Events from "./Events";
import Sniper from "./Sniper";
import SniperDetail from "./SniperDetail";
import styles from "./AppShell.module.css";

const NAV = [
  { href: "/poi", label: "PEOPLE" },
  { href: "/patrol", label: "CAMERA" },
  { href: "/sniper", label: "SEARCH" },
  { href: "/events", label: "MATCHES" },
] as const;

export default function AppShell() {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const [location] = useLocation();

  return (
    <div className={styles.shell}>
      <aside className={styles.rail}>
        <div>
          <span className={styles.brand}>PROJECT CHAW</span>
          <span className={styles.brandRev}>v0.1.0</span>
        </div>

        <nav className={styles.nav}>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(styles.navLink, location.startsWith(n.href) && styles.navLinkActive)}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className={styles.spacer} />

        <div className={styles.operatorBlock}>
          <span className={styles.operatorRole}>SIGNED IN</span>
          <span className={styles.operatorEmail}>{user?.email ?? "—"}</span>
          <button type="button" onClick={() => void signOut()} className={styles.signOut}>
            sign out
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <Switch>
          {/* Order matters: more specific routes must come before /:id wildcards. */}
          <Route path="/poi/new" component={PoiNew} />
          <Route path="/poi/:id" component={PoiDetail} />
          <Route path="/poi" component={PoiList} />
          <Route path="/patrol" component={Patrol} />
          <Route path="/sniper/:id" component={SniperDetail} />
          <Route path="/sniper" component={Sniper} />
          <Route path="/events" component={Events} />
          <Route>
            <Placeholder
              eyebrow="404"
              title="Page not found"
              body="The app has four sections: People, Camera, Search, and Matches. Pick one from the side."
            />
          </Route>
        </Switch>
      </main>
    </div>
  );
}

function Placeholder({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className={styles.placeholder}>
      <span className={styles.placeholderEyebrow}>{eyebrow}</span>
      <h1 className={styles.placeholderTitle}>{title}</h1>
      <p className={styles.placeholderBody}>{body}</p>
      <ServerProbe />
    </div>
  );
}

function ServerProbe() {
  const [me, setMe] = useState<{ sub: string; email?: string; role: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ sub: string; email?: string; role: string }>("/me")
      .then((data) => !cancelled && setMe(data))
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? `${err.status} ${err.message}` : String(err);
        setError(message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.serverProbe}>
      <span className={styles.serverProbeLabel}>GET /api/me</span>
      {error ? (
        <span className={cn(styles.serverProbeValue, styles.serverProbeError)}>{error}</span>
      ) : me ? (
        <>
          <span className={styles.serverProbeValue}>sub: {me.sub}</span>
          <span className={styles.serverProbeValue}>email: {me.email ?? "—"}</span>
          <span className={styles.serverProbeValue}>role: {me.role}</span>
        </>
      ) : (
        <span className={styles.serverProbeValue}>…</span>
      )}
    </div>
  );
}
