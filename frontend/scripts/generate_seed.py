import csv
import json
import re
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET


APP_DIR = Path("/Users/kamsi/Downloads/odoo1/appraisal-web-prototype/frontend")
SOURCE_DIR = Path("/Users/kamsi/Downloads/Technology 2/JOB DESCRIPTION_ IT DEPARTMENT")
GENERATED_DIR = APP_DIR / "generated"

ROSTER_PATH = SOURCE_DIR / "Employee_Roster_Template.csv"
DESIGNATION_PATH = SOURCE_DIR / "Designation_Mapping_Template.csv"
OWNERSHIP_PATH = SOURCE_DIR / "Appraisal_Ownership_Matrix_2026.csv"
MASTER_PATH = SOURCE_DIR / "Company_Appraisal_Master_Sheet_Template.csv"
SCHEDULE_PATH = Path("/Users/kamsi/Downloads/APPRAISAL SCHEDULE (2).xlsx")
BACKEND_SEED_PATH = APP_DIR.parent / "backend" / "app" / "seed.generated.json"


def read_csv(path: Path):
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", ".", value.lower()).strip(".")
    cleaned = re.sub(r"\.+", ".", cleaned)
    return cleaned or "user"


def normalize_name(value: str) -> str:
    return " ".join(value.strip().lower().split())


SCHEDULE_NAME_ALIASES = {
    normalize_name("Rose Udoh"): "Rose Uka",
    normalize_name("Benedicta Udeigwe"): "Benedicta Chidubem Udeigwe",
    normalize_name("Akinyemi Boluwatife"): "Akinyemi Boluwatito",
    normalize_name("Kamsi Nwaukwa"): "Kamsiriochi Nwaukwa",
}


def read_schedule_titles(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    titles: dict[str, str] = {}

    with zipfile.ZipFile(path) as workbook:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            for item in root.findall("a:si", ns):
                shared_strings.append("".join(text.text or "" for text in item.findall(".//a:t", ns)))

        sheet = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
        for row in sheet.findall(".//a:sheetData/a:row", ns):
            values: dict[str, str] = {}
            for cell in row.findall("a:c", ns):
                ref = cell.attrib.get("r", "")
                col = "".join(char for char in ref if char.isalpha())
                raw_value = cell.find("a:v", ns)
                value = ""
                if raw_value is not None:
                    raw = raw_value.text or ""
                    value = shared_strings[int(raw)] if cell.attrib.get("t") == "s" else raw
                values[col] = value

            name = (values.get("B") or "").strip()
            title = (values.get("C") or "").strip()
            if not name or name == "NAMES" or (name.isupper() and not title) or not title:
                continue

            canonical_name = SCHEDULE_NAME_ALIASES.get(normalize_name(name), name)
            titles[normalize_name(canonical_name)] = title

    return titles


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


PORTAL_URL = "https://people.buybetter.ng"
EMAIL_SUBJECT = "BuyBetter Appraisal 2026: login details and process"


REMOVED_EMPLOYEES = {
    "Obathare Reuben Ejovwo",
    "Umaru Dogari",
    "Luka Ishaka",
    "Stephen Caleb",
    "David Adjei",
    "Ibrahim Musa",
    "Hope Haruna",
    "Uduak Umoh",
}

MANAGER_ONLY_EMPLOYEES = {
    "Sandra Dunkwu",
}

ADMIN_CAPABILITY_EMPLOYEES = {
    "Sandra Dunkwu",
    "Samuel Mbudinma",
}

EMPLOYEE_ROLE_OVERRIDES = {
    "Vivian Udu": {
        "manager_label": "Chinwe Enemokwu",
        "kpi_owner_label": "Chinwe Enemokwu",
    },
    "Benedicta Chidubem Udeigwe": {
        "manager_label": "Chinwe Enemokwu",
        "kpi_owner_label": "Chinwe Enemokwu",
    },
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

EXTRA_USERS = [
    {
        "id": "USR-CHINWE-001",
        "displayName": "Chinwe Enemokwu",
        "username": "chinwe.enemokwu",
        "password": "AppraiseCEO2026!",
        "email": "chinwe@buybetter.ng",
        "kind": "manager",
        "capabilities": ["manager", "admin"],
        "employeeId": None,
        "managerScopes": ["Chinwe Enemokwu"],
    }
]

EMAIL_BY_NAME = {
    normalize_name("Dare Peters"): "dare@buybetter.ng",
    normalize_name("Samuel Mbudinma"): "samuel.mbudinma@buybetter.ng",
    normalize_name("Akintomide Akindele"): "tomide@buybetter.ng",
    normalize_name("Valentine Unyi Ternenge"): "valentine@buybetter.ng",
    normalize_name("Mary Favour Okorji"): "maryfavour@buybetter.ng",
    normalize_name("Chisom Ugoh"): "chisom.ugoh@buybetter.ng",
    normalize_name("Victoria Daniel Igo"): "victoria@buybetter.ng",
    normalize_name("Eniola Ojekunle"): "eniola.ojekunle@buybetter.ng",
    normalize_name("Happiness Oyewale"): "eniola.ojekunle@buybetter.ng",
    normalize_name("Pamela Edeh"): "pamela@buybetter.ng",
    normalize_name("Mary Edun Abidemi"): "mary@buybetter.ng",
    normalize_name("Rose Udoh"): "rose.uka@buybetter.ng",
    normalize_name("Rose Uka"): "rose.uka@buybetter.ng",
    normalize_name("Victor Ugwu"): "victor.ugwu@buybetter.ng",
    normalize_name("Imemba Goodluck Ikechukwu"): "ikechukwu@buybetter.ng",
    normalize_name("Anyanwu Kelechi Anthony"): "kelechi@buybetter.ng",
    normalize_name("Olayinka Olabiran"): "olayinka@buybetter.ng",
    normalize_name("Ugwuogor Nnamdi Samuel"): "nnamdi@buybetter.ng",
    normalize_name("Ephraim Yisa"): "ephraim@buybetter.ng",
    normalize_name("Felix Aondoemba Nguuma"): "felix@buybetter.ng",
    normalize_name("Stephanie Uwaezuoke"): "stephanie@buybetter.ng",
    normalize_name("Francis Fanen"): "francis@buybetter.ng",
    normalize_name("Sandra Ihkimioya"): "sandra@buybetter.ng",
    normalize_name("Okoro Victor"): "victor.okoro@buybetter.ng",
    normalize_name("Nnamani Chioma Helen"): "chioma@buybetter.ng",
    normalize_name("Arasi Oluwatobi"): "oluwatobi@buybetter.ng",
    normalize_name("Lorreta Nwabuaja"): "lorreta.nwabuaju@buybetter.ng",
    normalize_name("Chiamaka Mbaeru"): "chiamaka.mbaeru@buybetter.ng",
    normalize_name("Titoluwanimi Ige"): "titoluwanimi@buybetter.ng",
    normalize_name("Akinyemi Boluwatife"): "bolu@buybetter.ng",
    normalize_name("Akinyemi Boluwatito"): "bolu@buybetter.ng",
    normalize_name("Rebecca Lasekan"): "rebecca@buybetter.ng",
    normalize_name("Ngozika Grace Omaka"): "ngozika@buybetter.ng",
    normalize_name("Motunrayo Adejumobi"): "motunrayo@buybetter.ng",
    normalize_name("Kamsi Nwaukwa"): "kamsi@buybetter.ng",
    normalize_name("Kamsiriochi Nwaukwa"): "kamsi@buybetter.ng",
    normalize_name("Ojo Bunmi"): "bunmi@buybetter.ng",
    normalize_name("Adams Temidayo"): "temidayo@buybetter.ng",
    normalize_name("Ololade Shoyemi"): "lolade@buybetter.ng",
    normalize_name("Chinemerem Mgbaruike"): "chinemerem@buybetter.ng",
    normalize_name("Chioma Eze"): "chioma.eze@buybetter.ng",
    normalize_name("Toluwanimi Yusuff"): "toluwanimi@buybetter.ng",
    normalize_name("Dexter Onuorah"): "dexter@buybetter.ng",
    normalize_name("Olorunfemi Adegoke"): "olorunfemi@buybetter.ng",
    normalize_name("Ajayi Abimbola Opeoluwa"): "ope@buybetter.ng",
    normalize_name("Patrick Ikegwuonu"): "patrick.ikegwuonu@buybetter.ng",
    normalize_name("Maureen Kutuh"): "maureen@buybetter.ng",
    normalize_name("Chinonyerem Onyeaba"): "chinonyerem@buybetter.ng",
    normalize_name("Udeh Ifeanyi Clement"): "ifeanyi@buybetter.ng",
    normalize_name("Ebenezer Okechukwu"): "ebenezer@buybetter.ng",
    normalize_name("Moses Oregbuyide"): "moses.oregbuyide@buybetter.ng",
    normalize_name("Alice Ochigbo"): "alice@buybetter.ng",
    normalize_name("Chukwuejim Alexandra"): "alexandra@buybetter.ng",
    normalize_name("Vivian Udu"): "vivian@buybetter.ng",
    normalize_name("Benedicta Udeigwe"): "benedicta@buybetter.ng",
    normalize_name("Benedicta Chidubem Udeigwe"): "benedicta@buybetter.ng",
    normalize_name("Rofiat Gbemisola"): "rofiat@buybetter.ng",
    normalize_name("Chinwe Enemokwu"): "chinwe@buybetter.ng",
    normalize_name("Sandra Dunkwu"): "sandra.dunkwu@buybetter.ng",
}

DESIGNATION_FIELD_OVERRIDES = {
    "Growth Lead": {
        "matched_existing_role": "Growth Lead",
        "suggested_appraisal_role": "Growth Lead",
        "department": "Growth",
        "line_manager": "Chief of Staff",
        "reviewer": "",
        "kpi_owner": "Chief of Staff",
        "self_appraisal_required": "Yes",
        "needs_clarification": "No",
        "notes": "Growth Lead KPI pack supplied via Growth KPI Ololade Shoyemi.pdf; reporting line remains Chief of Staff",
    },
}

ROLE_KPI_OVERRIDES = {
    "Growth Lead": [
        {
            "kpiArea": "Daily Order Volume Growth",
            "kpiStatement": "Grow combined daily order volume toward approved targets and reverse recent order decline through repeatable commercial execution.",
            "weightPercent": 14,
        },
        {
            "kpiArea": "Same-Day Delivery Expansion",
            "kpiStatement": "Scale same-day delivery order throughput while protecting fulfilment quality and execution consistency.",
            "weightPercent": 10,
        },
        {
            "kpiArea": "Promotional Cadence Execution",
            "kpiStatement": "Run the approved free-delivery promotional cadence consistently and on schedule.",
            "weightPercent": 6,
        },
        {
            "kpiArea": "Promotional Revenue Capture",
            "kpiStatement": "Convert promotional campaigns into measurable revenue uplift against approved promo targets.",
            "weightPercent": 5,
        },
        {
            "kpiArea": "Nivea Revenue Growth",
            "kpiStatement": "Increase the Nivea monthly revenue line against target through focused commercial actions.",
            "weightPercent": 8,
        },
        {
            "kpiArea": "Beesline Merchandising Performance",
            "kpiStatement": "Improve Beesline monthly unit movement through strong in-store merchandising and sell-through execution.",
            "weightPercent": 5,
        },
        {
            "kpiArea": "New Revenue Line Introduction",
            "kpiStatement": "Launch and stabilise new revenue lines using the brand introduction playbook.",
            "weightPercent": 5,
        },
        {
            "kpiArea": "Department Revenue Delivery",
            "kpiStatement": "Deliver all-channel daily department revenue against target and keep the team focused on the highest-yield levers.",
            "weightPercent": 15,
        },
        {
            "kpiArea": "Core Channel Revenue Growth",
            "kpiStatement": "Grow the largest channel revenue line against daily target and sustain momentum in the strongest commercial lane.",
            "weightPercent": 10,
        },
        {
            "kpiArea": "Average Order Value Defense",
            "kpiStatement": "Maintain average order value at or above the agreed floor through bundling and cross-sell discipline.",
            "weightPercent": 5,
        },
        {
            "kpiArea": "Same-Day Delivery SLA",
            "kpiStatement": "Maintain on-time same-day delivery performance at the agreed service level.",
            "weightPercent": 5,
        },
        {
            "kpiArea": "Top-SKU Stockout Control",
            "kpiStatement": "Reduce stockout incidents across top SKUs through forecasting follow-up and replenishment coordination.",
            "weightPercent": 4,
        },
        {
            "kpiArea": "Direct Report KPI Delivery",
            "kpiStatement": "Drive direct reports to achieve department KPIs through clear cascade, follow-up, and performance management.",
            "weightPercent": 5,
        },
        {
            "kpiArea": "Wholesale Partner Retention",
            "kpiStatement": "Maintain target retention across key wholesale partners through joint planning and disciplined relationship management.",
            "weightPercent": 3,
        },
    ],
}


designation_rows = read_csv(DESIGNATION_PATH)
ownership_rows = read_csv(OWNERSHIP_PATH)
master_rows = read_csv(MASTER_PATH)
roster_rows = read_csv(ROSTER_PATH)
schedule_titles = read_schedule_titles(SCHEDULE_PATH)

for row in designation_rows:
    override = DESIGNATION_FIELD_OVERRIDES.get((row.get("roster_designation") or "").strip())
    if override:
        row.update(override)

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

for role_name, items in ROLE_KPI_OVERRIDES.items():
    role_kpis[role_name] = [dict(item) for item in items]


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
active_roster_designations = set()

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


def resolve_outreach_email(name: str) -> str:
    return EMAIL_BY_NAME.get(normalize_name(name), "")


def login_email_body(*, display_name: str, username: str, password: str) -> str:
    return (
        f"Hello {display_name},\n\n"
        "The BuyBetter 2026 appraisal cycle is now live.\n\n"
        "Please log in to complete your self-appraisal before your line manager review begins.\n\n"
        f"Portal: {PORTAL_URL}\n"
        f"Username: {username}\n"
        f"Password: {password}\n\n"
        "What to do:\n"
        "1. Sign in with the login details above.\n"
        "2. Complete your self-appraisal across all assigned KPI areas.\n"
        "3. Submit the form once you are done.\n"
        "4. Your line manager will review after submission.\n"
        "5. HR/Admin will release final results after the review process.\n\n"
        "Please keep your password private. If you are unable to sign in or notice missing KPI items, reply to HR immediately.\n\n"
        "Regards,\n"
        "BuyBetter HR / Appraisal Admin"
    )


for roster_row in roster_rows:
    employee_name = (roster_row.get("employee_name") or "").strip()
    if employee_name in REMOVED_EMPLOYEES:
        continue

    override = EMPLOYEE_ROLE_OVERRIDES.get(employee_name, {})
    base_designation = (roster_row.get("roster_designation") or "").strip()
    designation = schedule_titles.get(normalize_name(employee_name), base_designation)
    designation_row = designation_map.get(base_designation, {})
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
        outreach_email = resolve_outreach_email(employee_name)
        users.append(
            {
                "id": employee_id,
                "username": username,
                "password": employee_password(employee_id),
                "displayName": employee_name,
                "email": outreach_email,
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

    active_roster_designations.add(base_designation)

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


unresolved_designations = [
    item for item in unresolved_designations if item["designation"] in active_roster_designations
]

for extra_user in EXTRA_USERS:
    users.append(dict(extra_user))

email_counts = {}
for user in users:
    email = (user.get("email") or "").strip().lower()
    if email:
        email_counts[email] = email_counts.get(email, 0) + 1

for user in users:
    outreach_email = (user.get("email") or "").strip()
    user["outreachEmail"] = outreach_email
    if outreach_email and email_counts.get(outreach_email.lower(), 0) == 1:
        user["email"] = outreach_email
    else:
        user["email"] = ""


seed = {
    "cycle": {
        "id": "2026-H1",
        "name": "2026 Mid-Year Appraisal",
        "opensAt": "2026-06-16T09:00:00+01:00",
        "closesAt": "2026-06-30T23:59:59+01:00",
        "selfOpensAt": "2026-06-16T09:00:00+01:00",
        "selfClosesAt": "2026-06-30T23:59:59+01:00",
        "managerOpensAt": "2026-07-01T00:00:00+01:00",
        "managerClosesAt": "2026-07-07T23:59:59+01:00",
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

GENERATED_DIR.mkdir(parents=True, exist_ok=True)

generated = GENERATED_DIR / "seed.generated.json"
serialized_seed = json.dumps(seed, indent=2, ensure_ascii=False) + "\n"
generated.write_text(serialized_seed, encoding="utf-8")
BACKEND_SEED_PATH.write_text(serialized_seed, encoding="utf-8")

credentials_path = GENERATED_DIR / "credentials.generated.csv"
with credentials_path.open("w", newline="", encoding="utf-8") as handle:
    writer = csv.writer(handle)
    writer.writerow(["primary_kind", "capabilities", "display_name", "email", "username", "password", "employee_id", "manager_scopes"])
    for user in users:
        writer.writerow(
            [
                user["kind"],
                " | ".join(user.get("capabilities", [])),
                user["displayName"],
                user.get("outreachEmail", ""),
                user["username"],
                user["password"],
                user.get("employeeId", ""),
                " | ".join(user.get("managerScopes", [])),
            ]
        )

mailmerge_path = GENERATED_DIR / "login_mailmerge.generated.csv"
with mailmerge_path.open("w", newline="", encoding="utf-8") as handle:
    writer = csv.writer(handle)
    writer.writerow(["display_name", "email", "username", "password", "subject", "body"])
    for user in users:
        outreach_email = user.get("outreachEmail", "")
        if not outreach_email:
            continue
        writer.writerow(
            [
                user["displayName"],
                outreach_email,
                user["username"],
                user["password"],
                EMAIL_SUBJECT,
                login_email_body(
                    display_name=user["displayName"],
                    username=user["username"],
                    password=user["password"],
                ),
            ]
        )

gaps_path = GENERATED_DIR / "unresolved.generated.md"
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
print(f"Generated {mailmerge_path}")
print(f"Generated {gaps_path}")
