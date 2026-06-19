from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.db import engine, get_db
from app.deps import get_current_user
from app.models import (
    AppraisalCycle,
    AuditEvent,
    DesignationRoleMapping,
    Employee,
    EmployeeCycleAssignment,
    EmployeeKpiAssignment,
    FinalResult,
    KpiPack,
    KpiPackItem,
    SelfAppraisal,
    SelfAppraisalItem,
    User,
)
from app.schemas import (
    AdminWorkspaceResponse,
    AssignmentResponse,
    EmployeeSummary,
    EmployeeWorkspaceResponse,
    ExcludedDesignationResponse,
    FinalResultResponse,
    FinalResultUpdateRequest,
    LoginRequest,
    LoginResponse,
    ManagerAssignmentUpdateRequest,
    ResolveDesignationSetupRequest,
    SelfAppraisalItemResponse,
    SelfAppraisalResponse,
    SelfAppraisalUpdateRequest,
    UnresolvedDesignationResponse,
    UnresolvedEmployeeResponse,
    UnresolvedManagerResponse,
    UserResponse,
    WorkspaceCollectionResponse,
)
from app.security import create_access_token, verify_password


settings = get_settings()


def _decimal_to_float(value: Decimal | float | int | None) -> float:
    if value is None:
        return 0.0
    return float(value)


def _capabilities(user: User) -> set[str]:
    return {item.capability for item in user.capabilities}


def _manager_scopes(user: User) -> list[str]:
    return [item.owner_label for item in user.manager_scopes]


def build_user_response(db: Session, user: User) -> UserResponse:
    employee_code = db.scalar(select(Employee.employee_code).where(Employee.user_id == user.id))
    return UserResponse(
        id=str(user.id),
        username=user.username,
        display_name=user.display_name,
        capabilities=sorted(_capabilities(user)),
        employee_code=employee_code,
        manager_scopes=_manager_scopes(user),
    )


def require_capability(user: User, capability: str) -> None:
    if capability not in _capabilities(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"{capability.title()} capability required")


def assignment_loader():
    return (
        selectinload(EmployeeCycleAssignment.employee),
        selectinload(EmployeeCycleAssignment.kpi_assignments),
        selectinload(EmployeeCycleAssignment.self_appraisal).selectinload(SelfAppraisal.items),
        selectinload(EmployeeCycleAssignment.final_result),
    )


def get_open_cycle(db: Session) -> AppraisalCycle:
    cycle = db.scalar(select(AppraisalCycle).where(AppraisalCycle.status == "open").order_by(AppraisalCycle.code.asc()))
    if not cycle:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="No open appraisal cycle configured")
    return cycle


def get_employee_assignment_for_current_user(db: Session, user: User) -> EmployeeCycleAssignment:
    employee = db.scalar(select(Employee).where(Employee.user_id == user.id))
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee profile not found")

    require_capability(user, "employee")
    cycle = get_open_cycle(db)
    assignment = db.scalar(
        select(EmployeeCycleAssignment)
        .where(
            EmployeeCycleAssignment.employee_id == employee.id,
            EmployeeCycleAssignment.appraisal_cycle_id == cycle.id,
        )
        .options(*assignment_loader())
    )
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No appraisal assignment found for current cycle")
    return assignment


def get_assignment_by_id(db: Session, assignment_id: UUID) -> EmployeeCycleAssignment:
    assignment = db.scalar(
        select(EmployeeCycleAssignment)
        .where(EmployeeCycleAssignment.id == assignment_id)
        .options(*assignment_loader())
    )
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appraisal assignment not found")
    return assignment


def get_assignment_by_employee_code(db: Session, employee_code: str, cycle: AppraisalCycle) -> EmployeeCycleAssignment:
    assignment = db.scalar(
        select(EmployeeCycleAssignment)
        .join(Employee)
        .where(
            Employee.employee_code == employee_code,
            EmployeeCycleAssignment.appraisal_cycle_id == cycle.id,
        )
        .options(*assignment_loader())
    )
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee appraisal assignment not found")
    return assignment


def get_managed_assignments(db: Session, user: User, cycle: AppraisalCycle) -> list[EmployeeCycleAssignment]:
    require_capability(user, "manager")
    scopes = _manager_scopes(user)
    if not scopes:
        return []
    return list(
        db.scalars(
            select(EmployeeCycleAssignment)
            .join(Employee)
            .where(
                EmployeeCycleAssignment.appraisal_cycle_id == cycle.id,
                EmployeeCycleAssignment.primary_owner_label.in_(scopes),
            )
            .order_by(Employee.full_name.asc())
            .options(*assignment_loader())
        )
    )


def get_all_assignments(db: Session, cycle: AppraisalCycle) -> list[EmployeeCycleAssignment]:
    return list(
        db.scalars(
            select(EmployeeCycleAssignment)
            .join(Employee)
            .where(EmployeeCycleAssignment.appraisal_cycle_id == cycle.id)
            .order_by(Employee.full_name.asc())
            .options(*assignment_loader())
        )
    )


def can_manage_assignment(user: User, assignment: EmployeeCycleAssignment) -> bool:
    return assignment.primary_owner_label in set(_manager_scopes(user))


def require_manager_scope(user: User, assignment: EmployeeCycleAssignment) -> None:
    require_capability(user, "manager")
    if not can_manage_assignment(user, assignment):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Employee is outside your manager scope")


def derive_final_score(kpi_assignments: list[EmployeeKpiAssignment]) -> float:
    total_weight = sum(_decimal_to_float(item.weight_percent) for item in kpi_assignments) or 100
    weighted = sum((item.manager_score / 5) * _decimal_to_float(item.weight_percent) for item in kpi_assignments)
    return round((weighted / total_weight) * 100, 1)


def performance_band(score: float) -> str:
    if score >= 85:
        return "Exceeds Expectations"
    if score >= 70:
        return "Strong Performance"
    if score >= 55:
        return "Solid Performance"
    if score > 0:
        return "Needs Improvement"
    return "Not rated"


def sync_self_items_with_kpis(assignment: EmployeeCycleAssignment) -> SelfAppraisal:
    if assignment.self_appraisal is None:
        assignment.self_appraisal = SelfAppraisal(
            employee_cycle_assignment_id=assignment.id,
            status="draft",
        )
    existing = {item.employee_kpi_assignment_id: item for item in assignment.self_appraisal.items}
    for kpi_assignment in assignment.kpi_assignments:
        if kpi_assignment.id not in existing:
            assignment.self_appraisal.items.append(
                SelfAppraisalItem(
                    employee_kpi_assignment_id=kpi_assignment.id,
                    self_score=0,
                )
            )
    return assignment.self_appraisal


def ensure_final_result(assignment: EmployeeCycleAssignment) -> FinalResult:
    if assignment.final_result is None:
        assignment.final_result = FinalResult(
            employee_cycle_assignment_id=assignment.id,
            self_summary=assignment.self_appraisal.overall_achievements if assignment.self_appraisal else None,
            manager_summary=None,
            final_recommendation=None,
            final_score=0,
            performance_band="Not rated",
            released_to_employee=False,
        )
    assignment.final_result.self_summary = assignment.self_appraisal.overall_achievements if assignment.self_appraisal else None
    score = derive_final_score(assignment.kpi_assignments)
    assignment.final_result.final_score = score
    assignment.final_result.performance_band = performance_band(score)
    return assignment.final_result


def ensure_manager_can_score(assignment: EmployeeCycleAssignment) -> None:
    if not assignment.self_appraisal or assignment.self_appraisal.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Manager review unlocks only after the employee submits self appraisal",
        )


def record_audit_event(
    db: Session,
    *,
    actor_user: User | None,
    entity_type: str,
    entity_id: UUID,
    event_type: str,
    payload: dict,
) -> None:
    db.add(
        AuditEvent(
            actor_user_id=actor_user.id if actor_user else None,
            entity_type=entity_type,
            entity_id=entity_id,
            event_type=event_type,
            payload_json=payload,
        )
    )


def serialize_workspace(assignment: EmployeeCycleAssignment, cycle_code: str) -> EmployeeWorkspaceResponse:
    employee = assignment.employee
    kpi_assignments = sorted(assignment.kpi_assignments, key=lambda item: item.sort_order)
    blockers = list(assignment.blockers_json or [])

    self_appraisal = assignment.self_appraisal
    self_response = None
    if self_appraisal:
        items = sorted(
            self_appraisal.items,
            key=lambda item: next(
                (k.sort_order for k in kpi_assignments if k.id == item.employee_kpi_assignment_id),
                10_000,
            ),
        )
        self_response = SelfAppraisalResponse(
            id=str(self_appraisal.id),
            status=self_appraisal.status,
            overall_achievements=self_appraisal.overall_achievements,
            major_challenges=self_appraisal.major_challenges,
            support_needed=self_appraisal.support_needed,
            development_focus=self_appraisal.development_focus,
            employee_comments=self_appraisal.employee_comments,
            submitted_at=self_appraisal.submitted_at.isoformat() if self_appraisal.submitted_at else None,
            items=[
                SelfAppraisalItemResponse(
                    employee_kpi_assignment_id=str(item.employee_kpi_assignment_id),
                    self_score=item.self_score,
                    reason_for_score=item.reason_for_score,
                    key_evidence=item.key_evidence,
                    challenges_faced=item.challenges_faced,
                )
                for item in items
            ],
        )

    final_result = assignment.final_result
    final_response = None
    if final_result:
        final_response = FinalResultResponse(
            id=str(final_result.id),
            self_summary=final_result.self_summary,
            manager_summary=final_result.manager_summary,
            final_recommendation=final_result.final_recommendation,
            final_score=_decimal_to_float(final_result.final_score),
            performance_band=final_result.performance_band,
            released_to_employee=final_result.released_to_employee,
        )

    return EmployeeWorkspaceResponse(
        cycle_code=cycle_code,
        employee=EmployeeSummary(
            employee_code=employee.employee_code,
            full_name=employee.full_name,
            designation=employee.designation,
            appraisal_role_name=assignment.appraisal_role_name,
            department=employee.department,
            level=employee.level,
            line_manager_label=assignment.line_manager_label,
            reviewer_label=assignment.reviewer_label,
            kpi_owner_label=assignment.kpi_owner_label,
            primary_owner_label=assignment.primary_owner_label,
            can_self_appraise=employee.can_self_appraise,
            status=assignment.status,
            blockers=blockers,
        ),
        assignments=[
            AssignmentResponse(
                id=str(item.id),
                kpi_area=item.kpi_area,
                kpi_statement=item.kpi_statement,
                weight_percent=_decimal_to_float(item.weight_percent),
                manager_score=item.manager_score,
                manager_comment=item.manager_comment,
                evidence_note=item.evidence_note,
                development_action=item.development_action,
                manager_status=item.manager_status,
            )
            for item in kpi_assignments
        ],
        self_appraisal=self_response,
        final_result=final_response,
    )


def build_unresolved_designations(assignments: list[EmployeeCycleAssignment]) -> list[UnresolvedDesignationResponse]:
    grouped: dict[str, UnresolvedDesignationResponse] = {}
    for assignment in assignments:
        if assignment.excluded_this_cycle or assignment.status == "ready":
            continue
        designation = assignment.employee.designation
        blockers = [str(item) for item in (assignment.blockers_json or [])]
        if designation not in grouped:
            grouped[designation] = UnresolvedDesignationResponse(
                designation=designation,
                suggested_appraisal_role=assignment.appraisal_role_name or "",
                line_manager_label=assignment.line_manager_label or assignment.primary_owner_label or "",
                notes="; ".join(blockers) if blockers else "Needs HR setup",
            )
    return sorted(grouped.values(), key=lambda item: item.designation.lower())


def build_unresolved_employees(assignments: list[EmployeeCycleAssignment]) -> list[UnresolvedEmployeeResponse]:
    items = [
        UnresolvedEmployeeResponse(
            employee_name=assignment.employee.full_name,
            designation=assignment.employee.designation,
            employee_id=assignment.employee.employee_code,
            status=assignment.status,
            blockers=[str(item) for item in (assignment.blockers_json or [])],
        )
        for assignment in assignments
        if assignment.status != "ready" and not assignment.excluded_this_cycle
    ]
    return sorted(items, key=lambda item: item.employee_name.lower())


def build_unresolved_managers(assignments: list[EmployeeCycleAssignment]) -> list[UnresolvedManagerResponse]:
    items = []
    for assignment in assignments:
        if assignment.excluded_this_cycle:
            continue
        label = (assignment.line_manager_label or "").strip()
        if label and "/" not in label and "," not in label:
            continue
        items.append(
            UnresolvedManagerResponse(
                employee_name=assignment.employee.full_name,
                designation=assignment.employee.designation,
                issue="No line manager label mapped" if not label else f"Manager label is ambiguous: {label}",
            )
        )
    return sorted(items, key=lambda item: item.employee_name.lower())


def build_excluded_designations(assignments: list[EmployeeCycleAssignment]) -> list[ExcludedDesignationResponse]:
    grouped: dict[str, ExcludedDesignationResponse] = {}
    for assignment in assignments:
        if not assignment.excluded_this_cycle:
            continue
        designation = assignment.employee.designation
        if designation not in grouped:
            grouped[designation] = ExcludedDesignationResponse(
                designation=designation,
                notes="Excluded from this appraisal cycle by decision.",
            )
    return sorted(grouped.values(), key=lambda item: item.designation.lower())


def serialize_admin_workspace(assignments: list[EmployeeCycleAssignment], cycle_code: str) -> AdminWorkspaceResponse:
    return AdminWorkspaceResponse(
        workspaces=[serialize_workspace(assignment, cycle_code) for assignment in assignments],
        unresolved_designations=build_unresolved_designations(assignments),
        unresolved_employees=build_unresolved_employees(assignments),
        unresolved_managers=build_unresolved_managers(assignments),
        excluded_designations=build_excluded_designations(assignments),
    )


def recreate_assignment_kpis(
    assignment: EmployeeCycleAssignment,
    *,
    pack: KpiPack,
    line_manager_label: str,
    reviewer_label: str,
    kpi_owner_label: str,
) -> None:
    primary_owner_label = kpi_owner_label or line_manager_label
    items = sorted(pack.items, key=lambda item: item.sort_order)
    blockers: list[str] = []
    status_name = "ready"
    if not items:
        blockers.append("No KPI pack exists for the mapped role")
    if not primary_owner_label:
        blockers.append("No appraisal owner / manager relationship mapped yet")
    if blockers:
        status_name = "blocked"

    if assignment.self_appraisal:
        assignment.self_appraisal.items.clear()
    assignment.kpi_assignments.clear()

    assignment.kpi_pack_id = pack.id
    assignment.appraisal_role_name = pack.role_name
    assignment.line_manager_label = line_manager_label or None
    assignment.reviewer_label = reviewer_label or None
    assignment.kpi_owner_label = kpi_owner_label or None
    assignment.primary_owner_label = primary_owner_label or None
    assignment.blockers_json = blockers
    assignment.status = status_name

    for index, item in enumerate(items, start=1):
        assignment.kpi_assignments.append(
            EmployeeKpiAssignment(
                kpi_pack_item_id=item.id,
                sort_order=index,
                kpi_area=item.kpi_area,
                kpi_statement=item.kpi_statement,
                weight_percent=item.weight_percent,
                manager_score=0,
                manager_comment=None,
                evidence_note=None,
                development_action=None,
                manager_status="pending",
            )
        )


def create_app(*, db_engine: Engine = engine) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield

    app = FastAPI(title=settings.app_title, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "environment": settings.app_env}

    @app.post("/auth/login", response_model=LoginResponse)
    def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
        user = db.scalar(
            select(User)
            .where(User.username == payload.username.strip().lower())
            .options(selectinload(User.capabilities), selectinload(User.manager_scopes))
        )
        if not user or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")
        token = create_access_token(user_id=str(user.id))
        return LoginResponse(access_token=token, user=build_user_response(db, user))

    @app.get("/me", response_model=UserResponse)
    def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UserResponse:
        return build_user_response(db, current_user)

    @app.get("/employee/me/workspace", response_model=EmployeeWorkspaceResponse)
    def employee_workspace(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> EmployeeWorkspaceResponse:
        assignment = get_employee_assignment_for_current_user(db, current_user)
        cycle = get_open_cycle(db)
        return serialize_workspace(assignment, cycle.code)

    @app.put("/employee/me/self-appraisal", response_model=EmployeeWorkspaceResponse)
    def update_employee_self_appraisal(
        payload: SelfAppraisalUpdateRequest,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> EmployeeWorkspaceResponse:
        assignment = get_employee_assignment_for_current_user(db, current_user)
        if not assignment.employee.can_self_appraise:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Self appraisal is disabled for this employee")

        self_appraisal = sync_self_items_with_kpis(assignment)
        self_appraisal.status = payload.status
        self_appraisal.overall_achievements = payload.overall_achievements
        self_appraisal.major_challenges = payload.major_challenges
        self_appraisal.support_needed = payload.support_needed
        self_appraisal.development_focus = payload.development_focus
        self_appraisal.employee_comments = payload.employee_comments
        self_appraisal.submitted_at = datetime.now(UTC) if payload.status == "submitted" else None

        assignment_ids = {item.id for item in assignment.kpi_assignments}
        existing_items = {str(item.employee_kpi_assignment_id): item for item in self_appraisal.items}
        for item_payload in payload.items:
            if UUID(item_payload.employee_kpi_assignment_id) not in assignment_ids:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Self appraisal item does not belong to current employee")
            item = existing_items.get(item_payload.employee_kpi_assignment_id)
            if not item:
                item = SelfAppraisalItem(
                    self_appraisal_id=self_appraisal.id,
                    employee_kpi_assignment_id=UUID(item_payload.employee_kpi_assignment_id),
                )
                db.add(item)
            item.self_score = item_payload.self_score
            item.reason_for_score = item_payload.reason_for_score
            item.key_evidence = item_payload.key_evidence
            item.challenges_faced = item_payload.challenges_faced

        ensure_final_result(assignment)
        record_audit_event(
            db,
            actor_user=current_user,
            entity_type="self_appraisal",
            entity_id=self_appraisal.id,
            event_type="submitted" if payload.status == "submitted" else "saved",
            payload={"status": payload.status},
        )
        db.commit()

        cycle = get_open_cycle(db)
        refreshed = get_assignment_by_id(db, assignment.id)
        return serialize_workspace(refreshed, cycle.code)

    @app.get("/manager/workspace", response_model=WorkspaceCollectionResponse)
    def manager_workspace(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> WorkspaceCollectionResponse:
        cycle = get_open_cycle(db)
        assignments = get_managed_assignments(db, current_user, cycle)
        return WorkspaceCollectionResponse(workspaces=[serialize_workspace(item, cycle.code) for item in assignments])

    @app.patch("/manager/assignments/{assignment_id}", response_model=EmployeeWorkspaceResponse)
    def update_manager_assignment(
        assignment_id: str,
        payload: ManagerAssignmentUpdateRequest,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> EmployeeWorkspaceResponse:
        kpi_assignment = db.get(EmployeeKpiAssignment, UUID(assignment_id))
        if not kpi_assignment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KPI assignment not found")
        assignment = get_assignment_by_id(db, kpi_assignment.employee_cycle_assignment_id)
        require_manager_scope(current_user, assignment)
        ensure_manager_can_score(assignment)

        if payload.manager_score is not None:
            kpi_assignment.manager_score = payload.manager_score
        if payload.manager_comment is not None:
            kpi_assignment.manager_comment = payload.manager_comment
        if payload.evidence_note is not None:
            kpi_assignment.evidence_note = payload.evidence_note
        if payload.development_action is not None:
            kpi_assignment.development_action = payload.development_action
        if payload.manager_status is not None:
            kpi_assignment.manager_status = payload.manager_status

        ensure_final_result(assignment)
        record_audit_event(
            db,
            actor_user=current_user,
            entity_type="employee_kpi_assignment",
            entity_id=kpi_assignment.id,
            event_type="manager_updated",
            payload={key: value for key, value in payload.model_dump().items() if value is not None},
        )
        db.commit()

        cycle = get_open_cycle(db)
        refreshed = get_assignment_by_id(db, assignment.id)
        return serialize_workspace(refreshed, cycle.code)

    @app.patch("/manager/final-results/{employee_code}", response_model=EmployeeWorkspaceResponse)
    def update_manager_final_result(
        employee_code: str,
        payload: FinalResultUpdateRequest,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> EmployeeWorkspaceResponse:
        cycle = get_open_cycle(db)
        assignment = get_assignment_by_employee_code(db, employee_code, cycle)
        require_manager_scope(current_user, assignment)
        ensure_manager_can_score(assignment)

        final_result = ensure_final_result(assignment)
        if payload.self_summary is not None:
            final_result.self_summary = payload.self_summary
        if payload.manager_summary is not None:
            final_result.manager_summary = payload.manager_summary
        if payload.final_recommendation is not None:
            final_result.final_recommendation = payload.final_recommendation

        record_audit_event(
            db,
            actor_user=current_user,
            entity_type="final_result",
            entity_id=final_result.id,
            event_type="manager_updated",
            payload={key: value for key, value in payload.model_dump().items() if value is not None},
        )
        db.commit()

        refreshed = get_assignment_by_id(db, assignment.id)
        return serialize_workspace(refreshed, cycle.code)

    @app.get("/admin/workspace", response_model=AdminWorkspaceResponse)
    def admin_workspace(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> AdminWorkspaceResponse:
        require_capability(current_user, "admin")
        cycle = get_open_cycle(db)
        assignments = get_all_assignments(db, cycle)
        return serialize_admin_workspace(assignments, cycle.code)

    @app.patch("/admin/final-results/{employee_code}", response_model=EmployeeWorkspaceResponse)
    def update_admin_final_result(
        employee_code: str,
        payload: FinalResultUpdateRequest,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> EmployeeWorkspaceResponse:
        require_capability(current_user, "admin")
        cycle = get_open_cycle(db)
        assignment = get_assignment_by_employee_code(db, employee_code, cycle)
        final_result = ensure_final_result(assignment)

        if payload.self_summary is not None:
            final_result.self_summary = payload.self_summary
        if payload.manager_summary is not None:
            final_result.manager_summary = payload.manager_summary
        if payload.final_recommendation is not None:
            final_result.final_recommendation = payload.final_recommendation
        if payload.released_to_employee is not None:
            final_result.released_to_employee = payload.released_to_employee
            final_result.released_at = datetime.now(UTC) if payload.released_to_employee else None
            final_result.released_by_user_id = current_user.id if payload.released_to_employee else None

        record_audit_event(
            db,
            actor_user=current_user,
            entity_type="final_result",
            entity_id=final_result.id,
            event_type="admin_updated",
            payload={key: value for key, value in payload.model_dump().items() if value is not None},
        )
        db.commit()

        refreshed = get_assignment_by_id(db, assignment.id)
        return serialize_workspace(refreshed, cycle.code)

    @app.post("/admin/designation-mappings/resolve", response_model=AdminWorkspaceResponse)
    def resolve_designation_setup(
        payload: ResolveDesignationSetupRequest,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> AdminWorkspaceResponse:
        require_capability(current_user, "admin")
        cycle = get_open_cycle(db)

        resolved_role_name = payload.role_name.strip() or payload.source_role_name.strip()
        if not resolved_role_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A target appraisal role is required")

        pack = db.scalar(select(KpiPack).where(KpiPack.role_name == resolved_role_name).options(selectinload(KpiPack.items)))
        if payload.entries:
            if not pack:
                pack = KpiPack(role_name=resolved_role_name)
                db.add(pack)
                db.flush()
            pack.items.clear()
            for index, entry in enumerate(payload.entries, start=1):
                pack.items.append(
                    KpiPackItem(
                        sort_order=index,
                        kpi_area=entry.kpi_area,
                        kpi_statement=entry.kpi_statement,
                        weight_percent=entry.weight_percent,
                    )
                )
        elif payload.source_role_name.strip():
            source_pack = db.scalar(
                select(KpiPack).where(KpiPack.role_name == payload.source_role_name.strip()).options(selectinload(KpiPack.items))
            )
            if not source_pack:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source KPI pack not found")
            if not pack:
                pack = KpiPack(role_name=resolved_role_name)
                db.add(pack)
                db.flush()
            pack.items.clear()
            for index, item in enumerate(sorted(source_pack.items, key=lambda row: row.sort_order), start=1):
                pack.items.append(
                    KpiPackItem(
                        sort_order=index,
                        kpi_area=item.kpi_area,
                        kpi_statement=item.kpi_statement,
                        weight_percent=item.weight_percent,
                    )
                )
        if not pack:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide either KPI entries or a source role to copy from")

        mapping = db.scalar(select(DesignationRoleMapping).where(DesignationRoleMapping.designation == payload.designation))
        if not mapping:
            mapping = DesignationRoleMapping(designation=payload.designation)
            db.add(mapping)
            db.flush()

        mapping.kpi_pack_id = pack.id
        mapping.line_manager_label = payload.manager_label.strip() or None
        mapping.reviewer_label = payload.reviewer_label.strip() or None
        mapping.kpi_owner_label = payload.kpi_owner_label.strip() or None
        mapping.self_appraisal_required = True
        mapping.needs_clarification = False
        mapping.notes = None

        designation_assignments = list(
            db.scalars(
                select(EmployeeCycleAssignment)
                .join(Employee)
                .where(
                    Employee.designation == payload.designation,
                    EmployeeCycleAssignment.appraisal_cycle_id == cycle.id,
                )
                .options(*assignment_loader(), selectinload(EmployeeCycleAssignment.kpi_assignments))
            )
        )
        for assignment in designation_assignments:
            assignment.designation_mapping_id = mapping.id
            recreate_assignment_kpis(
                assignment,
                pack=pack,
                line_manager_label=payload.manager_label.strip(),
                reviewer_label=payload.reviewer_label.strip(),
                kpi_owner_label=payload.kpi_owner_label.strip(),
            )
        db.flush()
        for assignment in designation_assignments:
            self_appraisal = sync_self_items_with_kpis(assignment)
            self_appraisal.status = "draft"
            ensure_final_result(assignment)

        record_audit_event(
            db,
            actor_user=current_user,
            entity_type="designation_role_mapping",
            entity_id=mapping.id,
            event_type="resolved",
            payload={
                "designation": payload.designation,
                "role_name": resolved_role_name,
                "source_role_name": payload.source_role_name,
                "entries_count": len(payload.entries),
            },
        )
        db.commit()

        assignments = get_all_assignments(db, cycle)
        return serialize_admin_workspace(assignments, cycle.code)

    return app


app = create_app()
