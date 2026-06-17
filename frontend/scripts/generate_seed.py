import csv
import json
import re
from pathlib import Path


APP_DIR = Path("/Users/kamsi/Downloads/odoo1/appraisal-web-prototype/frontend")
SOURCE_DIR = Path("/Users/kamsi/Downloads/Technology 2/JOB DESCRIPTION_ IT DEPARTMENT")

ROSTER_PATH = SOURCE_DIR / "Employee_Roster_Template.csv"
DESIGNATION_PATH = SOURCE_DIR / "Designation_Mapping_Template.csv"
OWNERSHIP_PATH = SOURCE_DIR / "Appraisal_Ownership_Matrix_2026.csv"
MASTER_PATH = SOURCE_DIR / "Company_Appraisal_Master_Sheet_Template.csv"


def read_csv(path: Path):
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", ".", value.lower()).strip(".")
    cleaned = re.sub(r"\.+", ".", cleaned)
    return cleaned or "user"


def username_from_name(name: str) -> str:
    parts = [part for part in re.split(r"\s+", name.strip()) if part]
    if not parts:
        return "user"
    if len(parts) == 1:
        return slugify(parts[0])
    return slugify(f"{parts[0]}.{parts[-1]}")


def employee_password(employee_id: str) -> str:
    suffix = employee_id.split("-")[-1]
    return f"Appraise{suffix}!"


def manager_password(index: int) -> str:
    return f"Manager{index:03d}!"


def admin_password() -> str:
    return "AppraisalAdmin2026!"


REMOVED_EMPLOYEES = {
    "Obathare Reuben Ejovwo",
    "Umaru Dogari",
    "Luka Ishaka",
    "Stephen Caleb",
}

MANAGER_ONLY_EMPLOYEES = {
    "Sandra Dunkwu",
}

ADMIN_CAPABILITY_EMPLOYEES = {
    "Sandra Dunkwu",
    "Samuel Mbudinma",
}

EMPLOYEE_ROLE_OVERRIDES = {
    "Alice Ochigbo": {
        "appraisal_role": "Inventory Officers & Leads",
        "manager_label": "Growth Lead",
        "kpi_owner_label": "Growth Lead",
        "department": "Partnerships Inventory",
        "self_required": True,
        "excluded_this_cycle": False,
    },
    "Chukwuejim Alexandra": {
        "appraisal_role": "Inventory Officers & Leads",
        "manager_label": "Growth Lead",
        "kpi_owner_label": "Growth Lead",
        "department": "Partnerships Inventory",
        "self_required": True,
        "excluded_this_cycle": False,
    },
}

MANAGER_SCOPE_BY_EMPLOYEE = {
    "Sandra Dunkwu": ["Chief of Staff"],
    "Dare Peters": [
        "Head of Operations",
        "Operations Manager",
        "Operations Supervisor",
        "Procurement Lead / Head of Operations",
    ],
    "Ololade Shoyemi": ["Growth Lead", "Growth Manager", "Head of Growth"],
    "Rebecca Lasekan": ["Finance Lead"],
    "Kamsiriochi Nwaukwa": ["Head of IT", "IT Manager"],
    "Udeh Ifeanyi Clement": ["Head of Inventory"],
}


designation_rows = read_csv(DESIGNATION_PATH)
ownership_rows = read_csv(OWNERSHIP_PATH)
master_rows = read_csv(MASTER_PATH)
roster_rows = read_csv(ROSTER_PATH)

designation_map = {row["roster_designation"]: row for row in designation_rows}
ownership_map = {row["job_title"]: row for row in ownership_rows}

role_kpis = {}
for row in master_rows:
    role = (row.get("job_title") or "").strip()
    statement = (row.get("kpi_statement") or "").strip()
    area = (row.get("kpi_area") or "").strip()
    if not role or not statement:
        continue
    role_kpis.setdefault(role, [])
    role_kpis[role].append(
        {
            "kpiArea": area,
            "kpiStatement": statement,
            "weightPercent": int(float(row.get("weight_percent") or 0) or 0),
        }
    )

for items in role_kpis.values():
    seen = set()
    deduped = []
    for item in items:
        key = (item["kpiArea"], item["kpiStatement"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    items[:] = deduped


manager_labels = set()
employees = []
users = []
self_appraisals = []
final_results = []
assignments = []
custom_role_packs = []
unresolved_designations = []
unresolved_employees = []
unresolved_managers = []
excluded_designations = []

for row in designation_rows:
    needs_clarification = (row.get("needs_clarification") or "").strip().lower() == "yes"
    self_required = (row.get("self_appraisal_required") or "").strip().lower() != "no"
    if needs_clarification:
        unresolved_designations.append(
            {
                "designation": row["roster_designation"],
                "suggestedAppraisalRole": row.get("suggested_appraisal_role") or "",
                "lineManagerLabel": row.get("line_manager") or "",
                "notes": row.get("notes") or "",
            }
        )
    elif not self_required:
        excluded_designations.append(
            {
                "designation": row["roster_designation"],
                "notes": row.get("notes") or "",
            }
        )


def effective_role(roster_row, designation_row):
    role = (roster_row.get("mapped_appraisal_role") or "").strip()
    if role:
        return role
    exact = (designation_row.get("matched_existing_role") or "").strip()
    if exact:
        return exact
    suggested = (designation_row.get("suggested_appraisal_role") or "").strip()
    if suggested:
        return suggested
    return ""


for roster_row in roster_rows:
    employee_name = (roster_row.get("employee_name") or "").strip()
    if employee_name in REMOVED_EMPLOYEES:
        continue

    override = EMPLOYEE_ROLE_OVERRIDES.get(employee_name, {})
    designation = (roster_row.get("roster_designation") or "").strip()
    designation_row = designation_map.get(designation, {})
    default_self_required = (designation_row.get("self_appraisal_required") or "Yes").strip().lower() != "no"
    self_required = override.get("self_required", default_self_required)
    role = override.get("appraisal_role") or effective_role(roster_row, designation_row)
    ownership = ownership_map.get(role, {})
    manager_label = (
        (override.get("manager_label") or "").strip()
        or
        (roster_row.get("line_manager") or "").strip()
        or (designation_row.get("line_manager") or "").strip()
        or (ownership.get("line_manager") or "").strip()
    )
    reviewer_label = (
        (roster_row.get("reviewer") or "").strip()
        or (designation_row.get("reviewer") or "").strip()
        or (ownership.get("reviewer") or "").strip()
    )
    kpi_owner_label = (
        (override.get("kpi_owner_label") or "").strip()
        or
        (roster_row.get("kpi_owner") or "").strip()
        or (designation_row.get("kpi_owner") or "").strip()
        or (ownership.get("kpi_owner") or "").strip()
    )
    department = (
        (override.get("department") or "").strip()
        or
        (roster_row.get("department") or "").strip()
        or (designation_row.get("department") or "").strip()
        or (ownership.get("department") or "").strip()
    )
    clarification_flag = (designation_row.get("needs_clarification") or "").strip().lower() == "yes"
    if override.get("appraisal_role"):
        clarification_flag = False
    kpis = role_kpis.get(role, [])
    excluded_this_cycle = bool(override.get("excluded_this_cycle", not self_required))
    status = "ready"
    blockers = []
    if not role:
        status = "blocked"
        blockers.append("No KPI role mapped yet")
    elif not kpis:
        status = "blocked"
        blockers.append("No KPI pack exists for the mapped role")
    elif clarification_flag:
        status = "tentative"
        blockers.append("Role mapping still marked for clarification")

    if not manager_label and not kpi_owner_label:
        status = "blocked" if status == "ready" else status
        blockers.append("No appraisal owner / manager relationship mapped yet")

    if manager_label:
        manager_labels.add(manager_label)
    if kpi_owner_label:
        manager_labels.add(kpi_owner_label)
    if reviewer_label:
        manager_labels.add(reviewer_label)

    employee_id = (roster_row.get("employee_id") or "").strip()
    username = username_from_name(employee_name)
    capabilities = []
    if employee_name not in MANAGER_ONLY_EMPLOYEES:
        capabilities.append("employee")
    if employee_name in MANAGER_SCOPE_BY_EMPLOYEE:
        capabilities.append("manager")
    if employee_name in ADMIN_CAPABILITY_EMPLOYEES:
        capabilities.append("admin")
    if capabilities:
        users.append(
            {
                "id": employee_id,
                "username": username,
                "password": employee_password(employee_id),
                "displayName": employee_name,
                "kind": capabilities[0],
                "capabilities": capabilities,
                "employeeId": employee_id if "employee" in capabilities else None,
                "managerScopes": MANAGER_SCOPE_BY_EMPLOYEE.get(employee_name, []),
            }
        )

    if employee_name in MANAGER_ONLY_EMPLOYEES:
        continue

    primary_owner_label = kpi_owner_label or manager_label
    employee = {
        "employeeId": employee_id,
        "employeeName": employee_name,
        "designation": designation,
        "appraisalRole": role,
        "department": department or "Unassigned",
        "level": (roster_row.get("level") or "").strip() or "Unknown",
        "employeeUsername": username,
        "managerLabel": manager_label,
        "reviewerLabel": reviewer_label,
        "kpiOwnerLabel": kpi_owner_label,
        "primaryOwnerLabel": primary_owner_label,
        "status": status,
        "blockers": blockers,
        "excludedThisCycle": excluded_this_cycle,
        "canSelfAppraise": self_required,
        "canViewFinalResult": status != "blocked",
    }
    employees.append(employee)

    self_appraisals.append(
        {
            "employeeId": employee_id,
            "employeeName": employee_name,
            "employeeUsername": username,
            "cycle": "2026-H1",
            "kpiEntries": [
                {
                    "assignmentId": f"{employee_id}-KPI-{index:02d}",
                    "kpiArea": kpi["kpiArea"],
                    "kpiStatement": kpi["kpiStatement"],
                    "selfScore": 0,
                    "reasonForScore": "",
                    "keyEvidence": "",
                    "challengesFaced": "",
                }
                for index, kpi in enumerate(kpis, start=1)
            ],
            "overallAchievements": "",
            "majorChallenges": "",
            "supportNeeded": "",
            "developmentFocus": "",
            "employeeComments": "",
            "status": "draft",
        }
    )

    final_results.append(
        {
            "employeeId": employee_id,
            "employeeName": employee_name,
            "employeeUsername": username,
            "cycle": "2026-H1",
            "managerSummary": "",
            "selfSummary": "",
            "finalRecommendation": "",
            "finalScore": 0,
            "performanceBand": "Not rated",
            "releasedToEmployee": False,
        }
    )

    if status != "blocked":
        for index, kpi in enumerate(kpis, start=1):
            assignments.append(
                {
                    "assignmentId": f"{employee_id}-KPI-{index:02d}",
                    "cycle": "2026-H1",
                    "employeeId": employee_id,
                    "employeeName": employee_name,
                    "employeeUsername": username,
                    "jobTitle": role,
                    "department": department or "Unassigned",
                    "kpiArea": kpi["kpiArea"],
                    "kpiStatement": kpi["kpiStatement"],
                    "weightPercent": kpi["weightPercent"],
                    "managerLabel": manager_label,
                    "reviewerLabel": reviewer_label,
                    "kpiOwnerLabel": kpi_owner_label,
                    "primaryOwnerLabel": primary_owner_label,
                    "score": 0,
                    "managerComment": "",
                    "evidenceNote": "",
                    "developmentAction": "",
                    "status": "pending",
                }
            )

    if status != "ready" and not excluded_this_cycle:
        unresolved_employees.append(
            {
                "employeeName": employee_name,
                "designation": designation,
                "employeeId": employee_id,
                "status": status,
                "blockers": blockers,
            }
        )

    if excluded_this_cycle:
        continue

    if not manager_label:
        unresolved_managers.append(
            {
                "employeeName": employee_name,
                "designation": designation,
                "issue": "No line manager label mapped",
            }
        )
    elif "/" in manager_label or "," in manager_label:
        unresolved_managers.append(
            {
                "employeeName": employee_name,
                "designation": designation,
                "issue": f"Manager label is ambiguous: {manager_label}",
            }
        )


active_designations = {employee["designation"] for employee in employees if not employee["excludedThisCycle"]}
unresolved_designations = [
    item for item in unresolved_designations if item["designation"] in active_designations
]


seed = {
    "cycle": {
        "id": "2026-H1",
        "name": "2026 Mid-Year Appraisal",
        "prototype": True,
    },
    "users": users,
    "employees": employees,
    "assignments": assignments,
    "selfAppraisals": self_appraisals,
    "finalResults": final_results,
    "customRolePacks": custom_role_packs,
    "unresolvedDesignations": unresolved_designations,
    "unresolvedEmployees": unresolved_employees,
    "unresolvedManagers": unresolved_managers,
    "excludedDesignations": excluded_designations,
}

generated = APP_DIR / "src" / "data" / "seed.generated.ts"
generated.write_text(
    "export const generatedSeed = "
    + json.dumps(seed, indent=2, ensure_ascii=False)
    + " as const;\n",
    encoding="utf-8",
)

credentials_path = APP_DIR / "src" / "data" / "credentials.generated.csv"
with credentials_path.open("w", newline="", encoding="utf-8") as handle:
    writer = csv.writer(handle)
    writer.writerow(["primary_kind", "capabilities", "display_name", "username", "password", "employee_id", "manager_scopes"])
    for user in users:
        writer.writerow(
            [
                user["kind"],
                " | ".join(user.get("capabilities", [])),
                user["displayName"],
                user["username"],
                user["password"],
                user.get("employeeId", ""),
                " | ".join(user.get("managerScopes", [])),
            ]
        )

gaps_path = APP_DIR / "src" / "data" / "unresolved.generated.md"
with gaps_path.open("w", encoding="utf-8") as handle:
    handle.write("# Unresolved Appraisal Gaps\n\n")
    handle.write(f"- unresolved designations: {len(unresolved_designations)}\n")
    handle.write(f"- unresolved employees: {len(unresolved_employees)}\n")
    handle.write(f"- unresolved manager links: {len(unresolved_managers)}\n\n")
    handle.write(f"- excluded designations this cycle: {len(excluded_designations)}\n\n")
    handle.write("## Designations still needing clarification\n\n")
    for item in unresolved_designations:
        handle.write(
            f"- `{item['designation']}` | suggested role: `{item['suggestedAppraisalRole'] or 'None'}` | line manager label: `{item['lineManagerLabel'] or 'None'}`\n"
        )
    handle.write("\n## Employee records with blockers\n\n")
    for item in unresolved_employees:
        handle.write(
            f"- `{item['employeeName']}` ({item['designation']}) | status: `{item['status']}` | blockers: {', '.join(item['blockers'])}\n"
        )
    handle.write("\n## Excluded designations this cycle\n\n")
    for item in excluded_designations:
        handle.write(f"- `{item['designation']}` | {item['notes']}\n")

print(f"Generated {generated}")
print(f"Generated {credentials_path}")
print(f"Generated {gaps_path}")
