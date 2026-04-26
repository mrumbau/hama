import { useState, type CSSProperties } from "react";
import styles from "./TokenPreview.module.css";

/**
 * TokenPreview — Tag 2 visual review gate.
 *
 * Shows every token from tokens.css in actual rendered form so the user can
 * accept/redirect the design foundation before any component lands. Tag 3
 * deletes this file once the user signs off.
 *
 * Anti-pattern guard: dynamic style values come through CSS Custom Properties
 * passed via inline `style`, never raw colors or pixel values. The colors and
 * sizes themselves still resolve from token vars.
 */

type Theme = "dark" | "light";

const SURFACE_TOKENS = [
  "--surface-0",
  "--surface-100",
  "--surface-200",
  "--surface-300",
  "--surface-400",
  "--surface-500",
  "--surface-600",
  "--surface-700",
  "--surface-800",
  "--surface-900",
];

const PAPER_TOKENS = [
  "--paper-0",
  "--paper-50",
  "--paper-100",
  "--paper-200",
  "--paper-300",
  "--paper-400",
  "--paper-500",
];

const MONO_TOKENS = [
  "--mono-50",
  "--mono-100",
  "--mono-200",
  "--mono-300",
  "--mono-400",
  "--mono-500",
  "--mono-600",
  "--mono-700",
  "--mono-800",
  "--mono-900",
];

const SIGNAL_RED_TOKENS = [
  "--signal-red-50",
  "--signal-red-100",
  "--signal-red-200",
  "--signal-red-300",
  "--signal-red-400",
  "--signal-red-500",
  "--signal-red-600",
  "--signal-red-700",
  "--signal-red-800",
  "--signal-red-900",
];

const SIGNAL_AMBER_TOKENS = [
  "--signal-amber-50",
  "--signal-amber-100",
  "--signal-amber-200",
  "--signal-amber-300",
  "--signal-amber-400",
  "--signal-amber-500",
  "--signal-amber-600",
  "--signal-amber-700",
  "--signal-amber-800",
  "--signal-amber-900",
];

const SIGNAL_CYAN_TOKENS = [
  "--signal-cyan-50",
  "--signal-cyan-100",
  "--signal-cyan-200",
  "--signal-cyan-300",
  "--signal-cyan-400",
  "--signal-cyan-500",
  "--signal-cyan-600",
  "--signal-cyan-700",
  "--signal-cyan-800",
  "--signal-cyan-900",
];

const SPACES = [
  { token: "--space-1", value: "0.25rem  ·   4px" },
  { token: "--space-2", value: "0.5rem   ·   8px" },
  { token: "--space-3", value: "0.75rem  ·  12px" },
  { token: "--space-4", value: "1rem     ·  16px" },
  { token: "--space-5", value: "1.5rem   ·  24px" },
  { token: "--space-6", value: "2rem     ·  32px" },
  { token: "--space-7", value: "3rem     ·  48px" },
  { token: "--space-8", value: "4rem     ·  64px" },
  { token: "--space-9", value: "6rem     ·  96px" },
  { token: "--space-10", value: "8rem    · 128px" },
  { token: "--space-11", value: "12rem   · 192px" },
  { token: "--space-12", value: "16rem   · 256px" },
];

const TYPE_SAMPLES = [
  { token: "--text-xs", note: "0.694rem · captions, footnote-style metadata" },
  { token: "--text-sm", note: "0.833rem · secondary text, labels" },
  { token: "--text-base", note: "1rem · body" },
  { token: "--text-lg", note: "1.2rem · emphasised body" },
  { token: "--text-xl", note: "1.44rem · section headers" },
  { token: "--text-2xl", note: "1.728rem · page titles" },
  { token: "--text-3xl", note: "2.074rem · landing hero (pre-clamp)" },
];

const MOTIONS = [
  { token: "--motion-fast", duration: "50ms", use: "press feedback, focus state" },
  { token: "--motion-normal", duration: "100ms", use: "hover, color shift" },
  { token: "--motion-slow", duration: "150ms", use: "dropdown, tooltip, popover" },
  { token: "--motion-deliberate", duration: "300ms", use: "modal, drawer (rare)" },
];

const STATUS_TOKENS = [
  { token: "--color-status-pending", label: "pending" },
  { token: "--color-status-running", label: "running" },
  { token: "--color-status-done", label: "done" },
  { token: "--color-status-warn", label: "warn" },
  { token: "--color-status-fail", label: "fail" },
  { token: "--color-status-tail", label: "live tail" },
];

const RADII = [
  { token: "--radius-0", note: "operator brutalist" },
  { token: "--radius-1", note: "code chips, kbd" },
  { token: "--radius-2", note: "minimalist buttons" },
];

function pickFg(token: string): string {
  // Light values get dark foreground, vice versa. Heuristic on token name.
  const light =
    token.endsWith("-50") ||
    token.endsWith("-100") ||
    token.endsWith("-200") ||
    token === "--paper-0" ||
    token === "--paper-50";
  return light ? "var(--mono-900)" : "var(--mono-50)";
}

function Swatch({ token }: { token: string }) {
  const style = {
    "--swatch-bg": `var(${token})`,
    "--swatch-fg": pickFg(token),
  } as CSSProperties;
  return (
    <div className={styles.swatch} style={style}>
      <span className={styles.swatchToken}>{token}</span>
      <span className={styles.swatchValue}>{token}</span>
    </div>
  );
}

function SwatchGrid({ tokens }: { tokens: string[] }) {
  return (
    <div className={styles.swatchGrid}>
      {tokens.map((t) => (
        <Swatch key={t} token={t} />
      ))}
    </div>
  );
}

function Section({
  num,
  title,
  children,
}: {
  num: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      <span className={styles.sectionLabel}>§ {num}</span>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

export default function TokenPreview() {
  const [theme, setTheme] = useState<Theme>("dark");

  // Set on <html> so tokens.css [data-theme=…] selectors apply.
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.themeRow}>
          <div>
            <h1 className={styles.brand}>Argus / tokens</h1>
            <span className={styles.brandMeta}>tag 2 review · phase 1 · emil-design-eng</span>
          </div>
          <div className={styles.themeToggle} role="tablist" aria-label="Theme">
            <button
              type="button"
              role="tab"
              aria-selected={theme === "dark"}
              onClick={() => setTheme("dark")}
              className={[
                styles.themeToggleBtn,
                theme === "dark" ? styles.themeToggleBtnActive : "",
              ].join(" ")}
            >
              dark · operator
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={theme === "light"}
              onClick={() => setTheme("light")}
              className={[
                styles.themeToggleBtn,
                theme === "light" ? styles.themeToggleBtnActive : "",
              ].join(" ")}
            >
              light · public
            </button>
          </div>
        </header>

        <Section num="1" title="Surface scale · charcoal/asphalt · operator dark substrate">
          <SwatchGrid tokens={SURFACE_TOKENS} />
        </Section>

        <Section num="2" title="Paper scale · warm off-white · public light substrate">
          <SwatchGrid tokens={PAPER_TOKENS} />
        </Section>

        <Section num="3" title="Mono scale · text grays · usable in both modes">
          <SwatchGrid tokens={MONO_TOKENS} />
        </Section>

        <Section num="4" title="Signal · hazard red · alerts, banned, destructive">
          <SwatchGrid tokens={SIGNAL_RED_TOKENS} />
        </Section>

        <Section num="5" title="Signal · amber · warnings, quota-near, in-progress">
          <SwatchGrid tokens={SIGNAL_AMBER_TOKENS} />
        </Section>

        <Section num="6" title="Signal · cyan · status ok, latency tickers, telemetry info">
          <SwatchGrid tokens={SIGNAL_CYAN_TOKENS} />
        </Section>

        <Section num="7" title="Status semantic mapping (theme-bound)">
          <div className={styles.statusRow}>
            {STATUS_TOKENS.map((s) => (
              <div
                key={s.token}
                className={styles.statusCell}
                style={{ "--status-color": `var(${s.token})` } as CSSProperties}
              >
                <span className={styles.statusSquare} aria-hidden="true" />
                <span className={styles.statusName}>{s.label}</span>
                <span className={styles.statusValue}>{s.token}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section num="8" title="Spacing · 8pt grid in rem">
          {SPACES.map((s) => (
            <div key={s.token} className={styles.spaceRow}>
              <span className={styles.spaceLabel}>{s.token}</span>
              <span className={styles.spaceValue}>{s.value}</span>
              <span
                className={styles.spaceBar}
                style={{ "--space-bar-width": `var(${s.token})` } as CSSProperties}
                aria-hidden="true"
              />
            </div>
          ))}
        </Section>

        <Section num="9" title="Type · 1.20 minor-third scale · sans body / mono data">
          {TYPE_SAMPLES.map((t) => (
            <div key={t.token} className={styles.typeRow}>
              <span className={styles.typeLabel}>{t.token}</span>
              <div>
                <p
                  className={styles.typeSample}
                  style={{ fontSize: `var(${t.token})` } as CSSProperties}
                >
                  Argus operator surface — fusion report 4f1a-…
                </p>
                <p
                  className={styles.typeSampleMono}
                  style={{ fontSize: `var(${t.token})` } as CSSProperties}
                >
                  POI-0001 score=0.91 t+184ms layer=identity
                </p>
                <span className={styles.typeLabel}>{t.note}</span>
              </div>
            </div>
          ))}
          <div className={styles.typeRow}>
            <span className={styles.typeLabel}>display · clamp</span>
            <p
              className={styles.typeSampleDisplay}
              style={{ fontSize: "clamp(2.5rem, 6vw, 5rem)" } as CSSProperties}
            >
              SNIPER / FUSION
            </p>
          </div>
          <div className={styles.typeRow}>
            <span className={styles.typeLabel}>serif · landing hero</span>
            <p
              className={styles.typeSampleSerif}
              style={{ fontSize: "clamp(2rem, 4vw, 3.5rem)" } as CSSProperties}
            >
              An OSINT fusion engine for face recognition.
            </p>
          </div>
        </Section>

        <Section num="10" title="Motion · 4 durations · UI default ease-out">
          <div className={styles.motionGrid}>
            {MOTIONS.map((m) => (
              <div key={m.token} className={styles.motionCard}>
                <span className={styles.motionLabel}>{m.token}</span>
                <button
                  type="button"
                  className={styles.motionButton}
                  style={{ "--duration": `var(${m.token})` } as CSSProperties}
                >
                  press · {m.duration}
                </button>
                <span className={styles.motionLabel}>{m.use}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section num="11" title="Radius · three steps · 0/2/4px">
          <div className={styles.radiusRow}>
            {RADII.map((r) => (
              <div key={r.token} className={styles.radiusCell}>
                <span
                  className={styles.radiusBox}
                  style={{ borderRadius: `var(${r.token})` } as CSSProperties}
                  aria-hidden="true"
                />
                <span>{r.token}</span>
                <span>{r.note}</span>
              </div>
            ))}
          </div>
        </Section>

        <p className={styles.fineprint}>
          token-preview · review gate · tag 2 · accept or redirect before tag 3 schema work
        </p>
      </div>
    </div>
  );
}
