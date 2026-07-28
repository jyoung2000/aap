"""Application configuration, loaded from environment (.env)."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Core
    app_name: str = "JobPilot"
    app_port: int = 1456
    public_base_url: str = "http://localhost:1456"
    extra_cors_origins: str = ""
    secret_key: str = "dev-insecure-secret-change-me"
    env: str = "development"
    session_ttl_days: int = 30

    # Database
    postgres_user: str = "jobpilot"
    postgres_password: str = "jobpilot"
    postgres_db: str = "jobpilot"
    postgres_host: str = "db"
    postgres_port: int = 5432
    database_url: str | None = None

    # Redis
    redis_host: str = "redis"
    redis_port: int = 6379
    redis_url: str | None = None

    # LLM
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5"
    anthropic_max_tokens: int = 2000

    # Aggregator keys
    adzuna_app_id: str = ""
    adzuna_app_key: str = ""
    jooble_api_key: str = ""
    usajobs_api_key: str = ""
    usajobs_user_agent: str = ""
    themuse_api_key: str = ""
    serpapi_key: str = ""
    brave_api_key: str = ""

    # Apply orchestration
    max_applications_per_hour: int = 15
    humanized_input_default: bool = True
    playwright_headless: bool = False
    novnc_port: int = 6080
    # auto = try live Playwright, fall back to simulation; live = require browser; simulate = never launch.
    server_executor_mode: str = "auto"

    # Notifications
    notify_webhook_url: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # Extension
    extension_version: str = "1.0.0"

    # Filesystem — uploads, screenshots, extension bundles (mounted volume in Docker).
    data_dir: str = "/data"

    @property
    def upload_dir(self) -> str:
        import os

        d = os.path.join(self.data_dir, "uploads")
        os.makedirs(d, exist_ok=True)
        return d

    @property
    def screenshot_dir(self) -> str:
        import os

        d = os.path.join(self.data_dir, "screenshots")
        os.makedirs(d, exist_ok=True)
        return d

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def redis_dsn(self) -> str:
        if self.redis_url:
            return self.redis_url
        return f"redis://{self.redis_host}:{self.redis_port}/0"

    @property
    def is_production(self) -> bool:
        return self.env.lower() in ("production", "prod")

    @property
    def cors_origins(self) -> list[str]:
        origins = {self.public_base_url, "http://localhost:1456", f"http://localhost:{self.app_port}"}
        for extra in self.extra_cors_origins.split(","):
            extra = extra.strip()
            if extra:
                origins.add(extra)
        return sorted(origins)

    @property
    def llm_enabled(self) -> bool:
        return bool(self.anthropic_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
