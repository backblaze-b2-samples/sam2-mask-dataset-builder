"""Tests for the dataset service (scoped explorer + footprint summary).

The B2 repo functions are mocked so the suite runs without a live bucket.
"""

from datetime import UTC, datetime

from app.service import datasets as ds
from app.types import FileMetadata, SegmentationRun


def _file(key: str, size: int = 100) -> FileMetadata:
    return FileMetadata(
        key=key,
        filename=key.rsplit("/", 1)[-1],
        folder=key.rsplit("/", 1)[0] + "/",
        size_bytes=size,
        size_human=f"{size} B",
        content_type="application/octet-stream",
        uploaded_at=datetime.now(UTC),
        url=None,
    )


def _run(run_id: str) -> SegmentationRun:
    return SegmentationRun(
        run_id=run_id,
        kind="image",
        source_key="raw/images/cat.png",
        created_at=datetime.now(UTC),
        model_id="facebook/sam2.1-hiera-tiny",
        image_width=16,
        image_height=12,
        mask_count=1,
        run_key=f"datasets/{run_id}/run.json",
    )


def test_get_dataset_summary_computes_growth_ratio(monkeypatch):
    def fake_stats(prefix=""):
        if prefix == "raw/":
            return {"total_size_bytes": 1000}
        return {"total_size_bytes": 2500}

    derived_files = [
        _file("datasets/abc/run.json"),
        _file("datasets/abc/masks/obj_1_mask.png"),
        _file("datasets/abc/cutouts/obj_1.png"),
    ]
    monkeypatch.setattr(ds, "get_upload_stats", fake_stats)
    monkeypatch.setattr(ds, "list_files", lambda prefix, max_keys: derived_files)

    summary = ds.get_dataset_summary()
    assert summary.source_bytes == 1000
    assert summary.derived_bytes == 2500
    assert summary.growth_ratio == 2.5
    assert summary.run_count == 1
    assert summary.mask_count == 1
    assert summary.cutout_count == 1


def test_get_dataset_summary_handles_empty_source(monkeypatch):
    monkeypatch.setattr(ds, "get_upload_stats", lambda prefix="": {"total_size_bytes": 0})
    monkeypatch.setattr(ds, "list_files", lambda prefix, max_keys: [])
    summary = ds.get_dataset_summary()
    assert summary.growth_ratio == 0.0
    assert summary.run_count == 0


def test_list_runs_hydrates_run_json(monkeypatch):
    run = _run("abc123def456")
    files = [
        _file("datasets/abc123def456/run.json"),
        _file("datasets/abc123def456/masks/obj_1_mask.png"),
    ]
    monkeypatch.setattr(ds, "list_files", lambda prefix, max_keys: files)
    monkeypatch.setattr(ds, "download_file", lambda key: run.model_dump_json().encode("utf-8"))

    runs = ds.list_runs()
    assert len(runs) == 1
    assert runs[0].run_id == "abc123def456"


def test_list_runs_skips_malformed_run(monkeypatch):
    files = [_file("datasets/bad/run.json")]
    monkeypatch.setattr(ds, "list_files", lambda prefix, max_keys: files)
    monkeypatch.setattr(ds, "download_file", lambda key: b"{not json")

    runs = ds.list_runs()
    assert runs == []


def test_list_dataset_files_is_scoped_to_prefix(monkeypatch):
    captured = {}

    def fake_list(prefix, max_keys):
        captured["prefix"] = prefix
        return [_file("datasets/abc/run.json")]

    monkeypatch.setattr(ds, "list_files", fake_list)
    ds.list_dataset_files(prefix="abc/")
    assert captured["prefix"] == "datasets/abc/"


def test_list_dataset_files_cannot_escape_dataset_prefix(monkeypatch):
    captured = {}

    def fake_list(prefix, max_keys):
        captured["prefix"] = prefix
        return []

    monkeypatch.setattr(ds, "list_files", fake_list)
    # Leading slash is stripped and re-rooted; can't reach raw/ or the bucket root.
    ds.list_dataset_files(prefix="/raw/")
    assert captured["prefix"].startswith("datasets/")
