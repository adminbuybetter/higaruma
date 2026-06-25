from __future__ import annotations

import unittest
from pathlib import Path

from app.emailer import build_recipient_contexts, load_seed, render_launch_email, render_login_email


SEED_PATH = Path("/Users/kamsi/Downloads/odoo1/appraisal-web-prototype/backend/app/seed.generated.json")


class EmailerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.seed = load_seed(SEED_PATH)
        cls.contexts = build_recipient_contexts(cls.seed)

    def test_build_recipient_contexts_resolves_kamsi(self):
        context = self.contexts["EMP-055"]
        self.assertEqual(context.display_name, "Kamsiriochi Nwaukwa")
        self.assertEqual(context.email, "kamsi@buybetter.ng")
        self.assertEqual(context.username, "kamsiriochi.nwaukwa")
        self.assertEqual(context.appraisal_role, "Head of Information Technology")
        self.assertEqual(context.line_manager, "Sandra Dunkwu")
        self.assertEqual(context.deadline, "3 July 2026")
        self.assertIn("Architecture & Change Control", context.kpi_areas)

    def test_render_launch_email_contains_friendly_copy(self):
        rendered = render_launch_email(self.contexts["EMP-055"])
        self.assertEqual(rendered.subject, "Your H1 2026 appraisal is open")
        self.assertIn("Your BuyBetter H1 2026 appraisal is now open.", rendered.text_body)
        self.assertIn("complete your self-appraisal", rendered.html_body)

    def test_render_login_email_contains_credentials_and_kpis(self):
        rendered = render_login_email(self.contexts["EMP-055"])
        self.assertEqual(rendered.subject, "Your appraisal login details")
        self.assertIn("Username: kamsiriochi.nwaukwa", rendered.text_body)
        self.assertIn("Password: Appraise055!", rendered.text_body)
        self.assertIn("Architecture &amp; Change Control", rendered.html_body)
        self.assertIn("Sandra Dunkwu", rendered.html_body)


if __name__ == "__main__":
    unittest.main()
