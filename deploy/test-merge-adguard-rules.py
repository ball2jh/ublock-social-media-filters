#!/usr/bin/env python3
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


MERGER = Path(__file__).with_name("merge-adguard-rules.py")


def read_user_rules(config):
    rules = []
    in_rules = False
    for line in config.read_text().splitlines():
        if re.match(r"^user_rules:", line):
            in_rules = True
            continue
        if in_rules and line and not line.startswith("  "):
            break
        if in_rules:
            match = re.match(r"^\s*-\s*(.*)$", line)
            if match:
                rules.append(match.group(1).strip().strip("\"'"))
    return rules


class MergeAdGuardRulesTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.config = self.root / "AdGuardHome.yaml"
        self.rules = self.root / "generated.txt"
        self.state = self.root / "managed.txt"
        self.config.write_text(
            "user_rules:\n"
            "  - '@@||example.com^'\n"
            "  - '||instagram.com^'\n"
            "  - '||twitch.tv^'\n"
            "  - '||twitchcdn.net^'\n"
            "  - '||jtvnw.net^'\n"
            "filters:\n"
            "  - enabled: true\n"
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_merge(self, mode="write"):
        return subprocess.run(
            [sys.executable, MERGER, self.config, self.rules, self.state, mode],
            check=True,
            capture_output=True,
            text=True,
        )

    def test_first_managed_install_removes_legacy_twitch_rules(self):
        self.rules.write_text("||instagram.com^\n||tumblr.com^\n")

        result = self.run_merge()

        self.assertIn("3 managed rules to remove", result.stdout)
        self.assertEqual(
            read_user_rules(self.config),
            ["@@||example.com^", "||instagram.com^", "||tumblr.com^"],
        )
        self.assertEqual(
            self.state.read_text().splitlines(),
            ["||instagram.com^", "||tumblr.com^"],
        )

    def test_later_install_removes_rules_dropped_from_generated_list(self):
        self.rules.write_text("||instagram.com^\n||tumblr.com^\n")
        self.run_merge()
        self.rules.write_text("||tumblr.com^\n")

        result = self.run_merge()

        self.assertIn("1 managed rule to remove", result.stdout)
        self.assertEqual(
            read_user_rules(self.config),
            ["@@||example.com^", "||tumblr.com^"],
        )
        self.assertEqual(self.state.read_text().splitlines(), ["||tumblr.com^"])

    def test_check_mode_does_not_write(self):
        self.rules.write_text("||instagram.com^\n")
        before = self.config.read_text()

        self.run_merge("check")

        self.assertEqual(self.config.read_text(), before)
        self.assertFalse(self.state.exists())


if __name__ == "__main__":
    unittest.main()
