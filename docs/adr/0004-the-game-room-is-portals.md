# The Game Room is Portals, and Scenes are portrait

Each game in the Game Room is a **Portal**: a tall elliptical aperture cut through the back wall
into that game's world, rimmed in a thick turning band of light. It shows the game's Scene, it
wakes when approached, and it expands over the stage with the game's information beside it. The
three Scenes are drawn **5:8 portrait** to fit that aperture, replacing the square ones.

This replaced a built design in which the three game cards *were* three lit bays in an oak wall
unit above the stage. That arrangement worked as a drawing and failed as a room. Measured at
1440 x 900 after it shipped to the integration branch: a card was **896 px** against a **748 px**
stage, so **580 px** of wall unit hung above the stage, the Room stood **1736 px** tall, and the
stage's top edge sat at **y 1052** of a 900 px viewport. The first screenful of the Game Room was a
wall of documents; the cats roaming on the floor below were never on screen, because the painter
correctly stops animating an offscreen stage. The owner saw it on 2026-09-20 and rejected it.

The alternatives considered and rejected:

- **Trim the cards** — collapse the description, the why-pick, the setup line until a card is
  selected. Measured: best case put the stage's top edge at y 604. It reduces the symptom and keeps
  the cause.
- **Clamp the bays to 400 units** instead of tying them to the stage. Recovers the Scene band
  (286 px back to 336 px) and barely touches the overhang.
- **Put the deck back below the stage at every width**, which is what the page did before this
  effort. Known-good: stage at y 470, Scene band back to its shipped 410 px. It abandons the idea
  that the games live *in* the room.

A Portal is a hole in a wall, and a hole is whatever size you draw it, so the constraint that
forced the overhang — a card is taller than a 16:9 stage — simply stops applying. The stage returns
to exactly 1600 x 900 units at every width.

## Consequences

- **Code is deleted, not added.** `--deck-overhang`, `--deck-height`, the `ResizeObserver` on
  `.games`, the `padding-top` wall on `#games-scene`, the wide/narrow re-parenting between
  `.deck-slot` and `.deck-flow` in `src/dom/game-stage.ts`, `data-lit-bay` and the empty-bay
  lighting all go. The sprite-sheet playback, the particle field, the dialog, the Turnstile load
  and the invite `fetch` in `src/dom/game-room.ts` are kept and re-aimed.
- **A Portal is a button, not a link.** The whole card used to be an `<a>` to Steam. Clicking a
  Portal now expands it; the store link moves into the expanded panel, below the Invitation, which
  becomes the primary action. The Worker contract is untouched.
- **The Scene asset contract changes shape for every Scene, present and future**: 5:8 portrait,
  360 x 576 native frames, 4x3 grid, 12 frames, 4.1 s. This is a **smaller** sheet than the square
  one it replaces (1440 x 1728 against 1920 x 1440), which matters because the apartment preloads
  every declared asset before anything is reachable. No code depends on the frame being square —
  `.scene-sprite` expresses the grid as `background-size: 400% 300%` — so the change is three
  `width`/`height` attributes in `index.html` and this contract.
- **The three existing Scenes are regenerated**, not re-cropped. They are square, drawn in three
  different illustration styles, predate the version 2 Character Sheets, and Operation: Tango's is a
  split-screen with a hard vertical divider that no round aperture survives.
- **The rim and the particles are the most motion-heavy thing in the apartment**, and they run
  constantly rather than only on hover. They are therefore stopped completely by the existing
  `.motion-off` scoping, which the owner confirmed explicitly rather than exempting them. Nothing a
  Portal means is carried by motion alone.
- **Below 1080 px only one Portal is rendered**, with three dots, arrow keys and swipe to change
  which. The usable wall runs stage y 40 to y 540, so 480 units is the tallest a Portal gets and
  5:8 makes that 300 wide — **165 px on a phone at the 880 px stage floor, at every width**. The
  narrow Portal is therefore a chooser, and the expanded overlay is where a Scene is watched. The
  owner chose this over moving the Portals off the wall into a full-width column, with that number
  in front of them.
- **The Game Room's design note is the record** (`.scratch/COOP-001-apartment/design/11-game-room.md`,
  sections 1, 3.4, 3.5, 4.1, 5.4 and 6). Being under `.scratch/`, it is not committed; this ADR is
  the part that survives the effort directory.
