/**
 * Supabase Auth JWT verification middleware.
 *
 * Since 2024-Q4, Supabase signs access tokens with **asymmetric** keys
 * (ES256 / RS256) and exposes the public set at:
 *   ${SUPABASE_URL}/auth/v1/.well-known/jwks.json
 *
 * The legacy HS256 `SUPABASE_JWT_SECRET` does not sign new sessions any
 * more. We verify against JWKS exclusively. See ADR-9 for the full
 * argument and DECISIONS.md D-009 for the migration trace.
 *
 * jose's `createRemoteJWKSet` ships with built-in caching and a 30-second
 * cooldown for unknown kids — exactly what we want for a long-running
 * server. Tests inject a `createLocalJWKSet` via setJwksForTests().
 */

import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

import { env } from "../env.js";
import { logger } from "../lib/pino.js";

const supabaseJwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email().optional(),
  role: z.string().default("authenticated"),
  aud: z.union([z.string(), z.array(z.string())]).default("authenticated"),
  exp: z.number(),
});

export type AuthContext = {
  sub: string;
  email?: string;
  role: string;
};

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
  }
}

// ── JWKS provider (testable) ───────────────────────────────────────────────
// The remote JWKS getter is constructed lazily on first verification so the
// server can boot without the Supabase /auth/v1 endpoint reachable. Tests
// replace it via setJwksForTests().

let cachedJwks: JWTVerifyGetKey | null = null;

function defaultRemoteJwks(): JWTVerifyGetKey {
  const url = new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL);
  logger.info({ jwksUrl: url.toString() }, "auth: initialising remote JWKS");
  return createRemoteJWKSet(url, {
    cooldownDuration: 30_000, // re-fetch tolerance for unknown kids
    cacheMaxAge: 600_000, // 10 minutes
    timeoutDuration: 5_000,
  });
}

function getJwks(): JWTVerifyGetKey {
  if (!cachedJwks) cachedJwks = defaultRemoteJwks();
  return cachedJwks;
}

/** Test-only: inject a `createLocalJWKSet` getter built around in-memory keys. */
export function setJwksForTests(jwks: JWTVerifyGetKey | null): void {
  cachedJwks = jwks;
}

// ── Middleware ─────────────────────────────────────────────────────────────

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing_bearer_token" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({ error: "missing_bearer_token" });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      algorithms: ["RS256", "ES256"],
    });

    const parsed = supabaseJwtPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "auth: malformed JWT payload");
      res.status(401).json({ error: "invalid_token_payload" });
      return;
    }

    req.auth = {
      sub: parsed.data.sub,
      email: parsed.data.email,
      role: parsed.data.role,
    };
    next();
  } catch (err) {
    const reason = classifyJoseError(err);
    const errInfo =
      err instanceof Error
        ? {
            name: err.constructor.name,
            message: err.message,
            code: (err as { code?: string }).code,
          }
        : { value: String(err) };
    logger.warn({ reason, err: errInfo }, "auth: jwtVerify rejected");
    res.status(401).json({ error: reason });
  }
}

function classifyJoseError(err: unknown): string {
  if (err instanceof joseErrors.JWTExpired) return "token_expired";
  if (err instanceof joseErrors.JWTClaimValidationFailed) return "invalid_claims";
  if (err instanceof joseErrors.JWSSignatureVerificationFailed) return "invalid_signature";
  if (err instanceof joseErrors.JWKSNoMatchingKey) return "unknown_kid";
  if (err instanceof joseErrors.JWKSTimeout || err instanceof joseErrors.JWKSInvalid) {
    return "jwks_unreachable";
  }
  if (err instanceof joseErrors.JOSEError) return "invalid_token";
  return "auth_failed";
}
