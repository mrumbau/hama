/**
 * ErrorBlock — surfaces an `ApiError` (or any thrown value) with a
 * structured recovery hint. Tag 12 §4.3.
 *
 * Usage:
 *   <ErrorBlock error={err} onRetry={() => refresh()} />
 *
 * The component reads `describeError(err)` from lib/errorHints and
 * renders the title + operator-facing hint + a CTA appropriate to the
 * error type (sign-in link for 401, retry button for transient
 * failures, etc.).
 */

import { Link } from "wouter";

import { describeError } from "../lib/errorHints";
import styles from "./ErrorBlock.module.css";

export interface ErrorBlockProps {
  error: unknown;
  /** Optional retry handler — required if the error is retry-able. */
  onRetry?: () => void;
  /** Hide the raw status string at the bottom. Default: shown. */
  hideRaw?: boolean;
}

export function ErrorBlock({ error, onRetry, hideRaw = false }: ErrorBlockProps) {
  const described = describeError(error);
  const action = described.action;

  return (
    <div className={styles.block} role="alert">
      <span className={styles.title}>{described.title}</span>
      <span className={styles.hint}>{described.hint}</span>
      {action && (
        <div className={styles.actions}>
          {action.kind === "sign-in" && (
            <Link href={action.href} className={styles.actionLink}>
              {action.label}
            </Link>
          )}
          {action.kind === "external" && (
            <a href={action.href} target="_blank" rel="noreferrer" className={styles.actionLink}>
              {action.label}
            </a>
          )}
          {action.kind === "retry" && onRetry && (
            <button type="button" className={styles.actionButton} onClick={onRetry}>
              {action.label}
            </button>
          )}
        </div>
      )}
      {!hideRaw && <span className={styles.raw}>{described.raw}</span>}
    </div>
  );
}
