import { Link } from "wouter";
import styles from "./Landing.module.css";

const LAYERS = [
  {
    n: "01",
    name: "Identity",
    desc: "ArcFace 512-D embedding, kNN against the operator's own POI database via pgvector HNSW.",
  },
  {
    n: "02",
    name: "Web Presence",
    desc: "SerpAPI Google Lens + reverse-image + Bing reverse, deduplicated and re-ranked against the query face.",
  },
  {
    n: "03",
    name: "Geographic",
    desc: "Picarta photo-geolocation on the input image — answers where the photo was taken.",
  },
  {
    n: "04",
    name: "Authenticity",
    desc: "Reality Defender deepfake/replay detection on top-N matches.",
  },
] as const;

export default function Landing() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.topbar}>
          <span className={styles.brand}>
            argus<span className={styles.brandRev}>/ 0.1.0</span>
          </span>
          <Link href="/login" className={styles.signInLink}>
            sign in
          </Link>
        </header>

        <section className={styles.hero}>
          <span className={styles.heroEyebrow}>OSINT FUSION ENGINE · UNIVERSITY PROJECT</span>
          <h1 className={styles.heroHeadline}>
            One face photo in. Four independent identity layers out.
          </h1>
          <p className={styles.heroLead}>
            Argus correlates a single image across pgvector kNN against an operator-curated
            database, public-web reverse-image search, photo geolocation, and deepfake detection —
            and presents the consolidated report in a single dashboard with per-layer latency
            visible at all times.
          </p>
          <Link href="/login" className={styles.heroPrimary}>
            Sign in →
          </Link>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionEyebrow}>§ ARCHITECTURE</span>
          <h2 className={styles.sectionHeadline}>
            Recognition is commodity. The value is in the correlation.
          </h2>
          <div className={styles.sectionBody}>
            <p>
              A pgvector + ArcFace recognizer is two hundred lines of code. The engineering interest
              of this project is the layer parallelisation, the latency choreography, the
              partial-failure handling, and the unified operator UX over heterogeneous sources.
            </p>
            <p>
              Each of the four layers can fail without aborting the report. Each runs against a
              circuit breaker. Each respects a per-operator daily cost budget. The Sniper Mode
              dashboard streams results layer-by-layer over Supabase Realtime — no spinners, only
              latency tickers in milliseconds.
            </p>
          </div>

          <div className={styles.layerGrid}>
            {LAYERS.map((l) => (
              <article key={l.n} className={styles.layerCell}>
                <div className={styles.layerName}>LAYER {l.n}</div>
                <h3 className={styles.layerTitle}>{l.name}</h3>
                <p className={styles.layerDesc}>{l.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionEyebrow}>§ DEFENCE THESIS</span>
          <p className={styles.thesis}>
            Form follows the trust relationship. Minimalism for the public examiner; brutalism for
            the trusted operator. The seam between them is /login — a custom form against
            supabase.auth, not the Supabase Auth UI.
          </p>
        </section>

        <footer className={styles.footer}>argus / 0.1.0 · uni project · 2026</footer>
      </div>
    </div>
  );
}
