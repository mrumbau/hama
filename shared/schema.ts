/* ─────────────────────────────────────────────────────────────────────────
   ARGUS DRIZZLE SCHEMA
   Single source of truth for the Postgres schema. `drizzle-kit generate`
   emits SQL into supabase/migrations/. RLS policies, HNSW indexes and
   storage-bucket policies are hand-written SQL in the same directory
   (Drizzle does not model row-level security, ANN indexes, or storage).

   Conventions
   - All ids are uuid v4. pgcrypto.gen_random_uuid() default.
   - All timestamps are timestamptz. Default now() at insert.
   - All references to auth.users are FK on uuid; ON DELETE CASCADE on
     profiles only (deleting a user wipes their profile + audit attribution
     is preserved via SET NULL on operator_id / requested_by / created_by).
   - poi.category 'security_concern' from plan §7 is dropped per D-001.
   - fusion_layers.layer 'scene' from plan §7 is dropped per D-002 — Sniper
     has 4 layers.
   ───────────────────────────────────────────────────────────────────────── */

import { sql } from "drizzle-orm";
import {
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ── pgvector custom type ────────────────────────────────────────────────────
// Drizzle has no built-in vector type. We round-trip Float32 arrays as the
// Postgres `vector(N)` literal `[v1,v2,…]`. The HNSW cosine index lives in
// supabase/migrations/0002_indexes.sql since drizzle-kit cannot emit it.
export const vector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(",")}]`;
    },
    fromDriver(value: string): number[] {
      return value.replace(/[[\]]/g, "").split(",").map(Number);
    },
  })(name);

// ── auth.users foreign keys ─────────────────────────────────────────────────
// Supabase manages auth.users. We reference it via raw uuid columns and
// add the FK + ON DELETE rules in supabase/migrations/0003_foreign_keys.sql.
// (Drizzle's pgSchema("auth").table() makes drizzle-kit emit a CREATE TABLE
// that conflicts with the existing Supabase-managed table.)

// ── Enums ───────────────────────────────────────────────────────────────────

export const profileRole = pgEnum("profile_role", ["admin", "operator"]);

export const poiCategory = pgEnum("poi_category", ["vip", "guest", "staff", "banned", "missing"]);

export const eventKind = pgEnum("event_kind", ["detection", "recognition", "sniper_match"]);

export const eventStatus = pgEnum("event_status", ["pending", "confirmed", "dismissed"]);

export const fusionReportStatus = pgEnum("fusion_report_status", [
  "processing",
  "complete",
  "failed",
]);

// Layer 5 (scene) intentionally omitted per D-002.
export const fusionLayerName = pgEnum("fusion_layer_name", [
  "identity",
  "web_presence",
  "geographic",
  "authenticity",
]);

export const fusionLayerStatusEnum = pgEnum("fusion_layer_status", [
  "pending",
  "running",
  "done",
  "failed",
]);

// ── profiles ────────────────────────────────────────────────────────────────
// 1:1 with auth.users. Holds operator role + display name. Created on
// first login by a Supabase trigger (see 003_rls_policies.sql).

export const profiles = pgTable("profiles", {
  // FK to auth.users(id) ON DELETE CASCADE in 0003_foreign_keys.sql
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  role: profileRole("role").notNull().default("operator"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

// ── poi (persons of interest) ───────────────────────────────────────────────
// Soft-delete via deletedAt so face_embeddings and events keep referential
// integrity. RLS policies in 002_rls_policies.sql filter deleted_at IS NULL
// for non-admin reads.

export const poi = pgTable(
  "poi",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    fullName: text("full_name").notNull(),
    category: poiCategory("category").notNull(),
    notes: text("notes"),
    threshold: real("threshold").notNull().default(0.55),
    // FK to auth.users(id) ON DELETE SET NULL in 0003_foreign_keys.sql
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    poiCategoryIdx: index("poi_category_idx").on(t.category),
    poiCreatedAtIdx: index("poi_created_at_idx").on(t.createdAt),
  }),
);

// ── face_embeddings ─────────────────────────────────────────────────────────
// 3-5 embeddings per POI. Each embedding remembers the storage path of the
// image it was derived from (private bucket "poi-photos"), the quality
// score from python /quality, and the authenticity score from Reality
// Defender (D2). The HNSW vector_cosine_ops index lives in 004_indexes.sql.

export const faceEmbeddings = pgTable(
  "face_embeddings",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    poiId: uuid("poi_id")
      .notNull()
      .references(() => poi.id, { onDelete: "cascade" }),
    embedding: vector("embedding", 512).notNull(),
    sourceStoragePath: text("source_storage_path").notNull(),
    qualityScore: real("quality_score").notNull(),
    authenticityScore: real("authenticity_score"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    faceEmbeddingsPoiIdx: index("face_embeddings_poi_idx").on(t.poiId),
  }),
);

// ── events ──────────────────────────────────────────────────────────────────
// Audit trail of every recognition / sniper_match. Immutable except for
// status + resolvedAt. Operator confirm/dismiss actions update via RLS-
// gated UPDATE policy.

export const events = pgTable(
  "events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    poiId: uuid("poi_id").references(() => poi.id, { onDelete: "set null" }),
    kind: eventKind("kind").notNull(),
    cameraId: text("camera_id"),
    score: real("score").notNull(),
    frameStoragePath: text("frame_storage_path"),
    bbox: jsonb("bbox").$type<{ x: number; y: number; w: number; h: number } | null>(),
    // FK to auth.users(id) ON DELETE SET NULL in 0003_foreign_keys.sql
    operatorId: uuid("operator_id"),
    status: eventStatus("status").notNull().default("pending"),
    // ByteTrack-assigned track id (Tag 7, ADR-3). Null for non-tracked
    // event kinds (sniper_match) and for legacy rows from before Tag 7.
    // The dedup index is partial on `track_id IS NOT NULL`, defined
    // hand-written in 0007_track_id_dedup.sql.
    trackId: integer("track_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    eventsCreatedAtIdx: index("events_created_at_idx").on(t.createdAt),
    eventsPoiIdx: index("events_poi_idx").on(t.poiId),
    eventsOperatorIdx: index("events_operator_idx").on(t.operatorId),
  }),
);

// ── fusion_reports ──────────────────────────────────────────────────────────
// One row per Sniper Mode run. Spawns 4 fusion_layers rows on insert.

export const fusionReports = pgTable(
  "fusion_reports",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // FK to auth.users(id) ON DELETE SET NULL in 0003_foreign_keys.sql.
    // notNull at app level — ON DELETE SET NULL only fires if user is deleted.
    requestedBy: uuid("requested_by"),
    queryStoragePath: text("query_storage_path").notNull(),
    status: fusionReportStatus("status").notNull().default("processing"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    fusionReportsRequestedByIdx: index("fusion_reports_requested_by_idx").on(t.requestedBy),
    fusionReportsCreatedAtIdx: index("fusion_reports_created_at_idx").on(t.createdAt),
  }),
);

// ── fusion_layers ───────────────────────────────────────────────────────────
// Four rows per fusion_report (one per Sniper layer). Drives the realtime
// streaming in the Sniper UI: Express UPDATEs status + payload + latency_ms
// when each layer finishes; Supabase Realtime pushes the row to the client.

export const fusionLayers = pgTable(
  "fusion_layers",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    reportId: uuid("report_id")
      .notNull()
      .references(() => fusionReports.id, { onDelete: "cascade" }),
    layer: fusionLayerName("layer").notNull(),
    status: fusionLayerStatusEnum("status").notNull().default("pending"),
    latencyMs: integer("latency_ms"),
    payload: jsonb("payload"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    fusionLayersReportIdx: index("fusion_layers_report_idx").on(t.reportId),
    fusionLayersUniq: uniqueIndex("fusion_layers_report_layer_uniq").on(t.reportId, t.layer),
  }),
);

// ── daily_cost_ledger (Tag 8, ADR-6) ───────────────────────────────────────
// Per-operator daily spend tracker for the three paid external APIs.
// FK to auth.users + RLS + service constraint live in
// supabase/migrations/0008_cost_guard.sql.

export const dailyCostLedger = pgTable(
  "daily_cost_ledger",
  {
    operatorId: uuid("operator_id").notNull(),
    dayUtc: date("day_utc").notNull(),
    service: text("service").notNull(), // 'serpapi' | 'picarta' | 'reality_defender'
    spentEur: numeric("spent_eur", { precision: 8, scale: 4 }).notNull().default("0"),
    callCount: integer("call_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.operatorId, t.dayUtc, t.service] }),
    operatorDayIdx: index("daily_cost_ledger_operator_day_idx").on(t.operatorId, t.dayUtc),
  }),
);

// ── Type exports for use in server + client ─────────────────────────────────
export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;
export type Poi = typeof poi.$inferSelect;
export type InsertPoi = typeof poi.$inferInsert;
export type FaceEmbedding = typeof faceEmbeddings.$inferSelect;
export type InsertFaceEmbedding = typeof faceEmbeddings.$inferInsert;
export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;
export type FusionReport = typeof fusionReports.$inferSelect;
export type InsertFusionReport = typeof fusionReports.$inferInsert;
export type FusionLayerRow = typeof fusionLayers.$inferSelect;
export type InsertFusionLayerRow = typeof fusionLayers.$inferInsert;

export const SCHEMA_VERSION = "0.1.0-tag3";
