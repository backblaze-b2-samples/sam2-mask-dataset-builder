"""Mask encoding helpers — pure compute, no SDK.

Turns a boolean mask array into the derived artifacts written to B2:
- COCO RLE JSON (compact, training-pipeline friendly)
- binary mask PNG (0/255 single channel)
- transparent cut-out PNG (source pixels where the mask is true, alpha=0 elsewhere)

Plus geometry helpers (area, bbox). Everything here is numpy/Pillow/pycocotools
only — it never touches torch, sam2, or boto3.
"""

import io
import json

import numpy as np


def mask_area(mask: np.ndarray) -> int:
    """Number of foreground pixels."""
    return int(np.count_nonzero(mask))


def mask_bbox(mask: np.ndarray) -> list[int]:
    """Tight [x, y, w, h] bounding box of the foreground. [0,0,0,0] if empty."""
    ys, xs = np.where(mask)
    if xs.size == 0:
        return [0, 0, 0, 0]
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    return [x0, y0, x1 - x0 + 1, y1 - y0 + 1]


def encode_rle(mask: np.ndarray) -> bytes:
    """Encode a boolean mask as COCO RLE JSON bytes.

    Uses pycocotools when available (the canonical, interoperable format);
    falls back to a column-major run-length encoding with the same JSON shape
    so the artifact is still valid and decodable without the C extension.
    """
    fortran = np.asfortranarray(mask.astype(np.uint8))
    try:
        from pycocotools import mask as coco_mask

        rle = coco_mask.encode(fortran)
        counts = rle["counts"]
        if isinstance(counts, bytes):
            counts = counts.decode("ascii")
        payload = {
            "size": [int(mask.shape[0]), int(mask.shape[1])],
            "counts": counts,
            "format": "coco-rle",
        }
    except Exception:
        payload = {
            "size": [int(mask.shape[0]), int(mask.shape[1])],
            "counts": _fallback_rle(fortran),
            "format": "uncompressed-rle",
        }
    return json.dumps(payload).encode("utf-8")


def _fallback_rle(fortran: np.ndarray) -> list[int]:
    """Column-major run lengths starting from a 0 run (COCO convention)."""
    flat = fortran.flatten(order="F")
    counts: list[int] = []
    prev = 0
    run = 0
    for v in flat:
        if v == prev:
            run += 1
        else:
            counts.append(run)
            prev = v
            run = 1
    counts.append(run)
    return counts


def encode_mask_png(mask: np.ndarray) -> bytes:
    """Encode a boolean mask as a 0/255 grayscale PNG."""
    from PIL import Image

    arr = (mask.astype(np.uint8)) * 255
    buf = io.BytesIO()
    Image.fromarray(arr, mode="L").save(buf, format="PNG")
    return buf.getvalue()


def encode_cutout_png(image: np.ndarray, mask: np.ndarray) -> bytes:
    """Cut the masked region out of the source image as a transparent PNG.

    `image` is HxWx3 RGB uint8; pixels outside the mask get alpha 0.
    """
    from PIL import Image

    h, w = mask.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., :3] = image
    rgba[..., 3] = mask.astype(np.uint8) * 255
    buf = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buf, format="PNG")
    return buf.getvalue()


def decode_image(image_bytes: bytes) -> np.ndarray:
    """Decode image bytes to an HxWx3 RGB uint8 array (for cut-outs)."""
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return np.array(img)
