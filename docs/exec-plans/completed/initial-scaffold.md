# Scaffold plan — `sam2-mask-dataset-builder`

> Source of truth for the starter tree: `.claude/scratch/vcsk-2078275a-cd27-4420-b101-255f6582f927/`
> (fresh `vibe-coding-starter-kit` clone, git history stripped). Delta below is computed against that tree.
> Parent standards: `../CLAUDE.md` (S3-only, custom UA, standardized `B2_*` names).

## 1. Purpose

`sam2-mask-dataset-builder` is a B2-backed segmentation-dataset factory for ML engineers and dataset
builders. Source images and video clips live in B2 as a raw media archive. A lightweight studio UI lets a
user place **click or box prompts** on an image (or the first frame of a video); **Meta's Segment Anything 2
(SAM 2) runs locally** — predicting masks per prompt for images and propagating them across frames for video.
Every run writes its derived artifacts — COCO **RLE JSON**, **binary mask PNGs**, transparent **cut-out
instances**, and per-run/per-frame **metadata** — back to B2 alongside the source media. The result is a
reusable, versioned mask dataset that downstream training pipelines or annotation reviewers read straight off
B2 via presigned URLs. The headline B2 story: **one raw image archive becomes a multi-layer labeled dataset
whose derived footprint matches or exceeds the originals** — and it runs on local OSS with **no second API
key, B2 credentials only**.

## 2. Architecture delta from `vibe-coding-starter-kit`

The starter kit is the ceiling. We strip what a segmentation builder doesn't need and add the SAM 2 surface.

### KEEP (as-is, do not strip/rename/replace)
- Entire **UI kit** `apps/web/src/components/ui/*`, design tokens in `globals.css`, the `/design` page and its `components/design/*`. (Starter contract — non-negotiable.)
- **Upload** page/route (`/upload`, `app/upload/`, `components/upload/*`) — this *is* the **Ingest** step. Reframed in copy as "ingest source media", same machinery.
- **File Explorer** (`/files`, `app/files/`, `components/files/*`) — the **full-bucket browse** view. **Non-negotiable keep** per skill contract: it stays as the unscoped bucket explorer.
- Layout shell: `components/layout/*` (sidebar, header, health-banner, theme-provider, command-palette).
- Backend **layered architecture** (`types->config->repo->service->runtime`) and its structural tests. The `repo/b2_client.py` S3 wrapper and `runtime/{files,upload,health,metrics}.py`, `service/{files,upload}.py`, `types/{files,upload,stats,formatting}.py`.
- Frontend data layer pattern: `lib/api-client.ts`, `lib/queries.ts` (TanStack Query), `lib/refresh-context.tsx`, error/empty states.
- Observability (`/health`, `/metrics`, JSON logging), startup validation, `scripts/{dev.sh,pick-port.mjs,doctor.mjs}`, pre-commit, Railway infra docs (renamed), the agent-first doc system.

### ADD (new for this sample)
- **Backend — SAM 2 engine adapter (repo layer):** `services/api/app/repo/sam2_engine.py`. The ONLY place `torch` / `sam2` are imported — mirrors the "external SDK only in repo/" invariant (same rule that confines boto3). Lazy-loads the model on first use (server start stays fast; `/health` never loads it). Exposes `segment_image(image_bytes, prompts) -> list[mask arrays]` and `propagate_video(frames_dir, prompts) -> per-frame masks`. Model id from env `SAM2_MODEL_ID`, default `facebook/sam2.1-hiera-tiny` (smallest, CPU-runnable); loaded via the sam2 package's `from_pretrained` (HuggingFace Hub, **public + keyless**). If file approaches 300 lines, split image vs video into `sam2_engine.py` + `sam2_video.py`.
- **Backend — mask encoding (service helper):** COCO RLE via `pycocotools`, binary mask PNG + transparent cut-out via Pillow. Pure-compute helper in `service/masks.py` — no SDK; keep <300 lines.
- **Backend — segmentation service:** `services/api/app/service/segmentation.py` — orchestrates a run: fetch source from B2 (repo `download_file`), run engine, encode masks, write artifacts to B2 (repo `upload_file`), assemble typed run metadata. Writes `run.json` + `masks/` + `cutouts/` (+ `frames/` for video) under `datasets/<run_id>/`.
- **Backend — dataset service:** `services/api/app/service/datasets.py` — lists/aggregates the derived dataset scoped to the `datasets/` prefix (runs, mask counts, raw-vs-derived footprint). Powers the scoped explorer + dashboard.
- **Backend — repo additions:** add `download_file(key) -> bytes` (S3 `get_object`) to `repo/b2_client.py` (engine needs source bytes). `list_files`/`get_upload_stats` already accept a prefix — reuse for scoping.
- **Backend — new routes:** `services/api/app/runtime/segmentation.py` (`POST /segment/image`, `POST /segment/video`, `GET /runs`, `GET /runs/{run_id}`). Register in `main.py`.
- **Backend — new types:** `types/segmentation.py` — `PointPrompt`/`BoxPrompt`, `SegmentRequest`, `MaskInstance`, `SegmentationRun`, `DatasetSummary`. Mirror into `packages/shared/src/types.ts`.
- **Frontend — Studio page (the Prompt + Segment step):** new `/studio` route (`app/studio/`, `components/studio/*`). Pick a source image from B2; place foreground/background **click points** and **box** prompts on an overlay over the image; POST to `/segment/image`; render returned masks as semi-transparent overlays; "Save to dataset" persists to B2. **Image is the primary, fully-built interactive path.** Video: the page accepts a video, shows its first frame for prompting, and calls `/segment/video` (propagation); UI may present video results as a frame strip. Mark video clearly as the heavier, GPU-recommended path in copy.
- **Frontend — Mask Dataset explorer (scoped asset explorer, REQUIRED ADD):** new `/dataset` route (`app/dataset/`, `components/dataset/*`) — a view **scoped to the `datasets/` prefix** showing runs grouped, with each run's source thumbnail, masks/cut-outs, and presigned download links. This is the sample-specific explorer that sits *alongside* the kept full-bucket `/files` view.
- **Frontend — sidebar:** add **Studio** and **Dataset** nav entries; keep Dashboard, Upload, Files, Settings, Design System. Rebrand header label `OSS Starter Kit` -> `SAM 2 Masks`.
- **Frontend — queries/client:** add `segmentImage`, `segmentVideo`, `getRuns`, `getRun`, `getDatasetSummary` to `api-client.ts` + matching hooks in `queries.ts` (no bare `useEffect+fetch`).
- **Dataset layout on B2** (the storytelling core):
  - `raw/images/<name>.<ext>`, `raw/videos/<name>.<ext>` — ingested source (Upload writes here)
  - `datasets/<run_id>/run.json` — per-run metadata
  - `datasets/<run_id>/masks/<obj>_rle.json`, `.../masks/<obj>_mask.png`
  - `datasets/<run_id>/cutouts/<obj>.png`
  - `datasets/<run_id>/frames/<frame>/<obj>_mask.png` — video propagation
  - `SOURCE_PREFIX` (default `raw/`) and `DATASET_PREFIX` (default `datasets/`) are settings.

### TRIM (remove from starter)
- **PDF metadata extraction**: drop `_extract_pdf_metadata` from `service/metadata.py`, the PDF fields from `FileMetadataDetail` / shared types, and `PyPDF2` from `requirements.txt`. A segmentation dataset has no PDFs. Keep image metadata (width/height/EXIF). (Light trim; keep the feature, drop the PDF branch.)
- **Dashboard defaults**: the starter dashboard is *adapted*, not kept verbatim — see ADAPT. Old `components/dashboard/*` get repurposed.
- Nothing else removed — the starter is already lean.

### ADAPT (rewrite for the use case)
- **Dashboard `/`**: replace generic metrics with segmentation metrics — **segmentation runs**, **total masks generated**, **cut-out instances**, and the killer card: **raw archive footprint vs derived dataset footprint** (bytes + ratio), plus a recent-runs table. New aggregations flow through `runtime->service(datasets)->repo` and are exposed via TanStack Query hooks (no bare fetch). Reuse the existing stats-card / chart / table primitives.
- **Settings**: keep; optionally surface `SAM2_MODEL_ID` / prefixes as read-only info.

## 3. B2 surface (S3-compatible only — Standard #1)

| Operation | S3 call | Where |
|-----------|---------|-------|
| Ingest source media | put_object | upload flow |
| Read source for segmentation | get_object (**new** download_file) | segmentation service via repo |
| Write masks / cut-outs / run.json | put_object | segmentation service via repo |
| Browse bucket / dataset | list_objects_v2 (with Prefix) | files + datasets services |
| Object metadata | head_object | files service |
| Download links | generate_presigned_url (GET, 10-min, forced attachment) | files/dataset |
| Delete | delete_object | files service |

**No b2-native API anywhere.** Custom user agent `b2ai-sam2-mask-builder` set on the single boto3 S3 client
(Standard #2). All S3 access stays inside `repo/b2_client.py` (structural test enforced).

## 4. Key features (seed README + docs/features/* stubs)

1. **Ingest** — drag-and-drop source images/video into B2 as the raw media archive (`raw/`). *(adapts file-upload)*
2. **Promptable segmentation studio** — click-point and box prompts on an image/first frame; SAM 2 predicts masks locally. *(new: docs/features/segmentation.md)*
3. **Video mask propagation** — prompt the first frame; SAM 2 propagates masks across frames. *(in segmentation.md; GPU-recommended)*
4. **Mask dataset writeback** — RLE JSON + mask PNGs + cut-out instances + per-run metadata written to B2. *(new: docs/features/mask-dataset.md)*
5. **Scoped dataset explorer** — browse derived runs and download artifacts via presigned URLs. *(in mask-dataset.md)*
6. **Footprint dashboard** — raw-vs-derived storage growth, runs, masks. *(adapts dashboard.md)*

**External API provider:** NONE. SAM 2 runs locally; weights download from HuggingFace Hub (public, keyless).
No second API key, no provider cost — **B2 credentials only**. (`api-provider-selection.md` not needed.)

## 5. Doc transforms

| Starter doc | Action |
|-------------|--------|
| README.md | **Rewrite** for the SAM 2 sample (purpose, 5-step workflow, SAM 2 model setup + GPU note, B2 footprint story, quick start). |
| AGENTS.md | **Adapt** repo map, "building on" note, canonical files; **keep** invariants; note `torch`/`sam2` confined to `repo/`. |
| ARCHITECTURE.md | **Rewrite** components, data flows (ingest->prompt->segment->write->browse), add sam2 engine repo adapter + B2 prefix layout. |
| docs/features/file-upload.md | **Adapt** -> Ingest framing. |
| docs/features/file-browser.md | **Keep**, light edit (full-bucket vs scoped dataset explorer note). |
| docs/features/dashboard.md | **Rewrite** for segmentation/footprint metrics. |
| docs/features/metadata-extraction.md | **Adapt** — drop PDF, keep image/video metadata. |
| docs/features/segmentation.md | **New stub** — prompts, image + video paths, model, outputs. |
| docs/features/mask-dataset.md | **New stub** — dataset layout on B2, RLE/PNG/cut-out artifacts, scoped explorer, presigned access. |
| docs/app-workflows.md | **Rewrite** user journeys. |
| docs/dev-workflows.md | **Adapt** — add SAM 2 model setup, CPU vs GPU, frame extraction. |
| docs/design-system.md | **Keep** as-is. |
| docs/SECURITY.md | **Adapt** — prompt-input validation, key prefix allowlist, presigned expiry, model-download trust, no second key. |
| docs/RELIABILITY.md | **Adapt** — model load failure, large/long video handling, partial-run handling. |
| docs/exec-plans/completed/* | Leave starter's historical plans; Phase 5 drops this plan into completed/initial-scaffold.md. |

## 6. Rename table (vibe-coding-starter-kit -> sam2-mask-dataset-builder)

| Kind | From | To |
|------|------|----|
| kebab / dir / repo | vibe-coding-starter-kit | sam2-mask-dataset-builder |
| root pkg name | vibe-coding-starter-kit | sam2-mask-dataset-builder |
| npm workspace scope | @vibe-coding-starter-kit/web, @vibe-coding-starter-kit/shared | @sam2-mask-dataset-builder/web, @sam2-mask-dataset-builder/shared |
| Title Case (docs/README) | "Vibe Coding Starter Kit" / "OSS Starter Kit" | "SAM 2 Mask Dataset Builder" |
| sidebar header label | OSS Starter Kit | SAM 2 Masks |
| FastAPI title (main.py) | "OSS Starter Kit API" | "SAM 2 Mask Dataset Builder API" |
| custom user agent (user_agent_extra) | b2ai-oss-start | b2ai-sam2-mask-builder |
| UTM utm_content (README, sidebar, doctor) | b2ai-oss-start | b2ai-sam2-mask-builder |
| all `pnpm --filter @vibe-coding-starter-kit/...` | old scope | new scope |

Builder must `grep -rn "vibe-coding-starter-kit|OSS Starter Kit|b2ai-oss-start"` after renaming and confirm zero stragglers (except inside this plan / historical exec-plans).

### Env var standardization (Standard #3) — required rename
Starter uses `B2_ENDPOINT`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_PUBLIC_URL`. Migrate to the standard set:

| From | To |
|------|----|
| B2_KEY_ID | B2_APPLICATION_KEY_ID |
| B2_APPLICATION_KEY | (keep) |
| B2_BUCKET_NAME | (keep) |
| B2_PUBLIC_URL | B2_PUBLIC_URL_BASE |
| *(add)* | B2_REGION (e.g. us-west-004) |
| B2_ENDPOINT | keep as **optional** override; default endpoint derived `https://s3.{B2_REGION}.backblazeb2.com` |

Touch points: `services/api/app/config/settings.py` (fields + computed `endpoint` property, pass `region_name`),
`services/api/main.py` (REQUIRED_B2_SETTINGS, placeholder set), `scripts/doctor.mjs` (REQUIRED_B2_VARS,
PLACEHOLDERS), `.env.example`, README setup. New app env vars: `SAM2_MODEL_ID`, `SOURCE_PREFIX`,
`DATASET_PREFIX` (sane defaults; documented in .env.example).

## 7. Dependencies

Add to `services/api/requirements.txt`: `torch>=2.5.1`, `torchvision`, `sam2` (install from
`git+https://github.com/facebookresearch/sam2.git` if no PyPI wheel — pin with a comment), `huggingface_hub`,
`pycocotools`, `numpy`, `opencv-python-headless` (video->frames). Remove `PyPDF2`. Keep Pillow, python-magic.
README must state: **GPU recommended; CPU works for images (slower); default model `sam2.1-hiera-tiny`;
weights auto-download from HF on first run.**

## 8. Invariants the builder MUST keep green
- `tests/test_structure.py`: layers exist + `__init__.py`; no backward imports; **boto3 only in repo/** (keep `torch`/`sam2` in repo/ too); every `app/**.py` < 300 lines (split engine/service files if needed).
- Add/adapt tests for new behavior (segmentation service, dataset listing, mask encoding) — mock the SAM 2 engine and B2 in unit tests so `pnpm test:api` runs without a GPU or live B2.
- New endpoints touch exactly three FE files: `runtime/<router>.py`, `lib/api-client.ts`, `lib/queries.ts`.
- Run `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure` before declaring done. (If heavy deps like torch won't install in the build sandbox, still make the *structural* tests pass and clearly note any test that could not be executed — never silently skip.)

## 9. Out of scope
Real model download / GPU inference during scaffold (that's the later verify step); training pipelines;
auth/multi-tenant; non-S3 B2 APIs.
