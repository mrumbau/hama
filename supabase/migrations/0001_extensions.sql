-- 0001_extensions.sql
-- Hand-written. Runs before Drizzle's 0002_init_schema.sql because the
-- generated schema declares vector(512) columns and gen_random_uuid() defaults.
--
-- Idempotent: every CREATE EXTENSION uses IF NOT EXISTS so re-running the
-- migration runner is a no-op.

CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS vector;         -- pgvector for face embeddings
