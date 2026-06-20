from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_database_url(database_url: str) -> str:
    if database_url.startswith("postgresql+psycopg://"):
        return database_url
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    return database_url


def parse_cors_allow_origins(raw_value: str) -> list[str]:
    return [item.strip() for item in raw_value.split(",") if item.strip()]


class Settings(BaseSettings):
    app_env: str = "development"
    app_title: str = "BuyBetter Appraisal API"
    database_url: str = "sqlite:///./appraisal.db"
    secret_key: str = "dev-only-change-me"
    access_token_ttl_minutes: int = 720
    cors_allow_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    session_cookie_name: str = "buybetter_appraisal_session"
    session_cookie_samesite: str = "lax"
    session_cookie_secure: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @property
    def normalized_database_url(self) -> str:
        return normalize_database_url(self.database_url)

    @property
    def cors_origins(self) -> list[str]:
        return parse_cors_allow_origins(self.cors_allow_origins)

    @property
    def is_hosted_env(self) -> bool:
        return self.app_env.lower() in {"staging", "production"}

    @property
    def effective_session_cookie_samesite(self) -> str:
        if self.is_hosted_env and self.session_cookie_samesite.lower() == "lax":
            return "none"
        return self.session_cookie_samesite

    @property
    def effective_session_cookie_secure(self) -> bool:
        if self.is_hosted_env and not self.session_cookie_secure:
            return True
        return self.session_cookie_secure


@lru_cache
def get_settings() -> Settings:
    return Settings()
