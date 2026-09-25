// Cut placeholder Cycle sheets out of the Character Sheets.
//
// The Cycles this project actually wants are generated artwork: eight frames of
// walking and eight of running per Actor, made in one image-generation call from
// that Actor's Character Sheet. Nothing in this environment can generate an
// image, so the Actor system is built and shipped on placeholders instead —
// one neutral standing frame per Actor per facing, cut mechanically out of the
// Character Sheet's turnaround row. Mechanically is the point: a crop cannot
// invent a face, so identity cannot drift on the way through this script, and
// `art/characters/v3/` stays the only source any of it came from.
//
// The shot list that replaces these lives beside the effort's notes; the
// contract they are cut to is in CLAUDE.md under "Cycle assets travel as a set".
//
// Needs the Character Sheets, which are deliberately not in the repository:
//
//   node scripts/make-actor-placeholders.mjs ../path/to/art/characters/v3
//
// Not wired into any npm script — it runs once, by hand, and its output is
// committed.
//
// `scripts/art/build-cycle.mjs` now owns the same three ideas for real Cycles —
// a mask, one shared scale, feet on the frame's bottom edge — over a generated
// strip rather than a Character Sheet turnaround. This script is deliberately
// **not** rebuilt on that shared code: its committed output would have to stay
// byte-identical to be worth the churn, and it retires with the last
// placeholder. Read `scaleInto` and `place` below as the earlier statement of
// the same arithmetic, and change neither to match the other.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

import { decodePng, encodePng } from './png.mjs';

/** The Character Sheets' paper colour, and the thing every crop is cut out of. */
const SHEET_BACKGROUND = [251, 248, 241];

/**
 * How far from the paper colour a pixel has to be before it is the drawing.
 *
 * Below `clear` a background-connected pixel is paper and goes fully
 * transparent, which is what removes the soft ground shadow the sheets paint
 * under each figure. Above `solid` it is drawing and stays fully opaque.
 * Between the two the alpha ramps, so the umber contour keeps its soft edge.
 *
 * Only pixels the flood reaches are touched, so Míca's warm-white chest — which
 * is barely darker than the paper, but walled in by her outline — is never in
 * danger of being mistaken for the page behind her.
 */
const PAPER = { clear: 30, solid: 70 };

/**
 * The contact shadow each sheet paints on the ground under its figure.
 *
 * It is warm tan rather than paper — far enough from the paper colour to stop
 * the flood dead, so without this the cats would walk the apartment dragging a
 * smear of the Character Sheet's floor behind them. It is also light, which is
 * what separates it from anything drawn: Míca's light-brown patches are much
 * darker than her shadow, and the umber contour darker still. Letting the flood
 * through pixels that are both light and near the bottom of the band clears the
 * shadow without giving it licence anywhere near a face.
 */
const GROUND = { fromHeight: 0.78, minLuminance: 168, maxDifference: 150 };

/**
 * The frame box each Actor's Cycles are drawn in, in pixels.
 *
 * Two shapes rather than one square: a standing person and a walking cat do not
 * want their pixels in the same places. Every crop is scaled to fill the frame's
 * height exactly, so an Actor's height on the stage is the frame's height and a
 * crop that would be limited by the frame's width is a mistake worth failing on.
 */
const FRAME = {
  person: { width: 192, height: 320 },
  cat: { width: 256, height: 192 },
};

/**
 * Where each Actor's neutral side view sits on its Character Sheet.
 *
 * The bands are generous boxes around one view of the turnaround row, wide
 * enough to hold a tail or a ponytail and narrow enough to exclude the
 * neighbouring view and the caption under it; the tight crop is measured inside
 * them. `facing` follows the sheet's own convention, which the bible fixes: an
 * animal facing the page's left edge is showing its anatomical left side.
 *
 * The cats get both facings because the bible forbids mirroring Míca — her nose
 * mark sits beside her anatomical left nostril and a flipped bitmap would move
 * it to the wrong side of her face. Taking her left-facing frame from the Left
 * side view and her right-facing frame from the Right side view means the mark
 * is simply drawn where it belongs in each. Mira and Luna carry no asymmetric
 * marking, so mirroring either would in fact be safe; they are cut both ways
 * anyway, because one rule for the cats is cheaper to hold than three. The Boy
 * and the Girl have only a right-side view on their sheets, so they ship
 * right-facing and the painter mirrors them.
 */
/**
 * Measured against the **version 2** sheets. The script now reads version 3,
 * which is version 2 byte for byte except Luna's recoloured coat, so the
 * figures sit on the same pixels and the bands hold. Version 1's bands are not
 * reusable: v2 was a fresh set of generations and its figures land on
 * different pixels.
 *
 * Each band clears the sheet title above (it overlaps the x range of the
 * left-hand views) and the caption below, both of which are drawing that `lift`
 * would otherwise take for part of the figure. The numbers came from a row ink
 * profile over each view's own x range, so the gaps are real rather than
 * assumed: on the Boy's sheet, for instance, only seven blank rows separate the
 * shadow under his foot from the top of "Right side".
 */
const CROPS = [
  { actor: 'boy', shape: 'person', facing: 'right', view: 'Right side', band: { x0: 835, x1: 990, y0: 31, y1: 577 } },
  { actor: 'girl', shape: 'person', facing: 'right', view: 'Right side', band: { x0: 807, x1: 1032, y0: 40, y1: 571 } },
  { actor: 'mica', shape: 'cat', facing: 'left', view: 'Left side', band: { x0: 220, x1: 677, y0: 90, y1: 491 } },
  { actor: 'mica', shape: 'cat', facing: 'right', view: 'Right side', band: { x0: 829, x1: 1227, y0: 98, y1: 491 } },
  { actor: 'mira', shape: 'cat', facing: 'left', view: 'Left side', band: { x0: 217, x1: 647, y0: 84, y1: 447 } },
  { actor: 'mira', shape: 'cat', facing: 'right', view: 'Right side', band: { x0: 815, x1: 1235, y0: 82, y1: 447 } },
  { actor: 'luna', shape: 'cat', facing: 'left', view: 'Left side', band: { x0: 219, x1: 679, y0: 143, y1: 482 } },
  { actor: 'luna', shape: 'cat', facing: 'right', view: 'Right side', band: { x0: 834, x1: 1231, y0: 143, y1: 482 } },
];

const sheetDirectory = resolve(process.argv[2] ?? 'art/characters/v3');
const output = fileURLToPath(new URL('../public/assets/actors/', import.meta.url));

const sheets = new Map();
function sheet(actor) {
  if (!sheets.has(actor)) {
    const path = join(sheetDirectory, `${actor}-character-sheet-v3.png`);
    const bytes = readFileSync(path);
    sheets.set(actor, {
      image: decodePng(bytes),
      file: `${actor}-character-sheet-v3.png`,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return sheets.get(actor);
}

/** How far this pixel is from the paper, as the widest of its three channels. */
function fromPaper(image, x, y) {
  const at = (y * image.width + x) * 4;
  return Math.max(
    Math.abs(image.data[at] - SHEET_BACKGROUND[0]),
    Math.abs(image.data[at + 1] - SHEET_BACKGROUND[1]),
    Math.abs(image.data[at + 2] - SHEET_BACKGROUND[2]),
  );
}

/**
 * Lift one view off the paper.
 *
 * Flood the band inward from its edges, stopping wherever the drawing is solid.
 * Everything the flood reaches is paper or the shadow the paper carries, and
 * gets the ramped alpha; everything it cannot reach is inside the figure and is
 * left alone. Returns the band as RGBA plus the tight box the drawing occupies.
 */
function lift(image, band) {
  const width = band.x1 - band.x0 + 1;
  const height = band.y1 - band.y0 + 1;
  const data = Buffer.alloc(width * height * 4);
  const difference = new Uint8Array(width * height);
  const light = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const from = ((band.y0 + row) * image.width + band.x0 + column) * 4;
      const to = (row * width + column) * 4;
      image.data.copy(data, to, from, from + 4);
      const index = row * width + column;
      difference[index] = Math.min(255, fromPaper(image, band.x0 + column, band.y0 + row));
      light[index] = Math.round(0.299 * data[to] + 0.587 * data[to + 1] + 0.114 * data[to + 2]);
    }
  }

  const groundFrom = Math.floor(height * GROUND.fromHeight);
  const reached = new Uint8Array(width * height);
  const stack = [];
  const consider = index => {
    if (reached[index]) return;
    const onTheGround = index >= groundFrom * width;
    const passable =
      difference[index] < PAPER.solid ||
      (onTheGround && light[index] >= GROUND.minLuminance && difference[index] < GROUND.maxDifference);
    if (!passable) return;
    reached[index] = 1;
    stack.push(index);
  };
  for (let column = 0; column < width; column++) {
    consider(column);
    consider((height - 1) * width + column);
  }
  for (let row = 0; row < height; row++) {
    consider(row * width);
    consider(row * width + width - 1);
  }
  while (stack.length) {
    const index = stack.pop();
    const column = index % width;
    const row = (index - column) / width;
    if (column > 0) consider(index - 1);
    if (column < width - 1) consider(index + 1);
    if (row > 0) consider(index - width);
    if (row < height - 1) consider(index + width);
  }

  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let index = 0; index < width * height; index++) {
    if (reached[index]) {
      // Down among the feet there is nothing to be gentle with: every pixel the
      // flood can reach there is floor, and ramping any of it up leaves the pale
      // edge of the sheet's contact shadow stuck to the Actor's shoes. Higher up
      // the ramp is what keeps the umber contour's soft edge.
      const span = PAPER.solid - PAPER.clear;
      const ramp = Math.max(0, Math.min(1, (difference[index] - PAPER.clear) / span));
      const floor = index >= groundFrom * width || difference[index] >= PAPER.solid;
      data[index * 4 + 3] = floor ? 0 : Math.round(ramp * 255);
    } else {
      data[index * 4 + 3] = 255;
    }
    // The box is measured on what a viewer would actually see, so a rim pixel
    // that is nearly transparent does not stretch it past the drawing.
    if (data[index * 4 + 3] < 128) continue;
    const column = index % width;
    const row = (index - column) / width;
    if (column < left) left = column;
    if (column > right) right = column;
    if (row < top) top = row;
    if (row > bottom) bottom = row;
  }
  if (right < left || bottom < top) throw new Error('Found no drawing inside the band.');
  return { width, height, data, box: { left, top, right, bottom } };
}

/**
 * Scale a box out of `source` into a `width` x `height` image.
 *
 * Averages every source pixel falling under a destination pixel, over
 * premultiplied alpha so that the transparent paper around a figure cannot
 * bleed its colour into the figure's edge.
 */
function scaleInto(source, box, width, height) {
  const data = Buffer.alloc(width * height * 4);
  const fromWidth = box.right - box.left + 1;
  const fromHeight = box.bottom - box.top + 1;
  for (let row = 0; row < height; row++) {
    const y0 = box.top + Math.floor((row * fromHeight) / height);
    const y1 = Math.max(y0 + 1, box.top + Math.floor(((row + 1) * fromHeight) / height));
    for (let column = 0; column < width; column++) {
      const x0 = box.left + Math.floor((column * fromWidth) / width);
      const x1 = Math.max(x0 + 1, box.left + Math.floor(((column + 1) * fromWidth) / width));
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const at = (y * source.width + x) * 4;
          const weight = source.data[at + 3] / 255;
          red += source.data[at] * weight;
          green += source.data[at + 1] * weight;
          blue += source.data[at + 2] * weight;
          alpha += source.data[at + 3];
          count++;
        }
      }
      const to = (row * width + column) * 4;
      const coverage = alpha / count / 255;
      data[to] = coverage > 0 ? Math.round(red / count / coverage) : 0;
      data[to + 1] = coverage > 0 ? Math.round(green / count / coverage) : 0;
      data[to + 2] = coverage > 0 ? Math.round(blue / count / coverage) : 0;
      data[to + 3] = Math.round(alpha / count);
    }
  }
  return { width, height, data };
}

/** Drop a scaled figure into its frame: centred across, standing on the floor. */
function place(figure, frame) {
  const canvas = Buffer.alloc(frame.width * frame.height * 4, 0);
  const left = Math.round((frame.width - figure.width) / 2);
  const top = frame.height - figure.height;
  for (let row = 0; row < figure.height; row++) {
    const from = row * figure.width * 4;
    figure.data.copy(canvas, ((top + row) * frame.width + left) * 4, from, from + figure.width * 4);
  }
  return { width: frame.width, height: frame.height, data: canvas };
}

mkdirSync(output, { recursive: true });
const made = [];
for (const crop of CROPS) {
  const source = sheet(crop.actor);
  const lifted = lift(source.image, crop.band);
  const { box } = lifted;
  const frame = FRAME[crop.shape];
  const boxWidth = box.right - box.left + 1;
  const boxHeight = box.bottom - box.top + 1;
  // Filling the frame's height is what makes an Actor's painted height equal to
  // the frame's height, which is the whole registration contract.
  const scale = frame.height / boxHeight;
  const width = Math.round(boxWidth * scale);
  if (width > frame.width) {
    throw new Error(
      `${crop.actor} ${crop.facing} is ${boxWidth}x${boxHeight}, too wide for a ${frame.width}x${frame.height} frame.`,
    );
  }
  const file = `${crop.actor}-walk-${crop.facing}.png`;
  const bytes = encodePng(place(scaleInto(lifted, box, width, frame.height), frame));
  writeFileSync(join(output, file), bytes);
  made.push({
    file,
    actor: crop.actor,
    cycle: 'walk',
    facing: crop.facing,
    frames: 1,
    columns: 1,
    frameWidth: frame.width,
    frameHeight: frame.height,
    drawnAt: { width, height: frame.height },
    source: { file: source.file, sha256: source.sha256, view: crop.view, box: { ...crop.band } },
    bytes: bytes.length,
  });
  console.log(`${file}: ${boxWidth}x${boxHeight} of ${crop.view} → ${width}x${frame.height} in ${frame.width}x${frame.height}, ${bytes.length} bytes`);
}

// This script owns the `placeholders` half of the manifest and nothing else.
// The `schema` block and the `cycles` array belong to generated artwork, which
// arrives long after the last run of this script, so they are carried across a
// rewrite rather than clobbered by it.
const manifestPath = join(output, 'manifest.json');
const existing = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      kind: 'placeholder',
      warning:
        'These are not Cycles. Each file is one neutral standing frame cut mechanically out of a Character Sheet turnaround, shipped so that the Actor system could be built and seen before any animation frames exist. Replace every one of them with generated artwork; the shot list for that is in the effort notes and the contract is in CLAUDE.md.',
      madeBy: 'scripts/make-actor-placeholders.mjs',
      madeOn: new Date().toISOString().slice(0, 10),
      identitySource: 'art/characters/v3 — the version 3 Character Sheets, never a generated asset',
      missing: 'Every run Cycle, every walking frame, and the left facing of the Boy and the Girl.',
      ...(existing.schema ? { schema: existing.schema } : {}),
      cycles: existing.cycles ?? [],
      placeholders: made,
    },
    null,
    2,
  )}\n`,
);
console.log(`Wrote ${made.length} placeholders and a manifest into public/assets/actors/.`);
