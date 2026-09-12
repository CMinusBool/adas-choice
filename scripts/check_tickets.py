#!/usr/bin/env python3
"""Validate an effort's implementation tickets and print its frontier.

    python scripts/check_tickets.py .scratch/<KEY>-<slug>

The contract enforced here is ~/.claude/docs/issue-tracker.md, section
"Implementation tickets". /implement-parallel runs this before anything else
and stops on a non-zero exit, so every rule below is a rule a run depends on.

Exit 0 with a listing and a frontier line; exit 1 on any violation, and also
when the frontier is empty (nothing runnable, or every ticket already done).
The listing carries each ticket's Kind, and an `awaiting review:` line names the
tickets whose deliverable is waiting for the owner.
Standard library only: the repo has no Python toolchain. Its tests are
scripts/check_tickets_test.py (stdlib unittest).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

TICKET_NAME = re.compile(r"^(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$")
TITLE = re.compile(r"^# (\d{2}): \S.*$")
HEADER = re.compile(r"^([A-Z][A-Za-z ]*): *(.*)$")
BLOCKED_NONE = "None (can start immediately)"

HEADER_ORDER = ["Type", "Status", "Labels", "Blocked by", "Profile", "Kind", "Deliverable"]
REQUIRED_HEADERS = ["Type", "Status", "Labels", "Blocked by"]
SPEC_HEADERS = ["Type", "Status", "Labels"]

TYPES = {"task"}
STATUSES = ["ready", "in-progress", "review", "done"]
LABELS = {
    "needs-triage",
    "needs-info",
    "ready-for-agent",
    "ready-for-human",
    "wontfix",
}
PROFILES = {"mechanical", "standard", "deep", "novel"}

# What a ticket delivers, which is what decides how it is routed and how its
# completion is judged. A missing `Kind:` line reads as `code`, so every ticket
# written before the line existed stays valid.
KINDS = ["code", "design", "research", "content", "art", "asset-code"]
DEFAULT_KIND = "code"
# Kinds whose deliverable is a matter of taste, so they wait for the owner.
REVIEW_KINDS = {"design", "content", "art"}
# Kinds that carry no `Deliverable:` line: their deliverable is the diff.
BRANCH_KINDS = {"code"}
# Kinds whose `Deliverable:` is relative to the repo root, not the effort directory.
REPO_ROOT_KINDS = {"asset-code"}


class Ticket:
    def __init__(self, number: str, path: Path) -> None:
        self.number = number
        self.path = path
        self.headers: dict[str, str] = {}
        self.blocked_by: list[str] = []

    @property
    def status(self) -> str:
        return self.headers.get("Status", "")

    @property
    def labels(self) -> list[str]:
        raw = self.headers.get("Labels", "")
        return [label.strip() for label in raw.split(",") if label.strip()]

    @property
    def profile(self) -> str:
        return self.headers.get("Profile", "")

    @property
    def kind(self) -> str:
        """A missing line reads as `code`; an invalid one is reported, not defaulted."""
        return self.headers.get("Kind", DEFAULT_KIND)

    @property
    def deliverable(self) -> str:
        return self.headers.get("Deliverable", "")


def check_deliverable_path(value: str, kind: str, where: str, errors: list[str]) -> None:
    """One relative path, no escaping the root it is measured from.

    `asset-code` measures from the repo root; every other kind measures from the
    effort directory. Checked lexically, because the path may name something a
    ticket has not produced yet.
    """
    root = "the repo root" if kind in REPO_ROOT_KINDS else "the effort directory"
    if not value:
        errors.append(f"{where}: `Deliverable:` needs a path")
        return
    if "," in value or value.split() != [value]:
        errors.append(f"{where}: `Deliverable:` takes exactly one path, got {value!r}")
        return
    normalised = value.replace("\\", "/")
    if normalised.startswith(("/", "~")) or re.match(r"^[A-Za-z]:", normalised):
        errors.append(
            f"{where}: `Deliverable: {value}` must be relative to {root}, not an absolute path"
        )
        return
    if ".." in normalised.split("/"):
        errors.append(
            f"{where}: `Deliverable: {value}` must stay inside {root}; it contains `..`"
        )


def parse_headers(lines: list[str], where: str, errors: list[str]) -> dict[str, str]:
    """Read the contiguous header block that starts at line 3 (index 2)."""
    if len(lines) < 3 or lines[1].strip():
        errors.append(f"{where}: line 2 must be blank, between the title and the headers")
        return {}

    headers: dict[str, str] = {}
    seen: list[str] = []
    for offset, line in enumerate(lines[2:]):
        if not line.strip():
            break
        if line.lstrip().startswith(("-", "*", ">", "#")) or "**" in line:
            errors.append(
                f"{where}:{offset + 3}: header lines are plain text, no bullets and no bold: {line.strip()!r}"
            )
            break
        match = HEADER.match(line)
        if not match:
            errors.append(f"{where}:{offset + 3}: expected a `Name: value` header line, got {line.strip()!r}")
            break
        name, value = match.group(1), match.group(2).strip()
        if name in headers:
            errors.append(f"{where}:{offset + 3}: duplicate `{name}:` line")
            break
        headers[name] = value
        seen.append(name)

    unknown = [name for name in seen if name not in HEADER_ORDER]
    if unknown:
        errors.append(f"{where}: unknown header line(s): {', '.join(unknown)}")
    known = [name for name in seen if name in HEADER_ORDER]
    if known != sorted(known, key=HEADER_ORDER.index):
        errors.append(
            f"{where}: header lines must be in the order {', '.join(HEADER_ORDER)}; found {', '.join(known)}"
        )
    return headers


def check_ticket(path: Path, errors: list[str]) -> Ticket | None:
    name_match = TICKET_NAME.match(path.name)
    if not name_match:
        errors.append(f"{path.name}: filename must be `NN-<lower-kebab-slug>.md`, NN two digits")
        return None
    number = name_match.group(1)
    if number == "00":
        errors.append(f"{path.name}: tickets are numbered from 01")
        return None

    where = path.name
    lines = path.read_text(encoding="utf-8").splitlines()
    ticket = Ticket(number, path)

    if not lines:
        errors.append(f"{where}: file is empty")
        return ticket

    title = TITLE.match(lines[0])
    if not title:
        errors.append(f"{where}:1: line 1 must be `# <NN>: <Ticket title>`, got {lines[0].strip()!r}")
    elif title.group(1) != number:
        errors.append(f"{where}:1: title number {title.group(1)} does not match the filename number {number}")

    ticket.headers = parse_headers(lines, where, errors)

    for required in REQUIRED_HEADERS:
        if required not in ticket.headers:
            errors.append(f"{where}: missing required `{required}:` line")

    type_ = ticket.headers.get("Type")
    if type_ is not None and type_ not in TYPES:
        errors.append(f"{where}: `Type: {type_}` is not one of {', '.join(sorted(TYPES))}")

    kind = ticket.headers.get("Kind")
    kind_ok = kind is None or kind in KINDS
    if not kind_ok:
        errors.append(f"{where}: `Kind: {kind}` is not one of {', '.join(KINDS)}")
    effective_kind = ticket.kind if kind_ok else DEFAULT_KIND

    status = ticket.headers.get("Status")
    if status is not None and status not in STATUSES:
        errors.append(f"{where}: `Status: {status}` is not one of {', '.join(STATUSES)}")
    elif status == "review" and kind_ok and effective_kind not in REVIEW_KINDS:
        errors.append(
            f"{where}: `Status: review` is only for {', '.join(sorted(REVIEW_KINDS))} tickets; "
            f"a `{effective_kind}` ticket goes from in-progress straight to done"
        )

    if kind_ok:
        if effective_kind in BRANCH_KINDS:
            if "Deliverable" in ticket.headers:
                errors.append(
                    f"{where}: a `{effective_kind}` ticket carries no `Deliverable:` line; "
                    "its deliverable is the diff"
                )
        elif "Deliverable" not in ticket.headers:
            errors.append(f"{where}: `Kind: {effective_kind}` needs a `Deliverable:` line")
        else:
            check_deliverable_path(ticket.deliverable, effective_kind, where, errors)

    if "Labels" in ticket.headers:
        labels = ticket.labels
        if not labels:
            errors.append(f"{where}: `Labels:` needs at least one label")
        for label in labels:
            if label not in LABELS:
                errors.append(f"{where}: unknown label {label!r}; allowed: {', '.join(sorted(LABELS))}")

    profile = ticket.headers.get("Profile")
    if profile is not None and profile not in PROFILES:
        errors.append(f"{where}: `Profile: {profile}` is not one of {', '.join(sorted(PROFILES))}")

    blocked = ticket.headers.get("Blocked by")
    if blocked is not None and blocked != BLOCKED_NONE:
        for part in (piece.strip() for piece in blocked.split(",")):
            if not re.fullmatch(r"\d{2}", part):
                errors.append(
                    f"{where}: `Blocked by:` takes {BLOCKED_NONE!r} or two-digit ticket numbers, got {part!r}"
                )
            elif part == number:
                errors.append(f"{where}: a ticket cannot block itself")
            else:
                ticket.blocked_by.append(part)

    body = "\n".join(lines)
    for heading in ("## What to build", "## Acceptance criteria"):
        if not re.search(rf"^{re.escape(heading)}\s*$", body, re.MULTILINE):
            errors.append(f"{where}: missing a `{heading}` section")
    criteria = body.split("## Acceptance criteria", 1)
    if len(criteria) == 2 and not re.search(r"^- \[[ xX]\] ", criteria[1], re.MULTILINE):
        errors.append(f"{where}: `## Acceptance criteria` needs at least one `- [ ]` checkbox")

    return ticket


def check_spec(spec: Path, errors: list[str]) -> None:
    if not spec.is_file():
        errors.append("spec.md: missing")
        return
    lines = spec.read_text(encoding="utf-8").splitlines()
    headers = parse_headers(lines, "spec.md", errors)
    for required in SPEC_HEADERS:
        if required not in headers:
            errors.append(f"spec.md: missing required `{required}:` line")
    for extra in ("Blocked by", "Profile", "Kind", "Deliverable"):
        if extra in headers:
            errors.append(f"spec.md: opens with {', '.join(SPEC_HEADERS)} only; drop the `{extra}:` line")
    status = headers.get("Status")
    if status is not None and status not in STATUSES:
        errors.append(f"spec.md: `Status: {status}` is not one of {', '.join(STATUSES)}")


def check_edges(tickets: dict[str, Ticket], errors: list[str]) -> None:
    for ticket in tickets.values():
        for blocker in ticket.blocked_by:
            if blocker not in tickets:
                errors.append(f"{ticket.path.name}: `Blocked by: {blocker}` names a ticket that does not exist")

    # Cycles: iterative DFS with a colour map, so the report names the loop.
    WHITE, GREY, BLACK = 0, 1, 2
    colour = {number: WHITE for number in tickets}
    reported: set[frozenset[str]] = set()

    for start in sorted(tickets):
        if colour[start] != WHITE:
            continue
        stack: list[tuple[str, list[str]]] = [(start, [start])]
        colour[start] = GREY
        while stack:
            number, path = stack[-1]
            nxt = None
            for blocker in tickets[number].blocked_by:
                if blocker not in tickets:
                    continue
                if colour[blocker] == GREY:
                    loop = path[path.index(blocker):] + [blocker]
                    key = frozenset(loop)
                    if key not in reported:
                        reported.add(key)
                        errors.append("blocking cycle: " + " -> ".join(loop))
                elif colour[blocker] == WHITE:
                    nxt = blocker
                    break
            if nxt is None:
                colour[number] = BLACK
                stack.pop()
            else:
                colour[nxt] = GREY
                stack.append((nxt, path + [nxt]))


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return 2

    spec_dir = Path(argv[1])
    if not spec_dir.is_dir():
        print(f"{spec_dir}: not a directory", file=sys.stderr)
        return 1

    issues_dir = spec_dir / "issues"
    if not issues_dir.is_dir():
        print(f"{issues_dir}: no issues directory", file=sys.stderr)
        return 1

    errors: list[str] = []
    check_spec(spec_dir / "spec.md", errors)

    tickets: dict[str, Ticket] = {}
    files = sorted(path for path in issues_dir.iterdir() if path.is_file() and path.suffix == ".md")
    if not files:
        print(f"{issues_dir}: no ticket files", file=sys.stderr)
        return 1

    for path in files:
        ticket = check_ticket(path, errors)
        if ticket is None:
            continue
        if ticket.number in tickets:
            errors.append(
                f"{path.name}: ticket number {ticket.number} is already used by {tickets[ticket.number].path.name}"
            )
            continue
        tickets[ticket.number] = ticket

    check_edges(tickets, errors)

    if errors:
        print(f"{spec_dir}: {len(errors)} problem(s)", file=sys.stderr)
        for error in errors:
            print(f"  {error}", file=sys.stderr)
        return 1

    print(f"{spec_dir}  ({len(tickets)} tickets)")
    width = max(len(ticket.path.stem) for ticket in tickets.values())
    for number in sorted(tickets):
        ticket = tickets[number]
        blockers = ", ".join(ticket.blocked_by) if ticket.blocked_by else "-"
        print(
            f"  {ticket.path.stem:<{width}}  {ticket.status:<11}  "
            f"{ticket.profile or 'standard':<10}  {ticket.kind:<10}  "
            f"{','.join(ticket.labels):<15}  blocked by {blockers}"
        )

    frontier = [
        number
        for number, ticket in sorted(tickets.items())
        if ticket.status == "ready"
        and "ready-for-agent" in ticket.labels
        and all(tickets[blocker].status == "done" for blocker in ticket.blocked_by)
    ]
    awaiting = [number for number, ticket in sorted(tickets.items()) if ticket.status == "review"]

    if awaiting:
        print("awaiting review: " + ", ".join(awaiting))

    if frontier:
        print("frontier: " + ", ".join(frontier))
        return 0

    if all(ticket.status == "done" for ticket in tickets.values()):
        print("every ticket is done")
    print("frontier is empty")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
