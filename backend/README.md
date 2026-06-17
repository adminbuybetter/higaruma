# Backend

Phase 1 backend scaffold for the appraisal application.

## Stack

- FastAPI
- SQLAlchemy 2
- Alembic
- Postgres

## Quick start

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
docker compose up -d
alembic upgrade head
uvicorn app.main:app --reload
```

## Test

```bash
python -m unittest discover -s tests
```

