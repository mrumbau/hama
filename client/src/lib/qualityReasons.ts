/**
 * Human-friendly copy for the server's quality-gate reason codes.
 *
 * The codes themselves are machine-stable identifiers returned by
 * python/argus_ml/quality.py; this module owns the operator-facing
 * translation. Centralised so PoiDetail and any future enrolment
 * surface render the same text. Tag 13 may evolve the hint copy
 * based on the empirical FRR/FAR analysis (D-015 / EVALUATION.md).
 */

export interface QualityReasonCopy {
  /** Short noun phrase shown in the reason-code chip. */
  title: string;
  /** One-sentence remediation hint shown beneath the title. Empty if no hint applies. */
  hint: string;
}

export const QUALITY_REASON_COPY: Record<string, QualityReasonCopy> = {
  no_face: {
    title: "No face detected",
    hint: "Make sure the face is fully visible in the frame and not occluded by hair or accessories.",
  },
  multiple_faces: {
    title: "More than one face",
    hint: "Each enrolment photo must contain exactly one person.",
  },
  face_too_small: {
    title: "Face too small",
    hint: "Move closer or upload a higher-resolution photo — minimum 112 px on the short edge of the face.",
  },
  too_blurry: {
    title: "Eye region looks soft",
    hint: "Argus measures sharpness on the eye region — the depth plane that should always be in focus. Common causes: motion at the moment of capture, focus point landing on the background instead of the face, or thick glasses reflecting the light source.",
  },
  pose_extreme: {
    title: "Head turned too far",
    hint: "Look directly at the camera. The gate accepts up to ±45° yaw — hold a frontal angle.",
  },
};

export function describeReason(code: string): QualityReasonCopy {
  return QUALITY_REASON_COPY[code] ?? { title: code, hint: "" };
}
