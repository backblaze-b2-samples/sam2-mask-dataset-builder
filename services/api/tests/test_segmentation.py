"""Tests for the segmentation service.

The SAM 2 engine and B2 are both mocked so this suite runs with no GPU and no
live bucket — the engine returns a deterministic synthetic mask, and B2
put/get are captured in an in-memory store.
"""

import io

import numpy as np
import pytest
from PIL import Image

from app.service import segmentation as seg
from app.types import ObjectPrompt, PointPrompt


def _png_bytes(w=16, h=12) -> bytes:
    img = Image.new("RGB", (w, h), (120, 30, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def fake_b2(monkeypatch):
    """In-memory stand-in for B2 put/get used by the segmentation service."""
    store: dict[str, bytes] = {}
    source_key = "raw/images/cat.png"
    store[source_key] = _png_bytes()

    def fake_download(key):
        if key not in store:
            raise RuntimeError(f"missing {key}")
        return store[key]

    def fake_upload(data, key, content_type):
        store[key] = data
        return None

    monkeypatch.setattr(seg, "download_file", fake_download)
    monkeypatch.setattr(seg, "upload_file", fake_upload)
    return store, source_key


def _fake_engine_image(monkeypatch, h=12, w=16):
    def fake_segment_image(image_bytes, prompts):
        results = []
        for p in prompts:
            mask = np.zeros((h, w), dtype=bool)
            mask[2:6, 3:9] = True
            results.append({"object_id": p["object_id"], "mask": mask})
        return h, w, results

    monkeypatch.setattr(seg.sam2_engine, "segment_image", fake_segment_image)


def test_segment_image_writes_run_and_artifacts(monkeypatch, fake_b2):
    store, source_key = fake_b2
    _fake_engine_image(monkeypatch)

    objects = [ObjectPrompt(object_id=1, points=[PointPrompt(x=5, y=4, label=1)])]
    run = seg.segment_image(source_key, objects)

    assert run.kind == "image"
    assert run.mask_count == 1
    assert run.instances[0].area_px == 4 * 6
    # Derived artifacts written to B2 under datasets/<run_id>/
    assert run.run_key.startswith("datasets/")
    assert run.run_key.endswith("/run.json")
    assert run.instances[0].rle_key in store
    assert run.instances[0].mask_png_key in store
    assert run.instances[0].cutout_png_key in store
    assert run.run_key in store


def test_segment_image_rejects_key_outside_source_prefix(monkeypatch, fake_b2):
    _fake_engine_image(monkeypatch)
    objects = [ObjectPrompt(object_id=1, points=[PointPrompt(x=5, y=4)])]
    with pytest.raises(seg.SegmentationError):
        seg.segment_image("uploads/cat.png", objects)


def test_segment_image_rejects_traversal(monkeypatch, fake_b2):
    _fake_engine_image(monkeypatch)
    objects = [ObjectPrompt(object_id=1, points=[PointPrompt(x=5, y=4)])]
    with pytest.raises(seg.SegmentationError):
        seg.segment_image("raw/../secret.png", objects)


def test_get_run_reads_back_persisted_run(monkeypatch, fake_b2):
    _store, source_key = fake_b2
    _fake_engine_image(monkeypatch)
    objects = [ObjectPrompt(object_id=1, points=[PointPrompt(x=5, y=4)])]
    run = seg.segment_image(source_key, objects)

    fetched = seg.get_run(run.run_id)
    assert fetched is not None
    assert fetched.run_id == run.run_id
    assert fetched.mask_count == 1


def test_get_run_missing_returns_none(monkeypatch, fake_b2):
    assert seg.get_run("deadbeefcafe") is None
