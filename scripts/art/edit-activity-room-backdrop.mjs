#!/usr/bin/env node
// Narrow the Activity Room backdrop's painted doorway to the one door (COOP-001 ticket 93, design
// 75 §4.5 "T13's edit", §0.2 and §0.3).
//
// The kept S01 generation (ticket 42, attempt-2) paints its doorway 205 raw px wide between the
// casings, which is 162 units once the backdrop is scaled × 0.83 onto its 1328 x 747 stage: 14 %
// wider than the one door, 142 x 350 units (85 x 210 cm). Its height is already right. So the
// right-hand casing is moved left across the plain wall, and the strip of wall it vacates is
// filled from the wall and skirting beside it — a pixel edit, never a generation. Nothing here
// invents a pixel: every output pixel is a source pixel, or (in a narrow feather at the edit's
// right and top edges) a blend of two source pixels of the same wall.
//
// node scripts/art/edit-activity-room-backdrop.mjs [--source <attempt-2/strip-raw.png>]
//   [--manifest <42-activity-room/manifest.json>]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { blank, decodePng, encodePng } from '../png.mjs';

/** Rec. 709 luma of one pixel, 0-255. */
function luma(image, x, y) {
  const at = (y * image.width + x) * 4;
  return 0.2126 * image.data[at] + 0.7152 * image.data[at + 1] + 0.0722 * image.data[at + 2];
}

/**
 * The doorway as the design note measures it: from the left casing's inner edge to the right
 * casing's, the left jamb's brown reveal counted as opening (it is where the leaf hangs; design 75
 * §4.1 D7's leaf spans it). Taken on the column averages of a band of rows at the opening's middle
 * height, walked out from a seed column inside it while the band stays darker than the casings.
 *
 * `dark` 43 sits between the reveal (≤ 39 on the source) and the casings' inner edges (47 and 69).
 */
export function measureDoorway(image, { rows = [300, 500], seed = 210, dark = 43 } = {}) {
  const [y0, y1] = rows;
  const band = (x) => {
    let total = 0;
    for (let y = y0; y <= y1; y++) total += luma(image, x, y);
    return total / (y1 - y0 + 1);
  };
  if (band(seed) >= dark) throw new Error(`seed column ${seed} is not inside a dark doorway`);
  let x0 = seed;
  while (x0 > 0 && band(x0 - 1) < dark) x0--;
  let x1 = seed + 1;
  while (x1 < image.width && band(x1) < dark) x1++;
  return { x0, x1, width: x1 - x0 };
}

/** The Activity Room's stage width after design 75 §2.1: 1600 units × 0.83. */
export const STAGE_WIDTH = 1328;

/** Raw px across a backdrop `imageWidth` wide, in stage units once it is stretched onto the stage. */
export function stageUnits(px, imageWidth) {
  return (px * STAGE_WIDTH) / imageWidth;
}

/**
 * The edit, in raw px of the kept S01 source (design 75 §4.5's 1600u boxes ÷ 0.9545, then measured).
 *
 * - The right casing is x 323-348, its shadow on the wall 349-350, and the wall is settled from
 *   351. `shift` 26 takes the casing's inner edge from 323 to 297, which is design 75 §4.1 D7's leaf
 *   right edge (237 units): the opening becomes 118-296, 179 px.
 * - Columns `x0`-`x1` take the source 26 columns to their right, so the casing, its shadow and then
 *   the wall beside it slide across together and the left side of the fill is seamless by
 *   construction. The only join is where that shifted wall meets the unshifted wall, and it is
 *   feathered over the next `feather` columns, which are plain wall and skirting on both sides.
 * - Rows `y0`-`y1` run from the plain wall above the casing head (172) through the first floor
 *   row, 647 (design 75's 1600u row 620 is raw 647.6): that row carries the casing's contact shadow
 *   (x 342-346), which would otherwise be left on the floor under the skirting. The floor below it
 *   is left alone. The top `topFeather` rows blend in from the unedited wall.
 */
export const EDIT = { shift: 26, x0: 297, x1: 350, feather: 16, y0: 160, y1: 647, topFeather: 12 };

/** A copy of `image` with the doorway narrowed. The input is not touched. */
export function editBackdrop(image, edit = EDIT) {
  const { shift, x0, x1, feather, y0, y1, topFeather } = edit;
  const out = { width: image.width, height: image.height, data: Buffer.from(image.data) };
  for (let y = y0; y <= y1; y++) {
    const vertical = Math.min(1, (y - y0 + 1) / (topFeather + 1));
    for (let x = x0; x <= x1 + feather; x++) {
      const horizontal = x <= x1 ? 1 : 1 - (x - x1) / (feather + 1);
      const weight = vertical * horizontal;
      const here = (y * image.width + x) * 4;
      const from = (y * image.width + x + shift) * 4;
      for (let channel = 0; channel < 4; channel++) {
        out.data[here + channel] = Math.round(
          weight * image.data[from + channel] + (1 - weight) * image.data[here + channel],
        );
      }
    }
  }
  return out;
}

/** The doorway and the wall either side of it, the region the contact sheet shows. */
const CONTACT_REGION = { x0: 60, y0: 140, x1: 430, y1: 690 };
const CONTACT_GAP = 16;

/** Before and after, side by side, nearest-neighbour at `zoom` × so every pixel of a seam shows. */
export function contactSheet(before, after, { region = CONTACT_REGION, zoom = 2 } = {}) {
  const width = (region.x1 - region.x0) * zoom;
  const height = (region.y1 - region.y0) * zoom;
  const sheet = blank(width * 2 + CONTACT_GAP, height);
  sheet.data.fill(255);
  [before, after].forEach((image, panel) => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const from = ((region.y0 + Math.floor(y / zoom)) * image.width + region.x0 + Math.floor(x / zoom)) * 4;
        const to = (y * sheet.width + panel * (width + CONTACT_GAP) + x) * 4;
        image.data.copy(sheet.data, to, from, from + 4);
      }
    }
  });
  return sheet;
}

/**
 * The biggest step between neighbouring pixels along `axis` inside a box, in luma, and its 99th
 * percentile: what a seam would push up, measured the same way over plain wall for comparison.
 */
function steps(image, { x0, x1, y0, y1 }, axis) {
  const found = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const [nx, ny] = axis === 'x' ? [x + 1, y] : [x, y + 1];
      found.push(Math.abs(luma(image, nx, ny) - luma(image, x, y)));
    }
  }
  found.sort((a, b) => a - b);
  const round = (value) => Math.round(value * 10) / 10;
  return { max: round(found.at(-1)), p99: round(found[Math.floor(found.length * 0.99)]) };
}

/**
 * The joins the edit made, against the same measure over wall and skirting it never touched. The
 * top box stops at row 169 so its last step is wall to wall, short of the casing head's top
 * highlight at 171, which the untouched box has no counterpart of.
 */
export function seamReport(image) {
  return {
    rightJoin: steps(image, { x0: 325, x1: 390, y0: 210, y1: 646 }, 'x'),
    rightJoinUntouchedWall: steps(image, { x0: 420, x1: 485, y0: 210, y1: 646 }, 'x'),
    topJoin: steps(image, { x0: 297, x1: 390, y0: 150, y1: 170 }, 'y'),
    topJoinUntouchedWall: steps(image, { x0: 420, x1: 513, y0: 150, y1: 170 }, 'y'),
  };
}

const root = fileURLToPath(new URL('../../', import.meta.url));
const TICKET = '93-activity-room-doorway';
const SCRIPT = 'scripts/art/edit-activity-room-backdrop.mjs';
const SHOT = 'A-S01-backdrop';
const DEFAULT_SOURCE = '.scratch/COOP-001-apartment/art/generated/42-activity-room/A-S01-backdrop/attempt-2/strip-raw.png';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseArguments(argv) {
  const options = { source: resolve(root, DEFAULT_SOURCE), manifest: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--source') options.source = resolve(argv[++i]);
    else if (flag === '--manifest') options.manifest = resolve(argv[++i]);
    else if (flag === '--quiet') options.quiet = true;
    else throw new Error(`unknown argument ${flag}`);
  }
  // The generation directory's manifest sits two levels above an attempt: <dir>/<shot>/<attempt>/.
  options.manifest ??= join(dirname(dirname(dirname(options.source))), 'manifest.json');
  return options;
}

/**
 * Read the kept S01 attempt, refuse it unless its sha256 is the one the illustrator's manifest
 * kept, write `<attempt>-edit/strip.png` with its 2 × contact sheet and `edit.json` beside it, and
 * record the edit on the shot in the manifest — additively: an `edits` list on the shot, and every
 * field it already had left as it was. Returns the exit code.
 */
export function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const say = options.quiet ? () => {} : (line) => console.log(line);
  if (!existsSync(options.source)) {
    console.error(`no source at ${options.source}; pass the main checkout's kept attempt with --source`);
    return 1;
  }
  const manifest = JSON.parse(readFileSync(options.manifest, 'utf8'));
  const generation = dirname(options.manifest);
  const shot = manifest.shots?.find((entry) => entry.id === SHOT);
  if (!shot) {
    console.error(`${options.manifest} has no ${SHOT} shot`);
    return 1;
  }
  const sourceBytes = readFileSync(options.source);
  const sourceFile = relative(generation, options.source).split(sep).join('/');
  if (sourceFile !== shot.file || sha256(sourceBytes) !== shot.sha256) {
    console.error(`${sourceFile} (sha256 ${sha256(sourceBytes)}) is not the kept ${SHOT}, ${shot.file} (${shot.sha256})`);
    return 1;
  }

  const before = decodePng(sourceBytes);
  const after = editBackdrop(before);
  const output = `${dirname(options.source)}-edit`;
  mkdirSync(output, { recursive: true });
  const outputBytes = encodePng(after);
  writeFileSync(join(output, 'strip.png'), outputBytes);
  writeFileSync(join(output, 'contact-sheet-2x.png'), encodePng(contactSheet(before, after)));

  const doorway = (image) => {
    const { x0, x1, width } = measureDoorway(image);
    return { rawPx: { x0, x1, width }, stageUnits: Math.round(stageUnits(width, image.width) * 10) / 10 };
  };
  const record = {
    file: relative(generation, join(output, 'strip.png')).split(sep).join('/'),
    sha256: sha256(outputBytes),
    editOf: { file: shot.file, sha256: shot.sha256 },
    ticket: TICKET,
    script: SCRIPT,
    generated: false,
    operation:
      `right casing moved ${EDIT.shift} px left (raw x ${EDIT.x0 + EDIT.shift}-${EDIT.x1 + EDIT.shift} to ` +
      `${EDIT.x0}-${EDIT.x1}, rows ${EDIT.y0}-${EDIT.y1}), the strip it vacated filled with the wall and ` +
      `skirting beside it, feathered over ${EDIT.feather} columns at the right and ${EDIT.topFeather} rows at the top`,
    edit: EDIT,
    doorway: { before: doorway(before), after: doorway(after), stageWidth: STAGE_WIDTH },
    seams: seamReport(after),
    contactSheet: relative(generation, join(output, 'contact-sheet-2x.png')).split(sep).join('/'),
  };
  writeFileSync(join(output, 'edit.json'), `${JSON.stringify(record, null, 2)}\n`);
  shot.edits = [...(shot.edits ?? []).filter((entry) => entry.file !== record.file), record];
  writeFileSync(options.manifest, `${JSON.stringify(manifest, null, 2)}\n`);

  say(`wrote ${join(output, 'strip.png')}`);
  say(`doorway ${record.doorway.before.rawPx.width} -> ${record.doorway.after.rawPx.width} raw px, ` +
    `${record.doorway.before.stageUnits} -> ${record.doorway.after.stageUnits} units on the ${STAGE_WIDTH}-unit stage`);
  say(`seams ${JSON.stringify(record.seams)}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
