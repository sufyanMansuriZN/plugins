import copy
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PLUGIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PLUGIN))

import statusline  # noqa: E402
from statusline import RED, YELLOW, Git, line, parse_git  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"
AFTER = json.loads((FIXTURES / "after-response.json").read_text())
BEFORE = json.loads((FIXTURES / "before-first-response.json").read_text())
# The time the after-response payload was captured.
NOW = 1792162404.0
GIT = Git("main", 3, 2)
ANSI = re.compile(r"\x1b\[[0-9;]*m")


def plain(text):
    return ANSI.sub("", text)


def with_limits(**windows):
    payload = copy.deepcopy(AFTER)
    payload["rate_limits"] = windows
    return payload


def colored(row, text):
    """The color code right before `text` in the row, or '' when it is drawn in the default color."""
    at = row.index(text)
    match = re.search(r"(\x1b\[[0-9;]*m)$", row[:at])
    code = match.group(1) if match else ""
    return "" if code == statusline.RESET else code


class LineTest(unittest.TestCase):
    def test_example_row(self):
        self.assertEqual(
            plain(line(AFTER, NOW, GIT)),
            "main +3 ~2 · Opus 5.5 1M · ctx 6% · 5h 66% ↻46m · 7d 43% ↻3d21h",
        )

    def test_calm_row_has_no_alert_color(self):
        row = line(AFTER, NOW, GIT)
        self.assertNotIn(RED, row)
        self.assertNotIn(YELLOW, row)

    def test_before_first_response(self):
        self.assertEqual(plain(line(BEFORE, NOW, None)), "Opus 5.5 1M")

    def test_no_git(self):
        self.assertTrue(plain(line(AFTER, NOW, None)).startswith("Opus 5.5 1M · ctx 6%"))

    def test_clean_tree(self):
        self.assertTrue(plain(line(AFTER, NOW, Git("main", 0, 0))).startswith("main · Opus"))

    def test_no_model(self):
        payload = copy.deepcopy(AFTER)
        del payload["model"]
        self.assertEqual(plain(line(payload, NOW, None)), "ctx 6% · 5h 66% ↻46m · 7d 43% ↻3d21h")

    def test_model_name_already_says_size(self):
        payload = copy.deepcopy(BEFORE)
        payload["model"]["display_name"] = "Opus 4.6 (1M context)"
        self.assertEqual(plain(line(payload, NOW, None)), "Opus 4.6 (1M context)")

    def test_200k_window(self):
        payload = copy.deepcopy(BEFORE)
        payload["context_window"]["context_window_size"] = 200000
        self.assertEqual(plain(line(payload, NOW, None)), "Opus 5.5 200K")

    def test_no_rate_limits(self):
        payload = copy.deepcopy(AFTER)
        del payload["rate_limits"]
        self.assertEqual(plain(line(payload, NOW, None)), "Opus 5.5 1M · ctx 6%")

    def test_one_window_absent(self):
        payload = with_limits(seven_day=AFTER["rate_limits"]["seven_day"])
        self.assertEqual(plain(line(payload, NOW, None)), "Opus 5.5 1M · ctx 6% · 7d 43% ↻3d21h")

    def test_spend_limit(self):
        payload = with_limits(spend_limit={"used_percentage": 40.4, "resets_at": None})
        self.assertEqual(plain(line(payload, NOW, None)), "Opus 5.5 1M · ctx 6% · $ 40%")

    def test_bad_fields_leave_segments_out(self):
        payload = copy.deepcopy(AFTER)
        payload["model"] = "Opus"
        payload["context_window"]["used_percentage"] = "6"
        payload["rate_limits"] = {"five_hour": {"used_percentage": None}, "seven_day": []}
        self.assertEqual(plain(line(payload, NOW, None)), "")

    def test_reset_time_that_does_not_parse(self):
        payload = with_limits(five_hour={"used_percentage": 20, "resets_at": "soon"})
        self.assertEqual(plain(line(payload, NOW, None)), "Opus 5.5 1M · ctx 6% · 5h 20%")

    def test_reset_passed(self):
        payload = with_limits(five_hour={"used_percentage": 88, "resets_at": NOW - 1})
        self.assertEqual(plain(line(payload, NOW, None)), "Opus 5.5 1M · ctx 6%")

    def test_context_colors(self):
        for pct, color in ((69, ""), (70, YELLOW), (84.4, YELLOW), (85, RED)):
            payload = copy.deepcopy(AFTER)
            payload["context_window"]["used_percentage"] = pct
            row = line(payload, NOW, None)
            self.assertEqual(colored(row, f"{round(pct)}%"), color, pct)

    def test_pace_colors(self):
        hour = 3600
        cases = (
            # 40% with 4h of 5h left: 20% of the window gone, 20 ahead.
            (40, NOW + 4 * hour, YELLOW),
            # 40% with 2h left: 60% gone, behind pace.
            (40, NOW + 2 * hour, ""),
            # 55% with 4.5h left: 10% gone, 45 ahead.
            (55, NOW + 4.5 * hour, RED),
            # 91% with 10m left: behind pace, but 90 or more.
            (91, NOW + 600, RED),
        )
        for pct, resets_at, color in cases:
            row = line(with_limits(five_hour={"used_percentage": pct, "resets_at": resets_at}), NOW, None)
            self.assertEqual(colored(row, f"{pct}%"), color, (pct, resets_at))

    def test_no_reset_time_colors(self):
        for pct, color in ((49, ""), (50, YELLOW), (79, YELLOW), (80, RED)):
            row = line(with_limits(seven_day={"used_percentage": pct}), NOW, None)
            self.assertEqual(colored(row, f"{pct}%"), color, pct)
            self.assertNotIn("↻", plain(row))

    def test_countdowns(self):
        for seconds, text in ((30, "<1m"), (12 * 60, "12m"), (2 * 3600 + 40 * 60, "2h40m"),
                              (4 * 3600, "4h"), (31 * 3600 + 59, "1d7h"), (2 * 86400, "2d")):
            row = line(with_limits(five_hour={"used_percentage": 1, "resets_at": NOW + seconds}), NOW, None)
            self.assertTrue(plain(row).endswith(f"↻{text}"), (seconds, plain(row)))

    def test_width_cuts_git_first(self):
        git = Git("feature/a-very-long-branch-name", 1, 0)
        full = plain(line(AFTER, NOW, git))
        gauges = "Opus 5.5 1M · ctx 6% · 5h 66% ↻46m · 7d 43% ↻3d21h"
        cut = plain(line(AFTER, NOW, git, columns=4 + len(gauges) + 3 + 10))
        self.assertEqual(cut, "feature/a… · " + gauges)
        self.assertEqual(plain(line(AFTER, NOW, git, columns=len(full) + 4)), full)

    def test_width_never_cuts_gauges(self):
        self.assertEqual(
            plain(line(AFTER, NOW, GIT, columns=20)),
            "Opus 5.5 1M · ctx 6% · 5h 66% ↻46m · 7d 43% ↻3d21h",
        )


class ParseGitTest(unittest.TestCase):
    def test_counts(self):
        porcelain = "\n".join([
            "# branch.oid 0123456789abcdef",
            "# branch.head main",
            "1 A. N... 100644 100644 100644 a b new.py",
            "1 .M N... 100644 100644 100644 a b edited.py",
            "1 D. N... 100644 000000 000000 a b gone.py",
            "2 R. N... 100644 100644 100644 a b R100 to.py\tfrom.py",
            "? untracked.txt",
        ])
        self.assertEqual(parse_git(porcelain), Git("main", 2, 3))

    def test_detached(self):
        porcelain = "# branch.oid 0123456789abcdef\n# branch.head (detached)\n"
        self.assertEqual(parse_git(porcelain), Git("0123456", 0, 0))

    def test_not_status_output(self):
        self.assertIsNone(parse_git(""))


class ScriptTest(unittest.TestCase):
    def run_script(self, stdin, env=None):
        return subprocess.run(
            [sys.executable, str(PLUGIN / "statusline.py")],
            input=stdin, capture_output=True, text=True, env={**os.environ, **(env or {})},
        )

    def test_malformed_json_prints_nothing(self):
        for stdin in ("{bad", "", "[1, 2]", "null"):
            done = self.run_script(stdin)
            self.assertEqual((done.returncode, done.stdout, done.stderr), (0, "", ""), stdin)

    def test_real_repo(self):
        with tempfile.TemporaryDirectory() as repo:
            git = ["git", "-C", repo, "-c", "user.email=t@t", "-c", "user.name=t"]
            subprocess.run(git + ["init", "-q", "-b", "trunk"], check=True)
            Path(repo, "a.txt").write_text("a")
            subprocess.run(git + ["add", "a.txt"], check=True)
            subprocess.run(git + ["commit", "-q", "-m", "a"], check=True)
            Path(repo, "a.txt").write_text("b")
            Path(repo, "b.txt").write_text("b")
            payload = copy.deepcopy(BEFORE)
            payload["workspace"]["current_dir"] = repo
            done = self.run_script(json.dumps(payload), {"COLUMNS": "160"})
            self.assertEqual(plain(done.stdout), "trunk +1 ~1 · Opus 5.5 1M\n")

    def test_not_a_repo(self):
        with tempfile.TemporaryDirectory() as directory:
            payload = copy.deepcopy(BEFORE)
            payload["workspace"]["current_dir"] = directory
            done = self.run_script(json.dumps(payload), {"GIT_CEILING_DIRECTORIES": directory})
            self.assertEqual(plain(done.stdout), "Opus 5.5 1M\n")


if __name__ == "__main__":
    unittest.main()
