/**
 * Unit tests for the JWKS-based requireAuth middleware.
 *
 * The middleware verifies tokens against a JWKS resolver. Production wires
 * `createRemoteJWKSet` against ${SUPABASE_URL}/auth/v1/.well-known/jwks.json;
 * tests inject `createLocalJWKSet` against an in-memory ES256 keypair.
 *
 * Plan §13 Tag 3 gate (re-proven post-migration): the JWT chain must
 * accept a token signed by the Supabase signing key and reject every
 * other variation. Five cases:
 *   1. valid ES256 token  → 200, req.auth populated
 *   2. wrong-keypair token → 401 unknown_kid
 *   3. expired token      → 401 token_expired
 *   4. malformed payload  → 401 invalid_token_payload
 *   5. missing bearer     → 401 missing_bearer_token
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Stub env BEFORE jwt.ts imports it. SUPABASE_URL only needs to be a valid
// URL — tests inject the JWKS resolver via setJwksForTests, the URL is
// never fetched.
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test-key-very-long-min-40-chars-1234";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.DATABASE_DIRECT_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SERPAPI_KEY ??= "serpapi-test-key-must-be-long-enough";
process.env.PICARTA_API_KEY ??= "picarta-test-key";
process.env.REALITY_DEFENDER_API_KEY ??= "reality-defender-test-key-min-20-chars";

import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JSONWebKeySet,
  type JWK,
  type KeyLike,
} from "jose";

const { requireAuth, setJwksForTests } = await import("../src/auth/jwt.js");

type MinimalReq = {
  headers: Record<string, string>;
  auth?: { sub: string; email?: string; role: string };
};

function mockRes() {
  return {
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
}

async function callMiddleware(req: MinimalReq) {
  const res = mockRes();
  const next = vi.fn();
  await requireAuth(
    req as unknown as Parameters<typeof requireAuth>[0],
    res as unknown as Parameters<typeof requireAuth>[1],
    next,
  );
  return { res, next };
}

const SUB = "11111111-1111-1111-1111-111111111111";

// Two ES256 keypairs: one whose public half lives in the JWKS we inject,
// and one whose public half is NOT in the JWKS — for the wrong-keypair
// rejection test.
let signingKey: KeyLike;
let signingKid: string;
let foreignKey: KeyLike;
let foreignKid: string;

beforeAll(async () => {
  const argus = await generateKeyPair("ES256");
  const argusJwk: JWK = await exportJWK(argus.publicKey);
  signingKid = "argus-test-key-1";
  argusJwk.kid = signingKid;
  argusJwk.alg = "ES256";
  argusJwk.use = "sig";
  signingKey = argus.privateKey;

  const foreign = await generateKeyPair("ES256");
  foreignKid = "foreign-key-1";
  foreignKey = foreign.privateKey;

  const jwks: JSONWebKeySet = { keys: [argusJwk] };
  setJwksForTests(createLocalJWKSet(jwks));
});

afterAll(() => {
  setJwksForTests(null);
});

async function signSupabaseLikeToken(opts: {
  privateKey: KeyLike;
  kid: string;
  payload?: Record<string, unknown>;
  expiresIn?: string | number;
}): Promise<string> {
  const { privateKey, kid, payload, expiresIn = "1h" } = opts;
  const builder = new SignJWT({
    sub: SUB,
    email: "operator@example.com",
    role: "authenticated",
    aud: "authenticated",
    ...payload,
  })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuedAt();

  if (typeof expiresIn === "number") {
    builder.setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn);
  } else {
    builder.setExpirationTime(expiresIn);
  }

  return builder.sign(privateKey);
}

describe("requireAuth (JWKS / ES256)", () => {
  it("accepts a token signed by the JWKS-published key", async () => {
    const token = await signSupabaseLikeToken({
      privateKey: signingKey,
      kid: signingKid,
    });
    const req: MinimalReq = { headers: { authorization: `Bearer ${token}` } };
    const { res, next } = await callMiddleware(req);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(req.auth?.sub).toBe(SUB);
    expect(req.auth?.email).toBe("operator@example.com");
    expect(req.auth?.role).toBe("authenticated");
  });

  it("rejects a token signed by a key not in the JWKS", async () => {
    const token = await signSupabaseLikeToken({
      privateKey: foreignKey,
      kid: foreignKid,
    });
    const req: MinimalReq = { headers: { authorization: `Bearer ${token}` } };
    const { res, next } = await callMiddleware(req);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toBe("unknown_kid");
  });

  it("rejects an expired token", async () => {
    const token = await signSupabaseLikeToken({
      privateKey: signingKey,
      kid: signingKid,
      expiresIn: -10,
    });
    const req: MinimalReq = { headers: { authorization: `Bearer ${token}` } };
    const { res, next } = await callMiddleware(req);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toBe("token_expired");
  });

  it("rejects a malformed payload (no sub)", async () => {
    const builder = new SignJWT({
      email: "no-sub@example.com",
      role: "authenticated",
      aud: "authenticated",
    })
      .setProtectedHeader({ alg: "ES256", kid: signingKid })
      .setIssuedAt()
      .setExpirationTime("1h");
    const token = await builder.sign(signingKey);

    const req: MinimalReq = { headers: { authorization: `Bearer ${token}` } };
    const { res, next } = await callMiddleware(req);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toBe("invalid_token_payload");
  });

  it("rejects requests without a Bearer header", async () => {
    const req: MinimalReq = { headers: {} };
    const { res, next } = await callMiddleware(req);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toBe("missing_bearer_token");
  });
});
