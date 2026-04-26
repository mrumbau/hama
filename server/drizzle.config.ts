import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_DIRECT_URL;
if (!url) {
  throw new Error(
    "drizzle.config: DATABASE_DIRECT_URL is required. Copy server/.env.example to server/.env and fill in.",
  );
}

export default defineConfig({
  schema: "../shared/schema.ts",
  out: "../supabase/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  // Drizzle does not own auth.* — exclude it from the introspection diff.
  schemaFilter: ["public"],
  // pgvector / pgcrypto are CREATEd in 001_extensions.sql before this generated file runs.
  extensionsFilters: ["postgis"],
  verbose: true,
  strict: true,
});
