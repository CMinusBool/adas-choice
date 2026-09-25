#!/usr/bin/env python
"""Build one Scene set — still poster, 4x3 sprite sheet and animated GIF — from two raw generations.

A Scene travels as a set (docs/agents/scene-and-cycle-assets.md): frames are 360 x 576, a 5:8
portrait, 12 of them in a 4 x 3 grid, so the sheet is 1440 x 1728; the loop is 4.1 s. The still
and the sheet are generated separately and need not share a composition (owner, 2026-09-25), so
this takes both:

    python scripts/art/build-scene.py --still <still-raw.png> --sheet <sheet-raw.png> \
        --out <public/assets/name>

and writes `<name>.webp` (the still), `<name>-sprite.webp` (the sheet) and `<name>.gif` (the
sheet's twelve frames at the timings `src/dom/game-room.ts` plays the sheet at, so the GIF the
page shows while the sheet loads keeps the same beat).

Nothing is cropped, padded or retouched. The raw sheet is resampled whole onto the contract's
grid — a generator returns its sheet at its own size, and a whole-image resample is exactly a
per-cell one when the grid divides both images into the same 4 x 3 — and the still is resampled
whole onto one frame. Both must already be 5:8 to within a pixel of rounding; a raw image that is
not is refused rather than squeezed. The scale factors are printed, and an upscale is said so.

Why Python: the page ships WebP and GIF, and `scripts/png.mjs` writes PNG only. Pillow (12.x on
this workstation) encodes both; like Playwright it is a machine tool, not a package dependency.
"""
import argparse
import sys

from PIL import Image

FRAME = (360, 576)
COLUMNS, ROWS = 4, 3
# `frameDurations` in src/dom/game-room.ts, 4100 ms in all.
DURATIONS = [600, 250, 250, 300, 300, 350, 400, 500, 300, 250, 250, 350]
WEBP = {"quality": 90, "method": 6}
# 5:8 is 0.625; a generator's 1145 x 1374 sheet is 0.6250 per cell and its 992 x 1586 still 0.6255.
ASPECT_TOLERANCE = 0.002


def aspect_ok(width, height, target):
    return abs(width / height - target) <= ASPECT_TOLERANCE


def resample(image, size):
    return image.convert("RGB").resize(size, Image.Resampling.LANCZOS)


def build(still_path, sheet_path, out):
    still_raw = Image.open(still_path)
    sheet_raw = Image.open(sheet_path)
    frame_aspect = FRAME[0] / FRAME[1]
    sheet_size = (FRAME[0] * COLUMNS, FRAME[1] * ROWS)
    if not aspect_ok(*still_raw.size, frame_aspect):
        raise SystemExit(f"build-scene: the still is {still_raw.size}, not 5:8")
    if not aspect_ok(sheet_raw.size[0] / COLUMNS, sheet_raw.size[1] / ROWS, frame_aspect):
        raise SystemExit(f"build-scene: the sheet is {sheet_raw.size}, whose 4 x 3 cells are not 5:8")

    still = resample(still_raw, FRAME)
    sheet = resample(sheet_raw, sheet_size)
    still.save(f"{out}.webp", "WEBP", **WEBP)
    sheet.save(f"{out}-sprite.webp", "WEBP", **WEBP)

    frames = []
    for index in range(COLUMNS * ROWS):
        x = (index % COLUMNS) * FRAME[0]
        y = (index // COLUMNS) * FRAME[1]
        cell = sheet.crop((x, y, x + FRAME[0], y + FRAME[1]))
        frames.append(cell.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG))
    frames[0].save(
        f"{out}.gif", "GIF", save_all=True, append_images=frames[1:],
        duration=DURATIONS, loop=0, optimize=False, disposal=1,
    )

    for label, raw, size in (("still", still_raw, FRAME), ("sheet", sheet_raw, sheet_size)):
        scale = size[0] / raw.size[0]
        verb = "upscaled" if scale > 1 else "downscaled"
        print(f"{out}: {label} {raw.size[0]}x{raw.size[1]} -> {size[0]}x{size[1]}, {verb} x{scale:.4f}")
    print(f"{out}.gif: 12 frames, {sum(DURATIONS)} ms")


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--still", required=True)
    parser.add_argument("--sheet", required=True)
    parser.add_argument("--out", required=True, help="the set's path without extension")
    arguments = parser.parse_args(argv)
    build(arguments.still, arguments.sheet, arguments.out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
