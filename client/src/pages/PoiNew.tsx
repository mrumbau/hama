import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";

import { ApiError } from "../lib/api";
import { poiApi, type PoiCategory } from "../lib/poi";
import styles from "./PoiNew.module.css";

const CATEGORIES: PoiCategory[] = ["vip", "guest", "staff", "banned", "missing"];

export default function PoiNew() {
  const [, setLocation] = useLocation();
  const [fullName, setFullName] = useState("");
  const [category, setCategory] = useState<PoiCategory>("guest");
  const [notes, setNotes] = useState("");
  const [threshold, setThreshold] = useState(0.55);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError("full name required");
      return;
    }
    setSubmitting(true);
    try {
      const created = await poiApi.create({
        full_name: fullName.trim(),
        category,
        notes: notes.trim() || undefined,
        threshold,
      });
      setLocation(`/poi/${created.poi.id}`);
    } catch (err) {
      const msg = err instanceof ApiError ? `${err.status} ${err.message}` : String(err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>PEOPLE · ADD</span>
        <h1 className={styles.title}>Add a person</h1>
      </header>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="full_name">
            name
          </label>
          <input
            id="full_name"
            className={styles.input}
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={submitting}
            required
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="category">
            category
          </label>
          <select
            id="category"
            className={styles.select}
            value={category}
            onChange={(e) => setCategory(e.target.value as PoiCategory)}
            disabled={submitting}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="threshold">
            match strictness (≥ {threshold.toFixed(2)})
          </label>
          <div className={styles.thresholdRow}>
            <input
              id="threshold"
              type="range"
              min={0.3}
              max={0.9}
              step={0.01}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              disabled={submitting}
            />
            <span className={styles.thresholdValue}>{threshold.toFixed(2)}</span>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="notes">
            notes (optional)
          </label>
          <textarea
            id="notes"
            className={styles.textarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? "saving…" : "save"}
          </button>
          <Link href="/poi" className={styles.cancel}>
            cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
