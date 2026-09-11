# Actor Cycles — the shot list that replaces the placeholders

Ticket 07 built the Actor system and shipped it on **placeholders**: one neutral standing frame per
Actor, cut mechanically out of that Actor's Character Sheet by
`scripts/make-actor-placeholders.mjs`. No image-generation tool was available to the implementing
session and the repository has no image toolchain, so a crop was the only way to get
identity-correct artwork onto the page at all. A crop cannot invent a face, which is the one virtue
it has: nothing drifted.

This is the list of generations that replaces them. Everything is mechanically ready — the markup,
the painter, the preload list and the build check already carry these exact filenames — so
replacing a placeholder is dropping a file into `public/assets/actors/` and correcting three
numbers in `index.html`.

The contract these are cut to is in CLAUDE.md under "Cycle assets travel as a set too". Read it
first; this list only adds what is specific to each shot.

## Rules that apply to every shot

- **One call per sheet, from the Character Sheet.** Attach
  `art/characters/v1/<actor>-character-sheet-v1.png` and quote that character's non-negotiable
  features and palette values out of `art/characters/v1/character-bible.md`. Never reference another
  generated asset, a placeholder, or an earlier Cycle. Never commit anything from `art/`.
- **8 frames in a 4 x 2 grid**, filled left to right then top to bottom.
- **Feet on the frame's bottom edge and centred across it, in every frame.** That point is the
  Actor's position in the world; padding or re-cropping a delivered sheet breaks it.
- **No translation in the frames.** The Actor walks on the spot — the world model does the
  travelling, so a Cycle that crosses its own box would move the Actor twice.
- **Transparent background**, no ground shadow, no contact patch, no motion blur.
- **Side view, level with the Actor**, in the turnaround's neutral lighting.
- **Loop cleanly**: frame 8 leads back into frame 1.
- Check identity at full size *and* at the on-screen size in the last column below. At that size
  the large shapes and the distinguishing marks are all that survive.

## The shots

| # | File | Actor | Cycle | Facing | Frame | Sheet | Loop | Reference view | On screen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `boy-walk-right.png` | Boy | walk | right | 192x320 | 768x640 | 0.8 s @ 10 fps | Right side; Front and Three-quarter for the face | ~230 px tall |
| 2 | `boy-run-right.png` | Boy | run | right | 192x320 | 768x640 | 0.57 s @ 14 fps | as above | ~230 px tall |
| 3 | `girl-walk-right.png` | Girl | walk | right | 192x320 | 768x640 | 0.8 s @ 10 fps | Right side; Front for the face | ~210 px tall |
| 4 | `girl-run-right.png` | Girl | run | right | 192x320 | 768x640 | 0.57 s @ 14 fps | as above | ~210 px tall |
| 5 | `mica-walk-left.png` | Míca | walk | left | 256x192 | 1024x384 | 0.8 s @ 10 fps | **Left side** + the nose-dot inset | ~85 px tall |
| 6 | `mica-walk-right.png` | Míca | walk | right | 256x192 | 1024x384 | 0.8 s @ 10 fps | **Right side** — dot hidden on the far side | ~85 px tall |
| 7 | `mica-run-left.png` | Míca | run | left | 256x192 | 1024x384 | 0.57 s @ 14 fps | **Left side** + the nose-dot inset | ~85 px tall |
| 8 | `mica-run-right.png` | Míca | run | right | 256x192 | 1024x384 | 0.57 s @ 14 fps | **Right side** — dot hidden on the far side | ~85 px tall |
| 9 | `mira-walk-left.png` | Mira | walk | left | 256x192 | 1024x384 | 0.8 s @ 10 fps | **Left side** + the ringed-tail inset | ~85 px tall |
| 10 | `mira-walk-right.png` | Mira | walk | right | 256x192 | 1024x384 | 0.8 s @ 10 fps | **Right side** | ~85 px tall |
| 11 | `mira-run-left.png` | Mira | run | left | 256x192 | 1024x384 | 0.57 s @ 14 fps | **Left side** + the ringed-tail inset | ~85 px tall |
| 12 | `mira-run-right.png` | Mira | run | right | 256x192 | 1024x384 | 0.57 s @ 14 fps | **Right side** | ~85 px tall |

Twelve calls. The Boy and the Girl get one facing each because their identity survives a mirror;
the cats get two because Míca's does not, and Mira is treated the same so the pair matches.

Per-Actor notes, on top of the bible's own:

- **Boy** — the browline glasses stay on through every frame, including the ones where his head
  turns furthest. The brown shoes have no contrasting sole.
- **Girl** — the ponytail is the thing that moves. Let it swing with the stride rather than sitting
  rigid; the tie stays at the back of the head, never the side.
- **Míca** — the tail is wide with a blunt rounded end, and the patch boundaries match the sheet.
  Do not reroll the calico patches per frame; they are the same cat in every one.
- **Mira** — four dark tail rings plus a dark tip, counted the same in every frame. Torso striping
  stays faint, the leg bands stay strong, the ear backs stay rufous.

## Why the cats need both facings

`character-bible.md` is explicit: Míca's nose dot sits beside the **anatomical left** edge of her
pink nose, it never swaps sides, and "for an opposite-facing pose, render the opposite anatomical
side; do not flip a bitmap". A `scaleX(-1)` on a left-facing Míca puts the dot on the wrong side of
her face — the single most identifiable thing about her.

So her left-facing Cycles come from the sheet's **Left side** view, where the dot is visible, and
her right-facing Cycles from the **Right side** view, where it is naturally hidden. The placeholders
already follow this, and the painter always prefers a real per-facing sheet over mirroring.

The Boy and the Girl are mirrored today. Their asymmetries are milder — his part is on his left and
sweeps right, her fringe and ponytail have a direction — so a left-facing walk shows a reversed
parting. If that reads wrong once the Boy is walking about the Entryway, shots 1-4 become six by
adding `-left` walks and runs. The painter needs no change: drop the files in and add a `.cycle`
layer with `data-facing="left"`.

## What to change in the repository per delivery

In the `<div class="cast">` block at the end of `#apartment` in `index.html`, on that Actor's
`.cycle` layer:

- `data-frames="1"` becomes `data-frames="8"`
- `data-columns="1"` becomes `data-columns="4"`
- `data-fps` stays `10` for a walk and becomes `14` for a run
- a run Cycle needs its own layer: copy the walk layer, then set `data-cycle="run"` and its
  `data-sheet`

Nothing under `src/` changes. The painter measures a frame's shape off the sheet itself, so a
correctly sized delivery needs no code edit, and a wrongly sized one shows up at once as an Actor
of the wrong proportions rather than failing quietly.

When the last placeholder is gone: delete `public/assets/actors/manifest.json`, drop the
placeholder sentence from CLAUDE.md's Cycle convention, and `scripts/make-actor-placeholders.mjs`
and `scripts/png.mjs` can go with it.

## Beats are not on this list

Rummaging a shelf, pinning a Poster, being petted, knocking a Breakable down and sitting are
**Beats**, not Cycles, and belong to the tickets that need them. This list covers only the two
Cycles per Actor that the Actor system itself runs on.
