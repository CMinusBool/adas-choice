#!/usr/bin/env node
// Two pixel edits on the Entryway's approved backdrop, S01 attempt-4 (ticket 84, design 75's T4).
// There is no generation: attempt-4 is right in everything but two places, and both are a plain
// piece of painted wall away from right.
//
// 1. The front doorway is 227 raw px wide against the Room doors' ~200, 13 % over the one door.
//    Its right-hand jamb moves 26 px left across the plain wall, and the strip it leaves is wall
//    and skirting again. The opening comes to 201 px, 142 units at the Entryway's 0.7081.
// 2. The hook rail hangs with its tips 100 cm off the floor. The rail and its hooks move 156 px
//    up, tips to raw y 197 (166 cm), and where they hung is wall again.
//
// Every number is in `ATTEMPT_4` below with the measurement behind it. The script reads
// attempt-4 and never writes it; it writes `attempt-4-edit/strip.png` and a before-and-after
// contact sheet at 2x beside it, and records the edit additively in the shot's manifest. The
// generations live in the main checkout's effort directory, never in a worktree, so the paths are
// arguments rather than defaults.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { decodePng, encodePng } from '../png.mjs';

/** The casing's warm brown: well redder than blue, greener than blue, and not the pink wall. */
const isCasing = (r, g, b) => r - b >= 30 && g - b >= 10 && r >= 1.4 * g;

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/**
 * The doorway's opening, scanned outward from `seed` (a column inside it) on every row of
 * `rows` ([from, to)) to the first run of `run` casing pixels on each side. `left` is the first
 * column of the opening, `right` the first column of the right-hand casing, both the median over
 * the rows, so a banister or a lamp crossing a few rows does not move them.
 */
export function measureOpening(image, { seed, rows: [from, to], run = 6 }) {
  const casingAt = (x, y) => {
    if (x < 0 || x >= image.width) return true;
    const at = (y * image.width + x) * 4;
    return isCasing(image.data[at], image.data[at + 1], image.data[at + 2]);
  };
  const runFrom = (x, y, step) => {
    for (let k = 0; k < run; k++) if (!casingAt(x + step * k, y)) return false;
    return true;
  };
  const lefts = [];
  const rights = [];
  for (let y = from; y < to; y++) {
    let left = seed;
    while (left >= 0 && !runFrom(left, y, -1)) left--;
    let right = seed;
    while (right < image.width && !runFrom(right, y, 1)) right++;
    lefts.push(left + 1);
    rights.push(right);
  }
  const left = median(lefts);
  const right = median(rights);
  return { left, right, width: right - left };
}

const clampByte = value => Math.max(0, Math.min(255, Math.round(value)));

const inside = (x, y, boxes) => boxes.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);

/** The three colour channels at (x, y). */
function pixel(image, x, y) {
  const at = (y * image.width + x) * 4;
  return [image.data[at], image.data[at + 1], image.data[at + 2]];
}

function put(image, x, y, [r, g, b]) {
  const at = (y * image.width + x) * 4;
  image.data[at] = clampByte(r);
  image.data[at + 1] = clampByte(g);
  image.data[at + 2] = clampByte(b);
  image.data[at + 3] = 255;
}

/** Mean colour of columns [x0, x1) on row y. */
function rowMean(image, y, x0, x1) {
  const sum = [0, 0, 0];
  for (let x = x0; x < x1; x++) pixel(image, x, y).forEach((v, k) => { sum[k] += v; });
  return sum.map(v => v / (x1 - x0));
}

/**
 * A painted wall's grain at (x, y): the pixel less the mean of its own row within ±`radius`
 * columns, held to ±`limit` so a donor pixel that is something other than wall adds nothing loud.
 * Row-wise on purpose: the tone it rides on is a per-row tone, and a skirting's hard horizontal
 * edges have no grain along the row to lose.
 */
function grainAt(image, x, y, [x0, x1], { radius = 4, limit = 3 } = {}) {
  const from = Math.max(x0, x - radius);
  const to = Math.min(x1, x + radius + 1);
  const mean = rowMean(image, y, from, to);
  return pixel(image, x, y).map((v, k) => Math.max(-limit, Math.min(limit, v - mean[k])));
}

/**
 * Edit 1. The right jamb's columns `[c0, c1)` over `rows` move `shift` to the left, and the strip
 * they leave, `[c1 - shift, c1)` over `fillRows`, becomes the wall beside it: each row takes the
 * tone of the `tone` columns just right of the strip — smoothed over ±3 rows above the skirting,
 * exact on the skirting's own hard-edged rows — plus the grain of the `grain` columns, a strip of
 * plain wall of the same width elsewhere on the same rows. Tone from the neighbour and grain from
 * a donor is what makes the seam against the untouched wall vanish: a straight column clone from
 * the right would carry the bench and its shadow across. Nothing inside `keep` (the doormat) is
 * written.
 */
function moveJamb(source, target, jamb) {
  const { columns: [c0, c1], shift, rows, fillRows, skirtingTop, tone, grain, keep } = jamb;
  const strip = [c1 - shift, c1];
  if (grain[1] - grain[0] !== shift) throw new Error(`The grain donor must be ${shift} columns wide.`);
  for (let y = rows[0]; y < rows[1]; y++) {
    for (let x = c0; x < c1; x++) {
      if (!inside(x - shift, y, keep)) put(target, x - shift, y, pixel(source, x, y));
    }
  }
  const toneOf = y => rowMean(source, y, tone[0], tone[1]);
  for (let y = fillRows[0]; y < fillRows[1]; y++) {
    let base;
    if (y < skirtingTop) {
      const from = Math.max(fillRows[0], y - 3);
      const to = Math.min(skirtingTop, y + 4);
      const sum = [0, 0, 0];
      for (let row = from; row < to; row++) toneOf(row).forEach((v, k) => { sum[k] += v; });
      base = sum.map(v => v / (to - from));
    } else base = toneOf(y);
    for (let x = strip[0]; x < strip[1]; x++) {
      if (inside(x, y, keep)) continue;
      const texture = grainAt(source, grain[0] + (x - strip[0]), y, grain);
      put(target, x, y, base.map((v, k) => v + texture[k]));
    }
  }
}

/** The hooks' polished brass: bright, warm and well clear of the wall, the plate and the casing. */
const isBrass = (r, g, b) => r >= 140 && g >= 90 && r - b >= 80 && g - b >= 40;

/**
 * The tip of every hook inside `box` ([x0, y0, x1, y1), exclusive ends), left to right: the
 * lowest row holding at least two brass pixels of that hook, which is the bottom of the curve a
 * coat's loop rests in. A hook is a run of columns each holding three or more brass pixels, gaps
 * of up to two columns bridged, at least eight wide — so the plate's one-pixel brass bevel and the
 * screw heads, which are narrower, are not hooks.
 */
export function measureHookTips(image, [x0, y0, x1, y1]) {
  const brass = (x, y) => isBrass(...pixel(image, x, y));
  const heavy = [];
  for (let x = x0; x < x1; x++) {
    let count = 0;
    for (let y = y0; y < y1; y++) if (brass(x, y)) count++;
    if (count >= 3) heavy.push(x);
  }
  const hooks = [];
  for (const x of heavy) {
    const last = hooks.at(-1);
    if (last && x - last.at(-1) <= 3) last.push(x);
    else hooks.push([x]);
  }
  return hooks
    .filter(columns => columns.at(-1) - columns[0] + 1 >= 8)
    .map(columns => {
      for (let y = y1 - 1; y >= y0; y--) {
        let count = 0;
        for (let x = columns[0]; x <= columns.at(-1); x++) if (brass(x, y)) count++;
        if (count >= 2) return y;
      }
      return null;
    });
}

/**
 * The wall behind `box`, as if nothing hung there: each column's tone taken from the six rows just
 * above the box and the six just below (averaged ±3 columns, inside the box), and blended down the
 * box between the two.
 */
function wallBehind(source, [x0, y0, x1, y1]) {
  const band = (x, from, to) => {
    const sum = [0, 0, 0];
    let n = 0;
    for (let column = Math.max(x0, x - 3); column < Math.min(x1, x + 4); column++) {
      for (let y = from; y < to; y++) { pixel(source, column, y).forEach((v, k) => { sum[k] += v; }); n++; }
    }
    return sum.map(v => v / n);
  };
  const above = [];
  const below = [];
  for (let x = x0; x < x1; x++) { above.push(band(x, y0 - 6, y0)); below.push(band(x, y1, y1 + 6)); }
  return (x, y) => {
    const t = (y - y0 + 0.5) / (y1 - y0);
    return above[x - x0].map((v, k) => v + (below[x - x0][k] - v) * t);
  };
}

/**
 * Edit 2. Everything inside `box` that is not wall — the plate, the hooks, their shadow — goes up
 * `lift` rows, and where it was becomes wall again. What is "not wall" is a soft matte: a pixel's
 * distance from the wall behind it, 0 below 6 levels and 1 from 18, so the anti-aliased rim comes
 * along partly and the wall inside the box is never copied, so the new place has no box edge to
 * show. The old place is refilled over the whole box, not only the matte, with the wall behind it
 * plus the grain of the wall `grainRows` above: the painting lifts the wall a level or two in a
 * faint halo just over the plate, and a fill over the matte alone left that halo standing as a
 * line where the plate's top edge had been. Over the whole box the tone runs straight from the
 * rows above it to the rows below it, which are the rows it was taken from.
 */
function liftRail(source, target, { box, lift, grainRows }) {
  const [x0, y0, x1, y1] = box;
  if (lift < y1 - y0) throw new Error('The lifted rail would overlap where it hung.');
  const behind = wallBehind(source, box);
  const width = x1 - x0;
  const matte = new Float64Array(width * (y1 - y0));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const wall = behind(x, y);
      const distance = Math.max(...pixel(source, x, y).map((v, k) => Math.abs(v - wall[k])));
      matte[(y - y0) * width + (x - x0)] = Math.max(0, Math.min(1, (distance - 6) / 12));
    }
  }
  const at = (x, y) => (x < x0 || x >= x1 || y < y0 || y >= y1 ? 0 : matte[(y - y0) * width + (x - x0)]);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const texture = grainAt(source, x, y - grainRows, [x0, x1]);
      put(target, x, y, behind(x, y).map((v, k) => v + texture[k]));
    }
  }
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const alpha = at(x, y);
      if (alpha === 0) continue;
      const under = pixel(target, x, y - lift);
      put(target, x, y - lift, pixel(source, x, y).map((v, k) => under[k] * (1 - alpha) + v * alpha));
    }
  }
}

/**
 * Both of ticket 84's edits, on a copy: `image` itself is not written. `edits` is `ATTEMPT_4`
 * for the real backdrop; a test hands in its own fixture's. The rail goes first so the jamb's
 * edit reads no rail; the two never touch the same pixel.
 */
export function editEntrywayBackdrop(image, edits) {
  const out = { width: image.width, height: image.height, data: Buffer.from(image.data) };
  liftRail(image, out, edits.rail);
  moveJamb(image, out, edits.jamb);
  return out;
}

/**
 * The edits on S01 attempt-4 (1672 x 941 raw px), from design 75 §4.2 re-measured on the pixels.
 * Where the design's boxes and the pixels differ, the pixels win, and each difference is here:
 * - The jamb block is cols 290–319: the casing's inner shadow line (290–291) through its cast
 *   shadow on the wall (313–318). Moving it 26 brings the right casing from col 292 to 266, so the
 *   opening is 65–266, 201 px, 142.3 units at 0.7081. It runs from row 72, three rows over the
 *   header's top (75), whose faint shading line at row 74 would otherwise be left hanging over the
 *   new wall, and stops at row 585, the doormat's top edge; the mat is `keep`, and nothing at or
 *   below its top left of col 307 is written.
 * - The strip it leaves (294–319) is filled from row 72 to 590, the skirting's floor line, with
 *   the tone of cols 320–323 and the grain of the plain wall left of the front door, cols 3–28.
 *   §4.2's donor, cols 316–341, runs into the bench (from col 328, rows 465+), the bench's shadow
 *   on the wall and the hook rail (from col 338), so it is not used.
 * - The rail box is 336–528 x 312–373: the hook tops at 317, the plate to 358, its shadow to 364,
 *   the hooks' soft shadows to 369, and the teal door's casing from col 529. The tips measure 353
 *   (§4.2 read 352), so the lift is 156, not 155, to put them at 197.
 */
export const ATTEMPT_4 = {
  jamb: {
    columns: [290, 320], shift: 26, rows: [72, 585], fillRows: [72, 591], skirtingTop: 551,
    tone: [320, 324], grain: [3, 29], keep: [[0, 585, 307, 941]],
  },
  rail: { box: [336, 312, 529, 374], lift: 156, grainRows: 62 },
};

/** Where the edit is measured, and what it has to come to (ticket 84's acceptance criteria). */
export const TARGETS = {
  unitsPerPx: 0.7081,
  door: { width: 142, tolerance: 0.03 },
  opening: { seed: 180, rows: [110, 560] },
  tips: { y: 197, tolerance: 2 },
};

/** The two regions the contact sheet shows, before beside after, at `zoom` times, nearest-neighbour. */
const CONTACT = { zoom: 2, regions: [[200, 40, 380, 620], [320, 130, 540, 380]], gap: 16 };

/**
 * A contact sheet: one row per region, the region before the edit on the left and after it on the
 * right, each blown up `zoom` times with no smoothing, so a seam is shown as it is.
 */
export function contactSheet(before, after, { zoom, regions, gap }) {
  const panels = regions.map(([x0, y0, x1, y1]) => ({ x0, y0, width: (x1 - x0) * zoom, height: (y1 - y0) * zoom }));
  const width = gap + Math.max(...panels.map(p => p.width * 2 + gap * 2));
  const height = gap + panels.reduce((sum, p) => sum + p.height + gap, 0);
  const sheet = { width, height, data: Buffer.alloc(width * height * 4) };
  for (let at = 0; at < width * height; at++) sheet.data.set([24, 24, 24, 255], at * 4);
  let top = gap;
  for (const panel of panels) {
    [before, after].forEach((image, side) => {
      const left = gap + side * (panel.width + gap);
      for (let y = 0; y < panel.height; y++) {
        for (let x = 0; x < panel.width; x++) {
          put(sheet, left + x, top + y, pixel(image, panel.x0 + Math.floor(x / zoom), panel.y0 + Math.floor(y / zoom)));
        }
      }
    });
    top += panel.height + gap;
  }
  return sheet;
}

const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Mean luminance step between columns `a` and `a + 1` over rows [from, to). */
function columnStep(image, a, [from, to]) {
  let sum = 0;
  for (let y = from; y < to; y++) sum += Math.abs(luma(pixel(image, a, y)) - luma(pixel(image, a + 1, y)));
  return sum / (to - from);
}

/** Mean luminance step between rows `a` and `a + 1` over columns [from, to). */
function rowStep(image, a, [from, to]) {
  let sum = 0;
  for (let x = from; x < to; x++) sum += Math.abs(luma(pixel(image, x, a)) - luma(pixel(image, x, a + 1)));
  return sum / (to - from);
}

const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

/** Everything the report and the manifest quote, measured on the two images. */
export function measureEdit(before, after, edits = ATTEMPT_4, targets = TARGETS) {
  const opening = image => {
    const { left, right, width } = measureOpening(image, targets.opening);
    return { left, right, widthPx: width, widthUnits: round(width * targets.unitsPerPx, 1) };
  };
  const [x0, y0, x1, y1] = edits.rail.box;
  const lifted = [x0, y0 - edits.rail.lift, x1, y1 - edits.rail.lift];
  const openingAfter = opening(after);
  const tipsAfter = measureHookTips(after, lifted);
  const tipsBefore = measureHookTips(before, edits.rail.box);
  const [c0] = edits.jamb.tone;
  const wallRows = [110, 540];
  const strip = [edits.jamb.columns[1] - edits.jamb.shift, edits.jamb.columns[1]];
  return {
    opening: { before: opening(before), after: openingAfter },
    door: {
      widthUnits: targets.door.width,
      offBy: round((openingAfter.widthUnits - targets.door.width) / targets.door.width, 4),
      withinTolerance: Math.abs(openingAfter.widthUnits - targets.door.width) <= targets.door.width * targets.door.tolerance,
    },
    hookTips: {
      before: tipsBefore,
      after: tipsAfter,
      targetY: targets.tips.y,
      withinTolerance: tipsAfter.length === tipsBefore.length && tipsAfter.length > 0 &&
        tipsAfter.every(y => Math.abs(y - targets.tips.y) <= targets.tips.tolerance),
    },
    // The seams, as mean luminance steps; the wall's own step between two untouched neighbours
    // beside each is the yardstick. A seam that shows is a step well above its yardstick.
    seams: {
      jambStripAgainstWall: { step: round(columnStep(after, c0 - 1, wallRows)), wallOwn: round(columnStep(after, c0 + 1, wallRows)) },
      jambStripTop: {
        step: round(rowStep(after, edits.jamb.fillRows[0] - 1, strip)),
        wallOwn: round(rowStep(after, edits.jamb.fillRows[0] - 3, strip)),
      },
    },
  };
}

function parseArguments(argv) {
  const options = { input: null, out: null, manifest: null };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${argument} needs a value.`);
      return value;
    };
    if (argument === '--out') options.out = next();
    else if (argument === '--manifest') options.manifest = next();
    else if (argument.startsWith('-')) throw new Error(`Unknown argument ${argument}.`);
    else if (options.input) throw new Error('Takes one backdrop.');
    else options.input = argument;
  }
  if (!options.input) throw new Error('The attempt-4 strip-raw.png is required.');
  return options;
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const posix = path => path.replace(/\\/g, '/');

/**
 * node scripts/art/edit-entryway-backdrop.mjs <attempt-4/strip-raw.png> [--out <dir>] [--manifest <manifest.json>]
 *
 * Writes `strip.png` and `contact-2x.png` into `--out` (by default `attempt-4-edit/` beside the
 * input's own directory), prints the measurements, and with `--manifest` records the edit on the
 * S01 shot's `edits` list, replacing an earlier ticket-84 entry and touching nothing else. The input
 * is only read. Exits 1 when the opening or the tips miss their tolerance.
 */
export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const input = resolve(options.input);
  const inputBytes = readFileSync(input);
  const before = decodePng(inputBytes);
  if (before.width !== 1672 || before.height !== 941) {
    throw new Error(`Expected attempt-4's 1672x941, got ${before.width}x${before.height}.`);
  }
  const after = editEntrywayBackdrop(before, ATTEMPT_4);
  const out = resolve(options.out ?? join(dirname(dirname(input)), 'attempt-4-edit'));
  mkdirSync(out, { recursive: true });
  const stripBytes = encodePng(after);
  const contactBytes = encodePng(contactSheet(before, after, CONTACT));
  writeFileSync(join(out, 'strip.png'), stripBytes);
  writeFileSync(join(out, 'contact-2x.png'), contactBytes);
  const measured = measureEdit(before, after);

  const { opening, door, hookTips, seams } = measured;
  console.log(`${posix(join(out, 'strip.png'))}: ${after.width}x${after.height}`);
  console.log(`  opening: ${opening.before.left}-${opening.before.right} (${opening.before.widthPx} px, ${opening.before.widthUnits} u)` +
    ` -> ${opening.after.left}-${opening.after.right} (${opening.after.widthPx} px, ${opening.after.widthUnits} u);` +
    ` the one door is ${door.widthUnits} u, off by ${round(door.offBy * 100, 1)} % ${door.withinTolerance ? 'PASS' : 'FAIL'}`);
  console.log(`  hook tips: ${hookTips.before.join(', ')} -> ${hookTips.after.join(', ')}; target ${hookTips.targetY} ±${TARGETS.tips.tolerance}` +
    ` ${hookTips.withinTolerance ? 'PASS' : 'FAIL'}`);
  for (const [name, { step, wallOwn }] of Object.entries(seams)) console.log(`  seam ${name}: step ${step}, the wall's own ${wallOwn}`);
  console.log(`  contact sheet: ${posix(join(out, 'contact-2x.png'))}`);

  if (options.manifest) {
    const manifestPath = resolve(options.manifest);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const shot = manifest.shots?.find(one => one.id === 'S01');
    if (!shot) throw new Error(`No S01 shot in ${manifestPath}.`);
    const base = dirname(manifestPath);
    const entry = {
      ticket: '84',
      design: 'design/75-apartment-to-scale.md §4.2 (T4)',
      kind: 'pixel edit, no generation',
      script: 'scripts/art/edit-entryway-backdrop.mjs',
      editedAt: new Date().toISOString(),
      input: { path: posix(relative(base, input)), sha256: sha256(inputBytes) },
      output: { path: posix(relative(base, join(out, 'strip.png'))), sha256: sha256(stripBytes) },
      contactSheet: { path: posix(relative(base, join(out, 'contact-2x.png'))), sha256: sha256(contactBytes) },
      parameters: ATTEMPT_4,
      measured,
    };
    shot.edits = [...(shot.edits ?? []).filter(one => one.ticket !== '84'), entry];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`  manifest: S01 edits[] records ticket 84 in ${posix(manifestPath)}`);
  }
  return door.withinTolerance && hookTips.withinTolerance ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(`edit-entryway-backdrop: ${error.message}\n`);
    process.exit(2);
  }
}
