/**
 * Typed POI API helper. All Express POI routes pass through here so the
 * pages have one place to look when wire shapes change.
 */

import { api, ApiError } from "./api";
import { resizeImage, shouldSkipResize } from "./resizeImage";
import type { PoiCategory } from "@argus/shared";

export type { PoiCategory };

export interface Poi {
  id: string;
  fullName: string;
  category: PoiCategory;
  notes: string | null;
  threshold: number;
  createdBy: string | null;
  createdAt: string;
  embedding_count?: number;
}

export interface PoiPhoto {
  id: string;
  storagePath: string;
  qualityScore: number;
  authenticityScore: number | null;
  createdAt: string;
  signed_url: string | null;
}

export interface PoiDetailResponse {
  poi: Poi;
  photos: PoiPhoto[];
}

export interface UploadPhotoSuccess {
  embedding_id: string;
  storage_path: string;
  quality: Record<string, number>;
  authenticity: { verdict: string; score: number; source: "mock" | "real" };
  face: {
    bbox: { x: number; y: number; w: number; h: number };
    det_score: number;
    yaw_deg: number;
    blur_var: number;
  };
}

export type PhotoUploadOutcome =
  | { kind: "success"; data: UploadPhotoSuccess }
  | {
      kind: "quality_failed";
      reasons: string[];
      metrics: Record<string, number>;
    }
  | {
      kind: "authenticity_failed";
      verdict: string;
      score: number;
      source: "mock" | "real";
    }
  | { kind: "image_too_large"; max_bytes: number }
  | { kind: "unsupported_mime_type"; mimetype: string }
  | { kind: "other"; status: number; message: string };

export const poiApi = {
  list: () => api<{ poi: Poi[] }>("/poi"),

  detail: (id: string) => api<PoiDetailResponse>(`/poi/${id}`),

  create: (body: {
    full_name: string;
    category: PoiCategory;
    notes?: string;
    threshold?: number;
  }) => api<{ poi: Poi }>("/poi", { method: "POST", body }),

  softDelete: (id: string) =>
    api<unknown>(`/poi/${id}`, { method: "DELETE" }).then(() => undefined),

  uploadPhoto: async (id: string, file: File): Promise<PhotoUploadOutcome> => {
    // Client-side resize: real iPhone / Samsung photos are 50–100 MP.
    // Bring the longest edge down to 1920 px, re-encode JPEG q=0.85,
    // and rotate per EXIF (createImageBitmap with imageOrientation:
    // "from-image" handles the iPhone-portrait rotation natively).
    // Defence-in-depth: server-side images.py downscales again at
    // 2048 px max edge if the client somehow skipped this. (D-014.)
    let payload: Blob = file;
    let filename: string = file.name;
    if (!shouldSkipResize(file)) {
      try {
        payload = await resizeImage(file);
        // The blob is JPEG regardless of source format. Reflect the
        // change in the filename so the server's MIME check (which
        // reads the multipart `Content-Type` header, not the magic
        // bytes) routes via image/jpeg.
        filename = file.name.replace(/\.\w+$/, "") + ".jpg";
      } catch (err) {
        // Fall back to the original file. Common cause: createImageBitmap
        // refusing an unsupported codec (HEIC on Chrome desktop) or a
        // corrupted image. The server-side resize will still apply.
        console.warn("resizeImage fallback to original file:", err);
      }
    }

    const fd = new FormData();
    fd.append("image", payload, filename);
    try {
      // The api() helper is JSON-only. Photo uploads go via raw fetch
      // with the Authorization header pulled from supabase.auth.
      const { supabase } = await import("./supabase");
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        return { kind: "other", status: 401, message: "missing_session" };
      }
      const apiBase = import.meta.env.VITE_API_URL ?? "";
      const res = await fetch(`${apiBase}/api/poi/${id}/photos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const text = await res.text();
      const parsed = text ? safeJson(text) : null;

      if (res.ok) {
        return { kind: "success", data: parsed as UploadPhotoSuccess };
      }
      const obj = (parsed ?? {}) as Record<string, unknown>;
      const errCode = String(obj.error ?? "");
      if (errCode === "quality_gate_failed") {
        return {
          kind: "quality_failed",
          reasons: Array.isArray(obj.reasons) ? (obj.reasons as string[]) : [],
          metrics: (obj.metrics as Record<string, number>) ?? {},
        };
      }
      if (errCode === "deepfake_or_replay") {
        return {
          kind: "authenticity_failed",
          verdict: String(obj.verdict ?? "uncertain"),
          score: Number(obj.authenticity_score ?? 0),
          source: (obj.authenticity_source as "mock" | "real") ?? "mock",
        };
      }
      if (errCode === "image_too_large") {
        return {
          kind: "image_too_large",
          max_bytes: Number(obj.max_bytes ?? 0),
        };
      }
      if (errCode === "unsupported_mime_type") {
        return {
          kind: "unsupported_mime_type",
          mimetype: String(obj.mimetype ?? ""),
        };
      }
      return {
        kind: "other",
        status: res.status,
        message: String(obj.error ?? res.statusText ?? "upload_failed"),
      };
    } catch (err) {
      if (err instanceof ApiError) {
        return { kind: "other", status: err.status, message: err.message };
      }
      return {
        kind: "other",
        status: 0,
        message: err instanceof Error ? err.message : "network_error",
      };
    }
  },
};

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
