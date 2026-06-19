from __future__ import annotations

from sqlalchemy.orm import Session

from app.bootstrap import bootstrap_from_seed
from app.db import SessionLocal, engine


def seed_database() -> None:
    db: Session = SessionLocal()
    try:
        bootstrap_from_seed(db)
    finally:
        db.close()


def main() -> None:
    seed_database()
    print("Appraisal seed complete.")


if __name__ == "__main__":
    main()
