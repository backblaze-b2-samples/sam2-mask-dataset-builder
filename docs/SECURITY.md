<!-- last_verified: 2026-06-18 -->
# Security

Security principles and implementation for the SAM 2 Mask Dataset Builder.

## Trust Boundaries

- **Frontend -> API**: CORS-restricted to configured origins, scoped to `GET/POST/DELETE/OPTIONS`
- **API -> B2**: Authenticated via `B2_APPLICATION_KEY_ID` + `B2_APPLICATION_KEY`, signature v4
- **Client -> B2**: Presigned URLs for download (10-min expiry, `Content-Disposition: attachment`)
- **API -> HuggingFace Hub**: read-only model download — see Model-download trust below

## No second API key

SAM 2 runs locally; there is no inference provider and no second secret. The
only credentials in the system are the B2 application key. This removes an
entire class of secret-management and provider-trust risk.

## Ingest validation

- Filename sanitization: path traversal, null bytes, unsafe chars stripped
- MIME/extension consistency check against the media allowlist (images + clips only)
- Chunked streaming with size enforcement (500MB default)
- Content-type allowlist (JPEG/PNG/WebP, MP4/MOV/WebM); other types rejected
- Empty file rejection

## Segmentation input validation

- `source_key` must live under `SOURCE_PREFIX` (default `raw/`) — the API will
  not segment arbitrary bucket keys (`SegmentationError` -> 400)
- `source_key` and `run_id` rejected on path-traversal patterns (`../`, `%2e%2e`,
  backslashes, null bytes)
- Prompt coordinates and labels are validated by Pydantic at the boundary; at
  least one object prompt is required

## File key validation (browser/dataset)

- Empty keys rejected; path-traversal patterns rejected
- The scoped dataset explorer (`/dataset/files`) re-roots every prefix under
  `DATASET_PREFIX` so it cannot escape into the rest of the bucket
- Add tighter prefix scoping in `services/api/app/service/files.py::validate_key`
  if your deployment shares a bucket with other workloads

## Download safety

- Presigned URLs force `Content-Disposition: attachment` (10-min expiry)
- Prevents inline rendering of user-supplied content (XSS mitigation)

## Model-download trust

- On first inference the engine downloads `SAM2_MODEL_ID` weights from the public
  HuggingFace Hub. Pin `SAM2_MODEL_ID` to a known, trusted model id; treat the
  Hub as an external dependency. The download is read-only and uses no key.

## Secrets Management

- All secrets loaded via environment variables (pydantic-settings)
- Never committed to source control
- `.env.example` documents required variables without real values

## Agent Security Rules

- Never commit `.env`, credentials, or API keys
- Never weaken validation (including the `SOURCE_PREFIX` allowlist) without explicit instruction
- Never bypass CORS, auth, or input sanitization
- Always validate at system boundaries
