from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.bootstrap import bootstrap_from_seed
from app.db import Base, get_db
from app.main import create_app


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        db_path = Path(self.temp_dir.name) / "test_appraisal.db"
        self.engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False}, future=True)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False, future=True)
        Base.metadata.create_all(bind=self.engine)

        db = self.SessionLocal()
        try:
            bootstrap_from_seed(db)
        finally:
            db.close()

        app = create_app(db_engine=self.engine)

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def login(self, username: str, password: str) -> str:
        response = self.client.post("/auth/login", json={"username": username, "password": password})
        self.assertEqual(response.status_code, 200)
        return response.json()["access_token"]

    def tearDown(self):
        self.client.close()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_login_returns_token_and_user(self):
        response = self.client.post(
            "/auth/login",
            json={"username": "francis.fanen", "password": "Appraise013!"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["token_type"], "bearer")
        self.assertEqual(payload["user"]["username"], "francis.fanen")
        self.assertIn("employee", payload["user"]["capabilities"])
        self.assertEqual(payload["user"]["employee_code"], "EMP-013")

    def test_me_returns_current_user_profile(self):
        login = self.client.post(
            "/auth/login",
            json={"username": "samuel.mbudinma", "password": "Appraise043!"},
        )
        token = login.json()["access_token"]

        response = self.client.get("/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["username"], "samuel.mbudinma")
        self.assertIn("admin", payload["capabilities"])
        self.assertIn("employee", payload["capabilities"])

    def test_employee_workspace_returns_assignments_and_self_appraisal(self):
        token = self.login("francis.fanen", "Appraise013!")

        response = self.client.get("/employee/me/workspace", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["cycle_code"], "2026-H1")
        self.assertEqual(payload["employee"]["full_name"], "Francis Fanen")
        self.assertEqual(payload["employee"]["designation"], "Order Processing Officer")
        self.assertGreater(len(payload["assignments"]), 0)
        self.assertIsNotNone(payload["self_appraisal"])
        self.assertEqual(payload["self_appraisal"]["status"], "draft")

    def test_employee_submit_self_appraisal_updates_manager_workspace(self):
        employee_token = self.login("francis.fanen", "Appraise013!")
        employee_workspace = self.client.get(
            "/employee/me/workspace",
            headers={"Authorization": f"Bearer {employee_token}"},
        ).json()

        response = self.client.put(
            "/employee/me/self-appraisal",
            headers={"Authorization": f"Bearer {employee_token}"},
            json={
                "status": "submitted",
                "overall_achievements": "Closed all assigned fulfilment escalations on time.",
                "major_challenges": "Volume spikes on campaign days.",
                "support_needed": "Faster inventory escalation support.",
                "development_focus": "Exception handling and QA discipline.",
                "employee_comments": "Ready for manager review.",
                "items": [
                    {
                        "employee_kpi_assignment_id": item["employee_kpi_assignment_id"],
                        "self_score": 4,
                        "reason_for_score": "Target met consistently",
                        "key_evidence": "Daily tracker and escalations log",
                        "challenges_faced": "Peak order windows",
                    }
                    for item in employee_workspace["self_appraisal"]["items"]
                ],
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["self_appraisal"]["status"], "submitted")

        manager_token = self.login("dare.peters", "Appraise058!")
        manager_workspace = self.client.get(
            "/manager/workspace",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        self.assertEqual(manager_workspace.status_code, 200)
        workspaces = manager_workspace.json()["workspaces"]
        francis = next(item for item in workspaces if item["employee"]["employee_code"] == "EMP-013")
        self.assertEqual(francis["self_appraisal"]["status"], "submitted")
        self.assertEqual(
            francis["self_appraisal"]["overall_achievements"],
            "Closed all assigned fulfilment escalations on time.",
        )

    def test_manager_update_assignment_recalculates_final_score(self):
        employee_token = self.login("francis.fanen", "Appraise013!")
        employee_workspace = self.client.get(
            "/employee/me/workspace",
            headers={"Authorization": f"Bearer {employee_token}"},
        ).json()
        self.client.put(
            "/employee/me/self-appraisal",
            headers={"Authorization": f"Bearer {employee_token}"},
            json={
                "status": "submitted",
                "overall_achievements": "Ready for scoring",
                "major_challenges": "",
                "support_needed": "",
                "development_focus": "",
                "employee_comments": "",
                "items": [
                    {
                        "employee_kpi_assignment_id": item["employee_kpi_assignment_id"],
                        "self_score": 3,
                        "reason_for_score": "",
                        "key_evidence": "",
                        "challenges_faced": "",
                    }
                    for item in employee_workspace["self_appraisal"]["items"]
                ],
            },
        )

        manager_token = self.login("dare.peters", "Appraise058!")
        manager_workspace = self.client.get(
            "/manager/workspace",
            headers={"Authorization": f"Bearer {manager_token}"},
        ).json()["workspaces"]
        francis = next(item for item in manager_workspace if item["employee"]["employee_code"] == "EMP-013")
        assignment_id = francis["assignments"][0]["id"]

        response = self.client.patch(
            f"/manager/assignments/{assignment_id}",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={
                "manager_score": 4,
                "manager_comment": "Good performance.",
                "evidence_note": "Reviewed fulfilment tracker.",
                "manager_status": "in_review",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["assignments"][0]["manager_score"], 4)
        self.assertEqual(payload["assignments"][0]["manager_status"], "in_review")
        self.assertGreater(payload["final_result"]["final_score"], 0)

    def test_admin_workspace_and_release_result(self):
        admin_token = self.login("sandra.dunkwu", "Appraise060!")
        workspace = self.client.get("/admin/workspace", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(workspace.status_code, 200)
        payload = workspace.json()
        self.assertFalse(any(item["designation"] == "Growth Lead" for item in payload["unresolved_designations"]))
        ololade = next(item for item in payload["workspaces"] if item["employee"]["employee_code"] == "EMP-056")
        self.assertEqual(ololade["employee"]["status"], "ready")
        self.assertGreater(len(ololade["assignments"]), 0)

        release = self.client.patch(
            "/admin/final-results/EMP-013",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"released_to_employee": True},
        )
        self.assertEqual(release.status_code, 200)
        self.assertTrue(release.json()["final_result"]["released_to_employee"])

    def test_chinwe_can_access_admin_and_manager_views_for_aestheticians(self):
        token = self.login("chinwe.enemokwu", "AppraiseCEO2026!")

        admin_workspace = self.client.get(
            "/admin/workspace",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(admin_workspace.status_code, 200)
        all_workspaces = admin_workspace.json()["workspaces"]
        vivian = next(item for item in all_workspaces if item["employee"]["employee_code"] == "EMP-007")
        self.assertEqual(vivian["employee"]["line_manager_label"], "Chinwe Enemokwu")

        manager_workspace = self.client.get(
            "/manager/workspace",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(manager_workspace.status_code, 200)
        managed_codes = {item["employee"]["employee_code"] for item in manager_workspace.json()["workspaces"]}
        self.assertIn("EMP-007", managed_codes)
        self.assertIn("EMP-008", managed_codes)

    def test_admin_can_resolve_designation_setup(self):
        admin_token = self.login("sandra.dunkwu", "Appraise060!")
        response = self.client.post(
            "/admin/designation-mappings/resolve",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "designation": "Growth Lead",
                "role_name": "Growth Lead",
                "source_role_name": "",
                "entries": [
                    {
                        "kpi_area": "Campaign Planning",
                        "kpi_statement": "Campaign priorities are planned and executed against approved timelines.",
                        "weight_percent": 50,
                    },
                    {
                        "kpi_area": "Performance Reporting",
                        "kpi_statement": "Growth performance is reported with clear actions and escalations.",
                        "weight_percent": 50,
                    },
                ],
                "manager_label": "Chief of Staff",
                "reviewer_label": "",
                "kpi_owner_label": "Chief of Staff",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(any(item["designation"] == "Growth Lead" for item in payload["unresolved_designations"]))
        ololade = next(item for item in payload["workspaces"] if item["employee"]["employee_code"] == "EMP-056")
        self.assertEqual(ololade["employee"]["status"], "ready")
        self.assertEqual(len(ololade["assignments"]), 2)


if __name__ == "__main__":
    unittest.main()
