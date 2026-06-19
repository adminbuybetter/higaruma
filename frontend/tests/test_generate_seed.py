import json
import re
import subprocess
import unittest
import csv
from pathlib import Path


APP_DIR = Path("/Users/kamsi/Downloads/odoo1/appraisal-web-prototype/frontend")
SEED_PATH = APP_DIR / "src" / "data" / "seed.generated.ts"
GENERATOR_PATH = APP_DIR / "scripts" / "generate_seed.py"
CREDENTIALS_PATH = APP_DIR / "src" / "data" / "credentials.generated.csv"
MAILMERGE_PATH = APP_DIR / "src" / "data" / "login_mailmerge.generated.csv"


def run_generator():
    subprocess.run(["python3", str(GENERATOR_PATH)], cwd=APP_DIR, check=True)


def load_seed():
    text = SEED_PATH.read_text(encoding="utf-8")
    text = re.sub(r"^export const generatedSeed = ", "", text)
    text = re.sub(r" as const;\s*$", "", text)
    return json.loads(text)


def load_csv(path: Path):
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


class GenerateSeedTest(unittest.TestCase):
    def test_schedule_added_employees_are_ready(self):
        run_generator()
        seed = load_seed()

        dexter = next(
            row for row in seed["employees"] if row["employeeName"] == "Dexter Onuorah"
        )
        rofiat = next(
            row for row in seed["employees"] if row["employeeName"] == "Rofiat Gbemisola"
        )

        self.assertEqual(dexter["designation"], "Graphics Design")
        self.assertEqual(dexter["appraisalRole"], "Creative Designer")
        self.assertEqual(dexter["status"], "ready")
        self.assertEqual(dexter["blockers"], [])

        self.assertEqual(rofiat["designation"], "Beauty Advisor")
        self.assertEqual(rofiat["appraisalRole"], "Beauty Attendant")
        self.assertEqual(rofiat["status"], "ready")
        self.assertEqual(rofiat["blockers"], [])

    def test_admin_people_operation_officer_employee_is_ready(self):
        run_generator()
        seed = load_seed()

        employee = next(
            row for row in seed["employees"] if row["employeeName"] == "Samuel Mbudinma"
        )

        self.assertEqual(employee["designation"], "Admin/People Operation Officer")
        self.assertEqual(employee["appraisalRole"], "Admin/People Operation Officer")
        self.assertEqual(employee["status"], "ready")
        self.assertEqual(employee["blockers"], [])

        unresolved_designations = [row["designation"] for row in seed["unresolvedDesignations"]]
        unresolved_employees = [row["employeeName"] for row in seed["unresolvedEmployees"]]

        self.assertNotIn("Admin/People Operation Officer", unresolved_designations)
        self.assertNotIn("Samuel Mbudinma", unresolved_employees)

    def test_quality_control_wholesale_employee_is_ready(self):
        run_generator()
        seed = load_seed()

        employee = next(
            row for row in seed["employees"] if row["employeeName"] == "Maureen Kutuh"
        )

        self.assertEqual(employee["designation"], "Quality Control (Wholesale)")
        self.assertEqual(employee["appraisalRole"], "Quality Control (Wholesale)")
        self.assertEqual(employee["status"], "ready")
        self.assertEqual(employee["blockers"], [])

        unresolved_designations = [row["designation"] for row in seed["unresolvedDesignations"]]
        unresolved_employees = [row["employeeName"] for row in seed["unresolvedEmployees"]]

        self.assertNotIn("Quality Control (Wholesale)", unresolved_designations)
        self.assertNotIn("Maureen Kutuh", unresolved_employees)

    def test_growth_lead_employee_is_ready(self):
        run_generator()
        seed = load_seed()

        employee = next(
            row for row in seed["employees"] if row["employeeName"] == "Ololade Shoyemi"
        )

        self.assertEqual(employee["designation"], "Growth Lead")
        self.assertEqual(employee["appraisalRole"], "Growth Lead")
        self.assertEqual(employee["status"], "ready")
        self.assertEqual(employee["blockers"], [])

        unresolved_designations = [row["designation"] for row in seed["unresolvedDesignations"]]
        unresolved_employees = [row["employeeName"] for row in seed["unresolvedEmployees"]]

        self.assertNotIn("Growth Lead", unresolved_designations)
        self.assertNotIn("Ololade Shoyemi", unresolved_employees)

    def test_chinwe_is_super_admin_and_aestheticians_report_to_her(self):
        run_generator()
        seed = load_seed()

        chinwe = next(
            row for row in seed["users"] if row["displayName"] == "Chinwe Enemokwu"
        )
        self.assertEqual(chinwe["username"], "chinwe.enemokwu")
        self.assertEqual(chinwe["email"], "chinwe@buybetter.ng")
        self.assertEqual(chinwe["capabilities"], ["manager", "admin"])
        self.assertEqual(chinwe["managerScopes"], ["Chinwe Enemokwu"])
        self.assertIsNone(chinwe["employeeId"])

        aestheticians = [
            row for row in seed["employees"] if row["designation"] == "Aesthetician"
        ]
        self.assertEqual(len(aestheticians), 2)
        for employee in aestheticians:
            self.assertEqual(employee["managerLabel"], "Chinwe Enemokwu")
            self.assertEqual(employee["kpiOwnerLabel"], "Chinwe Enemokwu")
            self.assertEqual(employee["primaryOwnerLabel"], "Chinwe Enemokwu")
            self.assertEqual(employee["status"], "ready")

    def test_credentials_and_mailmerge_include_email_fields(self):
        run_generator()
        credentials = load_csv(CREDENTIALS_PATH)
        mailmerge = load_csv(MAILMERGE_PATH)

        chinwe_credential = next(
            row for row in credentials if row["display_name"] == "Chinwe Enemokwu"
        )
        self.assertEqual(chinwe_credential["email"], "chinwe@buybetter.ng")
        self.assertEqual(chinwe_credential["username"], "chinwe.enemokwu")

        sandra_credential = next(
            row for row in credentials if row["display_name"] == "Sandra Dunkwu"
        )
        self.assertEqual(sandra_credential["email"], "sandra.dunkwu@buybetter.ng")

        vivian_mail = next(
            row for row in mailmerge if row["display_name"] == "Vivian Udu"
        )
        self.assertEqual(vivian_mail["email"], "vivian@buybetter.ng")
        self.assertIn("Username: vivian.udu", vivian_mail["body"])
        self.assertIn("Password: Appraise007!", vivian_mail["body"])

        sandra_mail = next(
            row for row in mailmerge if row["display_name"] == "Sandra Dunkwu"
        )
        self.assertEqual(sandra_mail["email"], "sandra.dunkwu@buybetter.ng")

    def test_resigned_staff_are_removed_from_seed_and_exports(self):
        run_generator()
        seed = load_seed()
        credentials = load_csv(CREDENTIALS_PATH)
        mailmerge = load_csv(MAILMERGE_PATH)

        removed_names = {
            "David Adjei",
            "Ibrahim Musa",
            "Hope Haruna",
            "Uduak Umoh",
        }

        seed_employee_names = {row["employeeName"] for row in seed["employees"]}
        seed_user_names = {row["displayName"] for row in seed["users"]}
        credential_names = {row["display_name"] for row in credentials}
        mailmerge_names = {row["display_name"] for row in mailmerge}

        for name in removed_names:
            self.assertNotIn(name, seed_employee_names)
            self.assertNotIn(name, seed_user_names)
            self.assertNotIn(name, credential_names)
            self.assertNotIn(name, mailmerge_names)


if __name__ == "__main__":
    unittest.main()
