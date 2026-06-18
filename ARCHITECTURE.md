<!-- last_verified: 2026-06-18 -->
# Architecture

## Components

- **apps/web/** — Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
  - Dashboard with run/mask counts and the raw-vs-derived footprint card
  - Ingest (Upload) with drag-and-drop into the B2 `raw/` archive
  - **Studio** — interactive click/box prompting over a source image, local SAM 2
  - **Dataset** — scoped explorer for derived runs under `datasets/`
  - File browser (full bucket) with preview, download, delete
  - Dark mode via `next-themes`
- **services/api/** — FastAPI backend (layered architecture)
  - REST API for ingest, segmentation, run listing, dataset summary, file ops
  - B2 S3 integration via boto3 (`repo/b2_client.py`)
  - **SAM 2 engine adapter** (`repo/sam2_engine.py`) — the only place `torch`/`sam2` are imported
  - Mask encoding (RLE/PNG/cut-out) as a pure-compute service helper
  - Health check, structured JSON logging, Prometheus-format metrics
- **packages/shared/** — TypeScript type definitions mirroring the Pydantic models

## Backend Layering

The API follows a strict layered architecture:

```
types/     Pydantic models — no logic, no imports from other layers
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      External SDK adapters: boto3 (b2_client) + torch/sam2 (sam2_engine)
  |
service/   Business logic — calls repo, returns types
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types` -> `config` -> `repo` -> `service` -> `runtime`
2. No backward imports (e.g., service must not import from runtime)
3. **External SDKs are confined to `repo/`**: `boto3` AND `torch`/`sam2` live only there
4. All boundary data uses Pydantic models (no raw dicts across layers)
5. Each file stays under 300 lines

### Directory Structure

```
services/api/
  main.py                  App entrypoint, middleware, router registration
  app/
    types/                 Pydantic models (files, segmentation, stats, formatting)
    config/                Settings loaded from environment
    repo/                  b2_client.py (S3) + sam2_engine.py (SAM 2)
    service/               upload, files, metadata, masks, segmentation, datasets
    runtime/               FastAPI route handlers
  tests/                   pytest tests (structural + unit, SAM 2 + B2 mocked)
```

## The SAM 2 engine adapter

`app/repo/sam2_engine.py` is the **only** module that imports `torch` / `sam2`,
mirroring the "external SDK only in `repo/`" invariant that also confines
`boto3`. A structural test enforces this. The adapter:

- **Lazy-loads** the model on first use (`functools.lru_cache`) so server start
  stays fast and `/health` never pulls weights.
- Loads via the sam2 package's `from_pretrained` — weights come from the public
  HuggingFace Hub (no API key). Model id from `SAM2_MODEL_ID`.
- Returns plain NumPy boolean mask arrays, so every higher layer stays free of
  torch/sam2. Mask encoding (`service/masks.py`) and orchestration
  (`service/segmentation.py`) operate on those arrays only.

## Boundary Invariants

- **No external SDK leakage**: `boto3` and `torch`/`sam2` are imported only in
  `app/repo/`. Other layers interact through the repo interface (typed/NumPy).
- **No raw dicts at boundaries**: data crossing layer boundaries uses Pydantic models.
- **No mutable globals**: configuration is read-only after init.
- **Validated inputs**: HTTP inputs validated by FastAPI/Pydantic; source keys
  validated against path traversal and the `SOURCE_PREFIX` allowlist.

## Data Stores

- **Backblaze B2** — object storage (S3-compatible API). No application database.
  B2 is the sole data store: source media and every derived artifact live there,
  and the dataset *is* its own index (each run advertises a `run.json`).

### B2 prefix layout

```
raw/images/<name>.<ext>                       ingested source images
raw/videos/<name>.<ext>                       ingested source clips
datasets/<run_id>/run.json                    per-run metadata (the run index)
datasets/<run_id>/masks/obj_<id>_rle.json     COCO RLE JSON
datasets/<run_id>/masks/obj_<id>_mask.png     binary mask PNG
datasets/<run_id>/cutouts/obj_<id>.png        transparent cut-out
datasets/<run_id>/masks/frames/<n>/...        per-frame masks (video propagation)
```

`SOURCE_PREFIX` (default `raw/`) and `DATASET_PREFIX` (default `datasets/`) are settings.

## External Services

- **Backblaze B2 S3 API** — source + derived storage, presigned download URLs
- **HuggingFace Hub** — public, keyless SAM 2 weight download on first inference

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md) for full security documentation.

- **Frontend -> API** — CORS-restricted to configured origins
- **API -> B2** — authenticated via application keys, signature v4
- **Client -> B2** — presigned URLs for download (10-min expiry, forced attachment)
- **API -> HuggingFace Hub** — read-only model download (verify `SAM2_MODEL_ID`)

## Data Flows

- **Ingest**: Browser -> `POST /upload` (multipart) -> service validates ->
  repo writes to B2 under `raw/{images,videos}/` -> metadata extracted -> response
- **Segment (image)**: Browser -> `POST /segment/image` (`source_key` + prompts) ->
  service downloads source from B2 -> `sam2_engine.segment_image` (local) ->
  `masks.*` encode RLE/PNG/cut-out -> repo writes artifacts + `run.json` under
  `datasets/<run_id>/` -> typed `SegmentationRun` returned
- **Segment (video)**: as above via `POST /segment/video`; SAM 2 propagates the
  prompt frame's masks across frames; per-frame masks written under `frames/`
- **List runs**: Browser -> `GET /runs` -> dataset service lists `run.json` keys
  under `DATASET_PREFIX` and hydrates them
- **Footprint**: Browser -> `GET /dataset/summary` -> dataset service aggregates
  `SOURCE_PREFIX` vs `DATASET_PREFIX` byte totals and run/mask/cut-out counts
- **Download**: Browser -> `GET /files/{key}/download` -> repo presigns a GET URL

## Observability

- Structured JSON logging on all requests with `request_id`
- Request timing middleware; `/metrics` (Prometheus format)
- `/health` (B2 connectivity check — never loads the SAM 2 model)

## Canonical Files

- SAM 2 engine adapter (repo layer): `services/api/app/repo/sam2_engine.py`
- B2 data access (repo layer): `services/api/app/repo/b2_client.py`
- Mask encoding (pure compute): `services/api/app/service/masks.py`
- Run orchestration: `services/api/app/service/segmentation.py`
- Dataset aggregation: `services/api/app/service/datasets.py`
- Segmentation routes: `services/api/app/runtime/segmentation.py`
- Pydantic models: `services/api/app/types/` (`segmentation.py`, `files.py`, `stats.py`)
- Config (pydantic-settings): `services/api/app/config/settings.py`
- Structural tests: `services/api/tests/test_structure.py`
- Frontend API client: `apps/web/src/lib/api-client.ts`
- Shared TypeScript types: `packages/shared/src/types.ts`

## Core Features

- [Ingest](docs/features/file-upload.md)
- [Segmentation Studio](docs/features/segmentation.md)
- [Mask Dataset](docs/features/mask-dataset.md)
- [Dashboard](docs/features/dashboard.md)
- [File Browser](docs/features/file-browser.md)
- [Metadata Extraction](docs/features/metadata-extraction.md)

## References

- [docs/SECURITY.md](docs/SECURITY.md) — security principles and implementation
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — reliability expectations
- [AGENTS.md](AGENTS.md) — architectural invariants and agent instructions
