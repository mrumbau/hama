/**
 * Supabase Auth JWT verification middleware.
 *
 * Verifies HS256 access tokens issued by Supabase Auth using
 * SUPABASE_JWT_SECRET. Attaches the resolved auth user (sub, email, role) to
 * `req.auth`.
 *
 * Plan §9: every Express endpoint behind /api/* (except /api/health) MUST
 * pass through this middleware. The JWT secret is shared with Supabase —
 * if the secret leaks, every operator session is forgeable.
 */

import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { env } from "../env.js";
import { logger } from "../lib/pino.js";

const supabaseJwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email().optional(),
  role: z.string().default("authenticated"),
  aud: z.string().default("authenticated"),
  exp: z.number(),
});

export type AuthContext = z.infer<typeof supabaseJwtPayloadSchema>;

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
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
    const decoded = jwt.verify(token, env.SUPABASE_JWT_SECRET, {
      algorithms: ["HS256"],
    });
    const parsed = supabaseJwtPayloadSchema.safeParse(decoded);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "auth: malformed JWT payload");
      res.status(401).json({ error: "invalid_token_payload" });
      return;
    }
    req.auth = parsed.data;
    next();
  } catch (err) {
    const reason =
      err instanceof jwt.TokenExpiredError
        ? "token_expired"
        : err instanceof jwt.JsonWebTokenError
          ? "invalid_token"
          : "auth_failed";
    res.status(401).json({ error: reason });
  }
}
