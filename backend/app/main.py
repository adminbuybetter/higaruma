from fastapi import FastAPI

from app.config import get_settings


settings = get_settings()
app = FastAPI(title=settings.app_title)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.app_env}

