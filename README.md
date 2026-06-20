# BuyBetter Appraisal Prototype

Project split:

- `frontend/` = React/Vite appraisal prototype
- `backend/` = FastAPI/Postgres Phase 1 backend scaffold

## Frontend Run

```bash
cd frontend
npm install
npm run dev
```

The frontend build is compile-only. Seed generation is now a manual script, not part of `dev` or `build`.

## Backend Run

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
docker compose up -d
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

## Notes

The older prototype notes below still describe the frontend behavior.

Throwaway internal prototype for the 2026 appraisal cycle.

It answers one question:

`Can BuyBetter run self appraisal + appraisal-owner review in one local-first web app before committing to a fuller system?`

## Run

```bash
cd frontend
npm install
npm run dev
```

The seed is regenerated from the CSVs in:

- `/Users/kamsi/Downloads/Technology 2/JOB DESCRIPTION_ IT DEPARTMENT`

## What it includes

- employee login
- appraisal-owner / line-manager login
- HR admin login
- self appraisal form
- KPI scoring for direct reports
- final result release to employee
- unresolved mapping dashboard
- JSON / CSV export

## Prototype constraints

- local-only authentication
- generated passwords
- localStorage persistence
- no backend
- no production hardening

## Admin credentials

Generated into:

- `frontend/generated/credentials.generated.csv`

And also visible in the HR admin view.
