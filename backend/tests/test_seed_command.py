from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


BACKEND_DIR = Path("/Users/kamsi/Downloads/odoo1/appraisal-web-prototype/backend")
SEED_PATH = BACKEND_DIR / "app" / "seed.generated.json"


class SeedCommandTest(unittest.TestCase):
    def test_seed_command_populates_empty_database(self):
        temp_dir = tempfile.TemporaryDirectory()
        db_path = Path(temp_dir.name) / "seed_command.db"
        env = os.environ.copy()
        env["DATABASE_URL"] = f"sqlite:///{db_path}"
        env["APPRAISAL_SEED_PATH"] = str(SEED_PATH)

        subprocess.run(
            ["alembic", "upgrade", "head"],
            cwd=BACKEND_DIR,
            env=env,
            check=True,
        )

        subprocess.run(
            [sys.executable, "-m", "app.seed"],
            cwd=BACKEND_DIR,
            env=env,
            check=True,
        )

        connection = sqlite3.connect(db_path)
        try:
            user_count = connection.execute("select count(*) from users").fetchone()[0]
            employee_count = connection.execute("select count(*) from employees").fetchone()[0]
            cycle_count = connection.execute("select count(*) from appraisal_cycles").fetchone()[0]
        finally:
            connection.close()
            temp_dir.cleanup()

        self.assertGreater(user_count, 0)
        self.assertGreater(employee_count, 0)
        self.assertEqual(cycle_count, 1)


if __name__ == "__main__":
    unittest.main()
