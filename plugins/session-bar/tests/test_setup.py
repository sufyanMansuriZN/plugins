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

from setup import SetupError, hint, remove, setup  # noqa: E402

OTHER = {"type": "command", "command": "~/bin/my-statusline.sh", "padding": 1}


class SetupTest(unittest.TestCase):
    def setUp(self):
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop("CLAUDE_CONFIG_DIR", None)
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        self.claude = self.home / ".claude"
        self.settings = self.claude / "settings.json"
        self.saved = self.claude / "session-bar" / "previous-statusline.json"
        self.script = self.add_marketplace("plugins")

    def tearDown(self):
        self.tmp.cleanup()

    def add_marketplace(self, name, plugin="session-bar"):
        root = self.claude / "plugins" / "marketplaces" / name
        (root / ".claude-plugin").mkdir(parents=True)
        (root / ".claude-plugin" / "marketplace.json").write_text(
            json.dumps({"name": name, "plugins": [{"name": plugin, "source": f"./plugins/{plugin}"}]})
        )
        script = root / "plugins" / "session-bar" / "statusline.py"
        script.parent.mkdir(parents=True)
        script.write_text("")
        return script

    def ours(self, script=None):
        return {"type": "command", "command": f"python3 {script or self.script}", "refreshInterval": 30}

    def write_settings(self, value):
        self.settings.write_text(json.dumps(value, indent=2) + "\n")

    def read_settings(self):
        return json.loads(self.settings.read_text())

    def test_fresh_settings(self):
        setup(self.home)
        self.assertEqual(self.read_settings(), {"statusLine": self.ours()})
        self.assertFalse(self.saved.exists())

    def test_other_keys_kept_in_order_with_two_space_indent(self):
        self.write_settings({"model": "opus", "env": {"A": "1"}, "theme": "dark"})
        setup(self.home)
        text = self.settings.read_text()
        self.assertEqual(list(json.loads(text)), ["model", "env", "theme", "statusLine"])
        self.assertEqual(text, json.dumps({"model": "opus", "env": {"A": "1"}, "theme": "dark",
                                           "statusLine": self.ours()}, indent=2) + "\n")

    def test_second_run_changes_nothing(self):
        self.write_settings({"model": "opus"})
        setup(self.home)
        first = self.settings.read_bytes()
        message = setup(self.home)
        self.assertEqual(self.settings.read_bytes(), first)
        self.assertIn("nothing changed", message)

    def test_other_status_line_saved_and_restored(self):
        self.write_settings({"statusLine": OTHER, "model": "opus"})
        message = setup(self.home)
        self.assertIn(str(self.saved), message)
        self.assertEqual(json.loads(self.saved.read_text()), OTHER)
        self.assertEqual(self.read_settings()["statusLine"], self.ours())
        setup(self.home)
        self.assertEqual(json.loads(self.saved.read_text()), OTHER)
        remove(self.home)
        self.assertEqual(self.read_settings(), {"statusLine": OTHER, "model": "opus"})
        self.assertFalse(self.saved.exists())

    def test_remove_without_saved_drops_the_key(self):
        self.write_settings({"model": "opus"})
        setup(self.home)
        remove(self.home)
        self.assertEqual(self.read_settings(), {"model": "opus"})

    def test_remove_leaves_another_status_line(self):
        self.write_settings({"statusLine": OTHER})
        self.assertIn("nothing changed", remove(self.home))
        self.assertEqual(self.read_settings(), {"statusLine": OTHER})

    def test_old_path_of_ours_is_updated_not_saved(self):
        self.write_settings({"statusLine": {"type": "command", "command": "python3 /old/plugins/session-bar/statusline.py"}})
        setup(self.home)
        self.assertEqual(self.read_settings()["statusLine"], self.ours())
        self.assertFalse(self.saved.exists())

    def test_no_marketplace_copy(self):
        self.script.unlink()
        with self.assertRaisesRegex(SetupError, "no marketplace copy"):
            setup(self.home)
        self.assertFalse(self.settings.exists())

    def test_marketplace_must_list_the_plugin(self):
        self.script.unlink()
        self.add_marketplace("elsewhere", plugin="something-else")
        with self.assertRaises(SetupError):
            setup(self.home)

    def test_installed_marketplace_preferred(self):
        other = self.add_marketplace("a-fork")
        (self.claude / "plugins" / "installed_plugins.json").write_text(
            json.dumps({"version": 2, "plugins": {"session-bar@plugins": []}})
        )
        setup(self.home)
        self.assertEqual(self.read_settings()["statusLine"], self.ours())
        self.assertNotIn(str(other), self.settings.read_text())

    def test_invalid_settings_left_alone(self):
        self.settings.write_text("{ not json")
        with self.assertRaises(SetupError):
            setup(self.home)
        self.assertEqual(self.settings.read_text(), "{ not json")

    def test_symlinked_settings_stay_a_symlink(self):
        real = self.home / "dotfiles" / "settings.json"
        real.parent.mkdir()
        real.write_text("{}\n")
        self.settings.parent.mkdir(exist_ok=True)
        self.settings.symlink_to(real)
        setup(self.home)
        self.assertTrue(self.settings.is_symlink())
        self.assertEqual(json.loads(real.read_text()), {"statusLine": self.ours()})

    def test_hint_until_setup(self):
        self.assertIn("/session-bar:setup", json.loads(hint(self.home))["systemMessage"])
        self.write_settings({"statusLine": OTHER})
        self.assertIsNotNone(hint(self.home))
        setup(self.home)
        self.assertIsNone(hint(self.home))
        self.script.unlink()
        self.assertIsNotNone(hint(self.home))

    def test_config_dir(self):
        config = self.home / "elsewhere"
        config.mkdir()
        os.environ["CLAUDE_CONFIG_DIR"] = str(config)
        with self.assertRaises(SetupError):
            setup(self.home)
        os.environ["CLAUDE_CONFIG_DIR"] = str(self.claude)
        setup(self.home)
        self.assertEqual(self.read_settings(), {"statusLine": self.ours()})

    def test_script_uses_home_and_reports(self):
        env = {**os.environ, "HOME": str(self.home)}
        done = subprocess.run([sys.executable, str(PLUGIN / "setup.py")], capture_output=True, text=True, env=env)
        self.assertEqual(done.returncode, 0, done.stdout)
        self.assertIn("Set statusLine", done.stdout)
        done = subprocess.run([sys.executable, str(PLUGIN / "setup.py"), "--remove"],
                              capture_output=True, text=True, env=env)
        self.assertIn("Removed", done.stdout)
        self.assertEqual(self.read_settings(), {})


if __name__ == "__main__":
    unittest.main()
