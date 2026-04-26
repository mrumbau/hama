/**
 * Human-friendly copy for the server's quality-gate reason codes.
 *
 * The codes themselves are machine-stable identifiers returned by
 * python/argus_ml/quality.py; this module owns the operator-facing
 * translation. Centralised so PoiDetail and any future enrolment
 * surface render the same text. The `too_blurry` code was removed
 * with D-017 (Laplacian-blur axis disabled — det_score covers the
 * same failure modes with a wider discriminative margin); legacy
 * reports surface the raw code via the `describeReason` fallback.
 */

export interface QualityReasonCopy {
  /** Short noun phrase shown in the reason-code chip. */
  title: string;
  /** One-sentence remediation hint shown beneath the title. Empty if no hint applies. */
  hint: string;
}

export const QUALITY_REASON_COPY: Record<string, QualityReasonCopy> = {
  no_face: {
    title: "No face found",
    hint: "Make sure the face is fully visible — hair, hand, or sunglasses can hide it.",
  },
  multiple_faces: {
    title: "More than one face",
    hint: "Use a photo with just one person.",
  },
  face_too_small: {
    title: "Face too small",
    hint: "Move closer or use a sharper photo. The face needs to be at least 112 pixels wide.",
  },
  pose_extreme: {
    title: "Head turned too far",
    hint: "Look at the camera. The face should be roughly straight — up to about 55° to either side is OK.",
  },
  low_confidence_detection: {
    title: "Face is hard to read",
    hint: "Could be partial cover (mask, hand, hair), an extreme angle, low light, or a heavily compressed image. Try a clearer photo.",
  },
};

export function describeReason(code: string): QualityReasonCopy {
  return QUALITY_REASON_COPY[code] ?? { title: code, hint: "" };
}
