import { Link } from "wouter";
import styles from "./Landing.module.css";

const LAYERS = [
  {
    n: "01",
    name: "Match",
    desc: "Compare the face against people you've added to your library.",
  },
  {
    n: "02",
    name: "Web",
    desc: "Reverse image search across the public web. Returns visual matches with thumbnails.",
  },
  {
    n: "03",
    name: "Place",
    desc: "Predict where the photo was taken — country, region, coordinates.",
  },
  {
    n: "04",
    name: "Real?",
    desc: "Authentic, deepfake, or unsure. Flags manipulated images.",
  },
] as const;

export default function Landing() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.topbar}>
          <span className={styles.brand}>
            project chaw<span className={styles.brandRev}>/ v0.1.0</span>
          </span>
          <Link href="/login" className={styles.signInLink}>
            sign in
          </Link>
        </header>

        <section className={styles.hero}>
          <span className={styles.heroEyebrow}>FACE SEARCH · UNIVERSITY PROJECT</span>
          <h1 className={styles.heroHeadline}>
            One face photo in. Four answers out.
          </h1>
          <p className={styles.heroLead}>
            Project Chaw takes a single face photo and runs four checks in parallel: who they are
            in your own library, where else the face appears on the web, where the photo was
            taken, and whether the image is real. Results stream into one screen, with timings
            visible.
          </p>
          <Link href="/login" className={styles.heroPrimary}>
            Sign in →
          </Link>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionEyebrow}>§ HOW IT WORKS</span>
          <h2 className={styles.sectionHeadline}>
            Recognition is easy. The interesting part is putting four sources side by side.
          </h2>
          <div className={styles.sectionBody}>
            <p>
              Each of the four checks runs independently. Any one of them can fail — the others
              still finish. Each one runs through a circuit breaker that cools down failing
              upstreams, and each one respects a daily cost budget per user.
            </p>
            <p>
              The result page streams the four columns as they finish. No loading spinners — just
              live latency tickers and a status dot per column.
            </p>
          </div>

          <div className={styles.layerGrid}>
            {LAYERS.map((l) => (
              <article key={l.n} className={styles.layerCell}>
                <div className={styles.layerName}>STEP {l.n}</div>
                <h3 className={styles.layerTitle}>{l.name}</h3>
                <p className={styles.layerDesc}>{l.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionEyebrow}>§ DESIGN NOTE</span>
          <p className={styles.thesis}>
            Two surfaces, one app. A clean editorial landing for visitors; a dense tactical
            dashboard once you sign in. Same code, two design vocabularies — the seam is /login.
          </p>
        </section>

        <footer className={styles.footer}>project chaw / v0.1.0 · 2026</footer>
      </div>
    </div>
  );
}
