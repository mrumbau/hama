/**
 * Unit test for the requireAuth middleware.
 *
 * Proves the JWT chain: a token signed with SUPABASE_JWT_SECRET attaches
 * an auth context; a token signed with a different secret is rejected; a
 * malformed payload is rejected; a missing bearer is rejected.
 *
 * Plan §13 Tag 3 gate: "Express-Endpoint nimmt Token an, RLS lehnt
 * fremden Operator ab." This file proves the first half. rls.test.ts
 * proves the second half.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

// Stub env BEFORE the middleware imports it, so requireAuth picks up our
// known secret and not whatever lives in process.env.
process.env.SUPABASE_JWT_SECRET = "test-secret-very-long-please-32-chars";
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test-key-very-long-min-40-chars-1234";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.DATABASE_DIRECT_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SERPAPI_KEY ??= "serpapi-test-key-must-be-long-enough";
process.env.PICARTA_API_KEY ??= "picarta-test-key";
process.env.REALITY_DEFENDER_API_KEY ??= "reality-defender-test-key-min-20-chars";

const { requireAuth } = await import("../src/auth/jwt.js");

type MinimalReq = {
  headers: Record<string, string>;
  auth?: { sub: string; email?: string; role: string };
};

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res;
}

function callMiddleware(req: MinimalReq) {
  const res = mockRes();
  const next = vi.fn();
  // Cast through unknown — the middleware only touches headers + auth + res.status/json.
  requireAuth(
    req as unknown as Parameters<typeof requireAuth>[0],
    res as unknown as Parameters<typeof requireAuth>[1],
    next,
  );
  return { res, next };
}

const VALID_SECRET = "test-secret-very-long-please-32-chars";
const WRONG_SECRET = "different-secret-also-long-enough";

const SUB = "11111111-1111-1111-1111-111111111111";

describe("requireAuth", () => {
  it("accepts a token signed with SUPABASE_JWT_SECRET", () => {
    const token = jwt.sign(
      { sub: SUB, email: "operator@example.com", role: "authenticated", aud: "authenticated" },
      VALID_SECRET,
      { algorithm: "HS256", expiresIn: "1h" },
    );
    const req: MinimalReq = { headers: { authorization: `Bearer ${token}` } };
    const { res, next } = callMiddleware(req);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(req.auth?.sub).toBe(SUB);
    expect(req.auth?.email).toBe("operator@example.com");
  });

  it("rejects a token signed with a different secret", () => {
    const token = jwt.sign(
      { sub: SUB, email: "x@y.z", role: "authenticated", aud: "authenticated" },
      WRONG_SECRET,
      { algorithm: "HS256", expiresIn: "1h" },
    );
    const req: MinimalReq = { headers: { authorization: `Bearer ${token}` } };
    const { res, next } = callMiddleware(req);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toBe("invalid_token");
  });

  it("rejects an expired token", () => {
    const token = jwt.sign(
      { sub: SUB, role: "authenticated", aud: "authenticated" },
      VALID_SECRET,
      { algorithm: "HS256", expiresIn: -10 },
    );
    const req: MinimalReq = { headers: { authorization: `Bearer ${token}` } };
    const { res, next } = callMiddleware(req);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toBe("token_expired");
  });

  it("rejects a malformed payload (no sub)", () => {
    const token = jwt.sign(
      { email: "x@y.z", role: "authenticated", aud: "authenticated" },
      VALID_SECRET,
      { algorithm: "HS256", expiresIn: "1h" },
    );
    const req: MinimalReq = { headers: { authorization: `Bearer ${token}` } };
    const { res, next } = callMiddleware(req);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toBe("invalid_token_payload");
  });

  it("rejects requests without a Bearer header", () => {
    const req: MinimalReq = { headers: {} };
    const { res, next } = callMiddleware(req);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toBe("missing_bearer_token");
  });
});

beforeAll(() => undefined);
afterAll(() => undefined);
