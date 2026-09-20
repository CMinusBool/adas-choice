#!/usr/bin/env node
// Cut a static Room asset out of a raw generation: a backdrop, a furniture group, a Breakable, a
// tableau, or a static-object sprite sheet (a boombox's off/on cells, a door leaf's shut/open
// cells) — anything a Room's design note gives a fixed pixel box that is not an Actor Cycle.
//
// `build-cycle.mjs` is the Cycle contract's own tool: it fixes an Actor's frame box from its
// filename, forbids mirroring the cats, and — because a walk sheet's frames sit side by side with
// nothing between them — fails a frame whose content touches the frame's left or right edge as
// "edge-bleed". None of that fits a single Prop image with no neighbouring cell to bleed into, or
// a two-cell static object whose filename carries no Actor. This script reuses the same masking
// and one-shared-scale arithmetic (`buildMask`, `cellRegions`, `measureCell`, `MARGIN`, `assemble`,
// all imported from `build-cycle.mjs` rather than re-derived) but seats content on whichever edge
// the shot calls out — bottom, for anything the design note says stands on the floor or a shelf, or
// centred, for a wall-mounted or free-floating object — and never fails a shot for touching a
// horizontal edge that has nothing beside it. Nothing here invents a pixel: a shot's own composition
// decides what is content and what is ground, and the only thing this script computes is where a
// crop line falls and by how much everything scales.
//
// node scripts/art/build-prop.mjs <strip.png> --out <file.png> --frame <W>x<H>
//   [--frames 1] [--columns 1] [--seat bottom|centre] [--fit content|contain] [--key '#00FF00' | alpha]
//
// `--fit content` (the default) finds the tight alpha bounding box per cell and scales it, exactly
// as `build-cycle.mjs` does for a Cycle frame — right for anything generated with transparent
// margin around a single, static pose. `--fit contain` instead scales the *whole* raw cell
// rectangle down or up to fit the target box, preserving every pixel's position relative to its
// neighbours without hunting for a content edge — the only correct choice for a Beat like A-S15,
// whose figure deliberately moves between cells: finding "the content" per cell and re-centring it
// would flatten that motion, which is exactly the mistake the Cycle contract's bottom-seat would
// make here.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { blank, decodePng, encodePng } from '../png.mjs';
import { buildMask, cellRegions, measureCell, assemble, MARGIN } from './build-cycle.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

export function parseArguments(argv) {
  const options = {
    input: null, out: null, frames: 1, columns: 1, frame: null,
    seat: 'bottom', fit: 'content', key: null, mask: 'auto', metrics: null,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${argument} needs a value.`);
      return value;
    };
    if (argument === '--out' || argument === '-o') options.out = next();
    else if (argument === '--frames') options.frames = Number(next());
    else if (argument === '--columns' || argument === '--cols') options.columns = Number(next());
    else if (argument === '--seat') options.seat = next();
    else if (argument === '--fit') options.fit = next();
    else if (argument === '--metrics') options.metrics = next();
    else if (argument === '--key') {
      const value = next();
      if (value === 'alpha') options.mask = 'alpha';
      else { options.mask = 'key'; options.key = value; }
    } else if (argument === '--frame') {
      const match = /^(\d+)x(\d+)$/.exec(next());
      if (!match) throw new Error('--frame takes <width>x<height>, for example 760x600.');
      options.frame = { width: Number(match[1]), height: Number(match[2]) };
    } else if (argument.startsWith('-')) throw new Error(`Unknown argument ${argument}.`);
    else if (options.input) throw new Error('Takes one strip.');
    else options.input = argument;
  }
  if (!options.input) throw new Error('A raw strip is required.');
  if (!options.out) throw new Error('--out <file.png> is required.');
  if (!options.frame) throw new Error('--frame <W>x<H> is required.');
  if (!['bottom', 'centre'].includes(options.seat)) throw new Error('--seat is bottom or centre.');
  if (!['content', 'contain'].includes(options.fit)) throw new Error('--fit is content or contain.');
  return options;
}

/** Same averaging `build-cycle.mjs`'s `renderFrame` uses, seating on either edge instead of always the bottom. */
export function renderContent(image, mask, cell, { frame, scale, seat }) {
  const out = blank(frame.width, frame.height);
  if (cell.empty) return out;
  const [bx0, by0] = cell.bbox;
  const sourceWidth = cell.width;
  const sourceHeight = cell.height;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const offsetX = Math.round((frame.width - width) / 2);
  const offsetY = seat === 'bottom' ? frame.height - height : Math.round((frame.height - height) / 2);
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const sx0 = bx0 + (dx / width) * sourceWidth;
      const sx1 = bx0 + ((dx + 1) / width) * sourceWidth;
      const sy0 = by0 + (dy / height) * sourceHeight;
      const sy1 = by0 + ((dy + 1) / height) * sourceHeight;
      let red = 0, green = 0, blue = 0, covered = 0, samples = 0;
      for (let sy = Math.floor(sy0); sy < Math.min(Math.ceil(sy1), image.height); sy++) {
        for (let sx = Math.floor(sx0); sx < Math.min(Math.ceil(sx1), image.width); sx++) {
          samples++;
          if (!mask[sy * image.width + sx]) continue;
          const at = (sy * image.width + sx) * 4;
          red += image.data[at]; green += image.data[at + 1]; blue += image.data[at + 2];
          covered++;
        }
      }
      if (!covered || !samples) continue;
      const alpha = Math.round((255 * covered) / samples);
      if (alpha === 0) continue;
      const at = ((offsetY + dy) * frame.width + offsetX + dx) * 4;
      out.data[at] = Math.round(red / covered);
      out.data[at + 1] = Math.round(green / covered);
      out.data[at + 2] = Math.round(blue / covered);
      out.data[at + 3] = alpha;
    }
  }
  return out;
}

/**
 * `--fit contain`: the whole raw cell rectangle, scaled to fit without hunting for a content edge.
 *
 * Coverage over the same binary mask `buildMask` gives `renderContent`, not a weighted average of
 * the source's own alpha: a generation's soft-alpha interior sits at 250-254, not a clean 255 (both
 * kept A-S15 attempts measured this), and averaging that continuous channel across a several-pixel
 * sample window carries the imprecision straight into the delivered sheet as sheet-wide intermediate
 * alpha. Thresholding to a mask first and rebuilding alpha from how much of each destination pixel
 * the mask covers is what makes every other sheet in this drop binary; a Beat gets the same
 * treatment, just without the content-bbox re-centring that would flatten its motion.
 */
export function renderWholeCell(image, mask, region, { frame, seat }) {
  const out = blank(frame.width, frame.height);
  const sourceWidth = region.x1 - region.x0;
  const sourceHeight = region.y1 - region.y0;
  const scale = Math.min(frame.width / sourceWidth, frame.height / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const offsetX = Math.round((frame.width - width) / 2);
  const offsetY = seat === 'bottom' ? frame.height - height : Math.round((frame.height - height) / 2);
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const sx0 = region.x0 + (dx / width) * sourceWidth;
      const sx1 = region.x0 + ((dx + 1) / width) * sourceWidth;
      const sy0 = region.y0 + (dy / height) * sourceHeight;
      const sy1 = region.y0 + ((dy + 1) / height) * sourceHeight;
      let red = 0, green = 0, blue = 0, covered = 0, samples = 0;
      for (let sy = Math.floor(sy0); sy < Math.min(Math.ceil(sy1), image.height); sy++) {
        for (let sx = Math.floor(sx0); sx < Math.min(Math.ceil(sx1), image.width); sx++) {
          samples++;
          if (!mask[sy * image.width + sx]) continue;
          const at = (sy * image.width + sx) * 4;
          red += image.data[at]; green += image.data[at + 1]; blue += image.data[at + 2];
          covered++;
        }
      }
      if (!covered || !samples) continue;
      const alpha = Math.round((255 * covered) / samples);
      if (alpha === 0) continue;
      const at = ((offsetY + dy) * frame.width + offsetX + dx) * 4;
      out.data[at] = Math.round(red / covered);
      out.data[at + 1] = Math.round(green / covered);
      out.data[at + 2] = Math.round(blue / covered);
      out.data[at + 3] = alpha;
    }
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const resolved = resolve(options.input);
  const image = decodePng(readFileSync(resolved));
  const rows = Math.ceil(options.frames / options.columns);
  const regions = cellRegions(image.width, image.height, options.columns, rows).slice(0, options.frames);

  let rendered;
  let maskSource = null;
  let scale = null;
  let cellsInfo = [];

  if (options.fit === 'contain') {
    const { mask, source } = buildMask(image, { mode: options.mask, key: options.key ?? '#00FF00' });
    maskSource = source;
    rendered = regions.map(region => renderWholeCell(image, mask, region, { frame: options.frame, seat: options.seat }));
    cellsInfo = regions.map((region, index) => ({
      index: index + 1,
      region: `${region.x0},${region.y0}-${region.x1},${region.y1}`,
    }));
  } else {
    const { mask, source } = buildMask(image, { mode: options.mask, key: options.key ?? '#00FF00' });
    maskSource = source;
    const cells = regions.map(region => measureCell(image, mask, region));
    const filled = cells.filter(one => !one.empty);
    if (!filled.length) throw new Error('Nothing survived the mask: is the key colour right, or does this need --key alpha?');
    const tallest = Math.max(...filled.map(one => one.height));
    const widest = Math.max(...filled.map(one => one.width));
    scale = Math.min(
      (options.frame.height - MARGIN.top) / tallest,
      (options.frame.width - MARGIN.side) / widest,
    );
    rendered = cells.map(cell => renderContent(image, mask, cell, { frame: options.frame, scale, seat: options.seat }));
    cellsInfo = cells.map((cell, index) => ({
      index: index + 1,
      empty: cell.empty,
      width: cell.width, height: cell.height,
    }));
  }

  const sheet = assemble(rendered, { frame: options.frame, columns: options.columns });
  const bytes = encodePng(sheet);
  const out = resolve(options.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);

  const metrics = {
    builtBy: 'scripts/art/build-prop.mjs@1',
    builtAt: new Date().toISOString(),
    input: relativeToRoot(resolved),
    out: relativeToRoot(out),
    fit: options.fit,
    seat: options.seat,
    frames: options.frames,
    columns: options.columns,
    frame: `${options.frame.width}x${options.frame.height}`,
    sheet: `${sheet.width}x${sheet.height}`,
    maskSource,
    sharedScale: scale === null ? null : Math.round(scale * 10000) / 10000,
    cells: cellsInfo,
  };
  const metricsPath = options.metrics ? resolve(options.metrics) : null;
  if (metricsPath) {
    mkdirSync(dirname(metricsPath), { recursive: true });
    writeFileSync(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
  }

  console.log(
    `${relativeToRoot(out)}: ${sheet.width}x${sheet.height}, ${options.frames} frame(s) in ` +
      `${options.columns} column(s), fit ${options.fit}, seat ${options.seat}` +
      (maskSource ? `, mask ${maskSource}` : ''),
  );
  if (scale !== null) console.log(`  shared scale ${metrics.sharedScale}`);
  if (metricsPath) console.log(`  metrics: ${relativeToRoot(metricsPath)}`);
  return 0;
}

function relativeToRoot(path) {
  const absolute = resolve(path).replace(/\\/g, '/');
  const base = root.replace(/\\/g, '/');
  return absolute.startsWith(base) ? absolute.slice(base.length) : absolute;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(`build-prop: ${error.message}\n`);
    process.exit(2);
  }
}
