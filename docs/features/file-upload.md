<!-- last_verified: 2026-06-18 -->
# Feature: Ingest (Source Media Upload)

## Purpose
Ingest source images and video clips from the browser into the Backblaze B2 raw
media archive (under `SOURCE_PREFIX`, default `raw/`), with real-time progress.
This is the first step of the dataset workflow — the source the Studio segments.

## Used By
- UI: `/upload` page, upload form component
- API: `POST /upload`

## Core Functions
- `apps/web/src/components/upload/upload-form.tsx` — orchestrates dropzone + progress + upload state
- `apps/web/src/components/upload/dropzone.tsx` — drag-and-drop via `react-dropzone` (images + video only)
- `apps/web/src/components/upload/upload-progress.tsx` — per-file progress bars
- `apps/web/src/lib/api-client.ts` — `uploadFile()` using XHR for progress events
- `services/api/app/runtime/upload.py` — HTTP handler, reads file chunks
- `services/api/app/service/upload.py` — validates and orchestrates ingest, routes by kind
- `services/api/app/repo/b2_client.py` — `upload_file()` via boto3 `put_object`
- `services/api/app/service/metadata.py` — `extract_metadata()` after upload

## Canonical Files
- Upload handler pattern: `services/api/app/runtime/upload.py`
- Service orchestration pattern: `services/api/app/service/upload.py`
- Frontend upload flow: `apps/web/src/components/upload/upload-form.tsx`

## Inputs
- file: `File` (from browser, multipart form data) — image or video
- content_type: string (from file MIME type)

## Outputs
- `FileUploadResponse`: key, filename, size, content_type, uploaded_at, url, metadata
- Side effects: stored in B2 under `raw/images/<name>` or `raw/videos/<name>` by kind

## Flow
- User drops or selects source media in the dropzone
- Client validates file size (max 500MB) and type (images + clips) — rejected files show a toast
- XHR sends multipart POST to `/upload` with progress events
- API checks `Content-Length` early, validates content type against the media allowlist
- API sanitizes the filename (path components, null bytes, unsafe chars, ≤200 chars)
- API validates the extension matches the declared MIME type
- API reads the file in 1MB chunks with streaming size enforcement (max 500MB)
- API rejects empty files
- API routes the key by kind: `raw/videos/<name>` for video, else `raw/images/<name>`
- API calls `put_object` to B2 and extracts metadata (checksums, image dimensions, video duration)
- Client shows a toast and updates progress state

## Edge Cases
- File exceeds 500MB → client-side rejection toast + API 413 if bypassed
- File type not an allowed image/video → API 415
- Extension mismatches MIME type → API 415
- No filename / empty file → API 400
- Duplicate filename → B2 creates a new version (buckets are always versioned)
- B2 unreachable → API 500

## UX States
- Empty: dropzone with instructions (images + clips, 500 MB)
- Loading: per-file progress bars
- Error: red status icon, error message per file
- Complete: green checkmark, "Clear completed" button

## Verification
- Test files: `services/api/tests/test_upload_conflict.py`, `services/api/tests/test_error_handling.py`
- Required cases: image routed to `raw/images/`, video routed to `raw/videos/`, oversized rejection, disallowed type, missing filename, empty file
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green, no ruff violations

## Related Docs
- [Segmentation Studio](segmentation.md)
- [Metadata Extraction](metadata-extraction.md)
- [App Workflows](../app-workflows.md)
