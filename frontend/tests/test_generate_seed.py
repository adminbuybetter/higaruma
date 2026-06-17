import json
import re
import subprocess
import unittest
from pathlib import Path


APP_DIR = Path("/Users/kamsi/Downloads/odoo1/appraisal-web-prototype/frontend")
SEED_PATH = APP_DIR / "src" / "data" / "seed.generated.ts"
GENERATOR_PATH = APP_DIR / "scripts" / "generate_seed.py"


def run_generator():
    subprocess.run(["python3", str(GENERATOR_PATH)], cwd=APP_DIR, check=True)


def load_seed():
    text = SEED_PATH.read_text(encoding="utf-8")
    text = re.sub(r"^export const generatedSeed = ", "", text)
    text = re.sub(r" as const;\s*$", "", text)
    return json.loads(text)


class GenerateSeedTest(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
