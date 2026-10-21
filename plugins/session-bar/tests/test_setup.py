import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

PLUGIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PLUGIN))

from setup import SetupError, remove  # noqa: E402

OTHER = {"type": "command", "command": "~/bin/my-statusline.sh", "padding": 1}
# What 2.x /session-bar:setup wrote.
OURS = {
    "type": "command",
    "command": "python3 /home/me/.claude/plugins/marketplaces/plugins/plugins/session-bar/statusline.py",
    "refreshInterval": 30,
}


class RemoveTest(unittest.TestCase):
    def setUp(self):
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop("CLAUDE_CONFIG_DIR", None)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        self.claude = self.home / ".claude"
        self.settings = self.claude / "settings.json"
        self.saved = self.claude / "session-bar" / "previous-statusline.json"
        self.claude.mkdir()

    def write_settings(self, value):
        self.settings.write_text(json.dumps(value, indent=2) + "\n")

    def read_settings(self):
        return json.loads(self.settings.read_text())

    def test_restores_the_saved_status_line(self):
        self.write_settings({"model": "opus", "statusLine": OURS, "theme": "dark"})
        self.saved.parent.mkdir()
        self.saved.write_text(json.dumps(OTHER))
        self.assertIn("Restored", remove(self.home))
        self.assertEqual(self.read_settings(), {"model": "opus", "statusLine": OTHER, "theme": "dark"})
        self.assertFalse(self.saved.exists())

    def test_without_saved_drops_the_key(self):
        self.write_settings({"model": "opus", "statusLine": OURS})
        remove(self.home)
        self.assertEqual(self.read_settings(), {"model": "opus"})

    def test_leaves_another_status_line(self):
        self.write_settings({"statusLine": OTHER})
        before = self.settings.read_bytes()
        self.assertIn("nothing changed", remove(self.home))
        self.assertEqual(self.settings.read_bytes(), before)

    def test_no_settings(self):
        self.assertIn("nothing changed", remove(self.home))
        self.assertFalse(self.settings.exists())

    def test_invalid_settings_left_alone(self):
        self.settings.write_text("{ not json")
        with self.assertRaises(SetupError):
            remove(self.home)
        self.assertEqual(self.settings.read_text(), "{ not json")

    def test_symlinked_settings_stay_a_symlink(self):
        real = self.home / "dotfiles" / "settings.json"
        real.parent.mkdir()
        real.write_text(json.dumps({"statusLine": OURS}))
        self.settings.symlink_to(real)
        remove(self.home)
        self.assertTrue(self.settings.is_symlink())
        self.assertEqual(json.loads(real.read_text()), {})

    def test_config_dir(self):
        config = self.home / "elsewhere"
        config.mkdir()
        (config / "settings.json").write_text(json.dumps({"statusLine": OURS}))
        os.environ["CLAUDE_CONFIG_DIR"] = str(config)
        remove(self.home)
        self.assertEqual(json.loads((config / "settings.json").read_text()), {})

    def test_script_needs_the_flag_and_uses_home(self):
        self.write_settings({"statusLine": OURS})
        env = {**os.environ, "HOME": str(self.home)}
        done = subprocess.run([sys.executable, str(PLUGIN / "setup.py")], capture_output=True, text=True, env=env)
        self.assertEqual(done.returncode, 2)
        self.assertEqual(self.read_settings(), {"statusLine": OURS})
        done = subprocess.run([sys.executable, str(PLUGIN / "setup.py"), "--remove"],
                              capture_output=True, text=True, env=env)
        self.assertEqual(done.returncode, 0, done.stdout)
        self.assertIn("Removed", done.stdout)
        self.assertEqual(self.read_settings(), {})


if __name__ == "__main__":
    unittest.main()
