"""Image decoding helpers.

The ML service accepts images via a single shared input shape: a base64
string, optionally prefixed with a `data:image/...;base64,` URL header.
Multipart upload is delegated to the orchestrator (Express) — it strips
the file and forwards the bytes here as base64. One representation, one
decoder.

Two-layer size handling (D-014):
  * Client (Tag 5+ enrolment, Patrol Mode webcam): resize to ≤1920 px on
    the longest edge before upload — keeps the wire payload small.
  * Server (this module): defence-in-depth. Decompression-bomb cap at
    MAX_PIXELS = 100M (covers 50MP iPhones, 100MP Samsung HM3); any image
    > 2048 px on the longest edge is downscaled in-memory via PIL's
    LANCZOS thumbnail before convert("RGB"). Bbox coordinates from
    detection therefore live in the post-resize coordinate system, and
    DecodedImage.width/height reflect the same.

Memory budget at the cap: 100M pixels × 4 bytes/pixel (RGBA) = 400 MB
peak per decode. PIL frees most of that after thumbnail. The FastAPI
worker count is 2 (config.py ML_WORKERS), so simultaneous-request RAM
worst case is ~800 MB. See docs/OPERATIONS.md.
"""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

# Hard upper bound on decoded pixel count (W*H), the decompression-bomb
# defence. 100M = 100,000,000, sized to accept current high-res phone
# cameras (50MP iPhone Pro, 100MP Samsung HM3) without rejecting them.
MAX_PIXELS = 100_000_000

# Replace PIL's built-in MAX_IMAGE_PIXELS warning/error with our explicit
# pre-load check below. PIL's default 89M threshold is below modern phone-
# camera resolutions, so its warning would fire on every legitimate 50-100MP
# photo. Our pixel-count guard runs after pil.load() and before any
# allocation-heavy work, so the defence is unchanged.
Image.MAX_IMAGE_PIXELS = None

# Any image whose longest edge exceeds this is downscaled in-memory
# before face detection sees it. RetinaFace runs at 640×640 internally
# anyway; keeping the input ≤ 2048 px caps RAM and preserves enough
# resolution for the embedding network.
RESIZE_TARGET_EDGE = 2048


class ImageDecodeError(ValueError):
    """Raised for any failure to decode an input image into a BGR ndarray."""


@dataclass(frozen=True)
class DecodedImage:
    bgr: np.ndarray
    width: int
    height: int


def _strip_data_url(s: str) -> str:
    if s.startswith("data:") and "base64," in s:
        return s.split("base64,", 1)[1]
    return s


def decode_image(image_b64: str) -> DecodedImage:
    """Decode a base64 (or data-URL) string to a BGR uint8 ndarray.

    Raises ImageDecodeError on every failure path — the route handler
    converts that into a 422 with a typed reason.

    The returned DecodedImage carries POST-RESIZE dimensions so detector
    bbox coordinates map onto the same coordinate system the caller sees.
    """
    if not image_b64 or not image_b64.strip():
        raise ImageDecodeError("empty_image")

    try:
        raw = base64.b64decode(_strip_data_url(image_b64.strip()), validate=False)
    except (ValueError, TypeError) as exc:
        raise ImageDecodeError("invalid_base64") from exc

    if len(raw) < 32:
        raise ImageDecodeError("invalid_base64")

    try:
        with Image.open(io.BytesIO(raw)) as pil:
            pil.load()
            if pil.width * pil.height > MAX_PIXELS:
                raise ImageDecodeError("image_too_large")
            # Downscale once before convert("RGB") so the heavy work runs
            # on the smaller pixel buffer. thumbnail() is in-place and
            # preserves aspect ratio.
            if pil.width > RESIZE_TARGET_EDGE or pil.height > RESIZE_TARGET_EDGE:
                pil.thumbnail(
                    (RESIZE_TARGET_EDGE, RESIZE_TARGET_EDGE),
                    Image.Resampling.LANCZOS,
                )
            rgb = pil.convert("RGB")
            arr = np.asarray(rgb, dtype=np.uint8)
    except (UnidentifiedImageError, OSError) as exc:
        raise ImageDecodeError("invalid_image") from exc

    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    return DecodedImage(bgr=bgr, width=int(bgr.shape[1]), height=int(bgr.shape[0]))
