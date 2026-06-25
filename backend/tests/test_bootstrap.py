import os
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import bootstrap
from app.db import Base
from app.models import Employee, EmployeeCycleAssignment, EmployeeKpiAssignment, User
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker


SEED_PATH = Path("/Users/kamsi/Downloads/odoo1/appraisal-web-prototype/backend/app/seed.generated.json")


class BootstrapTest(unittest.TestCase):
    def test_resolve_seed_path_prefers_env_override_when_present(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            seed_path = Path(temp_dir) / "seed.json"
            seed_path.write_text("{}", encoding="utf-8")
            with patch.dict(os.environ, {"APPRAISAL_SEED_PATH": str(seed_path)}, clear=False):
                self.assertEqual(bootstrap.resolve_seed_path(), seed_path)

    def test_resolve_seed_path_uses_backend_copy(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            backend_seed = Path(temp_dir) / "backend-seed.json"
            backend_seed.write_text("{}", encoding="utf-8")
            with patch.dict(os.environ, {}, clear=True):
                with patch.object(bootstrap, "BACKEND_SEED_PATH", backend_seed):
                    self.assertEqual(bootstrap.resolve_seed_path(), backend_seed)

    def test_bootstrap_resyncs_existing_db_users_and_assignment_owners(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "bootstrap.db"
            seed_v1_path = Path(temp_dir) / "seed-v1.json"
            seed_v2_path = Path(temp_dir) / "seed-v2.json"

            seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
            seed_v1_path.write_text(json.dumps(seed), encoding="utf-8")

            mutated_seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
            for row in mutated_seed["users"]:
                if row["username"] == "ololade.shoyemi":
                    row["managerScopes"] = ["Ololade Shoyemi", "Dare Peters"]
                    break
            for row in mutated_seed["employees"]:
                if row["employeeId"] == "EMP-046":
                    row["managerLabel"] = "Ololade Shoyemi"
                    row["kpiOwnerLabel"] = "Ololade Shoyemi"
                    row["primaryOwnerLabel"] = "Ololade Shoyemi"
                    row["status"] = "ready"
                    break
            seed_v2_path.write_text(json.dumps(mutated_seed), encoding="utf-8")

            engine = create_engine(f"sqlite:///{db_path}", future=True)
            SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
            Base.metadata.create_all(bind=engine)

            with patch.dict(os.environ, {"APPRAISAL_SEED_PATH": str(seed_v1_path)}, clear=False):
                db = SessionLocal()
                try:
                    bootstrap.bootstrap_from_seed(db)
                finally:
                    db.close()

            with patch.dict(os.environ, {"APPRAISAL_SEED_PATH": str(seed_v2_path)}, clear=False):
                db = SessionLocal()
                try:
                    bootstrap.bootstrap_from_seed(db)
                finally:
                    db.close()

            db = SessionLocal()
            try:
                ololade = db.scalar(select(User).where(User.username == "ololade.shoyemi"))
                self.assertIsNotNone(ololade)
                self.assertEqual(
                    sorted(scope.owner_label for scope in ololade.manager_scopes),
                    ["Dare Peters", "Ololade Shoyemi"],
                )

                bunmi = db.scalar(select(Employee).where(Employee.employee_code == "EMP-046"))
                self.assertIsNotNone(bunmi)
                self.assertEqual(len(bunmi.cycle_assignments), 1)
                assignment = bunmi.cycle_assignments[0]
                self.assertEqual(assignment.line_manager_label, "Ololade Shoyemi")
                self.assertEqual(assignment.kpi_owner_label, "Ololade Shoyemi")
                self.assertEqual(assignment.primary_owner_label, "Ololade Shoyemi")
                self.assertEqual(assignment.status, "ready")
            finally:
                db.close()
                engine.dispose()

    def test_bootstrap_creates_missing_kpi_rows_when_employee_becomes_appraisable(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "bootstrap_kpis.db"
            seed_v1_path = Path(temp_dir) / "seed-v1.json"
            seed_v2_path = Path(temp_dir) / "seed-v2.json"

            blocked_seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
            for row in blocked_seed["employees"]:
                if row["employeeId"] == "EMP-010":
                    row["appraisalRole"] = ""
                    row["department"] = "Unassigned"
                    row["status"] = "blocked"
                    row["blockers"] = ["No KPI role mapped yet"]
                    row["excludedThisCycle"] = True
                    row["canSelfAppraise"] = False
                    row["canViewFinalResult"] = False
                    break
            blocked_seed["assignments"] = [
                row for row in blocked_seed["assignments"] if row["employeeId"] != "EMP-010"
            ]
            seed_v1_path.write_text(json.dumps(blocked_seed), encoding="utf-8")

            ready_seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
            seed_v2_path.write_text(json.dumps(ready_seed), encoding="utf-8")

            engine = create_engine(f"sqlite:///{db_path}", future=True)
            SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
            Base.metadata.create_all(bind=engine)

            with patch.dict(os.environ, {"APPRAISAL_SEED_PATH": str(seed_v1_path)}, clear=False):
                db = SessionLocal()
                try:
                    bootstrap.bootstrap_from_seed(db)
                finally:
                    db.close()

            with patch.dict(os.environ, {"APPRAISAL_SEED_PATH": str(seed_v2_path)}, clear=False):
                db = SessionLocal()
                try:
                    bootstrap.bootstrap_from_seed(db)
                finally:
                    db.close()

            db = SessionLocal()
            try:
                ephraim = db.scalar(select(Employee).where(Employee.employee_code == "EMP-010"))
                self.assertIsNotNone(ephraim)
                assignment = ephraim.cycle_assignments[0]
                self.assertEqual(assignment.appraisal_role_name, "Order Processing & Fulfilment")
                self.assertEqual(assignment.status, "ready")
                self.assertFalse(assignment.excluded_this_cycle)

                kpi_rows = db.scalars(
                    select(EmployeeKpiAssignment).where(
                        EmployeeKpiAssignment.employee_cycle_assignment_id == assignment.id
                    )
                ).all()
                self.assertGreater(len(kpi_rows), 0)
            finally:
                db.close()
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
