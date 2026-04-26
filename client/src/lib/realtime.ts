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
