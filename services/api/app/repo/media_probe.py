"""Video-probing adapter (repo layer).

This is the ONLY module outside `sam2_engine.py` that imports `cv2`
(OpenCV), keeping the "external SDK lives only in repo/" invariant intact:
the service layer asks for plain video metadata and never sees OpenCV.

The cv2 import is lazy and best-effort — if OpenCV is unavailable or a clip
cannot be decoded, `probe_video` returns an empty dict so ingest never
blocks on metadata extraction.
"""

import logging
import os
import tempfile

logger = logging.getLogger(__name__)


def probe_video(file_data: bytes) -> dict:
    """Best-effort probe of an ingested video clip.

    Returns a plain dict with any of `image_width`, `image_height`,
    `duration_seconds` that could be determined. On any failure (OpenCV
    missing, undecodable clip) returns an empty dict — never raises.
    """
    try:
        import cv2

        fd, path = tempfile.mkstemp(suffix=".bin")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(file_data)
            cap = cv2.VideoCapture(path)
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or None
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or None
            frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or None
            fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
            cap.release()
        finally:
            os.unlink(path)

        result: dict = {}
        if width:
            result["image_width"] = width
        if height:
            result["image_height"] = height
        if frames and fps:
            result["duration_seconds"] = round(frames / fps, 2)
        return result
    except Exception:
        logger.warning("Video metadata probe failed", exc_info=True)
        return {}
