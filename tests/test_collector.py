import importlib.util
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "collect.py"
SPEC = importlib.util.spec_from_file_location("collector", SCRIPT)
collector = importlib.util.module_from_spec(SPEC)
sys.modules["collector"] = collector
assert SPEC and SPEC.loader
SPEC.loader.exec_module(collector)


class PlannerTests(unittest.TestCase):
    def test_normal_day_only_requires_daily_when_coverage_is_current(self):
        now = datetime(2026, 9, 30, 3, 0, tzinfo=timezone.utc)
        windows = collector.plan_windows(
            now,
            {"weekly_last_due_date": "2026-09-27", "monthly_complete_through": "2026-08"},
        )
        self.assertEqual([window.name for window in windows], ["daily"])

    def test_missed_weekly_and_monthly_are_backfilled(self):
        now = datetime(2026, 10, 2, 3, 0, tzinfo=timezone.utc)
        windows = collector.plan_windows(now, {})
        self.assertEqual([window.name for window in windows], ["daily", "weekly", "monthly"])
        monthly = next(window for window in windows if window.name == "monthly")
        self.assertEqual(monthly.due_key, "2026-09")

    def test_sunday_first_runs_all_windows(self):
        now = datetime(2026, 11, 1, 3, 0, tzinfo=timezone.utc)
        windows = collector.plan_windows(now, {})
        self.assertEqual([window.name for window in windows], ["daily", "weekly", "monthly"])


class CanonicalUrlTests(unittest.TestCase):
    def test_tracking_parameters_and_fragments_do_not_change_identity(self):
        left = collector.canonical_url("https://Example.com/news/item/?utm_source=x&a=1#part")
        right = collector.canonical_url("https://example.com/news/item?a=1")
        self.assertEqual(left, right)


if __name__ == "__main__":
    unittest.main()
