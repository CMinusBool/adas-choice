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
//   [--frames 1] [--columns 1] [--seat bottom|centre] [--fit content|contain|fill] [--key '#00FF00' | alpha]
//   [--pack grid|shapes] [--airborne 10[,11...]]
//
// `--pack shapes` (with `--fit contain`, ticket 57) is for a Beat whose generator did not keep its
// figures on the grid: each figure is cut out as its own connected shape, taken in the grid's
// reading order by the cell its middle falls in, scaled by the raw cell's contain scale and seated
// on its frame's bottom edge, centred. A strip that is not exactly one shape per frame is refused.
// `--airborne` names the frames that are in the air (S22's hop, frame 10): each keeps the lift its
// feet had above the highest feet of its row's grounded frames, scaled with it.
//
// `--fit fill` is for an opaque backdrop only, one frame: the whole raw image resampled onto the
// whole frame, edge to edge, with none of the headroom `contain` leaves (ticket 34).
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
    seat: 'bottom', fit: 'content', key: null, mask: 'auto', metrics: null, pack: 'grid', airborne: [],
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
    else if (argument === '--pack') options.pack = next();
    else if (argument === '--airborne') options.airborne = next().split(',').map(Number);
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
  if (!['content', 'contain', 'fill'].includes(options.fit)) throw new Error('--fit is content, contain or fill.');
  if (options.fit === 'fill' && (options.frames !== 1 || options.columns !== 1)) {
    throw new Error('--fit fill resamples one opaque image onto one frame; a sheet keeps its painted proportions.');
  }
  if (!['grid', 'shapes'].includes(options.pack)) throw new Error('--pack is grid or shapes.');
  if (options.pack === 'shapes' && options.fit !== 'contain') {
    throw new Error('--pack shapes keeps the scale --fit contain gives a raw cell; pass --fit contain with it.');
  }
  if (options.airborne.length) {
    if (options.pack !== 'shapes' || options.seat !== 'bottom') throw new Error('--airborne lifts a frame off its floor, so it needs --pack shapes and --seat bottom.');
    for (const frame of options.airborne) {
      if (!Number.isInteger(frame) || frame < 1 || frame > options.frames) throw new Error(`--airborne takes frame numbers 1-${options.frames}, comma-separated.`);
    }
  }
  return options;
}

/**
 * `--pack shapes`: the strip's figures as connected shapes (8-connected, over the mask), in the
 * grid's reading order.
 *
 * The generator draws one figure per cell but not on an even grid, so a figure's ear or tail can sit
 * a few pixels over its cell line (S22). Each shape belongs to the cell its box's middle falls in.
 * Nothing is thresholded or merged: the strip must hold exactly one shape per declared frame, one to
 * a cell, or it is a wrong generation and the build stops rather than guessing which piece is which.
 */
export function shapesInReadingOrder(image, mask, { frames, columns }) {
  const { width, height } = image;
  const rows = Math.ceil(frames / columns);
  const labels = new Int32Array(width * height).fill(-1);
  const shapes = [];
  const stack = [];
  for (let start = 0; start < width * height; start++) {
    if (!mask[start] || labels[start] >= 0) continue;
    const shape = { label: shapes.length, pixels: 0, x0: width, y0: height, x1: -1, y1: -1 };
    labels[start] = shape.label;
    stack.push(start);
    while (stack.length) {
      const at = stack.pop();
      const x = at % width;
      const y = (at - x) / width;
      shape.pixels++;
      if (x < shape.x0) shape.x0 = x;
      if (x > shape.x1) shape.x1 = x;
      if (y < shape.y0) shape.y0 = y;
      if (y > shape.y1) shape.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbour = ny * width + nx;
          if (mask[neighbour] && labels[neighbour] < 0) { labels[neighbour] = shape.label; stack.push(neighbour); }
        }
      }
    }
    shapes.push(shape);
  }
  if (shapes.length !== frames) {
    const smallest = Math.min(...shapes.map(one => one.pixels));
    throw new Error(
      `--pack shapes found ${shapes.length} shapes on the strip but --frames declares ${frames} ` +
        `(the smallest is ${smallest} px): one figure per frame is the generation's job.`,
    );
  }
  const byCell = new Map();
  for (const shape of shapes) {
    const column = Math.min(columns - 1, Math.floor(((shape.x0 + shape.x1 + 1) / 2) / (width / columns)));
    const row = Math.min(rows - 1, Math.floor(((shape.y0 + shape.y1 + 1) / 2) / (height / rows)));
    const cell = row * columns + column;
    if (cell >= frames) throw new Error(`--pack shapes found a shape in spare cell ${cell + 1}; ${frames} frames were declared.`);
    if (byCell.has(cell)) throw new Error(`--pack shapes found two shapes in cell ${cell + 1}.`);
    byCell.set(cell, shape);
  }
  return [...byCell.keys()].sort((a, b) => a - b).map(cell => {
    const shape = byCell.get(cell);
    const own = new Uint8Array(width * height);
    for (let y = shape.y0; y <= shape.y1; y++) {
      for (let x = shape.x0; x <= shape.x1; x++) if (labels[y * width + x] === shape.label) own[y * width + x] = 1;
    }
    return {
      mask: own,
      cell: {
        empty: false, pixels: shape.pixels, bbox: [shape.x0, shape.y0, shape.x1, shape.y1],
        width: shape.x1 - shape.x0 + 1, height: shape.y1 - shape.y0 + 1,
      },
    };
  });
}

/** Same averaging `build-cycle.mjs`'s `renderFrame` uses, seating on either edge instead of always the bottom. */
export function renderContent(image, mask, cell, { frame, scale, seat, lift = 0 }) {
  const out = blank(frame.width, frame.height);
  if (cell.empty) return out;
  const [bx0, by0] = cell.bbox;
  const sourceWidth = cell.width;
  const sourceHeight = cell.height;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const offsetX = Math.round((frame.width - width) / 2);
  const offsetY = seat === 'bottom' ? frame.height - height - lift : Math.round((frame.height - height) / 2);
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
export function renderWholeCell(image, mask, region, { frame, seat, fill = false }) {
  const out = blank(frame.width, frame.height);
  const sourceWidth = region.x1 - region.x0;
  const sourceHeight = region.y1 - region.y0;
  // `--fit fill`: a backdrop is the bottom of its stage, so it covers the whole frame with no
  // headroom — the two axes may then scale by a hair apart (1672 x 940 onto 1600 x 900 is 0.9569
  // against 0.9574), which the metrics record rather than a crop hides.
  // The same headroom `build-cycle.mjs` leaves around a Cycle frame's content, so a whole cell
  // scaled to "fill" its target box still clears the edge-bleed rule: a raw generation's own cell
  // is drawn to whatever margin the illustrator happened to leave, not to this ticket's target
  // frame, and a figure that reaches the raw cell's edge in one frame of a moving Beat otherwise
  // scales to touch the built frame's edge exactly, which is a property of the fit, not a defect
  // in the generation.
  const scale = Math.min((frame.width - MARGIN.side) / sourceWidth, (frame.height - MARGIN.top) / sourceHeight);
  const width = fill ? frame.width : Math.max(1, Math.round(sourceWidth * scale));
  const height = fill ? frame.height : Math.max(1, Math.round(sourceHeight * scale));
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

/**
 * `--airborne`: how far, in raw px, each named frame's feet sit above its row's floor.
 *
 * The grounded frames' feet do not share one line across the strip (S22: 39-65 raw px above the
 * cell bottom), so the floor is taken per row, at the highest feet among the row's grounded frames.
 * That keeps a hop from coming out lower than the frames it lands among. Frames not named are
 * grounded and get no lift, so naming a frame is the art call and this only measures it.
 */
export function airborneLifts(shapes, regions, { airborne, columns }) {
  const lifts = new Array(shapes.length).fill(0);
  const named = new Set(airborne.map(frame => frame - 1));
  const gap = index => regions[index].y1 - 1 - shapes[index].cell.bbox[3];
  for (const index of named) {
    const row = Math.floor(index / columns);
    const grounded = shapes.map((_, other) => other).filter(other => Math.floor(other / columns) === row && !named.has(other));
    if (!grounded.length) throw new Error(`--airborne: frame ${index + 1}'s row has no grounded frame to measure its floor from.`);
    const floor = Math.max(...grounded.map(gap));
    if (gap(index) <= floor) throw new Error(`--airborne: frame ${index + 1}'s feet are not above its row's grounded feet.`);
    lifts[index] = gap(index) - floor;
  }
  return lifts;
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

  if (options.pack === 'shapes') {
    // The scale `--fit contain` gives the raw cell, shared by every shape: each figure comes out the
    // size it was drawn at against its cell, and only where it stands in the frame changes.
    const { mask, source } = buildMask(image, { mode: options.mask, key: options.key ?? '#00FF00' });
    maskSource = source;
    const cellWidth = regions[0].x1 - regions[0].x0;
    const cellHeight = regions[0].y1 - regions[0].y0;
    scale = Math.min((options.frame.width - MARGIN.side) / cellWidth, (options.frame.height - MARGIN.top) / cellHeight);
    const shapes = shapesInReadingOrder(image, mask, { frames: options.frames, columns: options.columns });
    const lifts = airborneLifts(shapes, regions, options);
    shapes.forEach(({ cell }, index) => {
      if (Math.round(cell.width * scale) > options.frame.width - MARGIN.side || Math.round(cell.height * scale) > options.frame.height - MARGIN.top) {
        throw new Error(`--pack shapes: frame ${index + 1}'s shape is ${cell.width}x${cell.height}, larger than a raw cell allows.`);
      }
      const lift = lifts[index] ? Math.round(lifts[index] * scale) : 0;
      if (Math.round(cell.height * scale) + lift > options.frame.height - MARGIN.top) {
        throw new Error(`--airborne: frame ${index + 1} lifted ${lift} px no longer fits its ${options.frame.height} px frame.`);
      }
    });
    rendered = shapes.map(({ mask: own, cell }, index) => renderContent(image, own, cell, {
      frame: options.frame, scale, seat: options.seat, lift: lifts[index] ? Math.round(lifts[index] * scale) : 0,
    }));
    cellsInfo = shapes.map(({ cell }, index) => ({
      index: index + 1,
      shape: `${cell.bbox[0]},${cell.bbox[1]}-${cell.bbox[2]},${cell.bbox[3]}`,
      width: cell.width, height: cell.height, pixels: cell.pixels,
      ...(lifts[index] ? { airborne: true, liftRaw: lifts[index], lift: Math.round(lifts[index] * scale) } : {}),
    }));
  } else if (options.fit === 'contain' || options.fit === 'fill') {
    const { mask, source } = buildMask(image, { mode: options.mask, key: options.key ?? '#00FF00' });
    maskSource = source;
    const fill = options.fit === 'fill';
    rendered = regions.map(region => renderWholeCell(image, mask, region, { frame: options.frame, seat: options.seat, fill }));
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
    pack: options.pack,
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
