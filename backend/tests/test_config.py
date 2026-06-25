import unittest

from app.config import Settings, normalize_database_url, parse_cors_allow_origins


class ConfigTest(unittest.TestCase):
    def test_normalize_database_url_converts_railway_postgres_scheme(self):
        self.assertEqual(
            normalize_database_url("postgresql://user:pass@host:5432/dbname"),
            "postgresql+psycopg://user:pass@host:5432/dbname",
        )
        self.assertEqual(
            normalize_database_url("postgres://user:pass@host:5432/dbname"),
            "postgresql+psycopg://user:pass@host:5432/dbname",
        )

    def test_normalize_database_url_keeps_existing_driver_and_sqlite(self):
        self.assertEqual(
            normalize_database_url("postgresql+psycopg://user:pass@host:5432/dbname"),
            "postgresql+psycopg://user:pass@host:5432/dbname",
        )
        self.assertEqual(normalize_database_url("sqlite:///./appraisal.db"), "sqlite:///./appraisal.db")

    def test_parse_cors_allow_origins_splits_and_trims_values(self):
        self.assertEqual(
            parse_cors_allow_origins(" http://localhost:5173, https://example.com ,,http://127.0.0.1:5173 "),
            [
                "http://localhost:5173",
                "https://example.com",
                "http://127.0.0.1:5173",
            ],
        )

    def test_hosted_env_upgrades_cookie_policy_for_cross_origin_frontend(self):
        settings = Settings(app_env="staging")
        self.assertTrue(settings.is_hosted_env)
        self.assertEqual(settings.effective_session_cookie_samesite, "none")
        self.assertTrue(settings.effective_session_cookie_secure)

    def test_local_env_keeps_dev_cookie_policy(self):
        settings = Settings(app_env="development")
        self.assertFalse(settings.is_hosted_env)
        self.assertEqual(settings.effective_session_cookie_samesite, "lax")
        self.assertFalse(settings.effective_session_cookie_secure)

    def test_smtp_configured_requires_core_fields(self):
        self.assertFalse(Settings().smtp_configured)
        self.assertTrue(
            Settings(
                smtp_host="smtp.zoho.com",
                smtp_username="admin@buybetter.ng",
                smtp_password="secret",
                smtp_from_email="admin@buybetter.ng",
            ).smtp_configured
        )


if __name__ == "__main__":
    unittest.main()
