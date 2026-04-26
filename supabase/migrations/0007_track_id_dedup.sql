-- 0007_track_id_dedup.sql
-- Tag 7 (Track-then-Recognize, ADR-3): replace the 30s time-window debounce
-- (D-012) with a track-id-keyed lifelong dedup. ByteTrack assigns a stable
-- integer track_id to each detection across consecutive Patrol-Mode frames;
-- the Express recognize route stamps this id on the event row, and a
-- per-(camera_id, track_id, poi_id) UNIQUE check ensures one event per
-- track per POI for the lifetime of that track. A person walking out and
-- back in produces a new track_id and therefore a new event — the failure
-- mode the time-window debounce had no answer for.
--
-- The column is nullable so events created before Tag 7 (and any future
-- non-Patrol kinds like sniper_match) keep their NULL semantic. The
-- partial index sits on track_id IS NOT NULL so the new dedup query
-- stays cheap without bloating the index for every event.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS track_id integer;

-- Dedup query: `WHERE camera_id = X AND track_id = T AND poi_id = P` must
-- be O(log n) for the WHERE-NOT-EXISTS guard in routes/recognize.ts.
CREATE INDEX IF NOT EXISTS events_track_dedup_idx
  ON events (camera_id, track_id, poi_id)
  WHERE track_id IS NOT NULL;
