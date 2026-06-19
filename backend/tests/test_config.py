import unittest

from app.config import normalize_database_url, parse_cors_allow_origins


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


if __name__ == "__main__":
    unittest.main()
