from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = Field(default="development", alias="APP_ENV")
    app_name: str = Field(default="Personal Productivity System", alias="APP_NAME")
    log_level: str = Field(default="info", alias="LOG_LEVEL")
    timezone: str = Field(default="UTC", alias="TIMEZONE")

    database_url: str = Field(
        default="postgresql+psycopg://productivity:change_me_strong@postgres:5432/productivity",
        alias="DATABASE_URL",
    )
    api_host: str = Field(default="0.0.0.0", alias="API_HOST")
    api_port: int = Field(default=8000, alias="API_PORT")
    api_prefix: str = Field(default="/v1", alias="API_PREFIX")
    auto_migrate: bool = Field(default=True, alias="AUTO_MIGRATE")

    auth_mode: Literal["dev", "cloudflare"] = Field(default="dev", alias="AUTH_MODE")
    dev_auth_email: str = Field(default="owner@example.com", alias="DEV_AUTH_EMAIL")

    cloudflare_team_domain: str = Field(default="", alias="CLOUDFLARE_TEAM_DOMAIN")
    cloudflare_access_audience: str = Field(default="", alias="CLOUDFLARE_ACCESS_AUDIENCE")

    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        alias="CORS_ORIGINS",
    )

    @property
    def parsed_cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def cloudflare_certs_url(self) -> str:
        if not self.cloudflare_team_domain:
            return ""
        return f"https://{self.cloudflare_team_domain}/cdn-cgi/access/certs"


@lru_cache
def get_settings() -> Settings:
    return Settings()
