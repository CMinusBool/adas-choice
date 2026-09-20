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
checkers in `scripts/` (`check-assets`, `check-styles`, and the three under `scripts/art/`). The
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
  Today, in mount order: `loading`, `language`, `motion`, `rooms`, `game-room`,
  `cinema-room`, `activity-room`, `sound`, `arrival`, `actors`, `cats`, `entryway`, `breakables`. The
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

- **Both languages, always.** Copy lives twice: the dictionaries in `src/copy.ts` and the
  Traditional Chinese first-paint markup in `index.html`. Change one, change the other in the same
  commit. Traditional Chinese is the default; English is the toggle. The hook is the pair of
  attributes `src/dom/language.ts` sweeps — `data-i18n` onto `textContent`, `data-i18n-aria` onto
  `aria-label`, `data-i18n-alt` onto `alt` — so a string is bilingual by carrying one of them and a
  key in both dictionaries, and `tsc` fails until the second dictionary has the key. A string with
  no hook is either painter-owned (the painter reads `copy` itself) or a proper noun; there is no
  third case. **Every Room's markup carries its own zh-Hant first paint, not only the Entryway's.**
  The spec asked for the opposite once no-JS was retired; three Room builds followed this file
  instead, and ticket 21 settled it here rather than stripping ~80 text nodes out of the markup —
  the duplication is typed and mechanically swept, and index.html stays readable as the record of
  what the page says. Reversing it is mechanical if that is ever wanted.
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
- **Scene assets travel as a set**: GIF, still poster, and 4x3 sprite sheet are replaced
  together. Frames are **360x576, a 5:8 portrait**, 12 frames, 4.1s loop — so a sheet is
  1440x1728. They were 480x480 square until 2026-09-20, when the Game Room became three
  **Portals** (tall elliptical apertures into each game's world) and a Scene had to fit one:
  see `docs/adr/0004-the-game-room-is-portals.md`. Nothing in code depends on the frame being
  square — `.scene-sprite` writes the grid as `background-size: 400% 300%`, and
  `check-assets.mjs` deliberately skips scene sprites — so the shape lives here and in the
  three `width`/`height` attributes on the `.game-art` images in `index.html`. (A Scene sprite is
  still skipped; it is an Actor's **Beat** that `check-assets.mjs --beat` checks, described under
  "Cycle assets travel as a set too" below.)
  **The contract changed; the assets have not.** The six files in `public/assets/` are still the
  square ones — 480x480 GIFs and posters, 1920x1440 sheets — and will be until the art lane
  delivers (tickets 41 and 34). The markup already declares `width="360" height="576"`, so the
  Portals squeeze a square Scene into a 5:8 ellipse today, and `index.html` says so where the
  Portals are declared. That is expected, and it is the one place a reader should not take this
  file's present tense for what is on disk.
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
  placeholders preload and validate like everyone else's. She roams, meows and can be petted
  like the other two, and the Game Room's snow globe is her Breakable. She
  stands slightly taller than the other two, `data-height="105"` against their `96`, which is her
  Character Sheet's 24 bible units to the shoulder against their 22. **`data-height` is the
  figure's rendered height in stage units, not the sprite's frame box** — the owner ruled that on
  2026-09-20, and the five values in `index.html` became 300 / 273 / 96 / 96 / 105, replacing
  360 / 328 / 132 / 132 / 144, which rendered the Boy taller than a door leaf and the cats at
  about twice their ruled shoulder height. There is one set of them, on the `#cast` parking block,
  because `src/dom/actors.ts` moves one element per Actor between stages rather than giving each
  Room its own. What is in the repository is
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
  **A Beat is checked by the same script under `--beat`**, and a Beat is not a Cycle: it is a
  one-off scripted animation tied to the moment it happens to — searching a bookshelf, knocking a
  Breakable down — so its figure moves inside the frame, which is the whole point of it and which
  no Cycle may do. So `node scripts/check-assets.mjs --beat <sheet> --frames N
  --columns N --frame WxH` runs the seven rules any sprite sheet must pass — the grid, 8-bit RGBA,
  binary alpha, no colour under a transparent pixel, no empty declared frame, no bleed into a
  neighbouring frame, no content in a spare cell — and drops the four that are the Cycle contract
  proper: feet on the bottom edge, centring, height variance and drift. That is a **second, smaller
  contract for a different kind of sheet, not a loosening of the first one**: the default mode is
  byte-for-byte what it was, every Cycle rule above still fails a Cycle, and nothing about a Beat is
  inferred — `--beat` refuses `--actor`, refuses a missing `--frame`, and refuses a bare invocation,
  because `index.html` declares Cycles and no Beat is declared anywhere the script can read. A
  default run that fails only on the four says so and names `--beat`. Ticket 52 added this after
  three art tickets in a row hit the unsatisfiable criterion "every sprite sheet passes
  `check-assets.mjs`" and reported a Beat's grid and alpha by eye instead.
- **Generated art lives in the main checkout, never in a worktree.** Raw generations go to
  `art/generated/<NN>-<slug>/` in the primary checkout — `illustrator` has no worktree and no
  branch, so that is where they land — and the frames actually chosen are committed under
  `public/assets/`, which is the only copy that survives. `/art/` is gitignored on purpose (ADR-less
  policy call from ticket 07: megabytes of rejected generations do not belong in history), so a
  generation that is not selected and dropped is **gone the moment the directory is cleaned**. This
  is not hypothetical: the seven Cinema Room shots generated before the 2026-09-20 spend cap were
  lost exactly this way, along with the ticket 22 walk strips, while `art/characters/v1` and `v2`
  survived because nothing cleaned them. Never point an art ticket's `Deliverable:` at a path inside
  a worktree, and never assume a generation from an earlier run is still on disk — check.
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
  checked by machine** — see "Animation is parked" below. The `motionPhase: 'not verified'` that
  `build-cycle.mjs` writes into `manifest.json` and `metrics.json`, and prints after a PASS, is
  therefore the permanent and correct answer for every sheet rather than a to-do: nothing grades
  it, and the owner's eye on `make-preview.mjs` is what stands in its place.
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
- **The Cast is wherever the visitor is, and it arrives.** The Boy, the Girl and all three cats are
  in whichever Room is open, placed by `HOMES` in `src/world/actors.ts`. A Room is not found already
  settled: it plays an **Arrival** of about three seconds on every entry — the Girl opens the Door
  and holds it, the cats run through first, the Boy comes last, everyone walks to their mark — and
  any click, tap or key press ends it and settles everyone at once. **Not found settled for a
  moment either**: a Room the page opens on has its marks taken down and its floor cleared as the
  Arrival is *made*, not as it starts, so the wait behind the loading screen is a wait on an empty
  Room rather than on a Cast about to blink out (ticket 51). For the same reason input ends only an
  Arrival that is **playing** — the page reports a tap on the loading screen like any other, and
  ending a waiting Arrival there would lift the screen onto a Room whose Door never opened. A stage
  nobody can see and a request for stillness do still call off a waiting one, and both put everybody
  on their mark, because a waiting Arrival has already emptied its Room. With motion off nothing plays
  and the Room is found at rest, which is `createRoomArrival(room, over: true)` and needs no second
  code path. **Three seconds is fixed and the Rooms are not the same size**, so `cycleWithin` in
  `src/world/actors.ts` decides per Actor: a mark a walk reaches inside the script is walked to, and
  one further off than the script is long is hurried to at a run. Move a Room's marks and its Cast
  changes gait rather than the Arrival changing length. The script does not place anybody at its
  end — a last stride finishes under its own steam, which is why the last one lands at 3.28 s in the
  Game Room, 3.44 in the Activity Room and 3.60 in the Cinema Room — but being **cut short** does
  place everybody, on the marks the Arrival took down when the Door opened.
  The Entryway's own 11.9s arrival is a different thing and is unchanged: it is the Cast coming in
  from outside, played once. The Doors are live all the way through it, so a Door taken at five
  seconds finishes it **in the Entryway, before the Cast is gathered into the Room being walked
  into** — finishing it afterwards put all five of them back in the hall they had just left and
  handed the new Room a set of marks nobody was standing on, which is a Room with no Cast in it
  (ticket 51). Because a Door has to open, **a door leaf must be a separate
  transparent asset and every Room backdrop must be drawn with an empty doorway** — a leaf painted
  into the backdrop at a fixed angle cannot be one anybody opens. **That is the contract every art
  ticket is written to, and it is not what is on disk yet**: today the leaves are CSS placeholders
  that swing, and the backdrops are the CSS placeholders tickets 15 to 17 shipped, which still
  carry their doorways painted in. Nothing is wrong with the code — `src/dom/arrival.ts` already
  swings a leaf through `data-door`, so an art drop replaces a surface and keeps the behaviour.
  The rule stands as written for every delivery; the **shipped** state is placeholders, and the
  art lane (tickets 31, 32, 41, 42) is where it stops being one.
- **Every Room has a stage**: a 16:9 logical canvas of 1600 x 900 units, origin top-left, x right,
  y down, held by `<div class="stage" data-stage="<room>">` and scaled to the Room's width in CSS.
  Walkable areas, Props, doors and Actor positions are all written in those units, so the same
  numbers mean the same place at every screen width, and the DOM only ever turns them into
  percentages of the stage. An Actor's position is its feet — the bottom-centre of its sprite —
  and depth is a y-sort. Furnish a Room by placing things on its stage in stage units; never in
  pixels.
- **Furnishing a Room.** A Prop is a box in stage units — `--x/--y/--w/--h`, turned into
  percentages of the stage by `left: calc(var(--x) / 16 * 1%)` and its three siblings — over a CSS
  placeholder surface, so dropping artwork in swaps the surface and keeps the box. Its `--z` is its
  sort key, and it has to be one, because `src/dom/actors.ts` gives every Actor
  `z-index: round(y)` and the two interleave so an Actor can pass behind a shelf; a stage is
  `isolation: isolate` to keep those keys local to their Room. A stage that holds a control — a
  door link, a Music Source button — cannot itself be `aria-hidden` or `pointer-events: none`;
  those move to its decorative children. And the Cast is declared per Room in one table, `HOMES`
  in `src/world/actors.ts`, placed by `gatherInto(slice, room)`: a Room says who is in it rather
  than writing placement code.
  **The four Rooms still name their Props four ways** — `.entryway-stage .at`,
  `#room-games .stage [data-box]`, `.stage-cinema .cinema-prop` and
  `.stage[data-stage="activities"] .prop` — but since ticket 50 the **arithmetic is written
  once**, in a four-part selector list, and each Room's own rule keeps only what it really
  differs on: the Entryway and the Activity Room sort on `--z`, the Cinema Room sorts every Prop
  at a flat 640, the Game Room writes each key inline. A selector list gives each part its own
  specificity, so folding them changed no cascade — checked by comparing the computed
  `position`/`left`/`top`/`width`/`height`/`z-index` of all 480 Prop boxes across four Rooms and
  four widths before and after. Renaming the four hooks to one is a separate, markup-wide job and
  is still not worth doing on its own.
  **What is not shared is `pointer-events`, and it is load bearing.** A stage that holds no
  control keeps the global `pointer-events: none` and lets its handful of real controls take
  theirs back — the Cinema Room and the Entryway. A stage that turns `pointer-events: auto` back
  on for the Room as a whole **must** then put it back to `none` for everything `aria-hidden`,
  or the Cast blocks clicks on whatever it is standing in front of. `#room-games .stage` has had
  that guard since ticket 45; the Activity Room went without one until ticket 50, where the Boy
  was found intercepting every click on the hunt station he stands over. Cats are never
  `aria-hidden` — a cat is a real button with a name — so the guard never costs a petting.
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
