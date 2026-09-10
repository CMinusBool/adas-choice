# The site becomes a built single-page apartment

The page grew from three game cards into four Rooms the visitor walks between, with roaming
Cats, scripted Beats and film playback. A seamless transition between Rooms requires the whole
apartment to live in one document with client-side routing, which no-JS cannot support, and a
world of that size needs a bundler for module resolution, TypeScript and asset optimisation.
We therefore retired three of the project's founding constraints — "no-JS is a supported mode",
"opens from `file://` with no build step", and "no root `package.json`" — in exchange for the
seamlessness and production quality the page is actually for.

## Considered options

- **Keep no-JS and `file://`, accept page reloads between Rooms.** Rejected: a reload between
  Rooms breaks the illusion of one continuous place, which is the entire premise.
- **Keep `file://` by loading classic scripts that assign to `globalThis`.** This works and was
  the plan until the constraint was lifted. Rejected once local convenience stopped mattering:
  it distorts every module in the codebase to preserve a double-click.
- **A framework (React, Svelte).** Rejected: the Rooms are absolutely-positioned sprites driven
  by `requestAnimationFrame`, not a data-bound interface, and a diffing layer fights per-frame
  animation without buying much.
- **A canvas engine (Pixi, Phaser).** Rejected: it would render sprites well and destroy the
  text layer — bilingual copy, Film details, the Invitation dialog, keyboard focus, screen
  reader support and the existing accessibility work.

## Consequences

- Routing is hash-based (`#/cinema`), not `pushState`. GitHub Pages has no rewrite rules, so a
  direct visit to a real path would 404 without a `404.html` redirect hack.
- Viewing the page locally now requires a dev server. This was accepted explicitly.
- `scripts/build.mjs` and its copy allow-list are replaced by the bundler's build; its
  `lang="zh-Hant"` assertion survives as a post-build check.
- `CLAUDE.md` documented all three retired constraints and had to be rewritten in the same
  effort, or it would actively mislead the next reader.
- Surviving constraints: both languages always, motion is opt-outable, relative paths only,
  Scene assets travel as a set, and no framework.
