"""Image decoding helpers.

The ML service accepts images via a single shared input shape: a base64
string, optionally prefixed with a `data:image/...;base64,` URL header.
Multipart upload is delegated to the orchestrator (Express) — it strips
the file and forwards the bytes here as base64. One representation, one
decoder.
"""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

# Hard upper bound on decoded pixel count (W*H), defending against decompression bombs.
MAX_PIXELS = 4096 * 4096


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
            rgb = pil.convert("RGB")
            arr = np.asarray(rgb, dtype=np.uint8)
    except (UnidentifiedImageError, OSError) as exc:
        raise ImageDecodeError("invalid_image") from exc

    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    return DecodedImage(bgr=bgr, width=int(bgr.shape[1]), height=int(bgr.shape[0]))
