import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import bootstrap


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


if __name__ == "__main__":
    unittest.main()
