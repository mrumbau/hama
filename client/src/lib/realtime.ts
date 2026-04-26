/**
 * Supabase Realtime channel helper for the events feed.
 *
 * ADR-7 (Tag 9): Supabase `postgres_changes` is the single push channel
 * for everything operators watch. Tag 6 wires `events` for Patrol Mode
 * alerts; Tag 8 reuses the same plumbing for `fusion_layers`.
 *
 * RLS gates what the anonymous-key client receives over Realtime — an
 * operator only sees rows their session can SELECT.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "./supabase";

export interface EventInsertPayload {
  id: string;
  poi_id: string | null;
  kind: string;
  camera_id: string | null;
  score: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  operator_id: string | null;
  status: "pending" | "confirmed" | "dismissed";
  created_at: string;
  resolved_at: string | null;
}

export function subscribeToEvents(onInsert: (row: EventInsertPayload) => void): RealtimeChannel {
  const channel = supabase
    .channel("argus-events")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (payload) => {
      onInsert(payload.new as EventInsertPayload);
    })
    .subscribe();
  return channel;
}

export async function unsubscribe(channel: RealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel);
}

// ── Sniper Mode (Tag 9) — fusion_layers + fusion_reports realtime ──────────

import type {
  AuthenticityPayload,
  FusionLayer,
  GeographicPayload,
  IdentityPayload,
  WebPresencePayload,
} from "@argus/shared/fusion";

export interface FusionLayerPayload {
  id: string;
  report_id: string;
  layer: FusionLayer;
  status: "pending" | "running" | "done" | "failed";
  payload:
    | IdentityPayload
    | WebPresencePayload
    | GeographicPayload
    | AuthenticityPayload
    | null;
  error_message: string | null;
  latency_ms: number | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface FusionReportPayload {
  id: string;
  requested_by: string;
  query_storage_path: string;
  status: "processing" | "complete" | "failed";
  created_at: string;
  completed_at: string | null;
}

/**
 * Subscribe to live updates for one Sniper report's layer rows. The
 * orchestrator UPDATEs each row as the corresponding layer transitions
 * pending → running → done | failed; `onChange` fires once per
 * transition with the new row. Filtered server-side by report_id so
 * the client doesn't have to discard cross-report noise.
 */
export function subscribeToFusionLayers(
  reportId: string,
  onChange: (row: FusionLayerPayload) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`argus-fusion-layers-${reportId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "fusion_layers",
        filter: `report_id=eq.${reportId}`,
      },
      (payload) => {
        const row = payload.new as FusionLayerPayload | undefined;
        if (row) onChange(row);
      },
    )
    .subscribe();
  return channel;
}

/**
 * Subscribe to a single fusion_reports row's status flips. Useful for
 * the Sniper detail page header — flips the badge from 'processing'
 * to 'complete' / 'failed' the moment the orchestrator finalises.
 */
export function subscribeToFusionReport(
  reportId: string,
  onChange: (row: FusionReportPayload) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`argus-fusion-report-${reportId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "fusion_reports",
        filter: `id=eq.${reportId}`,
      },
      (payload) => {
        const row = payload.new as FusionReportPayload | undefined;
        if (row) onChange(row);
      },
    )
    .subscribe();
  return channel;
}
