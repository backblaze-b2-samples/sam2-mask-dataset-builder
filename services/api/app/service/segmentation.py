"""Segmentation service — orchestrates one SAM 2 run end to end.

Flow (image): fetch source bytes from B2 (repo) -> run the engine (repo) ->
encode masks (service helper) -> write derived artifacts to B2 (repo) ->
assemble a typed SegmentationRun and persist run.json.

The service is the seam between the SDK-bearing repo layer and the HTTP
runtime. It holds the business rules: prompt validation, the B2 key layout,
and what counts as a "mask".
"""

import json
import re
import uuid
from datetime import UTC, datetime

from app.config import settings
from app.repo import download_file, sam2_engine, upload_file
from app.service import masks
from app.types import (
    FrameMasks,
    MaskInstance,
    ObjectPrompt,
    SegmentationRun,
)

_KEY_RE = re.compile(r"(\.\./|/\.\.|\\|%2e%2e|%00|\x00)")


class SegmentationError(Exception):
    """Raised when a segmentation request is invalid or cannot complete."""

    def __init__(self, detail: str, status_code: int = 400):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


def _validate_source_key(key: str) -> None:
    if not key:
        raise SegmentationError("source_key is required")
    if _KEY_RE.search(key.lower()):
        raise SegmentationError("Invalid source_key")
    if not key.startswith(settings.source_prefix):
        raise SegmentationError(
            f"source_key must live under the source prefix '{settings.source_prefix}'"
        )


def _prompt_dict(obj: ObjectPrompt) -> dict:
    """Convert a typed ObjectPrompt to the plain-dict contract the engine
    expects (keeps torch/sam2 out of the types layer)."""
    return {
        "object_id": obj.object_id,
        "points": [{"x": p.x, "y": p.y, "label": p.label} for p in obj.points],
        "box": (
            {"x0": obj.box.x0, "y0": obj.box.y0, "x1": obj.box.x1, "y1": obj.box.y1}
            if obj.box
            else None
        ),
    }


def _run_prefix(run_id: str) -> str:
    return f"{settings.dataset_prefix}{run_id}/"


def _write_instance(run_id: str, image, obj_id: int, mask, frame: int | None) -> MaskInstance:
    """Encode + upload one object's artifacts and return its typed record."""
    base = _run_prefix(run_id)
    seg = f"frames/{frame:05d}/" if frame is not None else ""
    rle_key = f"{base}masks/{seg}obj_{obj_id}_rle.json"
    mask_key = f"{base}masks/{seg}obj_{obj_id}_mask.png"
    cutout_key = f"{base}cutouts/{seg}obj_{obj_id}.png"

    upload_file(masks.encode_rle(mask), rle_key, "application/json")
    upload_file(masks.encode_mask_png(mask), mask_key, "image/png")

    cutout_out: str | None = None
    if image is not None:
        upload_file(masks.encode_cutout_png(image, mask), cutout_key, "image/png")
        cutout_out = cutout_key

    return MaskInstance(
        object_id=obj_id,
        area_px=masks.mask_area(mask),
        bbox=masks.mask_bbox(mask),
        rle_key=rle_key,
        mask_png_key=mask_key,
        cutout_png_key=cutout_out,
    )


def _persist_run(run: SegmentationRun) -> SegmentationRun:
    run_key = f"{_run_prefix(run.run_id)}run.json"
    run.run_key = run_key
    body = run.model_dump_json(indent=2).encode("utf-8")
    upload_file(body, run_key, "application/json")
    return run


def segment_image(source_key: str, objects: list[ObjectPrompt]) -> SegmentationRun:
    """Run image segmentation and persist the derived dataset run to B2."""
    _validate_source_key(source_key)
    source_bytes = download_file(source_key)
    image = masks.decode_image(source_bytes)

    prompts = [_prompt_dict(o) for o in objects]
    h, w, results = sam2_engine.segment_image(source_bytes, prompts)

    run_id = uuid.uuid4().hex[:12]
    instances = [
        _write_instance(run_id, image, r["object_id"], r["mask"], frame=None) for r in results
    ]

    run = SegmentationRun(
        run_id=run_id,
        kind="image",
        source_key=source_key,
        created_at=datetime.now(UTC),
        model_id=settings.sam2_model_id,
        image_width=w,
        image_height=h,
        instances=instances,
        mask_count=len(instances),
    )
    return _persist_run(run)


def segment_video(
    source_key: str,
    objects: list[ObjectPrompt],
    prompt_frame: int = 0,
    max_frames: int = 60,
) -> SegmentationRun:
    """Run video propagation and persist per-frame masks to B2.

    Heavier, GPU-recommended path. Cut-outs are skipped per frame to keep the
    artifact count manageable; masks + RLE are written for every frame.
    """
    _validate_source_key(source_key)
    source_bytes = download_file(source_key)

    prompts = [_prompt_dict(o) for o in objects]
    h, w, frame_results = sam2_engine.propagate_video(
        source_bytes, prompts, prompt_frame, max_frames
    )

    run_id = uuid.uuid4().hex[:12]
    frames: list[FrameMasks] = []
    mask_count = 0
    for fr in frame_results:
        idx = fr["frame_index"]
        instances = [
            _write_instance(run_id, None, inst["object_id"], inst["mask"], frame=idx)
            for inst in fr["instances"]
        ]
        mask_count += len(instances)
        frames.append(FrameMasks(frame_index=idx, instances=instances))

    run = SegmentationRun(
        run_id=run_id,
        kind="video",
        source_key=source_key,
        created_at=datetime.now(UTC),
        model_id=settings.sam2_model_id,
        image_width=w,
        image_height=h,
        frames=frames,
        mask_count=mask_count,
    )
    return _persist_run(run)


def get_run(run_id: str) -> SegmentationRun | None:
    """Read a persisted run.json back from B2, if it exists."""
    if _KEY_RE.search(run_id.lower()) or "/" in run_id:
        raise SegmentationError("Invalid run_id")
    run_key = f"{_run_prefix(run_id)}run.json"
    try:
        body = download_file(run_key)
    except RuntimeError:
        return None
    return SegmentationRun(**json.loads(body))
