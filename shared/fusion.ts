// Zod schemas for fusion_layers.payload, validated server-side before insert.
// Tag 8 lands the per-layer payload shapes; the operator UI (Tag 9) reads
// these via the Supabase Realtime push and renders one column per layer.

import { z } from "zod";

export const FUSION_LAYERS = ["identity", "web_presence", "geographic", "authenticity"] as const;
export type FusionLayer = (typeof FUSION_LAYERS)[number];

export const fusionLayerSchema = z.enum(FUSION_LAYERS);

export const FUSION_LAYER_STATUS = ["pending", "running", "done", "failed"] as const;
export type FusionLayerStatus = (typeof FUSION_LAYER_STATUS)[number];

export const fusionLayerStatusSchema = z.enum(FUSION_LAYER_STATUS);

// ── Layer 1 (Identity) — pgvector kNN against the POI bank ─────────────────

export const identityMatchSchema = z.object({
  poi_id: z.string().uuid(),
  full_name: z.string(),
  category: z.string(),
  /** Cosine similarity from median-of-top-K voting, range [0, 1]. */
  similarity: z.number().min(-1).max(1),
  /** poi.threshold copied at compute time so the UI can render a pass/fail badge. */
  threshold: z.number().min(0).max(1),
  /** Number of top-K kNN rows that voted for this POI. */
  votes: z.number().int().min(1),
});
export type IdentityMatch = z.infer<typeof identityMatchSchema>;

export const identityPayloadSchema = z.object({
  /** kNN-derived POI matches, sorted by similarity descending. */
  matches: z.array(identityMatchSchema),
  /** True when at least one match's similarity ≥ poi.threshold. */
  has_strong_match: z.boolean(),
  /** Total embedding rows scanned (corpus size at compute time). */
  corpus_size: z.number().int().nonnegative(),
});
export type IdentityPayload = z.infer<typeof identityPayloadSchema>;

// ── Layer 2 / 3 / 4 — placeholders for Tag 8b ──────────────────────────────
// These shapes are fixed at the schema level so the Tag 9 UI can be built
// against them ahead of the layer implementations.

export const webPresenceHitSchema = z.object({
  /** Engine that returned this hit (Google Lens, Google Reverse, Bing). */
  engine: z.enum(["google_lens", "google_reverse", "bing_reverse"]),
  url: z.string().url(),
  thumbnail_url: z.string().url().optional(),
  title: z.string().optional(),
  /** Optional scoring from the engine; not all expose one. */
  score: z.number().optional(),
});
export type WebPresenceHit = z.infer<typeof webPresenceHitSchema>;

export const webPresencePayloadSchema = z.object({
  hits: z.array(webPresenceHitSchema),
  hit_count: z.number().int().nonnegative(),
});
export type WebPresencePayload = z.infer<typeof webPresencePayloadSchema>;

export const geographicPayloadSchema = z.object({
  /** Picarta top-1 location guess. */
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  /** [lat, lng] of the top guess, or null if unknown. */
  coordinates: z.tuple([z.number(), z.number()]).nullable(),
  /** Picarta confidence (0-1). */
  confidence: z.number().min(0).max(1),
  /** Top-N alternatives with their confidences. */
  alternatives: z
    .array(
      z.object({
        country: z.string().optional(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .default([]),
});
export type GeographicPayload = z.infer<typeof geographicPayloadSchema>;

export const authenticityPayloadSchema = z.object({
  authentic: z.boolean(),
  /** 0–1; higher = more confident the image is real. */
  score: z.number().min(0).max(1),
  verdict: z.enum(["authentic", "deepfake", "uncertain"]),
  source: z.enum(["mock", "real"]),
  sha256: z.string(),
});
export type AuthenticityPayload = z.infer<typeof authenticityPayloadSchema>;
