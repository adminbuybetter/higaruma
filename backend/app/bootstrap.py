from __future__ import annotations

import json
import os
import re
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

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


def bootstrap_from_seed(db: Session) -> None:
    if db.scalar(select(User.id).limit(1)):
        return

    seed = _load_seed()

    cycle = AppraisalCycle(code=seed["cycle"]["id"], name=seed["cycle"]["name"], status="open")
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
