import logging

from fastapi import APIRouter, HTTPException

from app.service.segmentation import (
    SegmentationError,
    get_run,
    segment_image,
    segment_video,
)
from app.types import SegmentationRun, SegmentImageRequest, SegmentVideoRequest

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/segment/image", response_model=SegmentationRun)
async def segment_image_endpoint(req: SegmentImageRequest):
    try:
        run = segment_image(req.source_key, req.objects)
    except SegmentationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None
    except RuntimeError as e:
        logger.error("Image segmentation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) from None
    logger.info(
        "Segmentation run created: run_id=%s kind=image masks=%d",
        run.run_id,
        run.mask_count,
    )
    return run


@router.post("/segment/video", response_model=SegmentationRun)
async def segment_video_endpoint(req: SegmentVideoRequest):
    try:
        run = segment_video(req.source_key, req.objects, req.prompt_frame, req.max_frames)
    except SegmentationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None
    except RuntimeError as e:
        logger.error("Video propagation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) from None
    logger.info(
        "Segmentation run created: run_id=%s kind=video masks=%d",
        run.run_id,
        run.mask_count,
    )
    return run


@router.get("/runs/{run_id}", response_model=SegmentationRun)
async def get_run_endpoint(run_id: str):
    try:
        run = get_run(run_id)
    except SegmentationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return run
