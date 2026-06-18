<!-- last_verified: 2026-06-18 -->
# Feature: Dashboard

## Purpose
Show, at a glance, how a raw media archive is growing into a labeled mask dataset
on B2 — segmentation runs, masks generated, cut-out instances, and the headline
raw-vs-derived storage footprint.

## Used By
- UI: `/` page (dashboard home)
- API: `GET /dataset/summary`, `GET /runs`

## Core Functions
- `apps/web/src/components/dashboard/stats-cards.tsx` — 4 stat cards (runs, masks, cut-outs, derived size)
- `apps/web/src/components/dashboard/recent-runs-table.tsx` — last 10 runs
- `apps/web/src/components/dataset/footprint-card.tsx` — raw vs derived footprint + growth ratio
- `apps/web/src/lib/api-client.ts` — `getDatasetSummary()`, `getRuns()`
- `apps/web/src/lib/queries.ts` — `useDatasetSummary()`, `useRuns()`
- `services/api/app/runtime/datasets.py` — `GET /dataset/summary`, `GET /runs` handlers
- `services/api/app/service/datasets.py` — `get_dataset_summary()`, `list_runs()` business logic
- `services/api/app/repo/b2_client.py` — `get_upload_stats(prefix)`, `list_files()` data access

## Canonical Files
- Dashboard stat cards: `apps/web/src/components/dashboard/stats-cards.tsx`
- Footprint metric: `apps/web/src/components/dataset/footprint-card.tsx`
- Aggregation logic: `services/api/app/service/datasets.py`

## Inputs
- None (the dashboard loads data automatically)

## Outputs
- `GET /dataset/summary` → `DatasetSummary` (run_count, mask_count, cutout_count, source/derived bytes + human, growth_ratio)
- `GET /runs?limit=10` → `SegmentationRun[]` for the recent-runs table (newest first)

## Flow
- Page loads → two API calls (dataset summary, recent runs)
- Stat cards display run count, masks generated, cut-out instances, derived dataset size
- The footprint card shows raw archive bytes, derived dataset bytes, and the growth ratio (derived ÷ raw) — the killer storytelling metric
- The recent-runs table shows the last 10 runs with run id, kind, source, mask count, date

## Edge Cases
- API unavailable → cards/footprint show inline `ErrorState` with retry (not silent zeros)
- No runs yet → empty table message; footprint shows 0 B / "—" ratio
- Large object count → summary paginates through B2 with `ContinuationToken`

## UX States
- Loading: skeleton placeholders for cards, footprint metrics, and table
- Empty: "No runs yet" with a link to the Studio
- Loaded: populated cards, footprint, table

## Verification
- Test files: `services/api/tests/test_datasets.py`
- Required cases: growth-ratio computation, empty-source handling, run hydration, malformed-run skip
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green, no ruff violations

## Related Docs
- [Mask Dataset](mask-dataset.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [App Workflows](../app-workflows.md)
