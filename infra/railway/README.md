# Railway Deployment

Deploy both services (web + api) on Railway.

## Setup

1. Create a new Railway project
2. Add two services from the same repo:

### Web Service (Next.js)
- **Root Directory**: `apps/web`
- **Build Command**: `pnpm install && pnpm build`
- **Start Command**: `pnpm start`
- **Port**: `3000`

### API Service (FastAPI)
- **Root Directory**: `services/api`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

## Environment Variables

Set these on the API service:

| Variable | Value |
|----------|-------|
| `B2_APPLICATION_KEY_ID` | Your B2 key ID |
| `B2_APPLICATION_KEY` | Your B2 key |
| `B2_BUCKET_NAME` | Your bucket name |
| `B2_REGION` | Your bucket region (e.g. `us-west-004`) — the S3 endpoint is derived from it |
| `B2_PUBLIC_URL_BASE` | Your bucket's S3 base URL |
| `SAM2_MODEL_ID` | (optional) HuggingFace model id — defaults to `facebook/sam2.1-hiera-tiny` |
| `SOURCE_PREFIX` / `DATASET_PREFIX` | (optional) defaults `raw/` / `datasets/` |
| `API_CORS_ORIGINS` | Your web service URL (e.g., `https://web-production-xxx.up.railway.app`) |

> Video propagation is GPU-heavy; for production video workloads deploy the API
> on a GPU-backed host and install the CUDA build of `torch`.

Set this on the Web service:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | Your API service URL (e.g., `https://api-production-xxx.up.railway.app`) |
