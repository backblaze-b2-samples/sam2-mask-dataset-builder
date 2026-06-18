<!-- last_verified: 2026-06-18 -->
# Reliability

Reliability expectations and practices for this project.

## Health Checks

- `GET /health` verifies B2 connectivity and returns `healthy` or `degraded`
- Health endpoint is always available, even when B2 is down
- `/health` **never loads the SAM 2 model** — the model is lazy-loaded only on
  the first segment call, so the server starts fast and health stays cheap

## SAM 2 engine

- **Model load failure** (bad `SAM2_MODEL_ID`, no network on first run, OOM) →
  surfaced as a 500 with a logged error; the run is **not** saved
- The predictor is cached after first load (`lru_cache`); subsequent calls reuse it
- **CPU vs GPU**: image inference works on CPU (slower); video propagation is
  heavy and GPU-recommended

## Large / long media

- Ingest streams in 1MB chunks with a 500MB cap (rejects oversized early)
- Video propagation is bounded by `max_frames` (default 60) so a long clip can't
  run unbounded; raise it deliberately on a GPU host
- Frame extraction writes to a temp dir; decode failure (zero frames) → 500

## Error Handling

- HTTP handlers return structured error responses with appropriate status codes
- External service failures (B2) are caught and surfaced as 500/503 responses
- No unhandled exceptions leak stack traces to clients

## Logging

- Structured JSON logging via Python stdlib
- Every request gets a `request_id` for tracing
- Log levels: ERROR for failures, WARNING for degraded state, INFO for requests

## Observability

- Request timing middleware logs duration for every request
- `/metrics` endpoint exposes basic Prometheus-format counters
- Upload success/failure counts tracked

## Graceful Degradation

- File listing returns empty list (not error) when B2 has no objects
- Metadata extraction failures don't block ingest (return partial metadata)
- A malformed or half-written `run.json` is skipped by `list_runs()` rather than
  breaking the dataset listing (partial-run tolerance)
- Mask-overlay preview failures in the Studio are non-fatal — the run still
  saved to B2; the dataset explorer shows the artifacts
- Frontend shows skeleton states while loading, error states on failure

## Deployment

- Railway health checks on `/health`
- Zero-downtime deploys via rolling updates
- Environment-specific configuration via env vars (no config files in prod)
