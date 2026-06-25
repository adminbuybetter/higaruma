"""add phase window columns to appraisal cycles

Revision ID: 20260622_0002
Revises: 20260617_0001
Create Date: 2026-06-22 10:30:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260622_0002"
down_revision = "20260617_0001"
branch_labels = None
depends_on = None


SELF_OPEN_DEFAULT = "2026-06-16T09:00:00+01:00"
SELF_CLOSE_DEFAULT = "2026-06-30T23:59:59+01:00"
MANAGER_OPEN_DEFAULT = "2026-07-01T00:00:00+01:00"
MANAGER_CLOSE_DEFAULT = "2026-07-07T23:59:59+01:00"


def upgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    op.add_column("appraisal_cycles", sa.Column("self_opens_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("appraisal_cycles", sa.Column("self_closes_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("appraisal_cycles", sa.Column("manager_opens_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("appraisal_cycles", sa.Column("manager_closes_at", sa.DateTime(timezone=True), nullable=True))

    if is_postgres:
        op.execute(
            sa.text(
                """
                UPDATE appraisal_cycles
                SET
                  self_opens_at = COALESCE(self_opens_at, opens_at, CAST(:self_open_default AS timestamptz)),
                  self_closes_at = COALESCE(self_closes_at, closes_at, CAST(:self_close_default AS timestamptz)),
                  manager_opens_at = COALESCE(
                    manager_opens_at,
                    CASE
                      WHEN closes_at IS NOT NULL THEN closes_at + INTERVAL '1 day'
                      ELSE CAST(:manager_open_default AS timestamptz)
                    END
                  ),
                  manager_closes_at = COALESCE(
                    manager_closes_at,
                    CASE
                      WHEN closes_at IS NOT NULL THEN closes_at + INTERVAL '7 day'
                      ELSE CAST(:manager_close_default AS timestamptz)
                    END
                  )
                """
            ).bindparams(
                self_open_default=SELF_OPEN_DEFAULT,
                self_close_default=SELF_CLOSE_DEFAULT,
                manager_open_default=MANAGER_OPEN_DEFAULT,
                manager_close_default=MANAGER_CLOSE_DEFAULT,
            )
        )
    else:
        op.execute(
            sa.text(
                """
                UPDATE appraisal_cycles
                SET
                  self_opens_at = COALESCE(self_opens_at, opens_at, :self_open_default),
                  self_closes_at = COALESCE(self_closes_at, closes_at, :self_close_default),
                  manager_opens_at = COALESCE(
                    manager_opens_at,
                    CASE
                      WHEN closes_at IS NOT NULL THEN datetime(closes_at, '+1 day')
                      ELSE :manager_open_default
                    END
                  ),
                  manager_closes_at = COALESCE(
                    manager_closes_at,
                    CASE
                      WHEN closes_at IS NOT NULL THEN datetime(closes_at, '+7 day')
                      ELSE :manager_close_default
                    END
                  )
                """
            ).bindparams(
                self_open_default=SELF_OPEN_DEFAULT,
                self_close_default=SELF_CLOSE_DEFAULT,
                manager_open_default=MANAGER_OPEN_DEFAULT,
                manager_close_default=MANAGER_CLOSE_DEFAULT,
            )
        )


def downgrade() -> None:
    op.drop_column("appraisal_cycles", "manager_closes_at")
    op.drop_column("appraisal_cycles", "manager_opens_at")
    op.drop_column("appraisal_cycles", "self_closes_at")
    op.drop_column("appraisal_cycles", "self_opens_at")
