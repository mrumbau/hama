/**
 * Circuit Breaker — guards external API calls (SerpAPI, Picarta, Reality
 * Defender) so that a sustained failure on one provider doesn't keep
 * costing latency + cost-guard budget for every subsequent Sniper run.
 *
 * State machine
 *   closed     — normal operation. Calls go through. Failures increment
 *                a counter; on `failureThreshold` consecutive failures
 *                the breaker trips to `open`.
 *   open       — calls are rejected immediately with `circuit_open` for
 *                `openMs` after the trip moment. Saves the cost of
 *                hitting a known-broken upstream.
 *   half_open  — after `openMs` elapses, the next call is allowed
 *                through as a probe. Success → back to `closed`.
 *                Failure → reset the open timer, stay/go open.
 *
 * Pure in-memory state per breaker instance — no Redis. Argus runs as a
 * single Express process for the demo; horizontal scale would need a
 * Redis-backed variant but the contract (wrap a function, observe
 * tripped state) wouldn't change.
 *
 * Usage
 *   const cb = new CircuitBreaker("serpapi", { failureThreshold: 3, openMs: 60000 });
 *   const result = await cb.run(() => serpapiClient.searchByImage(url));
 *   if (!result.ok) {
 *     if (result.reason === "circuit_open") { ... layer 'failed' = "upstream cooling down" }
 *     else { ... layer 'failed' = result.error.message }
 *   }
 */

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  /** Consecutive failures that trip the breaker. */
  failureThreshold: number;
  /** How long the breaker stays open before allowing a half-open probe. */
  openMs: number;
  /** Override `Date.now()` for tests. Default uses the real clock. */
  now?: () => number;
}

export type CircuitRunResult<T> =
  | { ok: true; value: T; state: CircuitState }
  | { ok: false; reason: "circuit_open"; state: "open" | "half_open" }
  | { ok: false; reason: "failed"; error: Error; state: CircuitState };

export class CircuitBreaker {
  readonly name: string;
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly now: () => number;
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  /** Unix-ms timestamp when the breaker tripped open. 0 when closed. */
  private openedAt = 0;

  constructor(name: string, opts: CircuitBreakerOptions) {
    this.name = name;
    this.failureThreshold = opts.failureThreshold;
    this.openMs = opts.openMs;
    this.now = opts.now ?? Date.now;
  }

  /** Currently-observed state, after applying any pending open→half-open transition. */
  inspect(): { name: string; state: CircuitState; consecutiveFailures: number } {
    this.maybeTransitionToHalfOpen();
    return {
      name: this.name,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  /** Execute `fn` through the breaker. Never throws — returns a typed result. */
  async run<T>(fn: () => Promise<T>): Promise<CircuitRunResult<T>> {
    this.maybeTransitionToHalfOpen();

    if (this.state === "open") {
      return { ok: false, reason: "circuit_open", state: "open" };
    }

    const stateAtCall: "closed" | "half_open" = this.state;

    try {
      const value = await fn();
      this.onSuccess();
      return { ok: true, value, state: this.state };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.onFailure(stateAtCall);
      return { ok: false, reason: "failed", error, state: this.state };
    }
  }

  /** Manual reset — used by tests and admin endpoints. */
  reset(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.openedAt = 0;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private maybeTransitionToHalfOpen(): void {
    if (this.state === "open" && this.now() - this.openedAt >= this.openMs) {
      this.state = "half_open";
    }
  }

  private onSuccess(): void {
    // A success in any state closes the breaker. half_open → closed completes
    // the probe; closed stays closed and resets the failure counter.
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.openedAt = 0;
  }

  private onFailure(stateAtCall: "closed" | "half_open"): void {
    if (stateAtCall === "half_open") {
      // The probe failed — bounce straight back to open and restart timer.
      this.state = "open";
      this.openedAt = this.now();
      // Don't change consecutiveFailures here — it's already past threshold.
      return;
    }

    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = this.now();
    }
  }
}

// ── Module-level registry — one breaker per (named) external service ──────
//
// The orchestrator looks these up by name when constructing a layer call.
// Lazily initialised; tests can clear the registry between runs.

const registry = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, opts: CircuitBreakerOptions): CircuitBreaker {
  let cb = registry.get(name);
  if (!cb) {
    cb = new CircuitBreaker(name, opts);
    registry.set(name, cb);
  }
  return cb;
}

export function __test_only__resetRegistry(): void {
  registry.clear();
}
