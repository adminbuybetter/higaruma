"""initial appraisal schema

Revision ID: 20260617_0001
Revises:
Create Date: 2026-06-17 22:50:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260617_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("username", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("username", name=op.f("uq_users_username")),
    )
    op.create_index(
        "uq_users_email_not_null",
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("email IS NOT NULL"),
    )

    op.create_table(
        "employees",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_code", sa.String(length=64), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("designation", sa.String(length=255), nullable=False),
        sa.Column("department", sa.String(length=255), nullable=True),
        sa.Column("level", sa.String(length=255), nullable=True),
        sa.Column("employment_status", sa.String(length=64), server_default=sa.text("'active'"), nullable=False),
        sa.Column("can_self_appraise", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("excluded_this_cycle_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_employees_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employees")),
        sa.UniqueConstraint("employee_code", name=op.f("uq_employees_employee_code")),
    )

    op.create_table(
        "user_capabilities",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("capability", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_user_capabilities_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_capabilities")),
        sa.UniqueConstraint("user_id", "capability", name=op.f("uq_user_capabilities_user_id")),
    )

    op.create_table(
        "manager_scopes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_label", sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_manager_scopes_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_manager_scopes")),
        sa.UniqueConstraint("user_id", "owner_label", name=op.f("uq_manager_scopes_user_id")),
    )

    op.create_table(
        "appraisal_cycles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("opens_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_appraisal_cycles")),
        sa.UniqueConstraint("code", name=op.f("uq_appraisal_cycles_code")),
    )

    op.create_table(
        "kpi_packs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role_name", sa.String(length=255), nullable=False),
        sa.Column("department", sa.String(length=255), nullable=True),
        sa.Column("source_reference", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_kpi_packs")),
        sa.UniqueConstraint("role_name", name=op.f("uq_kpi_packs_role_name")),
    )

    op.create_table(
        "kpi_pack_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kpi_pack_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("kpi_area", sa.String(length=255), nullable=False),
        sa.Column("kpi_statement", sa.Text(), nullable=False),
        sa.Column("weight_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.CheckConstraint("weight_percent >= 0", name=op.f("ck_kpi_pack_items_weight_percent_non_negative")),
        sa.ForeignKeyConstraint(["kpi_pack_id"], ["kpi_packs.id"], name=op.f("fk_kpi_pack_items_kpi_pack_id_kpi_packs"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_kpi_pack_items")),
    )

    op.create_table(
        "designation_role_mappings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("designation", sa.String(length=255), nullable=False),
        sa.Column("kpi_pack_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("department", sa.String(length=255), nullable=True),
        sa.Column("line_manager_label", sa.String(length=255), nullable=True),
        sa.Column("reviewer_label", sa.String(length=255), nullable=True),
        sa.Column("kpi_owner_label", sa.String(length=255), nullable=True),
        sa.Column("self_appraisal_required", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("needs_clarification", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["kpi_pack_id"], ["kpi_packs.id"], name=op.f("fk_designation_role_mappings_kpi_pack_id_kpi_packs"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_designation_role_mappings")),
        sa.UniqueConstraint("designation", name=op.f("uq_designation_role_mappings_designation")),
    )

    op.create_table(
        "employee_cycle_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("appraisal_cycle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("designation_mapping_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("kpi_pack_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("appraisal_role_name", sa.String(length=255), nullable=True),
        sa.Column("line_manager_label", sa.String(length=255), nullable=True),
        sa.Column("reviewer_label", sa.String(length=255), nullable=True),
        sa.Column("kpi_owner_label", sa.String(length=255), nullable=True),
        sa.Column("primary_owner_label", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("excluded_this_cycle", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("blockers_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], name=op.f("fk_employee_cycle_assignments_employee_id_employees"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["appraisal_cycle_id"], ["appraisal_cycles.id"], name=op.f("fk_employee_cycle_assignments_appraisal_cycle_id_appraisal_cycles"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["designation_mapping_id"], ["designation_role_mappings.id"], name=op.f("fk_employee_cycle_assignments_designation_mapping_id_designation_role_mappings"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["kpi_pack_id"], ["kpi_packs.id"], name=op.f("fk_employee_cycle_assignments_kpi_pack_id_kpi_packs"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employee_cycle_assignments")),
        sa.UniqueConstraint("employee_id", "appraisal_cycle_id", name=op.f("uq_employee_cycle_assignments_employee_id")),
    )

    op.create_table(
        "employee_kpi_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_cycle_assignment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kpi_pack_item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("kpi_area", sa.String(length=255), nullable=False),
        sa.Column("kpi_statement", sa.Text(), nullable=False),
        sa.Column("weight_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("manager_score", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("manager_comment", sa.Text(), nullable=True),
        sa.Column("evidence_note", sa.Text(), nullable=True),
        sa.Column("development_action", sa.Text(), nullable=True),
        sa.Column("manager_status", sa.String(length=64), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["employee_cycle_assignment_id"], ["employee_cycle_assignments.id"], name=op.f("fk_employee_kpi_assignments_employee_cycle_assignment_id_employee_cycle_assignments"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["kpi_pack_item_id"], ["kpi_pack_items.id"], name=op.f("fk_employee_kpi_assignments_kpi_pack_item_id_kpi_pack_items"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employee_kpi_assignments")),
    )

    op.create_table(
        "self_appraisals",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_cycle_assignment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=64), server_default=sa.text("'draft'"), nullable=False),
        sa.Column("overall_achievements", sa.Text(), nullable=True),
        sa.Column("major_challenges", sa.Text(), nullable=True),
        sa.Column("support_needed", sa.Text(), nullable=True),
        sa.Column("development_focus", sa.Text(), nullable=True),
        sa.Column("employee_comments", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["employee_cycle_assignment_id"], ["employee_cycle_assignments.id"], name=op.f("fk_self_appraisals_employee_cycle_assignment_id_employee_cycle_assignments"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_self_appraisals")),
        sa.UniqueConstraint("employee_cycle_assignment_id", name=op.f("uq_self_appraisals_employee_cycle_assignment_id")),
    )

    op.create_table(
        "self_appraisal_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("self_appraisal_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_kpi_assignment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("self_score", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("reason_for_score", sa.Text(), nullable=True),
        sa.Column("key_evidence", sa.Text(), nullable=True),
        sa.Column("challenges_faced", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["self_appraisal_id"], ["self_appraisals.id"], name=op.f("fk_self_appraisal_items_self_appraisal_id_self_appraisals"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_kpi_assignment_id"], ["employee_kpi_assignments.id"], name=op.f("fk_self_appraisal_items_employee_kpi_assignment_id_employee_kpi_assignments"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_self_appraisal_items")),
        sa.UniqueConstraint("self_appraisal_id", "employee_kpi_assignment_id", name=op.f("uq_self_appraisal_items_self_appraisal_id")),
    )

    op.create_table(
        "final_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_cycle_assignment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("self_summary", sa.Text(), nullable=True),
        sa.Column("manager_summary", sa.Text(), nullable=True),
        sa.Column("final_recommendation", sa.Text(), nullable=True),
        sa.Column("final_score", sa.Numeric(5, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("performance_band", sa.String(length=64), server_default=sa.text("'Not rated'"), nullable=False),
        sa.Column("released_to_employee", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("released_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["employee_cycle_assignment_id"], ["employee_cycle_assignments.id"], name=op.f("fk_final_results_employee_cycle_assignment_id_employee_cycle_assignments"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["released_by_user_id"], ["users.id"], name=op.f("fk_final_results_released_by_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_final_results")),
        sa.UniqueConstraint("employee_cycle_assignment_id", name=op.f("uq_final_results_employee_cycle_assignment_id")),
    )

    op.create_table(
        "audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("entity_type", sa.String(length=128), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], name=op.f("fk_audit_events_actor_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_events")),
    )


def downgrade() -> None:
    op.drop_table("audit_events")
    op.drop_table("final_results")
    op.drop_table("self_appraisal_items")
    op.drop_table("self_appraisals")
    op.drop_table("employee_kpi_assignments")
    op.drop_table("employee_cycle_assignments")
    op.drop_table("designation_role_mappings")
    op.drop_table("kpi_pack_items")
    op.drop_table("kpi_packs")
    op.drop_table("appraisal_cycles")
    op.drop_table("manager_scopes")
    op.drop_table("user_capabilities")
    op.drop_table("employees")
    op.drop_index("uq_users_email_not_null", table_name="users")
    op.drop_table("users")
