/**
 * Recovery-hint mapper for ApiError surfaces — Tag 12 §4.3.
 *
 * Every operator-facing error block calls `describeError(err)` to get
 * `{ title, hint, action }`. The action is a structured "click target"
 * the page can render as a link or button — this lets the page surface
 * `{ kind: "sign-in" }` as an actual link without each error block
 * re-implementing the "session expired → /login" branch.
 *
 * Inputs are loose because the error sources differ:
 *   * `ApiError` from lib/api (Express orchestrator)
 *   * Supabase `PostgrestError` (RLS + select queries)
 *   * native `Error` / `TypeError` (network failures, fetch aborts)
 *   * raw string (legacy code paths)
 */

import { ApiError } from "./api";

export type ErrorAction =
  | { kind: "sign-in"; label: string; href: string }
  | { kind: "retry"; label: string }
  | { kind: "external"; label: string; href: string }
  | null;

export interface DescribedError {
  /** Short headline for the error block. */
  title: string;
  /** One-sentence operator-facing hint on how to recover. */
  hint: string;
  /** Optional structured CTA the caller renders. */
  action: ErrorAction;
  /** Raw status / message for the audit trail. */
  raw: string;
}

const SIGN_IN_HINT = "Your session has expired or the token is invalid.";
const NETWORK_HINT = "The server is unreachable right now — check your connection and retry.";

export function describeError(err: unknown): DescribedError {
  if (err instanceof ApiError) {
    return describeApiError(err);
  }
  if (err instanceof TypeError && /fetch failed|networkerror/i.test(err.message)) {
    return {
      title: "Network unreachable",
      hint: NETWORK_HINT,
      action: { kind: "retry", label: "retry" },
      raw: err.message,
    };
  }
  if (err instanceof Error) {
    return {
      title: "Unexpected error",
      hint: err.message,
      action: { kind: "retry", label: "retry" },
      raw: err.message,
    };
  }
  return {
    title: "Unexpected error",
    hint: String(err),
    action: null,
    raw: String(err),
  };
}

function describeApiError(err: ApiError): DescribedError {
  const raw = `${err.status} ${err.message}`;
  // Auth — re-sign-in needed.
  if (err.status === 401 || err.message === "invalid_token" || err.message === "missing_token") {
    return {
      title: "Sign in again",
      hint: SIGN_IN_HINT,
      action: { kind: "sign-in", label: "sign in", href: "/login" },
      raw,
    };
  }
  // Forbidden — operator lacks permission, no recovery.
  if (err.status === 403) {
    return {
      title: "Forbidden",
      hint: "Your account doesn't have access to this.",
      action: null,
      raw,
    };
  }
  // Not-found — likely a stale link.
  if (err.status === 404) {
    return {
      title: "Not found",
      hint: "This resource may have been deleted, or the link is stale.",
      action: null,
      raw,
    };
  }
  // Payload-too-large — surface the limit so the operator can shrink the upload.
  if (err.status === 413 || err.message.includes("image_too_large")) {
    return {
      title: "Image too large",
      hint: "Maximum upload size is 10 MB. Resize the image and retry.",
      action: { kind: "retry", label: "retry" },
      raw,
    };
  }
  // Mime-type rejection.
  if (err.status === 415 || err.message.includes("unsupported_mime_type")) {
    return {
      title: "Unsupported file type",
      hint: "Use a JPEG, PNG, or WebP file.",
      action: { kind: "retry", label: "retry" },
      raw,
    };
  }
  // Rate-limit / cost-guard.
  if (err.status === 429 || err.message.includes("cost_guard_exceeded")) {
    return {
      title: "Daily budget exceeded",
      hint: "You've used up today's daily budget. It resets at midnight (UTC).",
      action: null,
      raw,
    };
  }
  // ML / orchestrator failures — usually transient.
  if (err.status === 502 || err.status === 504 || err.message.includes("ml_unreachable")) {
    return {
      title: "Face service offline",
      hint: "The face-recognition service is offline or busy. Try again in a few seconds.",
      action: { kind: "retry", label: "retry" },
      raw,
    };
  }
  // Quality-gate rejections (handled by per-page reason code map; this path is the bare 422).
  if (err.status === 422) {
    return {
      title: "Request rejected",
      hint: err.message,
      action: { kind: "retry", label: "retry" },
      raw,
    };
  }
  // 5xx fallthrough.
  if (err.status >= 500) {
    return {
      title: "Server error",
      hint: err.message,
      action: { kind: "retry", label: "retry" },
      raw,
    };
  }
  // Generic 4xx.
  return {
    title: `Request failed (${err.status})`,
    hint: err.message,
    action: null,
    raw,
  };
}
