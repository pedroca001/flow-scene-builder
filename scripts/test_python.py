#!/usr/bin/env python3
"""Run every Python regression, including required Drive-preserved filenames.

Always uses a fresh local runtime, never the installed production queue.
"""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def main():
    with tempfile.TemporaryDirectory(prefix="flow_python_tests_") as scratch:
        os.environ["FLOW_APP_ROOT"] = str(Path(scratch) / "app")
        os.environ["FLOW_WORK_ROOT"] = str(Path(scratch) / "jobs")
        os.environ.pop("FLOW_SHARED_ROOT", None)
        sys.path.insert(0, str(ROOT))
        suite = unittest.TestSuite()
        for index, path in enumerate(sorted((ROOT / "tests").glob("test*.py"))):
            spec = importlib.util.spec_from_file_location(f"flow_tests_{index}", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(module))
        result = unittest.TextTestRunner(verbosity=1).run(suite)
        return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
