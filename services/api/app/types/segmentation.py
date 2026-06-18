from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PointPrompt(BaseModel):
    """A single click prompt. `x`/`y` are pixel coordinates in the source
    image. `label` is 1 for a foreground (include) click, 0 for background
    (exclude)."""

    type: Literal["point"] = "point"
    x: float
    y: float
    label: Literal[0, 1] = 1


class BoxPrompt(BaseModel):
    """An axis-aligned box prompt in pixel coordinates (x0,y0 top-left;
    x1,y1 bottom-right)."""

    type: Literal["box"] = "box"
    x0: float
    y0: float
    x1: float
    y1: float


class ObjectPrompt(BaseModel):
    """One object to segment, identified by `object_id`. SAM 2 takes a mix
    of point and box prompts per object; we group them so a single run can
    produce multiple labeled instances."""

    object_id: int
    points: list[PointPrompt] = Field(default_factory=list)
    box: BoxPrompt | None = None


class SegmentImageRequest(BaseModel):
    """Run image segmentation against a source object already in B2."""

    source_key: str
    objects: list[ObjectPrompt] = Field(min_length=1)


class SegmentVideoRequest(BaseModel):
    """Run video propagation against a source clip already in B2. Prompts are
    placed on a single frame (default: the first frame) and propagated across
    the clip. Video is the heavier, GPU-recommended path."""

    source_key: str
    objects: list[ObjectPrompt] = Field(min_length=1)
    prompt_frame: int = 0
    max_frames: int = 60


class MaskInstance(BaseModel):
    """A single segmented object's derived artifacts, all stored in B2."""

    object_id: int
    area_px: int
    bbox: list[int]  # [x, y, w, h]
    rle_key: str  # COCO RLE JSON in B2
    mask_png_key: str  # binary mask PNG in B2
    cutout_png_key: str | None = None  # transparent cut-out in B2


class FrameMasks(BaseModel):
    """Per-frame masks produced by video propagation."""

    frame_index: int
    instances: list[MaskInstance]


class SegmentationRun(BaseModel):
    """Metadata for one segmentation run, persisted as run.json in B2."""

    run_id: str
    kind: Literal["image", "video"]
    source_key: str
    created_at: datetime
    model_id: str
    image_width: int
    image_height: int
    instances: list[MaskInstance] = Field(default_factory=list)
    frames: list[FrameMasks] = Field(default_factory=list)
    mask_count: int = 0
    run_key: str = ""  # key of the run.json itself


class DatasetSummary(BaseModel):
    """Aggregate view of the derived dataset for the footprint dashboard."""

    run_count: int
    mask_count: int
    cutout_count: int
    source_bytes: int
    source_human: str
    derived_bytes: int
    derived_human: str
    growth_ratio: float  # derived / source
