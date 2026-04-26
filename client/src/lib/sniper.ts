/**
 * Typed wrappers around the Sniper-mode endpoints.
 *
 *   POST /api/sniper/run     multipart upload of a query image
 *   GET  /api/sniper/:id     polling fallback (Realtime is the primary
 *                            channel; this exists for direct API
 *                            consumers + post-disconnect catch-up)
 *
 * Layer payloads come from `@argus/shared/fusion` so the wire-shape is
 * pinned across both ends of the call.
 */

import type {
  AuthenticityPayload,
  FusionLayer,
  GeographicPayload,
  IdentityPayload,
  WebPresencePayload,
} from "@argus/shared/fusion";

import { api, ApiError } from "./api";
import { supabase } from "./supabase";

export type SniperLayerStatus = "pending" | "running" | "done" | "failed";
export type SniperReportStatus = "processing" | "complete" | "failed";

export interface LayerResult<T> {
  status: "done" | "failed";
  payload?: T;
  reason?: string;
  latencyMs: number;
}

export interface SniperRunResponse {
  report_id: string;
  query_storage_path: string;
  final_status: SniperReportStatus;
  layers: {
    identity: LayerResult<IdentityPayload>;
    web_presence: LayerResult<WebPresencePayload>;
    geographic: LayerResult<GeographicPayload>;
    authenticity: LayerResult<AuthenticityPayload>;
  };
}

export interface SniperReportRow {
  id: string;
  requested_by: string;
  query_storage_path: string;
  status: SniperReportStatus;
  created_at: string;
  completed_at: string | null;
}

export interface SniperLayerRow {
  layer: FusionLayer;
  status: SniperLayerStatus;
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

export interface SniperDetailResponse {
  report: SniperReportRow;
  layers: SniperLayerRow[];
}

export const sniperApi = {
  /**
   * Multipart upload of the query image. Returns the full report once
   * all four layers have terminated (or partial-failed). Latency =
   * max(per-layer latency); demos run ≤ 5 s.
   */
  async run(file: File): Promise<SniperRunResponse> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const fd = new FormData();
    fd.append("image", file);

    const res = await fetch("/api/sniper/run", {
      method: "POST",
      body: fd,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!res.ok) {
      const message =
        parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as { error: unknown }).error)
          : res.statusText || `HTTP ${res.status}`;
      throw new ApiError(res.status, message, parsed);
    }
    return parsed as SniperRunResponse;
  },

  detail(reportId: string): Promise<SniperDetailResponse> {
    return api<SniperDetailResponse>(`/sniper/${reportId}`);
  },
};
