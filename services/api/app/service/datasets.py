"""Dataset service — the scoped view of derived segmentation runs.

Powers the /dataset explorer and the footprint dashboard. Everything here is
restricted to the DATASET_PREFIX (derived artifacts) and the SOURCE_PREFIX
(raw media); it never browses the whole bucket — that's the /files explorer.
"""

import json

from app.config import settings
from app.repo import download_file, get_upload_stats, list_files
from app.types import DatasetSummary, FileMetadata, SegmentationRun
from app.types.formatting import humanize_bytes


def list_dataset_files(prefix: str = "", limit: int = 1000) -> list[FileMetadata]:
    """List derived artifacts under DATASET_PREFIX (optionally a sub-prefix).

    The given `prefix` is always re-rooted under DATASET_PREFIX so the scoped
    explorer can never escape into the rest of the bucket.
    """
    scoped = settings.dataset_prefix + prefix.lstrip("/")
    files = list_files(prefix=scoped, max_keys=limit)
    files.sort(key=lambda f: f.uploaded_at, reverse=True)
    return files[:limit]


def list_runs(limit: int = 100) -> list[SegmentationRun]:
    """Discover runs by reading every run.json under DATASET_PREFIX.

    B2 has no application database, so the dataset *is* the index: each run
    advertises itself via its run.json. We list once, pick the run.json keys,
    and hydrate them.
    """
    files = list_files(prefix=settings.dataset_prefix, max_keys=1000)
    run_keys = [
        f.key
        for f in files
        if f.key.endswith("/run.json") and f.key.startswith(settings.dataset_prefix)
    ]
    runs: list[SegmentationRun] = []
    for key in run_keys[:limit]:
        try:
            body = download_file(key)
            runs.append(SegmentationRun(**json.loads(body)))
        except (RuntimeError, ValueError, KeyError):
            # A half-written or malformed run shouldn't break the listing.
            continue
    runs.sort(key=lambda r: r.created_at, reverse=True)
    return runs


def get_dataset_summary() -> DatasetSummary:
    """Aggregate the killer storytelling metric: raw archive footprint vs the
    derived dataset footprint, plus run / mask / cut-out counts."""
    source = get_upload_stats(prefix=settings.source_prefix)
    derived = get_upload_stats(prefix=settings.dataset_prefix)

    derived_files = list_files(prefix=settings.dataset_prefix, max_keys=1000)
    run_count = sum(1 for f in derived_files if f.key.endswith("/run.json"))
    mask_count = sum(1 for f in derived_files if f.key.endswith("_mask.png"))
    cutout_count = sum(1 for f in derived_files if "/cutouts/" in f.key and f.key.endswith(".png"))

    source_bytes = source["total_size_bytes"]
    derived_bytes = derived["total_size_bytes"]
    ratio = (derived_bytes / source_bytes) if source_bytes else 0.0

    return DatasetSummary(
        run_count=run_count,
        mask_count=mask_count,
        cutout_count=cutout_count,
        source_bytes=source_bytes,
        source_human=humanize_bytes(source_bytes),
        derived_bytes=derived_bytes,
        derived_human=humanize_bytes(derived_bytes),
        growth_ratio=round(ratio, 3),
    )
