"""SAM 2 segmentation engine adapter (repo layer).

This is the ONLY module that imports `torch` / `sam2`, mirroring the
"external SDK lives only in repo/" invariant that also confines `boto3`.
The model is lazy-loaded on first use so server start stays fast and
`/health` never pulls weights. Weights download from the public HuggingFace
Hub on first use — no API key required.

Outputs are plain NumPy boolean mask arrays so every higher layer (service,
runtime) stays free of torch/sam2.
"""

import logging
import os
import tempfile
from functools import lru_cache

import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)

# Point/box prompt shapes the service passes in are plain dicts so this
# module needs no import from the types layer (repo must not depend on a
# higher layer — and types is lower, but dicts keep the contract explicit).
PromptDict = dict


@lru_cache(maxsize=1)
def _image_predictor():
    """Build (and cache) the SAM 2 image predictor. Heavy: loads weights."""
    import torch
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info("Loading SAM 2 image model %s on %s", settings.sam2_model_id, device)
    predictor = SAM2ImagePredictor.from_pretrained(settings.sam2_model_id)
    predictor.model.to(device)
    return predictor


@lru_cache(maxsize=1)
def _video_predictor():
    """Build (and cache) the SAM 2 video predictor. Heavy: loads weights."""
    import torch
    from sam2.sam2_video_predictor import SAM2VideoPredictor

    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info("Loading SAM 2 video model %s on %s", settings.sam2_model_id, device)
    predictor = SAM2VideoPredictor.from_pretrained(settings.sam2_model_id)
    predictor.model.to(device)
    return predictor


def _decode_image(image_bytes: bytes) -> np.ndarray:
    """Decode image bytes to an HxWx3 RGB uint8 array via Pillow."""
    import io

    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return np.array(img)


def _prompt_arrays(obj: PromptDict):
    """Split one object's prompts into SAM 2 input arrays.

    Returns (point_coords, point_labels, box) where each may be None.
    """
    points = obj.get("points") or []
    point_coords = (
        np.array([[p["x"], p["y"]] for p in points], dtype=np.float32) if points else None
    )
    point_labels = np.array([p["label"] for p in points], dtype=np.int32) if points else None
    box = None
    if obj.get("box"):
        b = obj["box"]
        box = np.array([b["x0"], b["y0"], b["x1"], b["y1"]], dtype=np.float32)
    return point_coords, point_labels, box


def segment_image(image_bytes: bytes, objects: list[PromptDict]):
    """Predict one boolean mask per object prompt for a single image.

    Returns (image_height, image_width, [ {object_id, mask: np.ndarray} ]).
    """
    import torch

    image = _decode_image(image_bytes)
    h, w = image.shape[0], image.shape[1]
    predictor = _image_predictor()

    results = []
    with torch.inference_mode():
        predictor.set_image(image)
        for obj in objects:
            point_coords, point_labels, box = _prompt_arrays(obj)
            masks, _scores, _ = predictor.predict(
                point_coords=point_coords,
                point_labels=point_labels,
                box=box,
                multimask_output=False,
            )
            # masks: (1, H, W) float/bool — take the single best mask.
            mask = np.asarray(masks[0]).astype(bool)
            results.append({"object_id": obj["object_id"], "mask": mask})
    return h, w, results


def _write_frames(video_bytes: bytes, max_frames: int) -> tuple[str, int, int, int]:
    """Decode a video clip into a temp dir of JPEG frames (SAM 2's video API
    reads a directory of frames). Returns (frames_dir, frame_count, h, w)."""
    import cv2

    tmpdir = tempfile.mkdtemp(prefix="sam2_frames_")
    src = os.path.join(tmpdir, "_source.bin")
    with open(src, "wb") as f:
        f.write(video_bytes)

    cap = cv2.VideoCapture(src)
    count = 0
    h = w = 0
    while count < max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        if h == 0:
            h, w = frame.shape[0], frame.shape[1]
        cv2.imwrite(os.path.join(tmpdir, f"{count:05d}.jpg"), frame)
        count += 1
    cap.release()
    os.remove(src)
    if count == 0:
        raise RuntimeError("No frames could be decoded from the video clip")
    return tmpdir, count, h, w


def propagate_video(
    video_bytes: bytes, objects: list[PromptDict], prompt_frame: int, max_frames: int
):
    """Prompt one frame and propagate masks across the clip.

    Returns (image_height, image_width, [ {frame_index, instances:[{object_id, mask}]} ]).
    """
    import torch

    frames_dir, _frame_count, h, w = _write_frames(video_bytes, max_frames)
    predictor = _video_predictor()

    per_frame: dict[int, list[dict]] = {}
    with torch.inference_mode():
        state = predictor.init_state(video_path=frames_dir)
        for obj in objects:
            point_coords, point_labels, box = _prompt_arrays(obj)
            predictor.add_new_points_or_box(
                inference_state=state,
                frame_idx=prompt_frame,
                obj_id=obj["object_id"],
                points=point_coords,
                labels=point_labels,
                box=box,
            )
        for frame_idx, obj_ids, mask_logits in predictor.propagate_in_video(state):
            instances = []
            for i, obj_id in enumerate(obj_ids):
                mask = (np.asarray(mask_logits[i].cpu()) > 0.0)[0].astype(bool)
                instances.append({"object_id": int(obj_id), "mask": mask})
            per_frame[frame_idx] = instances

    frames = [{"frame_index": idx, "instances": per_frame[idx]} for idx in sorted(per_frame)]
    return h, w, frames
