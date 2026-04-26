import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";

import { useAuth } from "../store/auth";
import styles from "./Login.module.css";

export default function Login() {
  const signIn = useAuth((s) => s.signIn);
  const [, setLocation] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      setLocation("/poi");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed. Try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <span className={styles.brand}>project chaw · sign in</span>
        <h1 className={styles.title}>Sign in.</h1>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              email
            </label>
            <input
              id="email"
              className={styles.input}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              password
            </label>
            <input
              id="password"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          {error && <p className={styles.formError}>{error}</p>}

          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? "signing in…" : "sign in"}
          </button>
        </form>

        <Link href="/" className={styles.backLink}>
          ← project chaw
        </Link>
      </main>
    </div>
  );
}
