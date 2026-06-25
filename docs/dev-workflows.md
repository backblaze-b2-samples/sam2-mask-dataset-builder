<!-- last_verified: 2026-06-25 -->
# Dev Workflows

Engineering workflows for this repo.

## SAM 2 model setup (CPU vs GPU)

- `requirements.txt` installs `torch`, `torchvision`, and `sam2` (from
  `git+https://github.com/facebookresearch/sam2.git`). On a GPU host, install
  the CUDA build of `torch`/`torchvision` that matches your driver *before*
  installing the rest, then `pip install -r requirements.txt`.
- The model id is `SAM2_MODEL_ID` (default `facebook/sam2.1-hiera-tiny`). Weights
  download from the public HuggingFace Hub on first inference — no API key. The
  first segment call is slow (download + load); subsequent calls reuse the
  cached predictor.
- **CPU** works for image segmentation (slower). **Video propagation is heavy —
  a GPU is strongly recommended.** Tune `max_frames` for long clips.
- `torch`/`sam2` are imported **only** in `app/repo/sam2_engine.py`. Frame
  extraction uses `opencv-python-headless`.

## Testing without a GPU or live B2

Unit tests monkeypatch the SAM 2 engine (`repo/sam2_engine`) and the B2 repo
functions, so `pnpm test:api` runs with no GPU and no bucket. When adding a
behavior test, mock the engine to return a deterministic NumPy mask and capture
B2 writes in an in-memory dict (see `tests/test_segmentation.py`). Never write a
test that loads real weights or hits a live bucket.

## New Feature

- [ ] Read `AGENTS.md` and `ARCHITECTURE.md`
- [ ] Read the relevant feature doc in `docs/features/`
- [ ] For non-trivial changes, create a plan in `docs/exec-plans/active/`
- [ ] Implement the smallest coherent change
- [ ] Add or update tests
- [ ] Run: `pnpm typecheck && pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- [ ] Update docs in the same PR (see AGENTS.md §8)
- [ ] Move plan to `docs/exec-plans/completed/` after validation

## Bugfix

- [ ] Add a failing test that reproduces the bug
- [ ] Confirm the test fails
- [ ] Implement the fix
- [ ] Rerun tests until green
- [ ] Update docs if behavior changed

## Refactor

- [ ] Read `ARCHITECTURE.md` — respect layering rules
- [ ] Ensure structural tests still pass: `pnpm check:structure`
- [ ] No behavior changes without updating feature docs

## Documentation Update

- [ ] Update only the canonical location (see AGENTS.md §8 doc update mapping)
- [ ] Never duplicate content — link instead
- [ ] Update `<!-- last_verified: YYYY-MM-DD -->` header

## Pull Request

- [ ] One coherent change per PR
- [ ] Run full lint + test suite before submitting
- [ ] Docs updated in the same PR as code changes
- [ ] Only change files relevant to the task — no drive-by improvements

## CI

GitHub Actions enables Corepack, uses the root `packageManager` pin with its
Corepack integrity hash, installs frontend dependencies from the repository root
with `pnpm install --frozen-lockfile --ignore-scripts`, then runs the root
`pnpm typecheck` script. The workflow sets `permissions: contents: read`, checks
out with `persist-credentials: false`, and intentionally leaves pnpm caching
disabled so the first pnpm-dependent command is the install step. Do not switch
CI to `npm install` inside `apps/web/`; the web app depends on the workspace
package via `workspace:*`, which npm does not resolve.

Run `pnpm lint:ci` after editing the workflow. It fails if checkout credentials
are persisted, install scripts are allowed during dependency installation, or
pnpm cache restoration is reintroduced before pnpm is available.

## Testing

### Test types
- **Unit**: pure logic (service layer)
- **Integration**: HTTP handlers, B2 connectivity (`tests/`)
- **Structural**: layering rules, import boundaries (`tests/test_structure.py`)
- **E2E**: Playwright browser-driven smoke tests

### Test placement
- Backend: `services/api/tests/`
- E2E: project root (Playwright)

### Commands
- Quick (backend): `pnpm test:api`
- Structure: `pnpm check:structure`
- Frontend typecheck: `pnpm typecheck`
- Frontend lint: `pnpm lint`
- Backend lint: `pnpm lint:api`
- Full suite: `pnpm typecheck && pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- E2E: `pnpm test:e2e` (run `pnpm --filter @sam2-mask-dataset-builder/web exec playwright install chromium` once first)

### When to run
- After behavior change: run relevant subset
- Before PR: run full suite

## Frontend Conventions

- Tailwind v4: config via CSS `@theme` blocks, NOT `tailwind.config.ts`
- Colors: OKLch format
- Dark mode: `next-themes` with `@custom-variant dark (&:is(.dark *))`
- Animations: `tw-animate-css` (not `tailwindcss-animate`)
- shadcn/ui components in `src/components/ui/` are generated — never modify them

## Data Fetching

All API reads/writes flow through TanStack Query hooks in
`apps/web/src/lib/queries.ts`. Don't add bare `useEffect + fetch` patterns
to components.

**Read** — use the hooks directly:

```tsx
const { data, isLoading, error, refetch } = useFiles(prefix, limit);
const { data: stats } = useFileStats();
```

Surface errors via `<ErrorState error={error} onRetry={() => refetch()} />`
rather than silently rendering empty UI.

**Write** — wrap mutations with `useMutation` and invalidate on success:

```tsx
const deleteMutation = useDeleteFile();
deleteMutation.mutate(file.key, {
  onSuccess: () => toast.success("Deleted"),
});
```

`useDeleteFile()` already calls `queryClient.invalidateQueries({ queryKey: qk.all })`
on success — every consumer of `useFiles` / `useFileStats` re-fetches lazily.

**Add a new endpoint** — three places to touch:
1. `services/api/app/runtime/<router>.py` — FastAPI route
2. `apps/web/src/lib/api-client.ts` — typed fetch wrapper
3. `apps/web/src/lib/queries.ts` — `useQuery` / `useMutation` hook + entry in `qk`

Defaults (in `apps/web/src/lib/query-client.tsx`):
- `staleTime: 30s` — file lists / stats don't change second-to-second
- `retry: 1` for transient errors; never retry 4xx (won't get better)
- `refetchOnWindowFocus`: on (TanStack default) — dashboard self-heals
  when the user comes back to the tab
