import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        Index(
            "uq_users_email_not_null",
            "email",
            unique=True,
            postgresql_where=text("email IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    username: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))

    capabilities: Mapped[list["UserCapability"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    manager_scopes: Mapped[list["ManagerScope"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserCapability(Base):
    __tablename__ = "user_capabilities"
    __table_args__ = (UniqueConstraint("user_id", "capability"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    capability: Mapped[str] = mapped_column(String(32), nullable=False)

    user: Mapped["User"] = relationship(back_populates="capabilities")


class Employee(Base, TimestampMixin):
    __tablename__ = "employees"

    id: Mapped[uuid.UUID] = uuid_pk()
    employee_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    designation: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    level: Mapped[str | None] = mapped_column(String(255), nullable=True)
    employment_status: Mapped[str] = mapped_column(String(64), nullable=False, default="active", server_default=text("'active'"))
    can_self_appraise: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    excluded_this_cycle_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))

    cycle_assignments: Mapped[list["EmployeeCycleAssignment"]] = relationship(back_populates="employee")


class ManagerScope(Base):
    __tablename__ = "manager_scopes"
    __table_args__ = (UniqueConstraint("user_id", "owner_label"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    owner_label: Mapped[str] = mapped_column(String(255), nullable=False)

    user: Mapped["User"] = relationship(back_populates="manager_scopes")


class AppraisalCycle(Base, TimestampMixin):
    __tablename__ = "appraisal_cycles"

    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(64), nullable=False)
    opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class KpiPack(Base, TimestampMixin):
    __tablename__ = "kpi_packs"

    id: Mapped[uuid.UUID] = uuid_pk()
    role_name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_reference: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))

    items: Mapped[list["KpiPackItem"]] = relationship(back_populates="kpi_pack", cascade="all, delete-orphan")


class KpiPackItem(Base):
    __tablename__ = "kpi_pack_items"
    __table_args__ = (
        CheckConstraint("weight_percent >= 0", name="weight_percent_non_negative"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    kpi_pack_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kpi_packs.id", ondelete="CASCADE"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    kpi_area: Mapped[str] = mapped_column(String(255), nullable=False)
    kpi_statement: Mapped[str] = mapped_column(Text, nullable=False)
    weight_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))

    kpi_pack: Mapped["KpiPack"] = relationship(back_populates="items")


class DesignationRoleMapping(Base, TimestampMixin):
    __tablename__ = "designation_role_mappings"

    id: Mapped[uuid.UUID] = uuid_pk()
    designation: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    kpi_pack_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("kpi_packs.id", ondelete="SET NULL"), nullable=True)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    line_manager_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewer_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    kpi_owner_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    self_appraisal_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    needs_clarification: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class EmployeeCycleAssignment(Base, TimestampMixin):
    __tablename__ = "employee_cycle_assignments"
    __table_args__ = (UniqueConstraint("employee_id", "appraisal_cycle_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    appraisal_cycle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("appraisal_cycles.id", ondelete="CASCADE"), nullable=False)
    designation_mapping_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("designation_role_mappings.id", ondelete="SET NULL"), nullable=True
    )
    kpi_pack_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("kpi_packs.id", ondelete="SET NULL"), nullable=True)
    appraisal_role_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    line_manager_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewer_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    kpi_owner_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    primary_owner_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(64), nullable=False)
    excluded_this_cycle: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    blockers_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))

    employee: Mapped["Employee"] = relationship(back_populates="cycle_assignments")
    kpi_assignments: Mapped[list["EmployeeKpiAssignment"]] = relationship(back_populates="employee_cycle_assignment", cascade="all, delete-orphan")
    self_appraisal: Mapped["SelfAppraisal | None"] = relationship(back_populates="employee_cycle_assignment", uselist=False, cascade="all, delete-orphan")
    final_result: Mapped["FinalResult | None"] = relationship(back_populates="employee_cycle_assignment", uselist=False, cascade="all, delete-orphan")


class EmployeeKpiAssignment(Base, TimestampMixin):
    __tablename__ = "employee_kpi_assignments"

    id: Mapped[uuid.UUID] = uuid_pk()
    employee_cycle_assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("employee_cycle_assignments.id", ondelete="CASCADE"), nullable=False
    )
    kpi_pack_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("kpi_pack_items.id", ondelete="SET NULL"), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    kpi_area: Mapped[str] = mapped_column(String(255), nullable=False)
    kpi_statement: Mapped[str] = mapped_column(Text, nullable=False)
    weight_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    manager_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    manager_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    development_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    manager_status: Mapped[str] = mapped_column(String(64), nullable=False, default="pending", server_default=text("'pending'"))

    employee_cycle_assignment: Mapped["EmployeeCycleAssignment"] = relationship(back_populates="kpi_assignments")
    self_items: Mapped[list["SelfAppraisalItem"]] = relationship(back_populates="employee_kpi_assignment", cascade="all, delete-orphan")


class SelfAppraisal(Base, TimestampMixin):
    __tablename__ = "self_appraisals"
    __table_args__ = (UniqueConstraint("employee_cycle_assignment_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    employee_cycle_assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("employee_cycle_assignments.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="draft", server_default=text("'draft'"))
    overall_achievements: Mapped[str | None] = mapped_column(Text, nullable=True)
    major_challenges: Mapped[str | None] = mapped_column(Text, nullable=True)
    support_needed: Mapped[str | None] = mapped_column(Text, nullable=True)
    development_focus: Mapped[str | None] = mapped_column(Text, nullable=True)
    employee_comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    employee_cycle_assignment: Mapped["EmployeeCycleAssignment"] = relationship(back_populates="self_appraisal")
    items: Mapped[list["SelfAppraisalItem"]] = relationship(back_populates="self_appraisal", cascade="all, delete-orphan")


class SelfAppraisalItem(Base, TimestampMixin):
    __tablename__ = "self_appraisal_items"
    __table_args__ = (UniqueConstraint("self_appraisal_id", "employee_kpi_assignment_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    self_appraisal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("self_appraisals.id", ondelete="CASCADE"), nullable=False)
    employee_kpi_assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("employee_kpi_assignments.id", ondelete="CASCADE"), nullable=False
    )
    self_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    reason_for_score: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    challenges_faced: Mapped[str | None] = mapped_column(Text, nullable=True)

    self_appraisal: Mapped["SelfAppraisal"] = relationship(back_populates="items")
    employee_kpi_assignment: Mapped["EmployeeKpiAssignment"] = relationship(back_populates="self_items")


class FinalResult(Base, TimestampMixin):
    __tablename__ = "final_results"
    __table_args__ = (UniqueConstraint("employee_cycle_assignment_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    employee_cycle_assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("employee_cycle_assignments.id", ondelete="CASCADE"), nullable=False
    )
    self_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    manager_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    final_recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)
    final_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0, server_default=text("0"))
    performance_band: Mapped[str] = mapped_column(String(64), nullable=False, default="Not rated", server_default=text("'Not rated'"))
    released_to_employee: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    released_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    employee_cycle_assignment: Mapped["EmployeeCycleAssignment"] = relationship(back_populates="final_result")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = uuid_pk()
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    entity_type: Mapped[str] = mapped_column(String(128), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
