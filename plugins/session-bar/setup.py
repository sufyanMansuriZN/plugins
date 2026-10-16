#!/usr/bin/env python3
"""Point Claude Code's statusLine at session-bar's statusline.py, or put the previous one back with --remove."""

import json
import os
import shlex
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Optional

PLUGIN = "session-bar"
REFRESH_SECONDS = 30


class SetupError(Exception):
    pass


def paths(home: Path):
    claude = Path(os.environ.get("CLAUDE_CONFIG_DIR") or home / ".claude")
    return claude / "settings.json", claude / "session-bar" / "previous-statusline.json", claude / "plugins"


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


def find_script(plugins: Path) -> Path:
    """The marketplace copy of statusline.py: it moves forward with every marketplace update, unlike the versioned cache."""
    installed = read_json(plugins / "installed_plugins.json") or {}
    installed_names = set(installed.get("plugins", {})) if isinstance(installed, dict) else set()
    found = []
    for script in sorted(plugins.glob(f"marketplaces/*/plugins/{PLUGIN}/statusline.py")):
        marketplace = script.parents[2]
        try:
            manifest = json.loads((marketplace / ".claude-plugin" / "marketplace.json").read_text())
        except (OSError, ValueError):
            continue
        listed = manifest.get("plugins", []) if isinstance(manifest, dict) else []
        if any(isinstance(p, dict) and p.get("name") == PLUGIN for p in listed):
            found.append((f"{PLUGIN}@{manifest.get('name', marketplace.name)}" not in installed_names, script))
    if not found:
        raise SetupError(
            f"no marketplace copy of {PLUGIN} with statusline.py under {plugins / 'marketplaces'}. "
            f"Run `claude plugin marketplace update` and `claude plugin update {PLUGIN}@plugins`, then try again."
        )
    return min(found)[1]


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


def setup(home: Path) -> str:
    if shutil.which("python3") is None:
        raise SetupError("python3 is not on PATH; the status line needs it")
    settings_path, saved_path, plugins = paths(home)
    settings = load_settings(settings_path)
    wanted = {
        "type": "command",
        "command": f"python3 {shlex.quote(str(find_script(plugins)))}",
        "refreshInterval": REFRESH_SECONDS,
    }
    current = settings.get("statusLine")
    if current == wanted:
        return f"statusLine in {settings_path} already runs session-bar; nothing changed."
    notes = []
    if current is not None and not ours(current):
        write_json(saved_path, current)
        notes.append(f"Saved your previous statusLine to {saved_path}; /session-bar:remove puts it back.")
    settings["statusLine"] = wanted
    write_json(settings_path, settings)
    notes.insert(0, f"Set statusLine in {settings_path} to: {wanted['command']} (every {REFRESH_SECONDS} s).")
    return " ".join(notes)


def remove(home: Path) -> str:
    settings_path, saved_path, _ = paths(home)
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


def hint(home: Path) -> Optional[str]:
    """The SessionStart hook's JSON: a line for the person only, while the statusLine does not run session-bar."""
    settings_path, _, _ = paths(home)
    try:
        current = load_settings(settings_path).get("statusLine")
    except SetupError:
        return None
    if ours(current) and Path(shlex.split(current["command"])[-1]).is_file():
        return None
    return json.dumps({"systemMessage": "session-bar: run /session-bar:setup once to show the status line."})


def main(argv) -> int:
    home = Path(os.path.expanduser("~"))
    if "--hint" in argv:
        message = hint(home)
        if message:
            print(message)
        return 0
    try:
        print(remove(home) if "--remove" in argv else setup(home))
    except SetupError as error:
        print(f"session-bar setup failed: {error}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
