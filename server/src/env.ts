/**
 * Zod-validated environment loader.
 *
 * Fail-fast: if any required variable is missing or malformed, the server
 * refuses to start with a precise error pointing at the field. This is the
 * only place that reads process.env directly.
 */

import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Supabase — three concerns, never mix them.
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(40),
  // Legacy HS256 secret. Optional since 2024-Q4: Supabase rotated to
  // asymmetric JWT signing keys, and new sessions are signed with ES256
  // keys exposed via /auth/v1/.well-known/jwks.json. Verification path is
  // JWKS — see ADR-9. The secret is kept here only as a fallback for
  // potential reverse-migration or emergency dual-verification.
  SUPABASE_JWT_SECRET: z.string().min(20).optional(),

  // Postgres — pooled URL for runtime, direct URL for migrations.
  DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//, "must start with postgres://"),
  DATABASE_DIRECT_URL: z.string().regex(/^postgres(?:ql)?:\/\//),

  // ML service.
  ML_BASE_URL: z.string().url().default("http://127.0.0.1:8001"),
  ML_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),

  // External APIs (server-only — frontend never sees these).
  SERPAPI_KEY: z.string().min(20),
  SERPAPI_BASE_URL: z.string().url().default("https://serpapi.com"),
  SERPAPI_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  PICARTA_API_KEY: z.string().min(10),
  PICARTA_BASE_URL: z.string().url().default("https://picarta.ai/api/v1"),
  PICARTA_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  REALITY_DEFENDER_API_KEY: z.string().min(20),
  REALITY_DEFENDER_BASE_URL: z.string().url().default("https://api.prd.realitydefender.xyz"),
  REALITY_DEFENDER_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),

  // Per-Sniper-call costs charged against the cost guard (Tag 8b, ADR-6).
  // Conservative estimates — refined when each provider's billing reports
  // arrive. The numbers can be adjusted via env without touching code.
  LAYER_COST_WEB_PRESENCE_EUR: z.coerce.number().nonnegative().default(0.02),
  LAYER_COST_GEOGRAPHIC_EUR: z.coerce.number().nonnegative().default(0.01),
  LAYER_COST_AUTHENTICITY_EUR: z.coerce.number().nonnegative().default(0.10),
  // Default TRUE — protects the 50/month free-tier quota. Must be set to
  // explicit "false"/"0" to call the real Reality Defender API.
  // Tag 5 enrolment + tests run against the deterministic mock.
  RD_MOCK_MODE: z
    .union([
      z.boolean(),
      z
        .string()
        .toLowerCase()
        .transform((v) => v !== "false" && v !== "0" && v !== ""),
    ])
    .default(true),

  // POI enrolment.
  // 50 MB cap covers raw iPhone Pro / Samsung HM3 fall-through cases when the
  // client-side resize (lib/resizeImage.ts) fails or is bypassed. The server
  // resizes again at 2048 px max edge in argus_ml/images.py before any
  // allocation-heavy work — see D-014 for the two-layer rationale.
  POI_PHOTO_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(50 * 1024 * 1024),
  POI_PHOTOS_MAX_PER_REQUEST: z.coerce.number().int().positive().default(1),

  // Cost guard + circuit breaker.
  COST_GUARD_DAILY_EUR: z.coerce.number().positive().default(2.0),
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
  CIRCUIT_BREAKER_OPEN_MS: z.coerce.number().int().positive().default(60_000),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function loadEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${fields}`);
  }
  cached = parsed.data;
  return cached;
}

export const env = loadEnv();
