"""Unit tests for mask encoding helpers (pure compute, no SDK/B2)."""

import json

import numpy as np

from app.service import masks


def _square_mask(h=10, w=10) -> np.ndarray:
    m = np.zeros((h, w), dtype=bool)
    m[2:6, 3:8] = True  # 4 rows x 5 cols = 20 px
    return m


def test_mask_area_counts_foreground():
    assert masks.mask_area(_square_mask()) == 20


def test_mask_bbox_is_tight():
    # x=3, y=2, w=5, h=4
    assert masks.mask_bbox(_square_mask()) == [3, 2, 5, 4]


def test_mask_bbox_empty_mask():
    assert masks.mask_bbox(np.zeros((5, 5), dtype=bool)) == [0, 0, 0, 0]


def test_encode_rle_is_valid_json_with_size():
    payload = json.loads(masks.encode_rle(_square_mask()))
    assert payload["size"] == [10, 10]
    assert "counts" in payload
    assert payload["format"] in ("coco-rle", "uncompressed-rle")


def test_encode_mask_png_is_png():
    data = masks.encode_mask_png(_square_mask())
    assert data[:8] == b"\x89PNG\r\n\x1a\n"


def test_encode_cutout_png_is_rgba_png():
    img = np.zeros((10, 10, 3), dtype=np.uint8)
    img[..., 0] = 255  # red source
    data = masks.encode_cutout_png(img, _square_mask())
    assert data[:8] == b"\x89PNG\r\n\x1a\n"


def test_fallback_rle_roundtrips_via_run_lengths():
    # The fallback counts must sum to the total pixel count.
    m = _square_mask()
    fortran = np.asfortranarray(m.astype(np.uint8))
    counts = masks._fallback_rle(fortran)
    assert sum(counts) == m.size
