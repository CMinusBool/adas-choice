#!/usr/bin/env python3
"""Tests for scripts/check_tickets.py.

    python scripts/check_tickets_test.py

Standard library only (`unittest`), like the script it tests: the repo has no
Python toolchain. Each test builds a whole effort directory in a temporary
directory and runs the script's `main()` over it, so what is asserted is the
real exit code and the real output a run would see.
"""

from __future__ import annotations

import io
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import check_tickets  # noqa: E402


SPEC = """# The effort

Type: task
Status: ready
Labels: ready-for-agent

## What to build

Everything.
"""

BODY = """
## What to build

Something.

## Acceptance criteria

- [ ] It works.
"""


def ticket(
    number: str,
    slug: str,
    *,
    status: str = "ready",
    labels: str = "ready-for-agent",
    blocked_by: str = "None (can start immediately)",
    profile: str | None = "standard",
    kind: str | None = "code",
    deliverable: str | None = None,
    headers: list[str] | None = None,
) -> tuple[str, str]:
    """One ticket file: (filename, text). `headers` overrides the block wholesale."""
    if headers is None:
        headers = [
            "Type: task",
            f"Status: {status}",
            f"Labels: {labels}",
            f"Blocked by: {blocked_by}",
        ]
        if profile is not None:
            headers.append(f"Profile: {profile}")
        if kind is not None:
            headers.append(f"Kind: {kind}")
        if deliverable is not None:
            headers.append(f"Deliverable: {deliverable}")
    title = slug.replace("-", " ").capitalize()
    return f"{number}-{slug}.md", f"# {number}: {title}\n\n" + "\n".join(headers) + "\n" + BODY


class EffortCase(unittest.TestCase):
    def run_check(self, tickets, spec: str = SPEC):
        """Write an effort directory, run main() over it, return (code, out, err)."""
        with tempfile.TemporaryDirectory() as tmp:
            effort = Path(tmp) / "COOP-001-apartment"
            (effort / "issues").mkdir(parents=True)
            (effort / "spec.md").write_text(spec, encoding="utf-8")
            for name, text in tickets:
                (effort / "issues" / name).write_text(text, encoding="utf-8")
            out, err = io.StringIO(), io.StringIO()
            with redirect_stdout(out), redirect_stderr(err):
                code = check_tickets.main(["check_tickets.py", str(effort)])
            return code, out.getvalue(), err.getvalue()

    def assertFails(self, tickets, fragment: str, spec: str = SPEC):
        code, _out, err = self.run_check(tickets)
        self.assertEqual(code, 1, f"expected exit 1, got {code}; stderr was:\n{err}")
        self.assertIn(fragment, err)
        return err

    def assertPasses(self, tickets, spec: str = SPEC):
        code, out, err = self.run_check(tickets, spec)
        self.assertEqual(code, 0, f"expected exit 0, got {code}; stderr was:\n{err}")
        return out


class BackwardsCompatibility(EffortCase):
    def test_ticket_without_kind_or_deliverable_still_passes(self):
        """A ticket written before this contract existed reads as `Kind: code`."""
        out = self.assertPasses([ticket("01", "old-style", kind=None)])
        self.assertIn("code", out)
        self.assertIn("frontier: 01", out)

    def test_missing_kind_prints_as_code_and_needs_no_deliverable(self):
        out = self.assertPasses([ticket("01", "old-style", kind=None, profile=None)])
        self.assertRegex(out, r"01-old-style\s+ready\s+standard\s+code\s")


class KindRules(EffortCase):
    def test_unknown_kind_is_rejected(self):
        self.assertFails([ticket("01", "weird", kind="sculpture")], "`Kind: sculpture` is not one of")

    def test_every_allowed_kind_is_accepted(self):
        for kind in check_tickets.KINDS:
            with self.subTest(kind=kind):
                deliverable = None
                if kind == "asset-code":
                    deliverable = "public/assets/actors/boy-walk-right.png"
                elif kind != "code":
                    deliverable = "design/01-a-note.md"
                out = self.assertPasses([ticket("01", "a-ticket", kind=kind, deliverable=deliverable)])
                self.assertIn(kind, out)

    def test_kind_must_come_after_profile(self):
        self.assertFails(
            [
                ticket(
                    "01",
                    "out-of-order",
                    headers=[
                        "Type: task",
                        "Status: ready",
                        "Labels: ready-for-agent",
                        "Kind: code",
                        "Blocked by: None (can start immediately)",
                        "Profile: standard",
                    ],
                )
            ],
            "header lines must be in the order",
        )


class DeliverableRules(EffortCase):
    def test_non_code_kind_needs_a_deliverable(self):
        self.assertFails(
            [ticket("01", "design-entryway", kind="design")],
            "`Kind: design` needs a `Deliverable:` line",
        )

    def test_code_kind_forbids_a_deliverable(self):
        self.assertFails(
            [ticket("01", "build-it", kind="code", deliverable="src/main.ts")],
            "a `code` ticket carries no `Deliverable:` line",
        )

    def test_deliverable_may_not_escape_the_effort_directory(self):
        self.assertFails(
            [ticket("01", "sheets", kind="art", deliverable="../../art/characters/v1/")],
            "must stay inside the effort directory; it contains `..`",
        )

    def test_asset_code_deliverable_is_measured_from_the_repo_root(self):
        self.assertFails(
            [ticket("01", "boy-walk", kind="asset-code", deliverable="../public/boy.png")],
            "must stay inside the repo root; it contains `..`",
        )
        self.assertPasses(
            [ticket("01", "boy-walk", kind="asset-code", deliverable="public/assets/boy.png")]
        )

    def test_deliverable_may_not_be_absolute(self):
        for value in ("/design/10.md", r"C:\design\10.md", "~/design/10.md"):
            with self.subTest(value=value):
                self.assertFails(
                    [ticket("01", "design-entryway", kind="design", deliverable=value)],
                    "must be relative to the effort directory, not an absolute path",
                )

    def test_deliverable_takes_exactly_one_path(self):
        self.assertFails(
            [ticket("01", "design-entryway", kind="design", deliverable="design/10.md, design/11.md")],
            "`Deliverable:` takes exactly one path",
        )

    def test_deliverable_needs_a_value(self):
        self.assertFails(
            [ticket("01", "design-entryway", kind="design", deliverable="")],
            "`Deliverable:` needs a path",
        )

    def test_spec_may_not_carry_the_new_lines(self):
        spec = SPEC.replace("Labels: ready-for-agent", "Labels: ready-for-agent\nKind: code")
        code, _out, err = self.run_check([ticket("01", "a-ticket")], spec=spec)
        self.assertEqual(code, 1)
        self.assertIn("drop the `Kind:` line", err)


class ReviewStatus(EffortCase):
    def test_review_is_allowed_on_design_content_and_art(self):
        for kind in sorted(check_tickets.REVIEW_KINDS):
            with self.subTest(kind=kind):
                out = self.assertPasses(
                    [
                        ticket("01", "a-note", status="review", kind=kind, deliverable="design/01-a.md"),
                        ticket("02", "something-else"),
                    ]
                )
                self.assertIn("awaiting review: 01", out)

    def test_review_is_rejected_on_code(self):
        self.assertFails(
            [ticket("01", "build-it", status="review", kind="code")],
            "`Status: review` is only for art, content, design tickets",
        )

    def test_review_is_rejected_on_research_and_asset_code(self):
        self.assertFails(
            [ticket("01", "films", status="review", kind="research", deliverable="research/films.md")],
            "a `research` ticket goes from in-progress straight to done",
        )
        self.assertFails(
            [ticket("01", "boy-walk", status="review", kind="asset-code", deliverable="public/boy.png")],
            "a `asset-code` ticket goes from in-progress straight to done",
        )

    def test_unknown_status_is_still_rejected(self):
        self.assertFails([ticket("01", "a-ticket", status="approved")], "`Status: approved` is not one of")


class FrontierAndReviewLines(EffortCase):
    """A small graph: a `review` ticket blocks a `ready` one, and one ticket is runnable."""

    GRAPH = [
        ticket("01", "design-entryway", status="review", kind="design", deliverable="design/01-entryway.md"),
        ticket("02", "build-entryway", status="ready", blocked_by="01"),
        ticket("03", "mica-and-mira", status="ready"),
    ]

    def test_review_blocks_and_both_lines_print(self):
        out = self.assertPasses(self.GRAPH)
        self.assertIn("awaiting review: 01", out)
        self.assertIn("frontier: 03", out)
        self.assertNotIn("frontier: 02", out)

    def test_the_review_line_prints_every_review_ticket_in_order(self):
        graph = [
            ticket("01", "films", status="review", kind="content", deliverable="research/films.md"),
            ticket("02", "design-entryway", status="review", kind="design", deliverable="design/02-e.md"),
            ticket("03", "mica-and-mira", status="ready"),
        ]
        out = self.assertPasses(graph)
        self.assertIn("awaiting review: 01, 02", out)

    def test_no_review_ticket_prints_no_review_line(self):
        out = self.assertPasses([ticket("01", "a-ticket")])
        self.assertNotIn("awaiting review", out)

    def test_an_effort_left_only_with_review_tickets_is_not_runnable(self):
        graph = [
            ticket("01", "design-entryway", status="review", kind="design", deliverable="design/01-e.md"),
            ticket("02", "build-entryway", status="ready", blocked_by="01"),
        ]
        code, out, _err = self.run_check(graph)
        self.assertEqual(code, 1)
        self.assertIn("awaiting review: 01", out)
        self.assertIn("frontier is empty", out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
