# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the
codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: the domain vocabulary (Room, Stage, Actor, Cycle, Prop,
  Breakable and the rest).
- **`docs/adr/`**: read the ADRs that touch the area you are about to work in.
- **`CLAUDE.md`** at the repo root carries the conventions those terms are built on — the stage
  units, the asset contracts, the health commands.

This repo is **single-context**: one `CONTEXT.md` and one `docs/adr/` at the root, no
`CONTEXT-MAP.md` and no per-context ADR directories.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest
creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and
`/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CLAUDE.md
├── CONTEXT.md
├── docs/
│   ├── adr/
│   │   ├── 0001-built-single-page-apartment.md
│   │   ├── 0002-real-films-original-artwork.md
│   │   └── 0003-github-pages-stays-the-host.md
│   └── agents/
├── src/
└── public/
```

Everything a subagent needs here is committed and present in a worktree, unlike `.scratch/` and
`art/`, which are gitignored and are reached by absolute path into the main checkout.

## Use the glossary's vocabulary

When your output names a domain concept (in a ticket title, a refactor proposal, a hypothesis, a
test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary
explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing
language the project doesn't use (reconsider) or there's a real gap (note it for
`/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (built single-page apartment), but worth reopening because…_
