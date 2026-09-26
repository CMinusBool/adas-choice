# Scene and Cycle assets

The sprite-sheet contracts, the art pipeline and the shipped state of the artwork.
Read this in full for any `art` or `asset-code` ticket, and before touching
`public/assets/`, `scripts/art/`, `scripts/check-assets.mjs`, the `data-sheet` /
`data-still` / `data-animated` attributes in `index.html`, or the loading gate.

## The contracts and the pipeline

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
  Since ticket 34 the six files in `public/assets/` are the Portal-shaped ones — 360x576
  posters and GIFs, 1440x1728 sheets — built from ticket 41's generations by
  `scripts/art/build-scene.py`, whose GIF keeps `src/dom/game-room.ts`'s frame timings.
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
  — one neutral standing frame per Actor, cut out of that Actor's Character Sheet by
  `scripts/make-actor-placeholders.mjs` (the identity source is `art/characters/v3/`; the frames
  shipped today were cut from `v2/` before v3 existed) — and **that is the shipped state,
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
  is not hypothetical: the ticket 22 walk strips went exactly this way, while `art/characters/v1`
  and `v2` survived because nothing cleaned them. Never point an art ticket's `Deliverable:` at a
  path inside a worktree, and never assume a generation from an earlier run is still on disk —
  **check, and check the disk rather than the prose.** This paragraph used to say the seven Cinema
  Room shots generated before the 2026-09-20 spend cap were lost too. They were not: all seven are
  in `art/generated/32-cinema-room/`, s01 to s07, and the art run of 2026-09-20 found them there
  and resumed from them. Nothing had cleaned that directory. The risk the paragraph describes is
  real; that particular instance of it was not.
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
