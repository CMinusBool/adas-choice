# Ada's choice — co-op game page

A bundled TypeScript single-page site published to GitHub Pages from `main` by
`.github/workflows/pages.yml`. Vite builds `index.html` + `styles.css` + `src/` + `public/` into
`dist/`; nothing is served from the repository root. There is no framework, and there will not be
one. A fresh clone needs `npm ci` at the root before anything works, and the page needs a dev
server — it no longer opens from `file://`, and no-JS is no longer a supported mode. Both of those,
and the arrival of a root `package.json`, are retired constraints: see
`docs/adr/0001-built-single-page-apartment.md` for why. `CONTEXT.md` holds the domain vocabulary.

`worker/` is a separate Cloudflare Worker (its own `package.json`, Node >= 22) behind the
invitation button. Secrets live only in Worker secrets; `public/site-config.js` holds public
values. See `SECURITY.md`.

## Health commands

The test and build list, in this order. `/implement-parallel` hands exactly these to every
implementer and merger, and CI (`pages.yml`) runs the same three after `npm ci`:

```bash
npm test
node --test worker/test/*.test.mjs
npm run build
```

`npm test` is `npm run typecheck`, then Vitest over `src/**/*.test.ts`, then `node --test` over the
checkers' tests in `scripts/` — six at its top (`check-assets`, `check-styles`, `check-stages`,
`check-cinema-stage`, `check-game-room-stage`, `check-entryway-handoffs`) and nine under
`scripts/art/`, the list in `package.json`'s `test` script. The
typecheck runs first on purpose: a duplicate copy key (TS1117) and two `switch` cases sharing a `}`
both landed during COOP-001 and were found by a later merge, because the fast loop was not
typechecking. `npm run typecheck` alone is still the fastest inner-loop check; it is two passes —
the whole project, then `src/world/` again under `tsconfig.world.json`.

`npm run build` is the acceptance run: typecheck, bundle into `dist/`, then
`scripts/assert-built-page.mjs` fails unless the built page still carries the Traditional Chinese
default (`lang="zh-Hant"`), ships `.nojekyll`, and resolves every local URL it references, then
`scripts/check-assets.mjs --non-fatal` reports on the Cycle sheets.

## Layout

- `index.html` — the first-paint markup. Its `/src/main.ts` script tag and its
  `<link rel="stylesheet" href="styles.css">` are the only two URLs on the page the bundler
  rewrites — both come back out of `dist/` hashed, under `assets/`. Every other URL there,
  `site-config.js` and `assets/favicon.svg` included, is passed through untouched.
- `src/main.ts` — the DOM layer's composition root: it builds the world once, mounts the painters
  in `src/dom/` and re-runs them on every change. Deliberately untested.
- `src/dom/` — one painter per slice of the world, each a `Mount` that wires its listeners once and
  returns a `Painter`. A new slice is a new file plus one entry in `src/main.ts`'s `mounts` list,
  not a branch inside an existing painter. `src/dom/painter.ts` holds that contract and `byId`.
  Today, in mount order: `loading`, `language`, `motion`, `rooms`, `invitation`, `game-room`,
  `cinema-room`, `activity-room`, `sound`, `arrival`, `actors`, `seats`, `cats`, `entryway`, `breakables`. The
  order is load bearing at both ends — `loading` first so the shell leaves `inert` before the router
  moves focus, `actors` after the Rooms so the Cast stands on top of whatever the Room laid down —
  and `arrival` sits after `sound` because the Door's own sounds go out through `playSfx`.
- `src/copy.ts` — both copy dictionaries, typed against each other.
- `src/world/` — the world model: pure TypeScript, no DOM and no browser APIs. This is the one
  seam, and the only thing tested. `src/world/index.ts` is its whole public surface; the DOM layer
  imports from `./world`, never from a file inside it. `tsconfig.world.json` typechecks the
  directory a second time with `lib: ["ES2022"]` and `types: []`, so a `document`, `window`,
  `localStorage`, `matchMedia` or timer reference in the model fails `npm run typecheck` and
  `npm run build`. Time and preferences enter as parameters the DOM layer feeds in.
- `public/` — copied to the output root verbatim, so a file here keeps its URL. `assets/`,
  `.nojekyll` and `site-config.js` live here because the bundler cannot see their URLs: it rewrites
  neither the `data-animated` / `data-still` / `data-sheet` attributes that `src/main.ts` turns
  into `url("…")` at runtime, nor bare relative URLs in `index.html`. A new asset the page
  references that way belongs in `public/`, or it 404s in `dist/`. Vite's "didn't resolve at build
  time, it will remain unchanged to be resolved at runtime" warning is that arrangement working.
- `site-config.js` stays a hand-edited classic script setting `window.ADA_CONFIG`, unbundled and
  deferred ahead of the module entry. `worker/README.md` step 6 tells the owner to edit it.

## Conventions

The rules below are the contract; the docs they point to hold the detail and the
history. Read a doc when its trigger applies to your ticket, in full, before editing.

- **Both languages, always.** Copy lives twice: the dictionaries in `src/copy.ts` and the
  Traditional Chinese first-paint markup in `index.html`. Change one, change the other in the same
  commit. Traditional Chinese is the default; English is the toggle. The hook is the pair of
  attributes `src/dom/language.ts` sweeps — `data-i18n` onto `textContent`, `data-i18n-aria` onto
  `aria-label`, `data-i18n-alt` onto `alt` — so a string is bilingual by carrying one of them and a
  key in both dictionaries, and `tsc` fails until the second dictionary has the key. A string with
  no hook is either painter-owned (the painter reads `copy` itself) or a proper noun; there is no
  third case. **Every Room's markup carries its own zh-Hant first paint, not only the Entryway's.**
  Why every Room repeats the zh-Hant first paint, and what ticket 21 settled:
  `docs/agents/decisions-log.md`.
- **Routing is the browser's.** Four Rooms at `#/entryway`, `#/games`, `#/cinema`, `#/activities`;
  a Room id is its route's path word. Doors are ordinary `<a href="#/cinema">` links, so the back
  button works without a history stack. Never `pushState` (ADR 0001). An unreadable hash is
  rewritten with `location.replace`, so junk never lands in history.
- **Motion is opt-outable.** Respect `prefers-reduced-motion`; keep explicit playback available;
  stop animating offscreen scenes and background tabs. The model decides (`motionIsOn`,
  `motionIsOnByChoice`) and `src/dom/motion.ts` paints the answer onto `<html>`: `motion-off`
  while motion is off, however it was turned off, and `motion-on` only when the visitor turned it
  on themselves. The `prefers-reduced-motion` block in `styles.css` is scoped to
  `:root:not(.motion-on)` so that choice reaches CSS animations and transitions too; a new
  animation or transition needs no opt-out of its own.
- **The apartment waits for its artwork.** Nothing is reachable until every declared asset has
  loaded behind the loading screen. The list is read off the built page — the `data-still`,
  `data-animated` and `data-sheet` attributes and the `<img src>`s inside `#apartment` — so
  furnishing a Room preloads it, with no second list to maintain. An asset the markup cannot
  name (audio) goes in `ASSETS_OUTSIDE_MARKUP` in `src/dom/loading.ts`.
- **Scene and Cycle sprite sheets have a fixed contract** (frame sizes, grid, feet on the bottom
  edge, no motion inside a Cycle frame, replaced as a set, built only by
  `scripts/art/build-cycle.mjs`, checked by `scripts/check-assets.mjs`). Before touching
  `public/assets/`, `scripts/art/`, `check-assets.mjs` or any `data-sheet` / `data-still` /
  `data-animated` attribute, read `docs/agents/scene-and-cycle-assets.md` in full.
- **An Actor exists only where `index.html` declares its `.cycle` layers**, and each ships one
  standing frame per facing; the world model does the travelling. Generated art lives in the main
  checkout under the effort directory. Read `docs/agents/scene-and-cycle-assets.md` in full before
  any `art` or `asset-code` ticket.
- **The Cast follows the visitor, and every Room plays a ~3s Arrival** any input ends; a Door
  needs a separate transparent leaf over a backdrop drawn with an empty doorway. Before editing
  `src/world/actors.ts`, `src/world/arrival.ts`, `src/dom/arrival.ts` or `src/dom/actors.ts`,
  read `docs/agents/cast-and-stages.md` in full.
- **Every Room has its own stage**: a 16:9 canvas whose size is its entry in `STAGES`
  (`src/world/stage.ts`), origin top-left; place Props, doors and Actors in that Room's stage units,
  never pixels. The Boy is 300 units tall and **every door in the apartment is 142 x 350 units**,
  box and painted doorway; a drop checks the doors to ±3% and records every other scale factor in
  the Room's manifest. An art drop swaps a Prop's surface through its `data-still`, never a `url()`
  in `styles.css`. Before touching stage markup, Prop CSS, `HOMES` or `src/dom/artwork.ts`, read
  `docs/agents/cast-and-stages.md` in full.
- **Relative paths only** — the site has to work from a repository subpath, which is why Vite's
  `base` is `'./'`. Never introduce a root-absolute URL that survives the build.
- **No framework.** Rooms are absolutely-positioned DOM sprites driven by `requestAnimationFrame`.
- Never commit anything from `node_modules/`, `worker/node_modules/`, `dist/`, or `.scratch/`.

## Agent skills

### Issue tracker

Efforts, specs and implementation tickets are **local markdown under `.scratch/`** (gitignored,
never committed), with no upstream tracker above them. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Effort conventions

- Before running **`/mattpocock-skills:grill-with-docs`** here, read
  `~/.claude/docs/grill-checklists/creative-web.md`: the groups a creative web effort's grill must
  have covered (space, asset contract, asset pipeline, review gates, where things live, copy, sound
  and motion, ship), each with the COOP-001 miss it comes from, plus the rule that an uncovered
  group is written into the spec verbatim rather than answered.
- Before running **`/mattpocock-skills:to-spec`** here, read `~/.claude/docs/spec-addendum.md`: the
  sections that plugin's template lacks — "Production design", "Asset pipeline" and "Review gates"
  after Implementation Decisions, then "Not yet decided" and the run-filled "Decisions during the
  build" at the end — and where each goes. The skill itself is not forked.
- Write the tickets with **`/to-tickets`** (the personal skill), never with
  `/mattpocock-skills:to-tickets` bare: the plugin's template writes bold inline fields that
  `scripts/check_tickets.py` rejects, and it knows nothing about `Kind:`, `Profile:` or
  `Deliverable:`. The personal skill calls the plugin one for the slicing and owns the file format.
- One effort per directory: `.scratch/<KEY>-<slug>/`, where `<KEY>` is a local key of the form
  `COOP-001`. The integration branch carries the same key (`COOP-001-apartment`) — that is how
  `/implement-parallel` resolves `.scratch/<KEY>-*/`.
- Spec: `.scratch/<KEY>-<slug>/spec.md`. Tickets: `.scratch/<KEY>-<slug>/issues/<NN>-<slug>.md`,
  one file per ticket, numbered from `01`. Scout notes go in `notes/`, research in `research/`.
- The ticket contract — header lines, allowed values, status lifecycle, frontier — is
  `~/.claude/docs/issue-tracker.md`, section "Implementation tickets".
- Validate before any run, and never start a run on a non-zero exit:

  ```bash
  python scripts/check_tickets.py .scratch/<KEY>-<slug>
  ```

When a skill says "publish to the issue tracker", write a file under `.scratch/<KEY>-<slug>/`.
When it says "fetch the ticket", read the file. Do not look for an upstream tracker: there is none,
and the skills that read one do not apply here.

### Closing mode

An effort whose directory holds `CLOSING.md` is closing. That file names the tickets that may still
run, who accepts each kind of deliverable, and what goes to `docs/known_issues.md` instead of a
ticket; it overrides `/implement-parallel` steps 4 to 8 and the agents' Report sections where it says
so, for that effort only. Small errors the branch ships with are one bullet each in
`docs/known_issues.md`, committed.

## Environment

- Windows workstation; the shell is Git Bash (POSIX), Python is `python` (3.14), not `python3` —
  `python3` on PATH is a Microsoft Store stub that exits 49.
- Playwright 1.62 and a matching Chromium are already on the machine and deliberately **not**
  in `package.json`; `scripts/verify/room-shots.mjs` is how a Room is really looked at —
  per-route screenshots at two widths, the motion check and `prefers-reduced-motion`
  emulation. Details and the port caveat: `docs/agents/windows-environment.md`.
- **Stop every dev and preview server before `npm ci`.** A running `vite preview` or `vite` holds
  files under `node_modules`, and `npm ci` deletes that directory first, so it fails with `EPERM`
  and leaves the tree half-installed. This is why a merger runs `npm ci` **only when the merge
  actually changed `package.json` or `package-lock.json`** — on every other merge the installed
  tree is already right and the reinstall is pure risk.
- `worker/` dependencies are already installed; `node --test worker/test/*.test.mjs` runs from the
  repo root without an install step. The Worker is not an npm workspace of the root package, so a
  root `npm ci` neither installs nor touches it.
- **Windows troubleshooting is in `docs/agents/windows-environment.md`** — read it when a
  worktree will not remove, `npm ci` fails, esbuild or node processes linger, Codex shells out
  to PowerShell, or an npm / `claude` / plugin install misbehaves.
