#!/usr/bin/env node
// Measure a painted rectangle inside a delivered image.
//
// An image generator cannot hit coordinates, so where the page depends on geometry *inside* an
// image the build measures the image rather than trusting the prompt (design/13-cinema-room.md
// §0, "Measured, not assumed"). Two kinds of image in the Cinema Room carry such geometry: the
// backdrop, whose doorway the Door link must cover and whose screen sheet the Bumper and title
// card are drawn over, and each Poster, whose frame the flat state clips to.
//
// The rectangle is grown outward from a seed pixel known to be inside it, one pixel per side per
// round, and a side stops as soon as the next line out is less than `fill` inside. Growing all
// four sides together is what keeps a figure breaking out over one edge of a Poster's frame from
// widening the frame: by the time a side reaches that edge the rectangle already spans the frame's
// other axis, and the figure never covers a whole line of it. Nothing here edits a pixel.
//
// That holds for the backdrop and fails for a Poster whose figures press against its frame, so a
// Poster is measured with `--frame` instead: the frame is found from the long straight runs of its
// paper band that the figures leave exposed (`measureFrame` below).
//
// node scripts/art/measure-rect.mjs <image.png> --inside alpha|dark:<luminance>|light:<luminance>
//   --seed <x>,<y> [--fill 0.95]
// node scripts/art/measure-rect.mjs <poster.png> --inside paper:<luminance> --frame
//
// Prints the rectangle in the image's own pixels, and as the four inset fractions a CSS
// `clip-path: inset(...)` or a percentage box wants.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { decodePng } from '../png.mjs';

/** Rec. 601 luma, the same weighting the eye gives a painted wall or a lit sheet. */
const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Turn an `--inside` rule into a pixel test. `alpha` is the drawing on a transparent ground;
 * `dark:N` and `light:N` are regions of an opaque image below or above a luminance.
 */
export function parseInside(rule) {
  if (rule === 'alpha') return (r, g, b, a) => a >= 128;
  const match = /^(dark|light|paper):(\d+(?:\.\d+)?)$/.exec(rule ?? '');
  if (!match) throw new Error(`--inside takes alpha, dark:<luminance>, light:<luminance> or paper:<luminance>, not ${rule}.`);
  const threshold = Number(match[2]);
  if (match[1] === 'dark') return (r, g, b, a) => a >= 128 && luminance(r, g, b) < threshold;
  if (match[1] === 'light') return (r, g, b, a) => a >= 128 && luminance(r, g, b) > threshold;
  // `paper` is `light` that is also nearly grey: a Poster's cream stock, and not the yellow of a
  // talisman or a lit window that is every bit as bright.
  return (r, g, b, a) => a >= 128 && luminance(r, g, b) > threshold && Math.max(r, g, b) - Math.min(r, g, b) < PAPER_CHROMA;
}

/** How far apart a pixel's channels may be and it still reads as paper (#F1E6CF is 34). */
const PAPER_CHROMA = 70;

/**
 * The rectangle around `seed` whose every edge line is at least `fill` inside.
 * Returns `{ x, y, width, height }` in pixels, x and y inclusive.
 */
export function measureRect(image, inside, { seed, fill = 0.95 }) {
  const { width, height, data } = image;
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index++) {
    const at = index * 4;
    mask[index] = inside(data[at], data[at + 1], data[at + 2], data[at + 3]) ? 1 : 0;
  }
  const [sx, sy] = seed;
  if (!(sx >= 0 && sy >= 0 && sx < width && sy < height) || !mask[sy * width + sx]) {
    throw new Error(`The seed (${sx}, ${sy}) is not inside the region being measured.`);
  }
  // Prefix sums along each row and each column, so any edge line's count is one subtraction.
  const rows = new Uint32Array((width + 1) * height);
  const columns = new Uint32Array((height + 1) * width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rows[y * (width + 1) + x + 1] = rows[y * (width + 1) + x] + mask[y * width + x];
      columns[x * (height + 1) + y + 1] = columns[x * (height + 1) + y] + mask[y * width + x];
    }
  }
  const rowFull = (y, x0, x1) => rows[y * (width + 1) + x1 + 1] - rows[y * (width + 1) + x0] >= fill * (x1 - x0 + 1);
  const columnFull = (x, y0, y1) =>
    columns[x * (height + 1) + y1 + 1] - columns[x * (height + 1) + y0] >= fill * (y1 - y0 + 1);

  let [x0, y0, x1, y1] = [sx, sy, sx, sy];
  const open = { left: true, right: true, top: true, bottom: true };
  while (open.left || open.right || open.top || open.bottom) {
    if (open.left) { if (x0 > 0 && columnFull(x0 - 1, y0, y1)) x0--; else open.left = false; }
    if (open.right) { if (x1 < width - 1 && columnFull(x1 + 1, y0, y1)) x1++; else open.right = false; }
    if (open.top) { if (y0 > 0 && rowFull(y0 - 1, x0, x1)) y0--; else open.top = false; }
    if (open.bottom) { if (y1 < height - 1 && rowFull(y1 + 1, x0, x1)) y1++; else open.bottom = false; }
  }
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/**
 * The frame round a painting, found from the band of `inside` (a Poster's paper stock) that
 * borders it, when figures in front of the frame hide much of that band.
 *
 * Every run of `inside` pixels at least `minRun` of the image long, down a column or along a row,
 * votes for that column or row with its length; no painted figure draws a straight line that
 * long, and what is left exposed of the band does. Each side is then the **outermost** line on its
 * half of the image that polled at least `keep` of that side's best line: the band is several
 * pixels thick, and its outer edge is the frame. Returns `{ x, y, width, height }` like
 * `measureRect`, and refuses an image in which some side found no line at all.
 */
export function measureFrame(image, inside, { minRun = 0.04, keep = 0.5 } = {}) {
  const { width, height, data } = image;
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index++) {
    const at = index * 4;
    mask[index] = inside(data[at], data[at + 1], data[at + 2], data[at + 3]) ? 1 : 0;
  }
  const columns = new Float64Array(width);
  const rows = new Float64Array(height);
  const longColumn = minRun * height;
  const longRow = minRun * width;
  for (let x = 0; x < width; x++) {
    let run = 0;
    for (let y = 0; y <= height; y++) {
      if (y < height && mask[y * width + x]) run++;
      else { if (run >= longColumn) columns[x] += run; run = 0; }
    }
  }
  for (let y = 0; y < height; y++) {
    let run = 0;
    for (let x = 0; x <= width; x++) {
      if (x < width && mask[y * width + x]) run++;
      else { if (run >= longRow) rows[y] += run; run = 0; }
    }
  }
  // `lines` runs from the image's edge inward, so the first strong one is the outermost.
  const outermost = (votes, lines, name) => {
    const best = Math.max(...lines.map(index => votes[index]));
    if (!(best > 0)) throw new Error(`No straight edge found for the frame's ${name} side.`);
    return lines.find(index => votes[index] >= keep * best);
  };
  const span = (from, to) => Array.from({ length: to - from }, (_, offset) => from + offset);
  const halfWidth = Math.floor(width / 2);
  const halfHeight = Math.floor(height / 2);
  const left = outermost(columns, span(0, halfWidth), 'left');
  const right = outermost(columns, span(halfWidth, width).reverse(), 'right');
  const top = outermost(rows, span(0, halfHeight), 'top');
  const bottom = outermost(rows, span(halfHeight, height).reverse(), 'bottom');
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** The rectangle as the four `inset()` fractions of its image, rounded to four places. */
export function insetFractions(rect, { width, height }) {
  const round = value => Math.round(value * 10000) / 10000;
  return {
    top: round(rect.y / height),
    right: round((width - rect.x - rect.width) / width),
    bottom: round((height - rect.y - rect.height) / height),
    left: round(rect.x / width),
  };
}

export function main(argv = process.argv.slice(2)) {
  let input = null;
  let rule = null;
  let seed = null;
  let fill = 0.95;
  let frame = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${argument} needs a value.`);
      return value;
    };
    if (argument === '--inside') rule = next();
    else if (argument === '--frame') frame = true;
    else if (argument === '--fill') fill = Number(next());
    else if (argument === '--seed') {
      const match = /^(\d+),(\d+)$/.exec(next());
      if (!match) throw new Error('--seed takes <x>,<y>.');
      seed = [Number(match[1]), Number(match[2])];
    } else if (argument.startsWith('-')) throw new Error(`Unknown argument ${argument}.`);
    else input = argument;
  }
  if (!input || !rule) throw new Error('Usage: measure-rect.mjs <image.png> --inside <rule> [--seed x,y] [--fill 0.95] | --frame');
  const image = decodePng(readFileSync(resolve(input)));
  const rect = frame
    ? measureFrame(image, parseInside(rule))
    : measureRect(image, parseInside(rule), { seed: seed ?? [Math.floor(image.width / 2), Math.floor(image.height / 2)], fill });
  const result = {
    image: input, size: `${image.width}x${image.height}`, inside: rule, ...(frame ? { method: 'frame' } : { fill }),
    rect, inset: insetFractions(rect, image),
  };
  console.log(JSON.stringify(result));
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}
