/**
 * Pino logger.
 *
 * pretty-printed in dev, JSON in prod. Plan §11 forbids `console.log` in
 * production code — this module is the only logger entry point. Every
 * server file imports `logger` from here.
 */

import pino from "pino";
import { env } from "../env.js";

const isDev = env.NODE_ENV === "development";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "argus-server" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.SUPABASE_SERVICE_ROLE_KEY",
      "*.SUPABASE_JWT_SECRET",
      "*.SERPAPI_KEY",
      "*.PICARTA_API_KEY",
      "*.REALITY_DEFENDER_API_KEY",
      "*.password",
      "*.token",
    ],
    remove: true,
  },
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname,service",
          messageFormat: "{msg}",
        },
      }
    : undefined,
});
