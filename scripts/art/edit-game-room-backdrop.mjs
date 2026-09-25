#!/usr/bin/env node
// Two pixel edits on the Game Room backdrop S01, made by code (ticket 87, design 75 §4.3, "T7").
//
// Scaled whole by 0.88, the painting's doorway comes to the one door's height (350 units) but not
// its width: 174 units against 142. And its painted cat bed, Luna's mark, is 94 cm across when a
// real one is 40-70. Neither is worth a generation. The owner's rule is to shrink an asset whose
// proportions are right and regenerate only when that is necessary, and both faults are geometry:
//
// 1. The doorway. The right-hand casing sits on a plain wall, so it is moved left across the
//    opening and the columns it vacates are filled with the wall and skirting from the columns
//    beside them. Every row from the top of the painting moves, so no seam runs across the wall,
//    and so do the few floor rows under the casing's foot, which the painter lit a little
//    lighter: the patch goes with the foot instead of staying behind on open floor.
// 2. The cat bed. Found by its colour, scaled about its bottom-centre, and set down on a floor,
//    skirting and wall rebuilt behind it from the columns either side. The planks, the skirting
//    and the wall's edges all run horizontally, so a column clone continues them; a per-row
//    ramp between the two sides carries the lamp's glow across.
//
// Nothing here generates or retouches by hand. It reads attempt-1 in the main checkout's effort
// directory (generated art never enters a worktree), refuses it unless its sha256 is the one the
// generation manifest recorded, writes `attempt-1-edit/` beside it — the edited backdrop, a
// before-and-after contact sheet at 2x and `metrics.json` — and records the edit additively in
// the manifest (a backup of the manifest is kept the first time). Attempt-1 is never written.
// It exits 1 without writing anything when the doorway misses 142 units +/- 3 %, the bed misses
// 70 cm +/- 10 %, or an edge of either edit measures as a seam.
//
//   node scripts/art/edit-game-room-backdrop.mjs --source <.../41-game-room/s01-room/attempt-1/strip-raw.png>
//     [--manifest <.../41-game-room/manifest.json>]

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { decodePng, encodePng } from '../png.mjs';

/**
 * Where the two edits fall on S01 attempt-1, in its raw px (1672 x 940), measured by colour
 * scans on 2026-09-26 against design 75 §4.3's boxes, which are good to +/- 2 px.
 */
export const S01 = {
  width: 1672,
  height: 940,
  // Today's stage is the painting contain-fitted to 1600 units; design 75 scales the Room by 0.88.
  unitsPerRawPx: 1600 / 1672,
  stageScale: 0.88,
  cmPerUnit: 0.6,
  doorway: {
    // The right casing is 276-300 at mid height, with its shading one column either side and the
    // shadow it casts on the wall to 304. 38 px brings the opening from 206 to 168 raw px.
    strip: [274, 304],
    shift: 38,
    // The painting's top down to row 569: the casing ends at 562, and rows 563-569 are the
    // lighter floor under its foot.
    rows: [0, 569],
    // The painted wall is smooth enough that a hard cut between two unrelated columns measures
    // 2.1-2.6 times its own grain; cross-fading each side edge over 8 columns brings it to 1.
    feather: 8,
    measure: { rows: [200, 500], probe: 150 },
    target: { units: 142, tolerance: 0.03 },
  },
  bed: {
    // The bed is 1116-1303 x 531-612 with its outline and shadow to 1109 and 617; the box keeps a
    // clean margin of room on every side and stops eight rows above the rug, which starts at 633,
    // so the seam check on its bottom edge measures planks and not the rug.
    box: [1090, 516, 1330, 624],
    factor: 0.75,
    target: { cm: 70, tolerance: 0.1 },
  },
  // The luma step across an edit's edge, against the painting's own grain beside it.
  seamLimit: 2,
};

/** The painted bed's pink: red well above green, green close to blue (the planks' green is not). */
export const isBedPixel = ([r, g, b]) => r - g > 28 && g - b < 16;

/** Rec. 601 luma. */
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const luminance = (data, index) => luma(data[index], data[index + 1], data[index + 2]);

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/**
 * The doorway's opening between the inner edges of its two casings, as the median over `rows`
 * (inclusive) of a scan outward from `probe`, a column inside the opening. `left` is the first
 * opening column, `right` the first column of the right-hand casing. A casing is anything at or
 * above `threshold` luma; the dark opening and its shaded jamb reveal are below it.
 */
export function measureOpening(image, { rows: [top, bottom], probe, threshold = 44 }) {
  const lefts = [];
  const rights = [];
  for (let y = top; y <= bottom; y++) {
    const at = x => luminance(image.data, (y * image.width + x) * 4);
    let left = probe;
    while (left > 0 && at(left - 1) < threshold) left--;
    let right = probe;
    while (right < image.width && at(right) < threshold) right++;
    lefts.push(left);
    rights.push(right);
  }
  const left = median(lefts);
  const right = median(rights);
  return { left, right, width: right - left };
}

/**
 * Move the casing columns `strip` (inclusive) left by `shift`, over `rows` (inclusive), and fill
 * the columns it vacates from the `shift` columns right of it: one block move of the casing and
 * the wall beside it. With `feather`, the moved block also cross-fades into the painting over
 * that many columns beyond each of its two side edges, so a smooth painted wall shows no cut.
 * Returns a new image; the source is not touched.
 */
export function narrowDoorway(image, { strip: [first, last], shift, rows: [top, bottom], feather = 0 }) {
  const out = { width: image.width, height: image.height, data: Buffer.from(image.data) };
  const start = first - shift;
  for (let y = top; y <= bottom; y++) {
    const row = y * image.width * 4;
    image.data.copy(out.data, row + start * 4, row + first * 4, row + (last + shift + 1) * 4);
    for (let k = 1; k <= feather; k++) {
      // `t` is the moved block's share: it falls off from the block's edge outward on both sides.
      const t = 1 - k / (feather + 1);
      for (const x of [start - k, last + k]) {
        for (let c = 0; c < 3; c++) {
          const here = image.data[row + x * 4 + c];
          const moved = image.data[row + (x + shift) * 4 + c];
          out.data[row + x * 4 + c] = Math.round(moved * t + here * (1 - t));
        }
      }
    }
  }
  return out;
}

/**
 * How much an edit's edge stands out: the mean luma step across the line in front of `at` (the
 * column `at` against `at - 1` for `axis: 'x'`, the row for `'y'`), over the span `along`
 * (inclusive), divided by the mean step between neighbouring lines two to six away on either
 * side. The painting's own grain scores about 1; a seam scores several times that.
 */
export function seamContrast(image, { axis, at, along: [from, to] }) {
  const lines = axis === 'x' ? image.width : image.height;
  if (at - 7 < 0 || at + 6 >= lines) throw new Error(`A seam at ${axis} ${at} needs six lines either side inside the image.`);
  const lumaAt = axis === 'x' ? (k, t) => luminance(image.data, (t * image.width + k) * 4) : (k, t) => luminance(image.data, (k * image.width + t) * 4);
  const step = k => {
    let total = 0;
    for (let t = from; t <= to; t++) total += Math.abs(lumaAt(k, t) - lumaAt(k - 1, t));
    return total / (to - from + 1);
  };
  const beside = [-6, -5, -4, -3, -2, 2, 3, 4, 5, 6].map(offset => step(at + offset));
  const baseline = beside.reduce((total, one) => total + one, 0) / beside.length;
  return step(at) / Math.max(baseline, 0.5);
}

const rgbAt = (image, x, y) => {
  const index = (y * image.width + x) * 4;
  return [image.data[index], image.data[index + 1], image.data[index + 2]];
};

/**
 * The inclusive bounding box of the feature inside `box` (`[x0, y0, x1, y1]`, inclusive): the
 * largest 8-connected run of pixels `isFeature([r, g, b])` accepts, so a stray pixel of the right
 * colour elsewhere in the box cannot widen it. Throws when there is none.
 */
export function measureFeature(image, { box, isFeature }) {
  const { width, height, on } = featureMask(image, { box, isFeature });
  const bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!on[y * width + x]) continue;
      bounds.x0 = Math.min(bounds.x0, x);
      bounds.x1 = Math.max(bounds.x1, x);
      bounds.y0 = Math.min(bounds.y0, y);
      bounds.y1 = Math.max(bounds.y1, y);
    }
  }
  return { x0: bounds.x0 + box[0], y0: bounds.y0 + box[1], x1: bounds.x1 + box[0], y1: bounds.y1 + box[1] };
}

/** The feature's largest 8-connected component inside `box`, as a box-local 0/1 mask. */
function featureMask(image, { box: [x0, y0, x1, y1], isFeature }) {
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const hit = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) hit[y * width + x] = isFeature(rgbAt(image, x + x0, y + y0)) ? 1 : 0;
  }
  const label = new Int32Array(width * height);
  let best = { id: 0, size: 0 };
  for (let start = 0, id = 0; start < hit.length; start++) {
    if (!hit[start] || label[start]) continue;
    label[start] = ++id;
    const stack = [start];
    let size = 0;
    while (stack.length) {
      const at = stack.pop();
      size++;
      const ax = at % width;
      const ay = (at - ax) / width;
      for (let ny = Math.max(0, ay - 1); ny <= Math.min(height - 1, ay + 1); ny++) {
        for (let nx = Math.max(0, ax - 1); nx <= Math.min(width - 1, ax + 1); nx++) {
          const near = ny * width + nx;
          if (hit[near] && !label[near]) {
            label[near] = id;
            stack.push(near);
          }
        }
      }
    }
    if (size > best.size) best = { id, size };
  }
  if (!best.size) throw new Error(`No feature pixel in the box ${x0},${y0}-${x1},${y1}.`);
  const on = new Uint8Array(width * height);
  for (let index = 0; index < on.length; index++) on[index] = label[index] === best.id ? 1 : 0;
  return { width, height, on };
}

/**
 * The room behind `box` with the feature taken out, as box-local float RGB: each row cloned from
 * the same row one box-width to the left, plus a ramp from the left edge's mismatch to the right
 * edge's, each measured over `probe` columns outside that side and smoothed over `smooth` rows
 * either way. Every row stays on its own row, so horizontal structure — planks, skirting, the
 * wall's edge — continues; the ramp is the light changing across the box.
 */
function roomBehind(image, { box: [x0, y0, x1, y1], probe = 4, smooth = 2 }) {
  const span = x1 - x0 + 1;
  const rows = y1 - y0 + 1;
  if (x0 - span - probe < 0 || x1 + probe >= image.width) {
    throw new Error(`The box ${x0},${y0}-${x1},${y1} needs ${span + probe} columns left of it to clone from.`);
  }
  const mismatch = (y, side) => {
    const sum = [0, 0, 0];
    for (let k = 1; k <= probe; k++) {
      const x = side < 0 ? x0 - k : x1 + k;
      const real = rgbAt(image, x, y);
      const clone = rgbAt(image, x - span, y);
      for (let c = 0; c < 3; c++) sum[c] += (real[c] - clone[c]) / probe;
    }
    return sum;
  };
  const edges = Array.from({ length: rows }, (_, y) => [mismatch(y0 + y, -1), mismatch(y0 + y, 1)]);
  const ramp = edges.map((_, y) => {
    const around = edges.slice(Math.max(0, y - smooth), y + smooth + 1);
    return [0, 1].map(side => [0, 1, 2].map(c => around.reduce((total, one) => total + one[side][c], 0) / around.length));
  });
  const rgb = new Float32Array(span * rows * 3);
  for (let y = 0; y < rows; y++) {
    const [left, right] = ramp[y];
    for (let x = 0; x < span; x++) {
      const t = span === 1 ? 0 : x / (span - 1);
      const clone = rgbAt(image, x0 + x - span, y0 + y);
      for (let c = 0; c < 3; c++) rgb[(y * span + x) * 3 + c] = clone[c] + left[c] * (1 - t) + right[c] * t;
    }
  }
  return rgb;
}

/** Chebyshev distance from the nearest `on` pixel, capped at `limit + 1`. */
function distanceFrom({ width, height, on }, limit) {
  const distance = new Uint8Array(width * height).fill(limit + 1);
  for (let index = 0; index < on.length; index++) if (on[index]) distance[index] = 0;
  for (let step = 1; step <= limit; step++) {
    const previous = Uint8Array.from(distance);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (previous[y * width + x] <= step) continue;
        search: for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
          for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
            if (previous[ny * width + nx] === step - 1) {
              distance[y * width + x] = step;
              break search;
            }
          }
        }
      }
    }
  }
  return distance;
}

/** Bilinear sample of a box-local plane read through `read(x, y) -> number[]`, clamped at its edges. */
function bilinear(width, height, x, y, read) {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const tx = x - fx;
  const ty = y - fy;
  let result = null;
  for (const [dx, dy, weight] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
    const value = read(Math.min(width - 1, Math.max(0, fx + dx)), Math.min(height - 1, Math.max(0, fy + dy)));
    result ??= value.map(() => 0);
    value.forEach((channel, c) => (result[c] += channel * weight));
  }
  return result;
}

/**
 * Shrink the feature inside `box` by `factor` about its bottom-centre and rebuild the room it no
 * longer covers. The feature is the largest connected run of `isFeature` pixels, filled across
 * each row (so the dark seams inside it come along), taken `grow` pixels further to bring its
 * outline and contact shadow, and faded out over `feather` more. The rest of the box becomes the
 * rebuilt room, blended into the untouched image over the box's outer `border` pixels, so the box
 * must hold nothing but room within that border. Returns a new image.
 */
export function shrinkFeature(image, { box, factor, isFeature, grow = 4, feather = 3, border = 4 }) {
  const [x0, y0] = box;
  const mask = featureMask(image, { box, isFeature });
  const { width, height, on } = mask;
  for (let y = 0; y < height; y++) {
    const row = on.subarray(y * width, (y + 1) * width);
    const first = row.indexOf(1);
    if (first >= 0) row.fill(1, first, row.lastIndexOf(1) + 1);
  }
  const bounds = measureFeature(image, { box, isFeature });
  const anchorX = (bounds.x0 + bounds.x1 + 1) / 2 - x0;
  const anchorY = bounds.y1 + 1 - y0;

  const distance = distanceFrom(mask, grow + feather);
  const alpha = Float32Array.from(distance, d => (d <= grow ? 1 : d > grow + feather ? 0 : (grow + feather + 1 - d) / (feather + 1)));
  const room = roomBehind(image, { box });

  const out = { width: image.width, height: image.height, data: Buffer.from(image.data) };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inset = Math.min(x, y, width - 1 - x, height - 1 - y);
      const keep = inset >= border ? 1 : (inset + 1) / (border + 1);
      const original = rgbAt(image, x + x0, y + y0);
      const behind = original.map((channel, c) => channel * (1 - keep) + room[(y * width + x) * 3 + c] * keep);
      // Where this pixel came from before the shrink, in box-local pixel centres.
      const sx = anchorX + (x + 0.5 - anchorX) / factor - 0.5;
      const sy = anchorY + (y + 0.5 - anchorY) / factor - 0.5;
      const inside = sx > -1 && sy > -1 && sx < width && sy < height;
      const [a] = inside ? bilinear(width, height, sx, sy, (px, py) => [alpha[py * width + px]]) : [0];
      let colour = behind;
      if (a > 0) {
        const read = (px, py) => [on[py * width + px], ...rgbAt(image, px + x0, py + y0), ...room.subarray((py * width + px) * 3, (py * width + px) * 3 + 3)];
        const [core, r, g, b, roomR, roomG, roomB] = bilinear(width, height, sx, sy, read);
        // The feature's own pixels come along as they are. Its halo — outline and contact shadow
        // — comes along as the darkening it put on the room there, applied to the room here, so
        // the skirting it stood in front of is not carried down onto the floor.
        const shade = Math.min(1, luma(r, g, b) / Math.max(1, luma(roomR, roomG, roomB)));
        colour = [r, g, b].map((channel, c) => channel * core + behind[c] * shade * (1 - core));
      }
      const index = ((y + y0) * image.width + x + x0) * 4;
      for (let c = 0; c < 3; c++) out.data[index + c] = Math.round(Math.min(255, Math.max(0, behind[c] * (1 - a) + colour[c] * a)));
    }
  }
  return out;
}

/** The regions the contact sheet shows, before beside after, at 2x with no smoothing. */
const CONTACT = { zoom: 2, gap: 16, background: [32, 32, 32], regions: [[20, 90, 380, 600], [1060, 480, 1360, 650]] };

/** Before and after side by side, one row per region, nearest-neighbour at `zoom`. */
export function contactSheet(before, after, { zoom, gap, background, regions } = CONTACT) {
  const sizes = regions.map(([x0, y0, x1, y1]) => [(x1 - x0) * zoom, (y1 - y0) * zoom]);
  const width = gap + 2 * (Math.max(...sizes.map(([w]) => w)) + gap);
  const height = gap + sizes.reduce((total, [, h]) => total + h + gap, 0);
  const sheet = { width, height, data: Buffer.alloc(width * height * 4) };
  for (let index = 0; index < width * height; index++) sheet.data.set([...background, 255], index * 4);
  let top = gap;
  regions.forEach(([x0, y0], row) => {
    const [w, h] = sizes[row];
    [before, after].forEach((image, column) => {
      const left = gap + column * (w + gap);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const from = ((y0 + Math.floor(y / zoom)) * image.width + x0 + Math.floor(x / zoom)) * 4;
          image.data.copy(sheet.data, ((top + y) * width + left + x) * 4, from, from + 3);
        }
      }
    });
    top += h + gap;
  });
  return sheet;
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const round = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

export function parseArguments(argv) {
  const options = { source: null, manifest: null };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--source' && value) options.source = resolve(argv[++index]);
    else if (flag === '--manifest' && value) options.manifest = resolve(argv[++index]);
    else throw new Error(`Unknown or incomplete argument ${flag}. Usage: --source <attempt-1/strip-raw.png> [--manifest <manifest.json>]`);
  }
  if (!options.source) {
    throw new Error('--source is required: S01 attempt-1 lives in the main checkout, under .scratch/<effort>/art/generated/41-game-room/s01-room/.');
  }
  // <shot dir>/<attempt>/strip-raw.png, with the manifest at the generation directory's root.
  options.manifest ??= join(dirname(dirname(dirname(options.source))), 'manifest.json');
  return options;
}

/** Everything the edit measured, in raw px and in the units design 75 quotes. */
function measure(before, after) {
  const { unitsPerRawPx, stageScale, cmPerUnit, doorway, bed, seamLimit } = S01;
  const units = rawPx => rawPx * unitsPerRawPx * stageScale;
  const opening = image => {
    const { left, right, width } = measureOpening(image, doorway.measure);
    return { rawPx: width, left, right, units1600: round(width * unitsPerRawPx), stageUnits: round(units(width)), cm: round(units(width) * cmPerUnit) };
  };
  const cat = image => {
    const box = measureFeature(image, { box: bed.box, isFeature: isBedPixel });
    const rawPx = box.x1 - box.x0 + 1;
    return { rawPx, box: [box.x0, box.y0, box.x1, box.y1], bottom: box.y1, centre: (box.x0 + box.x1 + 1) / 2, cm: round(units(rawPx) * cmPerUnit) };
  };
  const [bx0, by0, bx1, by1] = bed.box;
  const [first, last] = doorway.strip;
  const moved = first - doorway.shift;
  const feather = doorway.feather ?? 0;
  // A feathered edge is every line across its blend, and the worst of them is the one quoted.
  const seams = [
    { where: 'doorway fill against the untouched wall', axis: 'x', at: last + 1, through: last + feather + 1, along: doorway.rows },
    { where: 'moved casing strip against the wall above the lintel', axis: 'x', at: moved - feather, through: moved, along: [0, 115] },
    { where: 'doorway edit against the floor below it', axis: 'y', at: doorway.rows[1] + 1, along: [moved - feather, last + feather] },
    { where: 'bed box, left', axis: 'x', at: bx0, along: [by0, by1] },
    { where: 'bed box, right', axis: 'x', at: bx1 + 1, along: [by0, by1] },
    { where: 'bed box, top', axis: 'y', at: by0, along: [bx0, bx1] },
    { where: 'bed box, bottom', axis: 'y', at: by1 + 1, along: [bx0, bx1] },
  ].map(({ through, ...seam }) => {
    const lines = Array.from({ length: (through ?? seam.at) - seam.at + 1 }, (_, k) => seam.at + k);
    const contrast = round(Math.max(...lines.map(at => seamContrast(after, { ...seam, at }))), 2);
    return { ...seam, ...(through === undefined ? {} : { through }), contrast, pass: contrast <= seamLimit };
  });
  const door = { before: opening(before), after: opening(after), target: `${doorway.target.units} units +/- ${doorway.target.tolerance * 100} %` };
  door.pass = Math.abs(door.after.stageUnits / doorway.target.units - 1) <= doorway.target.tolerance;
  const shrunk = { before: cat(before), after: cat(after), target: `${bed.target.cm} cm +/- ${bed.target.tolerance * 100} %` };
  shrunk.pass = Math.abs(shrunk.after.cm / bed.target.cm - 1) <= bed.target.tolerance;
  return { opening: door, bed: shrunk, seams, seamLimit };
}

export function main(argv = process.argv.slice(2), io = console) {
  const options = parseArguments(argv);
  const sourceBytes = readFileSync(options.source);
  const sourceSha = sha256(sourceBytes);
  const manifest = JSON.parse(readFileSync(options.manifest, 'utf8'));
  const runId = basename(dirname(options.source));
  const shot = manifest.shots?.find(one => one.id === 'S01');
  const attempt = shot?.attempts?.find(one => one.runId === runId);
  if (!attempt || attempt.imageSha256 !== sourceSha) {
    throw new Error(`${options.source} is not S01 ${runId} as ${options.manifest} records it (sha256 ${sourceSha}, recorded ${attempt?.imageSha256 ?? 'nothing'}).`);
  }
  const before = decodePng(sourceBytes);
  if (before.width !== S01.width || before.height !== S01.height) {
    throw new Error(`S01 is ${S01.width}x${S01.height} raw px and this is ${before.width}x${before.height}: the edit's boxes do not apply.`);
  }

  const door = narrowDoorway(before, S01.doorway);
  const after = shrinkFeature(door, { box: S01.bed.box, factor: S01.bed.factor, isFeature: isBedPixel });
  const measured = measure(before, after);
  const { opening, bed, seams } = measured;
  io.log(`doorway: ${opening.before.rawPx} -> ${opening.after.rawPx} raw px = ${opening.after.units1600} of today's units = ${opening.after.stageUnits} units at x ${S01.stageScale} (${opening.after.cm} cm); target ${opening.target}: ${opening.pass ? 'PASS' : 'FAIL'}`);
  io.log(`cat bed: ${bed.before.rawPx} -> ${bed.after.rawPx} raw px = ${bed.before.cm} -> ${bed.after.cm} cm across, bottom row ${bed.before.bottom} -> ${bed.after.bottom}; target ${bed.target}: ${bed.pass ? 'PASS' : 'FAIL'}`);
  for (const seam of seams) io.log(`seam ${seam.axis} ${seam.at} (${seam.where}): ${seam.contrast} ${seam.pass ? 'ok' : `FAIL, over ${S01.seamLimit}`}`);
  if (!opening.pass || !bed.pass || !seams.every(seam => seam.pass)) {
    io.error('Not written: the edit misses its target or shows a seam.');
    return 1;
  }

  const outDir = join(dirname(dirname(options.source)), `${runId}-edit`);
  if (resolve(outDir) === resolve(dirname(options.source))) throw new Error('Refusing to write into the source attempt.');
  mkdirSync(outDir, { recursive: true });
  const outBytes = encodePng(after);
  const sheetBytes = encodePng(contactSheet(before, after));
  writeFileSync(join(outDir, 'strip-raw.png'), outBytes);
  writeFileSync(join(outDir, 'contact-2x.png'), sheetBytes);

  const root = dirname(options.manifest);
  const relative = path => path.slice(root.length + 1).replace(/\\/g, '/');
  const madeAt = new Date().toISOString();
  const edit = {
    runId: `${runId}-edit`,
    ticket: '87',
    madeBy: 'scripts/art/edit-game-room-backdrop.mjs',
    madeAt,
    generation: 'none: two pixel edits by a committed script',
    from: relative(options.source),
    fromSha256: sourceSha,
    image: relative(join(outDir, 'strip-raw.png')),
    imageSha256: sha256(outBytes),
    contactSheet: relative(join(outDir, 'contact-2x.png')),
    contactSheetSha256: sha256(sheetBytes),
    edits: [
      `doorway: right casing raw x ${S01.doorway.strip.join('-')} moved left ${S01.doorway.shift} px over rows ${S01.doorway.rows.join('-')}, the vacated columns cloned from the wall beside them`,
      `cat bed: scaled x ${S01.bed.factor} about its bottom-centre inside raw box ${S01.bed.box.join(',')}, the uncovered ring rebuilt from the columns either side`,
    ],
    measured: { opening, bed },
  };
  const { measured: _, ...provenance } = edit;
  writeFileSync(join(outDir, 'metrics.json'), `${JSON.stringify({ ...provenance, ...measured }, null, 2)}\n`);

  const backup = join(root, 'manifest.pre-edit-87.json');
  if (!existsSync(backup)) copyFileSync(options.manifest, backup);
  shot.edits = [...(shot.edits ?? []).filter(one => one.runId !== edit.runId), edit];
  const revision = { date: madeAt.slice(0, 10), what: `pixel edit, no generation: S01 ${edit.runId} (ticket 87)`, edit: `S01/${edit.runId}`, backup: basename(backup) };
  manifest.revisions = [...(manifest.revisions ?? []).filter(one => one.edit !== revision.edit), revision];
  writeFileSync(options.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  io.log(`wrote ${outDir} (strip-raw.png, contact-2x.png, metrics.json); ${basename(options.manifest)} records S01 ${edit.runId}, and S01 still keeps ${shot.kept}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(`edit-game-room-backdrop: ${error.message}\n`);
    process.exit(2);
  }
}
