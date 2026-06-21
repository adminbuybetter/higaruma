from __future__ import annotations

import csv
import json
from pathlib import Path
from datetime import datetime

APP_DIR = Path(__file__).resolve().parent.parent
GENERATED_DIR = APP_DIR / "generated"
SEED_PATH = GENERATED_DIR / "seed.generated.json"

PORTAL_URL = "https://appraisal-frontend-staging.up.railway.app"


def split_name(full_name: str) -> tuple[str, str]:
    parts = [part for part in full_name.strip().split() if part]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def dedupe_keep_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        output.append(normalized)
    return output


def format_deadline(raw_value: str) -> str:
    if not raw_value:
        return ""
    return datetime.fromisoformat(raw_value).strftime("%-d %B %Y")


def manager_display_name_for_label(seed_users: list[dict], owner_label: str) -> str:
    if not owner_label:
        return ""

    candidates = [
        user
        for user in seed_users
        if owner_label in (user.get("managerScopes") or [])
    ]
    if not candidates:
        return owner_label

    def rank(user: dict) -> tuple[int, str]:
        capabilities = set(user.get("capabilities") or [])
        employee_linked = 0 if user.get("employeeId") else 1
        admin_only_penalty = 1 if capabilities == {"manager", "admin"} else 0
        return (employee_linked + admin_only_penalty, user["displayName"].lower())

    best = sorted(candidates, key=rank)[0]
    return best["displayName"]


def main() -> None:
    seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))

    employees_by_id = {row["employeeId"]: row for row in seed["employees"]}
    assignments_by_employee: dict[str, list[dict]] = {}
    for row in seed["assignments"]:
        assignments_by_employee.setdefault(row["employeeId"], []).append(row)

    cycle_name = seed["cycle"]["name"]
    deadline = format_deadline(seed["cycle"].get("closesAt", ""))

    staff_rows: list[dict[str, str]] = []
    reviewer_rows: list[dict[str, str]] = []

    for user in seed["users"]:
        email = (user.get("email") or "").strip()
        if not email:
            continue

        first_name, last_name = split_name(user["displayName"])
        employee_id = user.get("employeeId") or ""
        employee = employees_by_id.get(employee_id)
        assignments = assignments_by_employee.get(employee_id, [])
        kpi_areas = dedupe_keep_order([row.get("kpiArea", "") for row in assignments])
        role_name = ""
        line_manager = ""
        if employee:
            role_name = employee.get("appraisalRole") or employee.get("designation") or ""
            owner_label = employee.get("managerLabel") or employee.get("primaryOwnerLabel") or ""
            line_manager = manager_display_name_for_label(seed["users"], owner_label)

        row = {
            "Email Address": email,
            "First Name": first_name,
            "Last Name": last_name,
            "display_name": user["displayName"],
            "portal_url": PORTAL_URL,
            "username": user["username"],
            "password": user["password"],
            "appraisal_role": role_name,
            "line_manager": line_manager,
            "deadline": deadline,
            "kpi_list": "\n".join(f"- {area}" for area in kpi_areas),
            "employee_id": employee_id,
            "capabilities": ", ".join(user.get("capabilities", [])),
            "cycle_name": cycle_name,
        }

        if employee_id:
            staff_rows.append(row)
        else:
            reviewer_rows.append(row)

    staff_output = GENERATED_DIR / "zoho_campaigns_staff.generated.csv"
    reviewer_output = GENERATED_DIR / "zoho_campaigns_reviewer_only.generated.csv"

    fieldnames = [
        "Email Address",
        "First Name",
        "Last Name",
        "display_name",
        "portal_url",
        "username",
        "password",
        "appraisal_role",
        "line_manager",
        "deadline",
        "kpi_list",
        "employee_id",
        "capabilities",
        "cycle_name",
    ]

    with staff_output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(sorted(staff_rows, key=lambda row: row["display_name"].lower()))

    with reviewer_output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(sorted(reviewer_rows, key=lambda row: row["display_name"].lower()))

    print(f"Wrote {staff_output}")
    print(f"Wrote {reviewer_output}")


if __name__ == "__main__":
    main()
