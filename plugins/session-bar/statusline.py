#!/usr/bin/env python3
"""session-bar: Claude Code statusLine command. Reads the session JSON on stdin, prints one row."""

import json
import math
import os
import subprocess
import sys
import time
from typing import List, NamedTuple, Optional

DIM = "\x1b[2m"
YELLOW = "\x1b[33m"
RED = "\x1b[31m"
RESET = "\x1b[0m"

SEP_TEXT = " · "
WINDOWS = (("five_hour", "5h", 5 * 3600), ("seven_day", "7d", 168 * 3600), ("spend_limit", "$", None))
# The status line is drawn two cells in from the terminal's left edge.
INDENT = 2


class Git(NamedTuple):
    branch: str
    added: int
    changed: int


class Run(NamedTuple):
    text: str
    color: str = ""


Segment = List[Run]


def num(value: object) -> Optional[float]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) else None


def obj(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def parse_git(porcelain: str) -> Optional[Git]:
    oid = head = None
    added = changed = 0
    for row in porcelain.splitlines():
        if row.startswith("# branch.oid "):
            oid = row[len("# branch.oid "):]
        elif row.startswith("# branch.head "):
            head = row[len("# branch.head "):]
        elif row.startswith("? "):
            added += 1
        elif row.startswith("1 "):
            xy = row[2:4]
            if "A" in xy:
                added += 1
            else:
                changed += 1
        elif row.startswith(("2 ", "u ")):
            changed += 1
    if head is None:
        return None
    if head == "(detached)":
        head = oid[:7] if oid and oid != "(initial)" else "HEAD"
    return Git(head, added, changed)


def read_git(directory: str) -> Optional[Git]:
    try:
        done = subprocess.run(
            ["git", "--no-optional-locks", "-C", directory, "status", "--porcelain=v2", "--branch"],
            capture_output=True, text=True, timeout=2,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return parse_git(done.stdout) if done.returncode == 0 else None


def countdown(seconds: float) -> str:
    minutes = int(seconds // 60)
    if minutes < 1:
        return "<1m"
    days, rest = divmod(minutes, 1440)
    hours, mins = divmod(rest, 60)
    if days:
        return f"{days}d{hours}h" if hours else f"{days}d"
    if hours:
        return f"{hours}h{mins}m" if mins else f"{hours}h"
    return f"{mins}m"


def size_label(size: float) -> str:
    if size >= 1_000_000 and size % 1_000_000 == 0:
        return f"{int(size // 1_000_000)}M"
    return f"{round(size / 1000)}K"


def git_segment(git: Optional[Git]) -> Optional[Segment]:
    if git is None:
        return None
    text = git.branch
    if git.added:
        text += f" +{git.added}"
    if git.changed:
        text += f" ~{git.changed}"
    return [Run(text)]


def model_segment(payload: dict) -> Optional[Segment]:
    name = obj(payload.get("model")).get("display_name")
    if not isinstance(name, str) or not name:
        return None
    size = num(obj(payload.get("context_window")).get("context_window_size"))
    if size and size > 0:
        label = size_label(size)
        if label.lower() not in name.lower():
            name = f"{name} {label}"
    return [Run(name)]


def context_segment(payload: dict) -> Optional[Segment]:
    pct = num(obj(payload.get("context_window")).get("used_percentage"))
    if pct is None:
        return None
    pct = round(pct)
    color = RED if pct >= 85 else YELLOW if pct >= 70 else ""
    return [Run("ctx ", DIM), Run(f"{pct}%", color)]


def pace_color(pct: float, resets_at: Optional[float], window: Optional[int], now: float) -> str:
    if resets_at is None or window is None:
        return RED if pct >= 80 else YELLOW if pct >= 50 else ""
    elapsed = min(1.0, max(0.0, 1 - (resets_at - now) / window))
    ahead = pct - elapsed * 100
    if ahead > 30 or pct >= 90:
        return RED
    return YELLOW if ahead > 15 else ""


def window_segment(limits: dict, key: str, label: str, window: Optional[int], now: float) -> Optional[Segment]:
    limit = obj(limits.get(key))
    pct = num(limit.get("used_percentage"))
    if pct is None:
        return None
    resets_at = num(limit.get("resets_at"))
    if resets_at is not None and resets_at <= now:
        return None
    runs = [Run(f"{label} ", DIM), Run(f"{round(pct)}%", pace_color(pct, resets_at, window, now))]
    if resets_at is not None:
        runs.append(Run(f" ↻{countdown(resets_at - now)}", DIM))
    return runs


def width(segment: Segment) -> int:
    return sum(len(run.text) for run in segment)


def render(segments: List[Segment]) -> str:
    sep = f"{DIM}{SEP_TEXT}{RESET}"
    return sep.join("".join(f"{r.color}{r.text}{RESET}" if r.color else r.text for r in seg) for seg in segments)


def fit_git(git: Segment, room: int) -> Optional[Segment]:
    text = git[0].text
    if len(text) <= room:
        return git
    return [Run(text[: room - 1] + "…")] if room >= 2 else None


def line(payload: dict, now: float, git: Optional[Git], columns: Optional[int] = None) -> str:
    limits = obj(payload.get("rate_limits"))
    gauges = [model_segment(payload), context_segment(payload)]
    gauges += [window_segment(limits, key, label, window, now) for key, label, window in WINDOWS]
    rest = [seg for seg in gauges if seg]
    head = git_segment(git)
    if head and columns:
        used = sum(width(seg) for seg in rest) + len(SEP_TEXT) * len(rest)
        head = fit_git(head, columns - INDENT - used)
    return render([head] + rest if head else rest)


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read())
        if not isinstance(payload, dict):
            return
        directory = obj(payload.get("workspace")).get("current_dir") or payload.get("cwd")
        git = read_git(directory) if isinstance(directory, str) and directory else None
        try:
            columns = int(os.environ.get("COLUMNS", ""))
        except ValueError:
            columns = None
        row = line(payload, time.time(), git, columns)
        if row:
            sys.stdout.write(row + "\n")
    except Exception:
        return


if __name__ == "__main__":
    main()
