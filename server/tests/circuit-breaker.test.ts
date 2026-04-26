/**
 * CircuitBreaker pure-logic tests.
 *
 * No external dependencies — uses an injected `now()` to fast-forward
 * time without sleeps. Verifies the closed → open → half-open → closed
 * cycle plus the half-open-failure-bounces-back-to-open edge.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  CircuitBreaker,
  __test_only__resetRegistry,
  getCircuitBreaker,
} from "../src/lib/circuit-breaker.js";

afterEach(() => {
  __test_only__resetRegistry();
});

const ok = async () => "value";
const boom = async () => {
  throw new Error("upstream_500");
};

describe("CircuitBreaker", () => {
  it("starts closed and lets calls through", async () => {
    const cb = new CircuitBreaker("svc", { failureThreshold: 3, openMs: 1000 });
    const r = await cb.run(ok);
    expect(r).toMatchObject({ ok: true, value: "value", state: "closed" });
  });

  it("trips open after `failureThreshold` consecutive failures", async () => {
    const cb = new CircuitBreaker("svc", { failureThreshold: 3, openMs: 1000 });
    expect((await cb.run(boom)).ok).toBe(false);
    expect((await cb.run(boom)).ok).toBe(false);
    expect(cb.inspect().state).toBe("closed"); // 2 of 3 — still closed
    expect((await cb.run(boom)).ok).toBe(false);
    expect(cb.inspect().state).toBe("open");
  });

  it("rejects with circuit_open while open, without invoking fn", async () => {
    let now = 1_000;
    const cb = new CircuitBreaker("svc", {
      failureThreshold: 1,
      openMs: 60_000,
      now: () => now,
    });
    await cb.run(boom); // trips
    let invoked = 0;
    const r = await cb.run(async () => {
      invoked += 1;
      return "should not run";
    });
    expect(invoked).toBe(0);
    expect(r).toMatchObject({ ok: false, reason: "circuit_open" });
  });

  it("transitions open → half-open after openMs and lets one probe through", async () => {
    let now = 1_000;
    const cb = new CircuitBreaker("svc", {
      failureThreshold: 1,
      openMs: 1000,
      now: () => now,
    });
    await cb.run(boom);
    expect(cb.inspect().state).toBe("open");
    now += 1000; // exactly openMs later
    expect(cb.inspect().state).toBe("half_open");
    const r = await cb.run(ok);
    expect(r).toMatchObject({ ok: true, value: "value", state: "closed" });
  });

  it("half-open failure bounces straight back to open and restarts the timer", async () => {
    let now = 1_000;
    const cb = new CircuitBreaker("svc", {
      failureThreshold: 1,
      openMs: 1000,
      now: () => now,
    });
    await cb.run(boom);
    now += 1000;
    expect(cb.inspect().state).toBe("half_open");
    await cb.run(boom); // probe fails
    expect(cb.inspect().state).toBe("open");
    // openMs starts again from this moment.
    now += 999;
    expect(cb.inspect().state).toBe("open");
    now += 1;
    expect(cb.inspect().state).toBe("half_open");
  });

  it("a success in closed state resets the failure counter", async () => {
    const cb = new CircuitBreaker("svc", { failureThreshold: 3, openMs: 1000 });
    await cb.run(boom);
    await cb.run(boom);
    expect(cb.inspect().consecutiveFailures).toBe(2);
    await cb.run(ok);
    expect(cb.inspect().consecutiveFailures).toBe(0);
  });

  it("reset() clears state to closed regardless of prior trips", async () => {
    const cb = new CircuitBreaker("svc", { failureThreshold: 1, openMs: 1000 });
    await cb.run(boom);
    expect(cb.inspect().state).toBe("open");
    cb.reset();
    expect(cb.inspect().state).toBe("closed");
    expect((await cb.run(ok)).ok).toBe(true);
  });

  it("getCircuitBreaker memoises by name", () => {
    const a = getCircuitBreaker("svc-x", { failureThreshold: 1, openMs: 1 });
    const b = getCircuitBreaker("svc-x", { failureThreshold: 99, openMs: 99 });
    expect(a).toBe(b);
    // Constructor opts of the second call are ignored (already-built instance).
  });
});
