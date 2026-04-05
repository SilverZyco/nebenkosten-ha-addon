from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://nebenkosten:changeme@db:5432/nebenkosten"
    DATABASE_URL_SYNC: str = "postgresql://nebenkosten:changeme@db:5432/nebenkosten"

    # Security
    SECRET_KEY: str = "CHANGE_THIS_SECRET_KEY"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # File Upload
    UPLOAD_DIR: str = "/app/uploads"
    MAX_UPLOAD_SIZE_MB: int = 50

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    OCR_ENABLED: bool = True
    AI_ENABLED: bool = True

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000"

    # Rate limiting
    RATE_LIMIT_LOGIN: int = 5

    # Billing calculation warning thresholds
    BILLING_FACTOR_MIN: float = 0.90
    BILLING_FACTOR_MAX: float = 1.10

    LOGO_PATH: str = "/app/logo/logo.png"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
