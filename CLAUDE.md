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

`npm test` is Vitest over `src/**/*.test.ts`. `npm run build` is the acceptance run: it runs
`npm run typecheck`, bundles into `dist/`, then `scripts/assert-built-page.mjs` fails unless the
built page still carries the Traditional Chinese default (`lang="zh-Hant"`), ships `.nojekyll`, and
resolves every local URL it references. `npm run typecheck` alone is the fast inner-loop check; it
is two passes — the whole project, then `src/world/` again under `tsconfig.world.json`.

## Layout

- `index.html` — the first-paint markup. Its `/src/main.ts` script tag is the only URL on the
  page the bundler rewrites; every other URL there is passed through untouched.
- `src/main.ts` — the DOM layer's composition root: it builds the world once, mounts the painters
  in `src/dom/` and re-runs them on every change. Deliberately untested.
- `src/dom/` — one painter per slice of the world (`language`, `motion`, `rooms`, `game-room`,
  `loading`), each a `Mount` that wires its listeners once and returns a `Painter`. A new slice is a new file
  plus one entry in `src/main.ts`'s `mounts` list, not a branch inside an existing painter.
  `src/dom/painter.ts` holds that contract and `byId`.
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

- **Both languages, always.** Copy lives twice: the dictionaries in `src/copy.ts` and the
  Traditional Chinese first-paint markup in `index.html`. Change one, change the other in the same
  commit. Traditional Chinese is the default; English is the toggle.
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
- **Scene assets travel as a set**: GIF, still poster, and 4x3 sprite sheet (480x480 frames,
  12 frames, 4.1s loop) are replaced together.
- **Cycle assets travel as a set too**, and to their own contract. An Actor's Cycles live at
  `public/assets/actors/<actor>-<cycle>-<facing>.png` — `walk` and `run`, `left` and `right` — and
  are replaced together. Frames are laid left to right then top to bottom in a 4-column grid, 8
  frames to a Cycle, each frame 192x320 for the Boy and the Girl and 256x192 for the cats. In every
  frame the Actor stands with its feet on the frame's bottom edge and centred across it: that point
  is the Actor's position in the world, which is why nothing may be padded or cropped after the
  fact. Backgrounds are transparent with no baked shadow, and **no frame moves the Actor** — the
  world model does the travelling, so a Cycle that walks across its own box would move it twice.
  Playback is a fixed rate: walk 10 fps, run 14 fps; `idle` is the walk sheet held on its first
  frame, so there is no idle asset. A per-facing sheet always wins; where only `right` exists the
  painter mirrors it with `scaleX(-1)`, which is a fallback and is **wrong for Míca**, whose nose
  mark must not change sides — she ships both facings, and so do Mira and Luna. Every sheet is
  declared as a `data-sheet` on a `.cycle` layer inside `#apartment`, which is how the preload list
  and `scripts/assert-built-page.mjs` find it; a URL built in TypeScript is invisible to both.
  **That declaration is also what makes an Actor real**: `check-assets.mjs` reads its list off
  `index.html`, so a sheet sitting in `public/assets/actors/` with no layer naming it is neither
  preloaded nor checked. **Luna, the third cat, was in exactly that state until 2026-09-20** and is
  not any more: she has her `.cycle` layers, her `ActorId` and her row in `ACTOR_SHAPES`, so her
  placeholders preload and validate like everyone else's. What she still lacks is behaviour — the
  roaming, the meow and the petting Beat are ticket 08's, and her Breakable is the Game Room's. She
  stands slightly taller than the other two, `data-height="144"` against their `132`, which is her
  Character Sheet's 24 bible units to the shoulder against their 22. What is in the repository is
  **placeholders**
  — one neutral standing frame per Actor, cut out of that Actor's Character Sheet in
  `art/characters/v2/` by `scripts/make-actor-placeholders.mjs` — and **that is the shipped state,
  on purpose**: see "Animation is parked" below. A one-frame sheet is a valid Cycle under every rule
  above, and the Actor still travels, because the world model does the travelling. See
  `public/assets/actors/manifest.json`, and `docs/actor-cycles-shot-list.md` for the generations
  that would replace them if the work ever resumes. Every rule in this paragraph is checked
  mechanically by `node scripts/check-assets.mjs` — size, grid, binary alpha, feet on the bottom
  edge, centring, no bleed into a neighbouring frame, no height pop and no translation across the
  Cycle — which `npm run build` runs as a report and which any delivered sheet must still pass.
  **Those rules are not relaxed.** They are geometry, they cost nothing to run, and they have
  never been what a generation failed on.
- **A Cycle sheet is built by code, never by hand.** A generation comes back as a strip on a
  chroma ground at whatever size the model felt like, and `node scripts/art/build-cycle.mjs
  <strip.png> --out public/assets/actors/<actor>-<cycle>-<facing>.png` turns it into a sheet: mask
  the ground out, take a bounding box per cell, scale the whole Cycle by **one shared factor**
  taken from its tallest frame — scaling per frame is what makes a figure grow and shrink as it
  walks — seat each figure on its frame's bottom edge, centre it, lay the frames out 4 across, and
  run the validator over the result. It writes a `metrics.json` beside the sheet (send that to the
  effort directory with `--metrics`, not into `public/`), appends the sheet's provenance to
  `manifest.json`, and prints the `index.html` attribute changes the delivery needs, which
  `--apply` makes. Nothing invents pixels and nothing is padded or cropped afterwards: a strip
  that cannot be made to pass the validator is a wrong generation, and its art ticket is reopened
  rather than the tolerance loosened. `--mirror` bakes the other facing and is refused for the
  cats. `node scripts/art/make-preview.mjs --sheet <sheet.png>` writes a self-contained page that
  plays a candidate back at the contract's rate for the owner's eye. **Motion phase is no longer
  checked by machine**, and no sheet carries a "motion phase not verified" status — see
  "Animation is parked" below.
- **Animation is parked, and placeholders are the answer.** Seven generations of one walk Cycle,
  across every prompt technique that was tried — plain brief, explicit leg order, phase wording,
  per-limb shading, a stick-figure pose reference — failed to produce a walk whose leading leg
  alternates across the cycle. The owner ruled on 2026-09-18 that the cost is not worth the
  result and that placeholder Cycles ship. Concretely: the twelve-shot Cycle programme is
  `wontfix` (COOP-001 tickets 23–30); `scripts/art/` and `scripts/check-assets.mjs` stay in the
  repository and keep working; and **no motion check runs in the pipeline** —
  `/implement-parallel` no longer spawns `motion-reviewer`, because its answers were measured
  wrong often enough to be worth nothing at the price of an `opus` vision run per Cycle. The
  mechanical geometry validator above is untouched. If a real Cycle is ever delivered, it goes
  through `build-cycle.mjs`, passes `check-assets.mjs`, and the owner watches `make-preview.mjs`
  — one pair of eyes, no grader.
- **Every Room has a stage**: a 16:9 logical canvas of 1600 x 900 units, origin top-left, x right,
  y down, held by `<div class="stage" data-stage="<room>">` and scaled to the Room's width in CSS.
  Walkable areas, Props, doors and Actor positions are all written in those units, so the same
  numbers mean the same place at every screen width, and the DOM only ever turns them into
  percentages of the stage. An Actor's position is its feet — the bottom-centre of its sprite —
  and depth is a y-sort. Furnish a Room by placing things on its stage in stage units; never in
  pixels.
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

## Environment

- Windows workstation; the shell is Git Bash (POSIX), Python is `python` (3.14), not `python3` —
  `python3` on PATH is a Microsoft Store stub that exits 49.
- Playwright 1.62 and a matching Chromium are already on the machine, in the npx cache and under
  `%LOCALAPPDATA%\ms-playwright`. They are deliberately **not** in `package.json`:
  `scripts/verify/room-shots.mjs` imports the package by `file:///` path, so `npm ci` gains no step.
  That script is how a Room is really looked at — per-route screenshots at two widths, the
  `requestAnimationFrame` motion check and `prefers-reduced-motion` emulation, neither of which the
  desktop app's embedded browser pane can do. Windows reserves the port range `.claude/launch.json`
  puts `preview` on (4173), so the script probes upward for one that binds.
- **Stop every dev and preview server before `npm ci`.** A running `vite preview` or `vite` holds
  files under `node_modules`, and `npm ci` deletes that directory first, so it fails with `EPERM`
  and leaves the tree half-installed. This is why a merger runs `npm ci` **only when the merge
  actually changed `package.json` or `package-lock.json`** — on every other merge the installed
  tree is already right and the reinstall is pure risk.
- **esbuild leaves a service process behind**, one per Vite run, and it holds
  `node_modules/@esbuild/...` open in whatever checkout started it — usually a worktree, where it
  then blocks removal. Find it and end it before cleaning up:

  ```bash
  powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='esbuild.exe'\" | Select-Object ProcessId, ExecutablePath"
  powershell -NoProfile -Command "Stop-Process -Id <pid> -Force"
  ```

  (`node.exe` with `--service=` in its command line is the same thing under another name.)
- **Removing a worktree on Windows.** `git worktree remove` refuses one holding modified or
  untracked files; where those are a stray copy of something already committed, `git clean -f
  <path>` or `git restore .` inside it makes the remove work without `--force`, which is worth the
  extra step because `--force` throws away whatever was there unseen. A directory some process
  still has open cannot be deleted at all, even once git has emptied it: `git worktree prune` drops
  the administrative entry and the empty directory stays behind, which is a finished cleanup and
  not a failed one.
- **Codex runs its own shell steps through PowerShell 7, not Git Bash.** A `codex exec` turn that
  shells out is writing PowerShell, so POSIX quoting and `/c/...` paths do not survive the trip;
  hand it Windows paths. Node also refuses to spawn the `.cmd` shims npm installs (`EINVAL`, the
  CVE-2024-27980 mitigation), so `scripts/art/codex-imagegen.mjs` and
  `scripts/verify/room-shots.mjs` both walk a shim back to the package's own `.js` entry point and
  spawn that with their own Node.
- `worker/` dependencies are already installed; `node --test worker/test/*.test.mjs` runs from the
  repo root without an install step. The Worker is not an npm workspace of the root package, so a
  root `npm ci` neither installs nor touches it.
- `npm` skips `postinstall` under its `allow-scripts` gate, so a root `npm install` reports
  esbuild's script as not approved. That is harmless: esbuild's binary arrives through its
  platform-specific optional dependency, and `npm run build` works without it.
- The `mattpocock-skills` plugin is installed (user scope, v1.2.3, commit `3cca18b`), unpacked
  under `~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/`, so
  `/grill-with-docs`, `/to-spec` and `/to-tickets` are available. `enabledPlugins` in
  `~/.claude/settings.json` is not proof of an install; read `installed_plugins.json`.
- The `claude` CLI is a global npm install at `~/AppData/Roaming/npm` (already on PATH). `npm`
  skips the package's `postinstall` under its `allow-scripts` gate; that is harmless as long as
  `claude --version` answers. If it ever stops launching, reinstall with
  `--allow-scripts=@anthropic-ai/claude-code`.
