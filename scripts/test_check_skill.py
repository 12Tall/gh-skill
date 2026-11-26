import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import check_skill


class CheckSkillTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        (self.root / "SKILL.md").write_text(
            "---\nname: gh-skill\ndescription: Example\n---\n", encoding="utf-8"
        )

    def check_readme(self, markdown):
        (self.root / "README.md").write_text(markdown, encoding="utf-8")
        with patch.object(check_skill, "ROOT", self.root), contextlib.redirect_stdout(io.StringIO()):
            check_skill.main()

    def test_missing_links_in_fenced_examples_are_ignored(self):
        self.check_readme("```markdown\n[example](missing.md)\n```\n~~~\n[example](other.md)\n~~~\n")

    def test_missing_link_after_fence_still_fails(self):
        with self.assertRaises(SystemExit) as error:
            self.check_readme("````\n```\n[example](ignored.md)\n````\n[real link](actual.md)\n")
        self.assertNotIn("ignored.md", str(error.exception))
        self.assertIn("README.md: actual.md", str(error.exception))

    def test_missing_link_after_fence_is_the_only_reported_link(self):
        with self.assertRaises(SystemExit) as error:
            self.check_readme("```\n[example](ignored.md)\n```\n[real link](actual.md)\n")
        self.assertEqual(str(error.exception), "Missing relative link targets:\nREADME.md: actual.md")
