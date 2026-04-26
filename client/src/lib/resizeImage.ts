/**
 * Client-side image resize for POI enrolment uploads.
 *
 * Two-layer image-size handling (D-014):
 *   - Client (this module): bring real iPhone / Samsung-HM3 photos
 *     down to ≤1920 px on the longest edge before they hit the wire.
 *     Saves bandwidth and keeps Express + ML happy on slow networks.
 *   - Server (python/argus_ml/images.py): defence-in-depth. Same
 *     work happens at MAX_PIXELS=100M for clients that bypass this.
 *
 * EXIF orientation is honoured natively via
 * `createImageBitmap(blob, { imageOrientation: "from-image" })` —
 * supported in every modern Chromium / Safari / Firefox. iPhone
 * portraits store the bits in landscape with `Orientation: 6` (rotate
 * 90° CW) and a naïve canvas draw would tilt the face — this option
 * tells the browser to apply the rotation when producing the bitmap.
 *
 * The resize call itself is wrapped in a try/catch in poi.ts; any
 * failure surfaces as a console.warn there and falls back to the
 * original file.
 */

const MAX_EDGE_PX = 1920;
const JPEG_QUALITY = 0.85;

/**
 * Resize a user-picked file to ≤ MAX_EDGE_PX on its longest edge and
 * encode as JPEG. Returns a Blob whose `type` is `image/jpeg`.
 *
 * Throws if `createImageBitmap` is unavailable (very old browser),
 * the source cannot be decoded, or `canvas.toBlob` returns null.
 */
export async function resizeImage(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("createImageBitmap_unsupported");
  }

  // `imageOrientation: "from-image"` rotates the bitmap per the EXIF
  // Orientation tag so the resulting canvas draw is upright.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (err) {
    throw new Error(`createImageBitmap_failed: ${(err as Error).message}`);
  }

  const { width: srcW, height: srcH } = bitmap;
  // Downscale only — never upscale; a 800×600 photo stays 800×600.
  const scale = Math.min(MAX_EDGE_PX / srcW, MAX_EDGE_PX / srcH, 1);
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("canvas_context_unavailable");
  }
  // Browsers default `imageSmoothingQuality` to "low" which over-pixelates
  // faces at large downscale ratios. "high" is a single-keyword opt-in.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, dstW, dstH);
  bitmap.close();

  const blob: Blob | null = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
  });
  if (!blob) throw new Error("canvas_toblob_returned_null");
  return blob;
}

/** True if the given file is small enough that resize is a waste of CPU. */
export function shouldSkipResize(file: File): boolean {
  // Below ~600 KB the network savings from resize are minimal; the work
  // would still cost a frame of jank on the main thread. createImageBitmap
  // is async but the canvas draw + toBlob are not.
  return file.size < 600 * 1024;
}
