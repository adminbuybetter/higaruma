from __future__ import annotations

import json
import os
import re
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    AppraisalCycle,
    Employee,
    EmployeeCycleAssignment,
    EmployeeKpiAssignment,
    FinalResult,
    KpiPack,
    KpiPackItem,
    ManagerScope,
    SelfAppraisal,
    SelfAppraisalItem,
    User,
    UserCapability,
)
from app.security import hash_password


BACKEND_SEED_PATH = Path(__file__).with_name("seed.generated.json")


def resolve_seed_path() -> Path:
    env_path = os.getenv("APPRAISAL_SEED_PATH")
    if env_path:
        path = Path(env_path)
        if path.exists():
            return path

    if BACKEND_SEED_PATH.exists():
        return BACKEND_SEED_PATH

    raise FileNotFoundError(
        f"Seed file not found. Checked: {BACKEND_SEED_PATH}"
    )


def _load_seed() -> dict:
    seed_path = resolve_seed_path()
    text = seed_path.read_text(encoding="utf-8")
    if seed_path.suffix == ".json":
        return json.loads(text)
    text = re.sub(r"^export const generatedSeed = ", "", text)
    text = re.sub(r" as const;\s*$", "", text)
    return json.loads(text)


def sync_employee_designations_from_seed(db: Session, seed: dict) -> None:
    employee_rows = {row["employeeId"]: row for row in seed.get("employees", [])}
    employees = list(db.scalars(select(Employee)))
    updated = False

    for employee in employees:
        row = employee_rows.get(employee.employee_code)
        if not row:
            continue
        next_designation = row.get("designation") or employee.designation
        if employee.designation != next_designation:
            employee.designation = next_designation
            updated = True

    if updated:
        db.commit()


def _sync_string_collection(db: Session, existing_items, desired_values: set[str], attribute_name: str, factory, owner_id) -> bool:
    existing_values = {getattr(item, attribute_name) for item in existing_items}
    changed = False

    for item in existing_items:
        value = getattr(item, attribute_name)
        if value not in desired_values:
            db.delete(item)
            changed = True

    missing_values = desired_values - existing_values
    for value in sorted(missing_values):
        db.add(factory(owner_id, value))
        changed = True

    return changed


def sync_users_from_seed(db: Session, seed: dict) -> None:
    users_by_username = {
        user.username: user
        for user in db.scalars(
            select(User).options(
                selectinload(User.capabilities),
                selectinload(User.manager_scopes),
            )
        )
    }
    updated = False

    for user_row in seed.get("users", []):
        username = user_row["username"]
        user = users_by_username.get(username)
        password_hash = hash_password(user_row["password"])

        if user is None:
            user = User(
                username=username,
                email=user_row.get("email") or None,
                password_hash=password_hash,
                display_name=user_row["displayName"],
                is_active=True,
            )
            db.add(user)
            db.flush()
            users_by_username[username] = user
            updated = True
        else:
            next_email = user_row.get("email") or None
            next_display_name = user_row["displayName"]
            if user.email != next_email:
                user.email = next_email
                updated = True
            if user.display_name != next_display_name:
                user.display_name = next_display_name
                updated = True
            if user.password_hash != password_hash:
                user.password_hash = password_hash
                updated = True
            if not user.is_active:
                user.is_active = True
                updated = True

        capability_values = set(user_row.get("capabilities", []))
        scope_values = set(user_row.get("managerScopes", []))

        existing_capabilities = list(user.capabilities)
        existing_scopes = list(user.manager_scopes)

        updated = _sync_string_collection(
            db,
            existing_capabilities,
            capability_values,
            "capability",
            lambda user_id, value: UserCapability(user_id=user_id, capability=value),
            user.id,
        ) or updated
        updated = _sync_string_collection(
            db,
            existing_scopes,
            scope_values,
            "owner_label",
            lambda user_id, value: ManagerScope(user_id=user_id, owner_label=value),
            user.id,
        ) or updated

    if updated:
        db.commit()


def sync_employees_and_assignments_from_seed(db: Session, seed: dict) -> None:
    cycle_row = seed.get("cycle", {})
    cycle = db.scalar(select(AppraisalCycle).where(AppraisalCycle.code == cycle_row.get("id")))
    if not cycle:
        return

    employee_rows = {row["employeeId"]: row for row in seed.get("employees", [])}
    users_by_username = {user.username: user for user in db.scalars(select(User))}
    employees = list(
        db.scalars(
            select(Employee).options(selectinload(Employee.cycle_assignments))
        )
    )
    updated = False

    for employee in employees:
        row = employee_rows.get(employee.employee_code)
        if not row:
            continue

        next_full_name = row["employeeName"]
        next_designation = row.get("designation") or employee.designation
        next_department = row.get("department")
        next_level = row.get("level")
        next_can_self_appraise = row.get("canSelfAppraise", True)
        next_excluded_default = row.get("excludedThisCycle", False)
        next_user = users_by_username.get(row.get("employeeUsername") or "")
        next_user_id = next_user.id if next_user else None

        if employee.full_name != next_full_name:
            employee.full_name = next_full_name
            updated = True
        if employee.designation != next_designation:
            employee.designation = next_designation
            updated = True
        if employee.department != next_department:
            employee.department = next_department
            updated = True
        if employee.level != next_level:
            employee.level = next_level
            updated = True
        if employee.can_self_appraise != next_can_self_appraise:
            employee.can_self_appraise = next_can_self_appraise
            updated = True
        if employee.excluded_this_cycle_default != next_excluded_default:
            employee.excluded_this_cycle_default = next_excluded_default
            updated = True
        if employee.user_id != next_user_id:
            employee.user_id = next_user_id
            updated = True

        assignment = next(
            (
                item
                for item in employee.cycle_assignments
                if item.appraisal_cycle_id == cycle.id
            ),
            None,
        )
        if assignment is None:
            continue

        next_values = {
            "appraisal_role_name": row.get("appraisalRole") or None,
            "line_manager_label": row.get("managerLabel") or None,
            "reviewer_label": row.get("reviewerLabel") or None,
            "kpi_owner_label": row.get("kpiOwnerLabel") or None,
            "primary_owner_label": row.get("primaryOwnerLabel") or None,
            "status": row.get("status") or "blocked",
            "excluded_this_cycle": row.get("excludedThisCycle", False),
            "blockers_json": row.get("blockers", []),
        }

        for field_name, value in next_values.items():
            if getattr(assignment, field_name) != value:
                setattr(assignment, field_name, value)
                updated = True

    if updated:
        db.commit()


def parse_optional_datetime(raw_value: str | None) -> datetime | None:
    if not raw_value:
        return None
    return datetime.fromisoformat(raw_value)


def sync_cycle_windows_from_seed(db: Session, seed: dict) -> None:
    cycle_row = seed.get("cycle", {})
    cycle = db.scalar(select(AppraisalCycle).where(AppraisalCycle.code == cycle_row.get("id")))
    if not cycle:
        return

    next_values = {
        "opens_at": parse_optional_datetime(cycle_row.get("opensAt")),
        "closes_at": parse_optional_datetime(cycle_row.get("closesAt")),
        "self_opens_at": parse_optional_datetime(cycle_row.get("selfOpensAt")),
        "self_closes_at": parse_optional_datetime(cycle_row.get("selfClosesAt")),
        "manager_opens_at": parse_optional_datetime(cycle_row.get("managerOpensAt")),
        "manager_closes_at": parse_optional_datetime(cycle_row.get("managerClosesAt")),
    }

    updated = False
    for field_name, value in next_values.items():
        if getattr(cycle, field_name) != value:
            setattr(cycle, field_name, value)
            updated = True

    if updated:
        db.commit()


def bootstrap_from_seed(db: Session) -> None:
    seed = _load_seed()
    if db.scalar(select(User.id).limit(1)):
        sync_users_from_seed(db, seed)
        sync_employee_designations_from_seed(db, seed)
        sync_employees_and_assignments_from_seed(db, seed)
        sync_cycle_windows_from_seed(db, seed)
        return

    opens_at = seed["cycle"].get("opensAt")
    closes_at = seed["cycle"].get("closesAt")
    self_opens_at = seed["cycle"].get("selfOpensAt")
    self_closes_at = seed["cycle"].get("selfClosesAt")
    manager_opens_at = seed["cycle"].get("managerOpensAt")
    manager_closes_at = seed["cycle"].get("managerClosesAt")
    cycle = AppraisalCycle(
        code=seed["cycle"]["id"],
        name=seed["cycle"]["name"],
        status="open",
        opens_at=parse_optional_datetime(opens_at),
        closes_at=parse_optional_datetime(closes_at),
        self_opens_at=parse_optional_datetime(self_opens_at),
        self_closes_at=parse_optional_datetime(self_closes_at),
        manager_opens_at=parse_optional_datetime(manager_opens_at),
        manager_closes_at=parse_optional_datetime(manager_closes_at),
    )
    db.add(cycle)
    db.flush()

    assignments_by_employee: dict[str, list[dict]] = {}
    for assignment in seed["assignments"]:
        assignments_by_employee.setdefault(assignment["employeeId"], []).append(assignment)

    self_by_employee = {row["employeeId"]: row for row in seed["selfAppraisals"]}
    final_by_employee = {row["employeeId"]: row for row in seed["finalResults"]}
    employee_rows = {row["employeeId"]: row for row in seed["employees"]}

    role_packs: dict[str, KpiPack] = {}
    role_pack_items: dict[tuple[str, str, str], KpiPackItem] = {}

    user_by_employee_code: dict[str, User] = {}
    user_by_username: dict[str, User] = {}

    for user_row in seed["users"]:
        user = User(
            username=user_row["username"],
            email=user_row.get("email") or None,
            password_hash=hash_password(user_row["password"]),
            display_name=user_row["displayName"],
            is_active=True,
        )
        db.add(user)
        db.flush()
        for capability in user_row.get("capabilities", []):
            db.add(UserCapability(user_id=user.id, capability=capability))
        for scope in user_row.get("managerScopes", []):
            db.add(ManagerScope(user_id=user.id, owner_label=scope))
        employee_code = user_row.get("employeeId")
        if employee_code:
            user_by_employee_code[employee_code] = user
        user_by_username[user.username] = user

    db.flush()

    for employee_code, employee_row in employee_rows.items():
        user = user_by_employee_code.get(employee_code)
        employee = Employee(
            employee_code=employee_code,
            user_id=user.id if user else None,
            full_name=employee_row["employeeName"],
            designation=employee_row["designation"],
            department=employee_row.get("department"),
            level=employee_row.get("level"),
            employment_status="active",
            can_self_appraise=employee_row.get("canSelfAppraise", True),
            excluded_this_cycle_default=employee_row.get("excludedThisCycle", False),
        )
        db.add(employee)
        db.flush()

        employee_assignments = sorted(assignments_by_employee.get(employee_code, []), key=lambda item: item["assignmentId"])
        appraisal_role = employee_row.get("appraisalRole") or None
        assignment_record = EmployeeCycleAssignment(
            employee_id=employee.id,
            appraisal_cycle_id=cycle.id,
            appraisal_role_name=appraisal_role,
            line_manager_label=employee_row.get("managerLabel") or None,
            reviewer_label=employee_row.get("reviewerLabel") or None,
            kpi_owner_label=employee_row.get("kpiOwnerLabel") or None,
            primary_owner_label=employee_row.get("primaryOwnerLabel") or None,
            status=employee_row.get("status") or "blocked",
            excluded_this_cycle=employee_row.get("excludedThisCycle", False),
            blockers_json=employee_row.get("blockers", []),
        )
        db.add(assignment_record)
        db.flush()

        if appraisal_role and appraisal_role not in role_packs and employee_assignments:
            pack = KpiPack(role_name=appraisal_role, department=employee_row.get("department"))
            db.add(pack)
            db.flush()
            role_packs[appraisal_role] = pack

        if appraisal_role and appraisal_role in role_packs:
            assignment_record.kpi_pack_id = role_packs[appraisal_role].id

        assignment_entities: dict[str, EmployeeKpiAssignment] = {}
        for sort_order, assignment in enumerate(employee_assignments, start=1):
            pack_item_id = None
            if appraisal_role and appraisal_role in role_packs:
                key = (appraisal_role, assignment["kpiArea"], assignment["kpiStatement"])
                if key not in role_pack_items:
                    item = KpiPackItem(
                        kpi_pack_id=role_packs[appraisal_role].id,
                        sort_order=sort_order,
                        kpi_area=assignment["kpiArea"],
                        kpi_statement=assignment["kpiStatement"],
                        weight_percent=Decimal(str(assignment["weightPercent"])),
                    )
                    db.add(item)
                    db.flush()
                    role_pack_items[key] = item
                pack_item_id = role_pack_items[key].id

            entity = EmployeeKpiAssignment(
                employee_cycle_assignment_id=assignment_record.id,
                kpi_pack_item_id=pack_item_id,
                sort_order=sort_order,
                kpi_area=assignment["kpiArea"],
                kpi_statement=assignment["kpiStatement"],
                weight_percent=Decimal(str(assignment["weightPercent"])),
                manager_score=assignment.get("score", 0),
                manager_comment=assignment.get("managerComment") or None,
                evidence_note=assignment.get("evidenceNote") or None,
                development_action=assignment.get("developmentAction") or None,
                manager_status=assignment.get("status") or "pending",
            )
            db.add(entity)
            db.flush()
            assignment_entities[assignment["assignmentId"]] = entity

        self_row = self_by_employee.get(employee_code)
        if self_row:
            self_appraisal = SelfAppraisal(
                employee_cycle_assignment_id=assignment_record.id,
                status=self_row.get("status", "draft"),
                overall_achievements=self_row.get("overallAchievements") or None,
                major_challenges=self_row.get("majorChallenges") or None,
                support_needed=self_row.get("supportNeeded") or None,
                development_focus=self_row.get("developmentFocus") or None,
                employee_comments=self_row.get("employeeComments") or None,
            )
            db.add(self_appraisal)
            db.flush()
            for entry in self_row.get("kpiEntries", []):
                assignment_id = entry["assignmentId"]
                assignment_entity = assignment_entities.get(assignment_id)
                if not assignment_entity:
                    continue
                db.add(
                    SelfAppraisalItem(
                        self_appraisal_id=self_appraisal.id,
                        employee_kpi_assignment_id=assignment_entity.id,
                        self_score=entry.get("selfScore", 0),
                        reason_for_score=entry.get("reasonForScore") or None,
                        key_evidence=entry.get("keyEvidence") or None,
                        challenges_faced=entry.get("challengesFaced") or None,
                    )
                )

        final_row = final_by_employee.get(employee_code)
        if final_row:
            db.add(
                FinalResult(
                    employee_cycle_assignment_id=assignment_record.id,
                    self_summary=final_row.get("selfSummary") or None,
                    manager_summary=final_row.get("managerSummary") or None,
                    final_recommendation=final_row.get("finalRecommendation") or None,
                    final_score=Decimal(str(final_row.get("finalScore", 0))),
                    performance_band=final_row.get("performanceBand") or "Not rated",
                    released_to_employee=final_row.get("releasedToEmployee", False),
                )
            )

    db.commit()
