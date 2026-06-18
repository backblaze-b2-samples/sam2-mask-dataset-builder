<!-- last_verified: 2026-06-18 -->
# AGENTS.md

This is the authoritative control surface for all coding agents. Read this first.

## 1. Repository Map

```
apps/web/          Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
                     /studio   — promptable SAM 2 segmentation (the primary feature)
                     /dataset  — scoped explorer for derived runs (datasets/)
                     /files    — full-bucket File Explorer (kept from the starter kit)
services/api/      FastAPI backend (layered: types/config/repo/service/runtime)
                     repo/sam2_engine.py — SAM 2 adapter (only torch/sam2 importer)
packages/shared/   Shared TypeScript types
docs/              System of record (features, workflows, security, reliability)
docs/exec-plans/   Execution plans and tech debt tracker
infra/railway/     Deployment config
```

This app is built on the Backblaze B2 **vibe-coding-starter-kit**. The sections
below describe what was kept from that starter contract vs adapted/added here.

## 2. Kept from the starter kit vs this app

**Kept as-is (do not strip, rename, or replace)**
- **UI kit / design system.** `apps/web/src/components/ui/` (shadcn primitives), the design tokens in `apps/web/src/app/globals.css`, and the `/design` reference page. Build new screens with these primitives; never edit the generated `components/ui/` files directly. Restyling happens through tokens in `globals.css`.
- **File Explorer.** `/files` route, `apps/web/src/app/files/`, and `apps/web/src/components/files/` — the **full-bucket** browse view. The Files sidebar entry stays. The `/dataset` explorer is a *separate, scoped* view; it does not replace `/files`.
- **Ingest (Upload).** `/upload` route, `apps/web/src/app/upload/`, and `apps/web/src/components/upload/`. Reframed in copy as "ingest source media" (writes to `raw/`), same machinery. The Upload sidebar entry stays.
- The layered backend (`types/config/repo/service/runtime`) and its structural tests.

**This app's surface (added / adapted)**
- **Studio** (`/studio`) — the primary, fully-built interactive feature: click/box prompts over a source image, local SAM 2, save to dataset. Video is the heavier propagation path.
- **Dataset** (`/dataset`) — scoped explorer + footprint, restricted to `DATASET_PREFIX`.
- **Dashboard** (`/`) — rewritten for segmentation metrics (runs, masks, cut-outs, raw-vs-derived footprint). New aggregations flow through `runtime -> service(datasets) -> repo` and TanStack Query hooks in `apps/web/src/lib/queries.ts` — no bare `useEffect + fetch`. Update `docs/features/dashboard.md` in the same PR as any dashboard change (see §9).

## 3. Architectural Invariants

**Backend layering**: `types` -> `config` -> `repo` -> `service` -> `runtime`

- No backward imports across layers
- **No external SDK outside `repo/`**: this means `boto3`/`botocore`, `torch`/`sam2`, and `cv2`/opencv. The SAM 2 model is loaded and run only in `app/repo/sam2_engine.py`; it returns plain NumPy mask arrays so the service/runtime layers never see torch. OpenCV video probing lives in `app/repo/media_probe.py` and returns a plain dict so `service/metadata.py` never imports cv2. The structural test `test_external_sdks_only_in_repo` mechanically enforces this boundary for all four packages.
- No business logic in route handlers (`runtime/`)
- All external APIs wrapped in `repo/` adapters
- All request/response data validated at boundary (Pydantic models)
- No shared mutable state across layers

**Frontend**: shadcn/ui components in `src/components/ui/` are generated — never modify them.

**Data fetching**: every API call flows through TanStack Query hooks in `apps/web/src/lib/queries.ts`. No bare `useEffect + fetch` patterns. New endpoints touch three files: `runtime/<router>.py`, `lib/api-client.ts`, `lib/queries.ts`.

## 4. Quality Expectations

- **DRY** — do not duplicate logic, types, or constants. Extract shared code only when used in 2+ places.
- Structured JSON logging only — no `print()` statements
- No raw SDK calls outside `repo/` layer
- Files stay under 300 lines
- Tests added or updated for every behavior change
- Docs updated in same PR as code changes
- Lint clean before merge
- Prefer boring, composable libraries over clever abstractions
- No implicit type assumptions — use typed models

## 5. Mechanical Enforcement

| Rule | Enforced by |
|------|-------------|
| No backward imports | `tests/test_structure.py::test_no_backward_imports` |
| No external SDK outside repo/ (boto3, torch, sam2, cv2/opencv) | `tests/test_structure.py::test_external_sdks_only_in_repo` |
| File size < 300 lines (split engine/service if needed) | `tests/test_structure.py::test_file_size_limits` |
| All layers exist | `tests/test_structure.py::test_all_layers_exist` |
| No bare print() | `ruff` rule T20 |
| Import ordering | `ruff` rule I001 |
| Frontend strict equality | `eslint` rule eqeqeq |
| No unused vars | `eslint` + `ruff` rules |

## 6. Commands

```bash
# Run
pnpm dev               # start both frontend and backend
pnpm dev:web           # frontend only
pnpm dev:api           # backend only

# Test & Lint
pnpm lint              # frontend lint (eslint)
pnpm build             # frontend type check + build
pnpm lint:api          # backend lint (ruff)
pnpm test:api          # backend tests (pytest) — SAM 2 + B2 are mocked, so
                       # this runs with no GPU and no live bucket
pnpm check:structure   # structural boundary tests
pnpm test:e2e          # Playwright e2e tests
```

> Unit tests never load real SAM 2 weights or touch a live bucket: the engine
> (`repo/sam2_engine`) and B2 repo functions are monkeypatched. Add new
> behavior tests the same way — mock the engine + B2, assert on the typed run
> and the keys written.

## 7. Agent Workflow

1. Read this file first.
2. Review [ARCHITECTURE.md](ARCHITECTURE.md) before structural changes.
3. For non-trivial changes, create a plan in `docs/exec-plans/active/`.
4. Implement the smallest coherent change.
5. Run: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
6. Update docs in the same PR (see §9).
7. Move completed plans to `docs/exec-plans/completed/`.
8. Only change files relevant to the task. No drive-by improvements.

## 8. Frontend Conventions

See [docs/dev-workflows.md](docs/dev-workflows.md) for full details.

## 9. Doc Update Mapping

| Change Type | Update Location |
|-------------|-----------------|
| Feature logic, inputs, outputs, tests | `docs/features/<feature>.md` |
| User journeys | `docs/app-workflows.md` |
| System layout, deployments | `ARCHITECTURE.md` |
| Dev or testing process | `docs/dev-workflows.md` |
| Setup or scope changes | `README.md` |
| Security changes | `docs/SECURITY.md` |
| Reliability changes | `docs/RELIABILITY.md` |
| Active work plans | `docs/exec-plans/active/` |
| Known tech debt | `docs/exec-plans/tech-debt-tracker.md` |

If documentation and implementation conflict, update docs in the same PR. Documentation rot destroys agent reliability.

## 10. Doc Map

| Topic | Location |
|-------|----------|
| System layout, data flows, boundaries | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Feature docs | [docs/features/](docs/features/) |
| User journeys | [docs/app-workflows.md](docs/app-workflows.md) |
| Engineering workflows and testing | [docs/dev-workflows.md](docs/dev-workflows.md) |
| Security principles | [docs/SECURITY.md](docs/SECURITY.md) |
| Reliability expectations | [docs/RELIABILITY.md](docs/RELIABILITY.md) |
| Execution plans | [docs/exec-plans/](docs/exec-plans/) |
| Tech debt | [docs/exec-plans/tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md) |

## 11. When Unsure

- Prefer boring, stable libraries
- Prefer small PRs over large changes
- Add tests with every change
- Never bypass lint rules without explicit instruction
- Ask before making destructive or irreversible changes
