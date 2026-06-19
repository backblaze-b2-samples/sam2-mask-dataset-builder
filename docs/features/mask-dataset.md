<!-- last_verified: 2026-06-19 -->
# Feature: Mask Dataset

## Purpose
Persist every segmentation run as a reusable, versioned dataset on B2 — COCO RLE
JSON, binary mask PNGs, transparent cut-outs, and per-run metadata — and expose
a scoped explorer for browsing and downloading those artifacts.

## Used By
- UI: `/dataset` page, `apps/web/src/components/dataset/*`
- API: `GET /runs`, `GET /dataset/summary`, `GET /dataset/files`, plus `GET /files/{key}/download` for presigned artifact downloads and `GET /files/{key}/preview` for inline previews (does not increment the download counter)

## Core Functions
- `services/api/app/service/segmentation.py` — writes artifacts + `run.json` per run
- `services/api/app/service/masks.py` — `encode_rle()`, `encode_mask_png()`, `encode_cutout_png()`, geometry helpers
- `services/api/app/service/datasets.py` — `list_runs()`, `get_dataset_summary()`, `list_dataset_files()` (all scoped to `DATASET_PREFIX`)
- `services/api/app/runtime/datasets.py` — HTTP handlers
- `apps/web/src/components/dataset/dataset-explorer.tsx` — runs list + footprint
- `apps/web/src/components/dataset/run-card.tsx` — per-run inline previews + artifacts + presigned downloads; the composite preview and every per-object thumbnail are clickable buttons that open the lightbox
- `apps/web/src/components/dataset/run-preview.tsx` — `RunPreview` (source + high-contrast mask composite, image runs), `MaskComposite` (the shared spotlight + tint overlay stack), and `PreviewImage` (per-object cut-out/mask thumbnail), all via `usePreviewUrl`
- `apps/web/src/components/dataset/run-lightbox.tsx` — `RunLightbox` click-to-expand dialog: a large composite view (source + the same mask overlay) or a single enlarged asset (cut-out / mask PNG), reusing the shadcn `Dialog`
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
- `/dataset` lists runs (scoped) and shows the footprint card. Expanding a run renders inline visual previews via presigned preview URLs — for image runs, the source with its mask PNGs composited on top (mirrors the Studio canvas); for every run, a per-object cut-out thumbnail (falling back to the mask silhouette when no cut-out was written) — alongside presigned download buttons for its `run.json`, source, RLE, mask PNGs, and cut-outs. Preview URLs are only fetched while a run is expanded.
- **High-contrast mask composite.** The source + mask overlay uses the same two-pass treatment as the Studio canvas. The mask PNG is grayscale ("L": white = inside the segment, black = outside). Pass 1 — **spotlight**, rendered only when a run has exactly one mask instance: the mask drawn with `mix-blend-mode: multiply` at `opacity 0.55`, so white stays neutral (the object keeps full brightness) and black darkens (the background dims). Pass 2 — **tint**, one per instance: the mask drawn with `mix-blend-mode: screen` at `opacity 0.85` and a teal hue-rotate filter, painting each segment a distinct brand color. The spotlight + tint stack lives in `MaskComposite` (`run-preview.tsx`) and is reused verbatim by the lightbox.
- **Click-to-expand lightbox.** In an expanded run, the composite preview and each per-object thumbnail are keyboard-accessible `<button>`s (with `cursor-pointer`) that open a shadcn `Dialog` (`run-lightbox.tsx`). Clicking the composite shows a large view (up to ~85vh) of the source with the identical spotlight/tint overlay; clicking a thumbnail shows that single cut-out or mask PNG enlarged. Lightbox preview URLs are only fetched while the dialog is open.
- The footprint card aggregates `SOURCE_PREFIX` vs `DATASET_PREFIX` byte totals — the headline "raw archive becomes a labeled dataset" metric

## Edge Cases
- Malformed/half-written `run.json` → skipped by `list_runs()` (doesn't break the listing)
- Empty source archive → growth ratio 0.0
- `/dataset/files` prefix with a leading slash → stripped and re-rooted under `DATASET_PREFIX`
- The full bucket (anything outside `datasets/`) is **not** shown here — that's the `/files` explorer

## UX States
- Empty: "No runs yet" with a link to the Studio
- Loading: skeleton rows / metric skeletons; per-image skeletons while preview URLs load, with an image-off placeholder if a preview can't be resolved (the lightbox shows the same skeleton / image-off states)
- Expanded run: the composite preview and per-object thumbnails are clickable (`cursor-pointer`, focusable buttons) and open the larger lightbox view
- Video runs: no source composite (the source isn't a single still frame) — a short note plus per-object cut-out thumbnails are shown instead
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
