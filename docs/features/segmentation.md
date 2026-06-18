<!-- last_verified: 2026-06-18 -->
# Feature: Segmentation Studio

## Purpose
Run Meta's Segment Anything 2 (SAM 2) **locally** against a source image (or
video clip) in B2, driven by interactive click and box prompts, and produce
boolean masks per object.

## Used By
- UI: `/studio` page, `apps/web/src/components/studio/*`
- API: `POST /segment/image`, `POST /segment/video`, `GET /runs/{run_id}`

## Core Functions
- `apps/web/src/components/studio/segmentation-studio.tsx` — orchestrates source pick + prompts + run
- `apps/web/src/components/studio/prompt-canvas.tsx` — click/box overlay in image-pixel coordinates, mask overlays
- `apps/web/src/components/studio/source-picker.tsx` — lists the `raw/` ingest archive
- `apps/web/src/lib/api-client.ts` — `segmentImage()`, `segmentVideo()`, `getRun()`
- `apps/web/src/lib/queries.ts` — `useSegmentImage()`, `useSegmentVideo()`, `useRun()`
- `services/api/app/runtime/segmentation.py` — HTTP handlers
- `services/api/app/service/segmentation.py` — run orchestration (fetch -> engine -> encode -> write)
- `services/api/app/repo/sam2_engine.py` — **the only torch/sam2 importer**; image + video inference
- `services/api/app/service/masks.py` — RLE/PNG/cut-out encoding (pure compute)

## Canonical Files
- SAM 2 engine adapter: `services/api/app/repo/sam2_engine.py`
- Run orchestration: `services/api/app/service/segmentation.py`
- Interactive canvas: `apps/web/src/components/studio/prompt-canvas.tsx`

## Inputs
- source_key: string — an object under `SOURCE_PREFIX` (default `raw/`)
- objects: `ObjectPrompt[]` — each with foreground/background `points` and/or a `box`, in source-image pixel coordinates
- (video) prompt_frame: int (default 0), max_frames: int (default 60)

## Outputs
- `SegmentationRun` — run_id, kind, source_key, model_id, image dimensions, and
  `MaskInstance[]` (image) or `FrameMasks[]` (video). See [Mask Dataset](mask-dataset.md) for the B2 artifacts written.
- Side effects: derived artifacts + `run.json` written under `datasets/<run_id>/`

## Flow
- User picks a source image from the `raw/` picker; the page fetches a presigned preview URL
- User selects a mode (include point / exclude point / box) and clicks on the image; clicks are mapped to image-pixel coordinates
- "Segment & save" POSTs `{ source_key, objects }` to `/segment/image`
- API downloads the source bytes from B2 (repo), runs `sam2_engine.segment_image` locally, encodes masks, writes artifacts + `run.json` to B2, returns the typed run
- The UI overlays the returned mask PNGs (presigned) over the source and links to the dataset explorer
- **Video**: the page calls `/segment/video`; SAM 2 propagates the prompt frame's masks across frames. Heavier — GPU recommended. The UI surfaces the prompt frame's masks as a preview.

## The model
- `SAM2_MODEL_ID` (default `facebook/sam2.1-hiera-tiny`) is loaded lazily on first
  inference via `from_pretrained`; weights download from the public HuggingFace
  Hub (no API key). `/health` never loads the model.
- CUDA is used automatically when available, else CPU.

## Edge Cases
- source_key outside `SOURCE_PREFIX` → 400 (prevents segmenting arbitrary keys)
- source_key with path-traversal patterns → 400
- No prompts → the Studio disables the run button; the API requires ≥1 object
- Model load failure / corrupt media → 500 with a logged error (run not saved)
- Video with zero decodable frames → 500

## UX States
- Empty: "Pick a source image to start prompting."
- Loading: skeleton while the preview URL loads; "Segmenting..." while inference runs
- Error: toast with the API detail
- Saved: an inline alert with the run id and a link to `/dataset`

## Verification
- Test files: `services/api/tests/test_segmentation.py`, `services/api/tests/test_masks.py`
- Required cases: image run writes artifacts + run.json, prefix/traversal rejection, run read-back, missing run, mask geometry/encoding
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green (SAM 2 + B2 mocked), no ruff violations

## Related Docs
- [Mask Dataset](mask-dataset.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [App Workflows](../app-workflows.md)
