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

  // Supabase — three keys, never mix them.
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(40),
  SUPABASE_JWT_SECRET: z.string().min(20),

  // Postgres — pooled URL for runtime, direct URL for migrations.
  DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//, "must start with postgres://"),
  DATABASE_DIRECT_URL: z.string().regex(/^postgres(?:ql)?:\/\//),

  // ML service.
  ML_BASE_URL: z.string().url().default("http://127.0.0.1:8001"),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),

  // External APIs (server-only — frontend never sees these).
  SERPAPI_KEY: z.string().min(20),
  PICARTA_API_KEY: z.string().min(10),
  REALITY_DEFENDER_API_KEY: z.string().min(20),

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
