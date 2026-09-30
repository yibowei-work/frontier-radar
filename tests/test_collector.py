import importlib.util
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch


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


class GithubCollectorTests(unittest.TestCase):
    def test_repository_activity_ids_follow_beijing_calendar_days(self):
        first = datetime(2026, 9, 29, 16, 30, tzinfo=timezone.utc)
        same_beijing_day = datetime(2026, 9, 30, 1, 0, tzinfo=timezone.utc)
        next_beijing_day = datetime(2026, 9, 30, 16, 0, tzinfo=timezone.utc)

        self.assertEqual(
            collector.github_activity_native_id(42, first),
            collector.github_activity_native_id(42, same_beijing_day),
        )
        self.assertNotEqual(
            collector.github_activity_native_id(42, same_beijing_day),
            collector.github_activity_native_id(42, next_beijing_day),
        )

    def test_recent_repository_pushes_are_capped_and_old_or_forked_repos_are_ignored(self):
        now = datetime(2026, 9, 30, 11, 0, tzinfo=timezone.utc)
        windows = [collector.Window("daily", datetime(2026, 9, 27, 11, 0, tzinfo=timezone.utc), now, "2026-09-30")]
        repositories = []
        for index in range(7):
            repositories.append(
                {
                    "id": index,
                    "name": f"robot-{index}",
                    "full_name": f"example/robot-{index}",
                    "html_url": f"https://github.com/example/robot-{index}",
                    "description": "Developer SDK and API toolkit",
                    "language": "Python",
                    "stargazers_count": index,
                    "created_at": "2025-01-01T00:00:00Z",
                    "pushed_at": f"2026-09-30T0{index}:00:00Z",
                    "archived": False,
                    "fork": False,
                }
            )
        repositories.extend(
            [
                {**repositories[0], "id": 20, "name": "old", "pushed_at": "2026-09-01T00:00:00Z"},
                {**repositories[0], "id": 21, "name": "fork", "fork": True},
            ]
        )
        source = {
            "id": "github-example",
            "name": "Example GitHub",
            "org": "example",
            "region": "中国",
            "company_scale": "初创公司",
            "company": "示例公司",
            "default_topic": "具身智能",
        }

        with patch.object(collector, "fetch", return_value=(json.dumps(repositories).encode(), {})):
            items, status = collector.collect_github(source, now, windows, "token")

        self.assertEqual(len(items), 5)
        self.assertEqual(status["matched"], 5)
        self.assertTrue(all(item["region"] == "中国" for item in items))
        self.assertTrue(all(item["signal_type"] == "开源" for item in items))
        self.assertTrue(all(item["topic"] == "具身智能" for item in items))


if __name__ == "__main__":
    unittest.main()
