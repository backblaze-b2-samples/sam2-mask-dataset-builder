import logging

from fastapi import APIRouter

from app.service.datasets import (
    get_dataset_summary,
    list_dataset_files,
    list_runs,
)
from app.types import DatasetSummary, FileMetadata, SegmentationRun

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/runs", response_model=list[SegmentationRun])
async def list_runs_endpoint(limit: int = 100):
    return list_runs(limit=limit)


@router.get("/dataset/summary", response_model=DatasetSummary)
async def dataset_summary_endpoint():
    return get_dataset_summary()


@router.get("/dataset/files", response_model=list[FileMetadata])
async def dataset_files_endpoint(prefix: str = "", limit: int = 1000):
    return list_dataset_files(prefix=prefix, limit=limit)
