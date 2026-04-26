/**
 * Supabase Storage helpers — service-role uploads + signed-URL reads.
 *
 * Three buckets per plan §7 / migration 0006_buckets.sql:
 *   poi-photos       — enrolment photos (10MB, image/*, retained)
 *   event-frames     — Patrol-Mode captured frames (5MB, 30d lifecycle)
 *   sniper-queries   — Sniper-Mode query images (10MB, 7d lifecycle)
 *
 * UUIDv4 paths. Signed-URL TTL ≤ 60s for any browser-facing read so a
 * leaked URL becomes worthless quickly.
 */

import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "./supabase-admin.js";

export type Bucket = "poi-photos" | "event-frames" | "sniper-queries";

const SIGNED_URL_TTL_SEC = 60;

function extensionFromMime(contentType: string): "jpg" | "png" | "webp" {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

export interface UploadResult {
  /** path inside the bucket — e.g. "1d6e8a35-….jpg" */
  path: string;
  /** size in bytes */
  size: number;
}

/** Upload a binary buffer under a fresh UUIDv4 filename. Throws on failure. */
export async function uploadToBucket(
  bucket: Bucket,
  buf: Buffer,
  contentType: string,
): Promise<UploadResult> {
  const ext = extensionFromMime(contentType);
  const path = `${randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin().storage.from(bucket).upload(path, buf, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`storage_upload_failed: ${error.message}`);
  return { path, size: buf.byteLength };
}

/** Best-effort cleanup. Never throws — failure is logged at the call site. */
export async function deleteFromBucket(
  bucket: Bucket,
  path: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin().storage.from(bucket).remove([path]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Signed read URL with short TTL. Used by the operator UI to preview photos. */
export async function signedReadUrl(bucket: Bucket, path: string): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error || !data) throw new Error(`signed_url_failed: ${error?.message ?? "unknown"}`);
  return data.signedUrl;
}
