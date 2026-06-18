<!-- last_verified: 2026-06-18 -->
# App Workflows

User journeys inside the application.

## Ingest source media

- User navigates to `/upload`
- Drops or selects source images / video clips
- Client validates size (max 500MB) and type (images + clips)
- Progress bar shows per-file status
- On success: media lands in B2 under `raw/images/` or `raw/videos/`
- See: [Ingest](features/file-upload.md)

## Prompt & segment (the core loop)

- User navigates to `/studio`
- Picks a source from the `raw/` archive (the source picker)
- Chooses a prompt mode — **include point**, **exclude point**, or **box**
- Clicks on the image to drop prompts (green = include, red = exclude); drags to draw a box
- Clicks **Segment & save** — SAM 2 runs locally and predicts a mask per object
- Returned masks overlay the source; the run is saved to B2 with a link to the dataset
- **Video**: picking a clip prompts on the first frame and propagates across frames (heavier, GPU recommended)
- See: [Segmentation Studio](features/segmentation.md)

## Browse the mask dataset

- User navigates to `/dataset`
- Sees the storage footprint card (raw archive vs derived dataset, growth ratio)
- Sees segmentation runs, scoped to the `datasets/` prefix
- Expands a run to download `run.json`, the source, RLE JSON, mask PNGs, and cut-outs via presigned URLs
- See: [Mask Dataset](features/mask-dataset.md)

## Browse the full bucket

- User navigates to `/files`
- Sees everything in the bucket (source + derived) as a tree
- Hover a file row to preview / download / delete
- This is the unscoped explorer; the scoped one is `/dataset`
- See: [File Browser](features/file-browser.md)

## View the dashboard

- User navigates to `/` (home)
- Stat cards show segmentation runs, masks generated, cut-out instances, derived dataset size
- The footprint card shows raw-vs-derived storage growth
- The recent-runs table shows the last 10 runs
- See: [Dashboard](features/dashboard.md)
