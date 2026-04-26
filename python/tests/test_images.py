"""Pure-decode tests for argus_ml.images.

No model load — verifies the high-resolution input handling (D-014):
  * Native 24MP synthetic image decodes successfully (>16M pixel limit).
  * Decoded image is downscaled to RESIZE_TARGET_EDGE on the longest edge.
  * DecodedImage.width/height reflect post-resize dimensions, NOT input.
  * 100M+ pixel input is rejected with image_too_large.
  * Aspect ratio is preserved across the downscale.
"""

from __future__ import annotations

import base64
import io

import pytest
from PIL import Image

from argus_ml.images import (
    MAX_PIXELS,
    RESIZE_TARGET_EDGE,
    DecodedImage,
    ImageDecodeError,
    decode_image,
)


def _synthetic_jpeg_b64(width: int, height: int) -> str:
    """Generate a `width × height` gradient JPEG and encode as base64.

    Gradients compress small enough that even 24MP fits well under the
    base64-decode RAM budget, and pytest stays fast.
    """
    img = Image.new("RGB", (width, height))
    # A trivial gradient — just enough non-uniform content for JPEG to keep.
    px = img.load()
    if px is None:
        raise RuntimeError("PIL.Image.load() returned None")
    for y in range(0, height, 8):
        for x in range(0, width, 8):
            px[x, y] = (x % 256, y % 256, (x + y) % 256)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_24mp_jpeg_decodes_without_image_too_large():
    """6000 × 4000 = 24,000,000 pixels — exceeds the old 16M cap, fits the new 100M cap."""
    b64 = _synthetic_jpeg_b64(6000, 4000)
    result = decode_image(b64)
    assert isinstance(result, DecodedImage)
    assert result.width <= RESIZE_TARGET_EDGE
    assert result.height <= RESIZE_TARGET_EDGE


def test_24mp_decode_preserves_aspect_ratio():
    """6000 × 4000 → resized to ≤ 2048 on the longest edge with 3:2 aspect held."""
    b64 = _synthetic_jpeg_b64(6000, 4000)
    result = decode_image(b64)
    # Source aspect ratio is 6000/4000 = 1.5. Allow ±1px tolerance for rounding.
    aspect = result.width / result.height
    assert 1.49 <= aspect <= 1.51
    # Longest edge must be RESIZE_TARGET_EDGE (downscale-only never upscales).
    assert max(result.width, result.height) == RESIZE_TARGET_EDGE


def test_smaller_image_is_not_resized():
    """Below the 2048-edge threshold the decoder must not touch the image."""
    b64 = _synthetic_jpeg_b64(800, 600)
    result = decode_image(b64)
    assert result.width == 800
    assert result.height == 600


def test_50mp_iphone_class_image_is_accepted():
    """8160 × 6120 = 50MP — modern iPhone Pro maximum."""
    b64 = _synthetic_jpeg_b64(8160, 6120)
    result = decode_image(b64)
    assert max(result.width, result.height) == RESIZE_TARGET_EDGE


def test_above_100m_pixels_is_rejected():
    """The decompression-bomb defence still fires above MAX_PIXELS."""
    # 12000 × 9000 = 108,000,000 > 100M.
    b64 = _synthetic_jpeg_b64(12000, 9000)
    with pytest.raises(ImageDecodeError) as excinfo:
        decode_image(b64)
    assert "image_too_large" in str(excinfo.value)


def test_max_pixels_constant_value():
    """Pin the public constant so a future bump does not silently regress."""
    assert MAX_PIXELS == 100_000_000
    assert RESIZE_TARGET_EDGE == 2048


def test_invalid_base64_still_rejected():
    """The size bump did not weaken the upstream guards."""
    with pytest.raises(ImageDecodeError):
        decode_image("????" * 16)


def test_empty_input_still_rejected():
    with pytest.raises(ImageDecodeError):
        decode_image("   ")
