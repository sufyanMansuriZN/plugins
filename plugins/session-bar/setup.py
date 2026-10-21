#!/usr/bin/env python3
"""--remove: take the 2.x session-bar statusLine out of Claude Code's settings and put back the one it saved."""

import json
import os
import shlex
import sys
import tempfile
from pathlib import Path
from typing import Optional

PLUGIN = "session-bar"


class SetupError(Exception):
    pass


def paths(home: Path):
    claude = Path(os.environ.get("CLAUDE_CONFIG_DIR") or home / ".claude")
    return claude / "settings.json", claude / "session-bar" / "previous-statusline.json"


def read_json(path: Path) -> Optional[object]:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as error:
        raise SetupError(f"cannot read {path}: {error}")


def write_json(path: Path, value: object) -> None:
    target = path.resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=f".{target.name}.")
    with os.fdopen(fd, "w") as out:
        out.write(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    if target.exists():
        os.chmod(tmp, target.stat().st_mode & 0o777)
    os.replace(tmp, target)


def ours(status_line: object) -> bool:
    command = status_line.get("command") if isinstance(status_line, dict) else None
    try:
        words = shlex.split(command) if isinstance(command, str) else []
    except ValueError:
        return False
    return bool(words) and words[-1].endswith(f"/plugins/{PLUGIN}/statusline.py")


def load_settings(settings_path: Path) -> dict:
    settings = read_json(settings_path)
    if settings is None:
        return {}
    if not isinstance(settings, dict):
        raise SetupError(f"{settings_path} does not hold a JSON object")
    return settings


def remove(home: Path) -> str:
    settings_path, saved_path = paths(home)
    settings = load_settings(settings_path)
    if not ours(settings.get("statusLine")):
        return f"statusLine in {settings_path} does not run session-bar; nothing changed."
    previous = read_json(saved_path)
    if previous is not None:
        settings["statusLine"] = previous
        message = f"Restored your previous statusLine from {saved_path}."
    else:
        del settings["statusLine"]
        message = f"Removed session-bar's statusLine from {settings_path}."
    write_json(settings_path, settings)
    if previous is not None:
        saved_path.unlink()
    return message


def main(argv) -> int:
    if "--remove" not in argv:
        print("usage: setup.py --remove")
        return 2
    try:
        print(remove(Path(os.path.expanduser("~"))))
    except SetupError as error:
        print(f"session-bar remove failed: {error}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
