-- 0005_indexes.sql
-- Hand-written. The HNSW vector_cosine_ops index is the engine of Layer 1
-- (Identity) — without it, every recognition query becomes a sequential
-- scan over every embedding, which violates the < 250ms E2E SLO from §8.
--
-- Parameters chosen per pgvector docs:
--   m=16              graph neighbours per node (default, good trade-off)
--   ef_construction=64 build-time search width (recall vs build-cost)
--
-- A partial btree index on pending events accelerates the operator's
-- dashboard query (`SELECT … WHERE status='pending' ORDER BY created_at DESC`).

CREATE INDEX IF NOT EXISTS face_embeddings_hnsw_cosine
  ON face_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS events_status_pending
  ON events (created_at DESC)
  WHERE status = 'pending';

-- Convenience index for operator-mode "events I have to resolve right now":
-- combines operator_id + status filter.
CREATE INDEX IF NOT EXISTS events_operator_pending
  ON events (operator_id, created_at DESC)
  WHERE status = 'pending';
