from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- Backblaze B2 (S3-compatible) ---
    # Standardized B2_* names. The endpoint is normally DERIVED from the
    # region so there's one less thing to copy/paste wrong; set B2_ENDPOINT
    # only when you need to override it (custom DNS, gateway, etc.).
    b2_application_key_id: str = ""
    b2_application_key: str = ""
    b2_bucket_name: str = ""
    b2_region: str = ""
    b2_public_url_base: str = ""
    b2_endpoint: str = ""  # optional override

    # --- SAM 2 segmentation engine ---
    # HuggingFace Hub model id. Default is the smallest variant so it runs on
    # CPU; weights auto-download from the public Hub on first use (no key).
    sam2_model_id: str = "facebook/sam2.1-hiera-tiny"

    # --- Dataset layout on B2 ---
    # Source media (ingest) lives under SOURCE_PREFIX; derived runs (masks,
    # cut-outs, run.json) live under DATASET_PREFIX. The scoped /dataset
    # explorer is restricted to DATASET_PREFIX.
    source_prefix: str = "raw/"
    dataset_prefix: str = "datasets/"

    api_port: int = 8000
    # Explicit allowlist by default — covers Next on :3000 and the
    # fallback :3001 it picks if 3000 is busy. Production deploys should
    # override with the exact frontend origin.
    api_cors_origins: str = "http://localhost:3000,http://localhost:3001"
    # Optional dev-only escape hatch: a regex that matches additional
    # allowed origins. Empty by default — set this to e.g.
    # `^http://localhost:\d+$` to accept any localhost port without
    # listing each one. NEVER ship this to production.
    api_cors_origin_regex: str = ""

    # Upload limits
    max_file_size: int = 500 * 1024 * 1024  # 500MB — source video clips run large

    # Small durable counters (downloads, etc). Point at a persistent
    # volume in production if you care about surviving restarts.
    download_count_file: str = "data/download_count.json"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def endpoint(self) -> str:
        """S3 endpoint URL. Uses B2_ENDPOINT verbatim when set, otherwise
        derives the canonical Backblaze regional endpoint from B2_REGION."""
        if self.b2_endpoint:
            return self.b2_endpoint
        if self.b2_region:
            return f"https://s3.{self.b2_region}.backblazeb2.com"
        return ""

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.api_cors_origins.split(",")]


settings = Settings()
