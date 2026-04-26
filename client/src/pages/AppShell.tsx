import { useEffect, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";

import { useAuth } from "../store/auth";
import { api, ApiError } from "../lib/api";
import { cn } from "../lib/cn";
import styles from "./AppShell.module.css";

const NAV = [
  { href: "/poi", label: "POI" },
  { href: "/patrol", label: "PATROL" },
  { href: "/sniper", label: "SNIPER" },
  { href: "/events", label: "EVENTS" },
] as const;

export default function AppShell() {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const [location] = useLocation();

  return (
    <div className={styles.shell}>
      <aside className={styles.rail}>
        <div>
          <span className={styles.brand}>ARGUS</span>
          <span className={styles.brandRev}>REV 0.1.0 · DAY 3</span>
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
          <span className={styles.operatorRole}>OPERATOR</span>
          <span className={styles.operatorEmail}>{user?.email ?? "—"}</span>
          <button type="button" onClick={() => void signOut()} className={styles.signOut}>
            sign out
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <Switch>
          <Route path="/poi">
            <Placeholder
              eyebrow="POI / REGISTRY"
              title="POI registry"
              body="Tag 5 wires up enrolment with quality + authenticity gates. Tag 3 only proves the auth chain works end-to-end."
            />
          </Route>
          <Route path="/patrol">
            <Placeholder
              eyebrow="PATROL / LIVE"
              title="Patrol mode"
              body="Tag 6 wires up webcam capture, ML detect/embed, pgvector kNN, and Realtime alert push. Tag 7 adds ByteTrack."
            />
          </Route>
          <Route path="/sniper">
            <Placeholder
              eyebrow="SNIPER / FUSION"
              title="Sniper mode"
              body="Tag 8–9 wires up the 4-layer fanout (Identity / Web Presence / Geographic / Authenticity) with Supabase Realtime layer-result streaming."
            />
          </Route>
          <Route path="/events">
            <Placeholder
              eyebrow="EVENTS / AUDIT TRAIL"
              title="Events"
              body="Tag 6 populates this view via the Patrol pipeline. Per-row confirm/dismiss actions are RLS-gated to operator_id = auth.uid() OR is_admin()."
            />
          </Route>
          <Route>
            <Placeholder
              eyebrow="404"
              title="Unknown route"
              body="The operator surface has /poi, /patrol, /sniper, /events. Tag 3 placeholder."
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
