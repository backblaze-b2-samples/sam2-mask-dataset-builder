<!-- last_verified: 2026-06-18 -->
# Feature: Mask Dataset

## Purpose
Persist every segmentation run as a reusable, versioned dataset on B2 — COCO RLE
JSON, binary mask PNGs, transparent cut-outs, and per-run metadata — and expose
a scoped explorer for browsing and downloading those artifacts.

## Used By
- UI: `/dataset` page, `apps/web/src/components/dataset/*`
- API: `GET /runs`, `GET /dataset/summary`, `GET /dataset/files`, plus `GET /files/{key}/download` for presigned artifact downloads

## Core Functions
- `services/api/app/service/segmentation.py` — writes artifacts + `run.json` per run
- `services/api/app/service/masks.py` — `encode_rle()`, `encode_mask_png()`, `encode_cutout_png()`, geometry helpers
- `services/api/app/service/datasets.py` — `list_runs()`, `get_dataset_summary()`, `list_dataset_files()` (all scoped to `DATASET_PREFIX`)
- `services/api/app/runtime/datasets.py` — HTTP handlers
- `apps/web/src/components/dataset/dataset-explorer.tsx` — runs list + footprint
- `apps/web/src/components/dataset/run-card.tsx` — per-run artifacts + presigned downloads
- `apps/web/src/components/dataset/footprint-card.tsx` — raw-vs-derived storage growth

## Canonical Files
- Dataset aggregation: `services/api/app/service/datasets.py`
- Mask encoding: `services/api/app/service/masks.py`
- Scoped explorer UI: `apps/web/src/components/dataset/dataset-explorer.tsx`

## B2 dataset layout
```
raw/images/<name>.<ext>                       ingested source images
raw/videos/<name>.<ext>                       ingested source clips
datasets/<run_id>/run.json                    per-run metadata (the run index)
datasets/<run_id>/masks/obj_<id>_rle.json     COCO RLE JSON
datasets/<run_id>/masks/obj_<id>_mask.png     binary mask PNG (0/255)
datasets/<run_id>/cutouts/obj_<id>.png        transparent cut-out (RGBA)
datasets/<run_id>/masks/frames/<n>/...        per-frame masks (video propagation)
```
There is **no application database**. The dataset is its own index: each run
advertises a `run.json`, and `list_runs()` discovers runs by listing those keys
under `DATASET_PREFIX`.

## Inputs
- (list) limit: int
- (files) prefix: string — re-rooted under `DATASET_PREFIX`, cannot escape it
- (download) key: string — validated against path traversal

## Outputs
- `GET /runs` → `SegmentationRun[]` (newest first)
- `GET /dataset/summary` → `DatasetSummary` (run/mask/cut-out counts; source vs derived bytes; growth ratio)
- `GET /dataset/files` → `FileMetadata[]` scoped to `DATASET_PREFIX`
- `GET /files/{key}/download` → `{ url }` presigned (10-min, forced attachment)

## Flow
- A Studio run encodes each object's mask to RLE + PNG (+ cut-out for images) and uploads them, then writes `run.json`
- `/dataset` lists runs (scoped), shows the footprint card, and lets the user expand a run to download its `run.json`, source, RLE, mask PNGs, and cut-outs via presigned URLs
- The footprint card aggregates `SOURCE_PREFIX` vs `DATASET_PREFIX` byte totals — the headline "raw archive becomes a labeled dataset" metric

## Edge Cases
- Malformed/half-written `run.json` → skipped by `list_runs()` (doesn't break the listing)
- Empty source archive → growth ratio 0.0
- `/dataset/files` prefix with a leading slash → stripped and re-rooted under `DATASET_PREFIX`
- The full bucket (anything outside `datasets/`) is **not** shown here — that's the `/files` explorer

## UX States
- Empty: "No runs yet" with a link to the Studio
- Loading: skeleton rows / metric skeletons
- Error: inline `ErrorState` with retry

## Verification
- Test files: `services/api/tests/test_datasets.py`, `services/api/tests/test_segmentation.py`, `services/api/tests/test_masks.py`
- Required cases: footprint/growth-ratio computation, empty source, run hydration, malformed-run skip, scoped-prefix re-rooting, artifact write
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green, no ruff violations

## Related Docs
- [Segmentation Studio](segmentation.md)
- [File Browser](file-browser.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
