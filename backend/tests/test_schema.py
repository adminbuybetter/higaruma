import unittest

from app.db import Base
from app.models import DesignationRoleMapping, EmployeeCycleAssignment, FinalResult, SelfAppraisal, SelfAppraisalItem, User


class SchemaTest(unittest.TestCase):
    def test_expected_tables_exist(self):
        expected = {
            "users",
            "user_capabilities",
            "employees",
            "manager_scopes",
            "appraisal_cycles",
            "kpi_packs",
            "kpi_pack_items",
            "designation_role_mappings",
            "employee_cycle_assignments",
            "employee_kpi_assignments",
            "self_appraisals",
            "self_appraisal_items",
            "final_results",
            "audit_events",
        }
        self.assertTrue(expected.issubset(set(Base.metadata.tables.keys())))

    def test_unique_constraints_match_phase_one_rules(self):
        users = User.__table__
        self.assertTrue(any(index.unique and index.name == "uq_users_email_not_null" for index in users.indexes))

        designation = DesignationRoleMapping.__table__
        self.assertTrue(any("designation" in constraint.columns for constraint in designation.constraints if constraint.__class__.__name__ == "UniqueConstraint"))

        assignments = EmployeeCycleAssignment.__table__
        self.assertTrue(
            any(
                {"employee_id", "appraisal_cycle_id"} == {column.name for column in constraint.columns}
                for constraint in assignments.constraints
                if constraint.__class__.__name__ == "UniqueConstraint"
            )
        )

        self.assertTrue(
            any(
                {"employee_cycle_assignment_id"} == {column.name for column in constraint.columns}
                for constraint in SelfAppraisal.__table__.constraints
                if constraint.__class__.__name__ == "UniqueConstraint"
            )
        )
        self.assertTrue(
            any(
                {"employee_cycle_assignment_id"} == {column.name for column in constraint.columns}
                for constraint in FinalResult.__table__.constraints
                if constraint.__class__.__name__ == "UniqueConstraint"
            )
        )
        self.assertTrue(
            any(
                {"self_appraisal_id", "employee_kpi_assignment_id"} == {column.name for column in constraint.columns}
                for constraint in SelfAppraisalItem.__table__.constraints
                if constraint.__class__.__name__ == "UniqueConstraint"
            )
        )


if __name__ == "__main__":
    unittest.main()
