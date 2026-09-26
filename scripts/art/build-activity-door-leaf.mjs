#!/usr/bin/env node
// Build the Activity Room's door leaf from ticket 94's kept attempt (COOP-001 ticket 96, design 75
// §4.1 D7 and §2.2).
//
// Every door in the apartment is 142 x 350 units (85 x 210 cm), within ± 3 %. Ticket 94's kept
// attempt-1 draws its shut leaf 548 x 1261 raw px, which is 152 x 350 units at the door's height:
// 7 % too wide. Its proportions are otherwise right, so it is squeezed across, x 0.934, to the one
// door, rather than generated again (CLOSING.md §4: two generations per shot, both spent). The
// sheet is two cells, shut then open, each 284 x 700 px — 2 px a unit — and the shut cell is the
// leaf edge to edge, so the `.a-door-leaf` box on the stage is the leaf.
//
// The open cell ships but `styles.css` does not read it (the swing is a 3D rotation of the shut
// cell). It keeps the shut cell's across-to-down ratio, so the two are one drawing at one squeeze;
// its near edge is drawn in perspective 113 raw px taller than the shut leaf, so it takes the
// scale that fits that height in the cell, hung on its hinge edge at the cell's left.
//
// Nothing here invents a pixel. Each half's leaf is its largest drawn shape (8-connected, over the
// alpha mask), which leaves out the generator's stray fringe specks; each output pixel is the
// average of the leaf pixels it covers, and its alpha how much of it they cover.
//
// node scripts/art/build-activity-door-leaf.mjs --source <94's attempt-1/strip-raw.png>
//   [--manifest <94-activity-door-leaf/manifest.json>] [--out public/assets/activity-room/door-leaf.png]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { blank, decodePng, encodePng } from '../png.mjs';
import { buildMask } from './build-cycle.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** One door's cell: 142 x 350 units at 2 px a unit. */
export const CELL = { width: 284, height: 700 };

/** The largest 8-connected shape of `mask` inside a region, as its box (x1/y1 exclusive) and its pixels. */
function largestShape(mask, width, region) {
  const seen = new Uint8Array(mask.length);
  let best = null;
  const stack = [];
  for (let y = region.y0; y < region.y1; y++) {
    for (let x = region.x0; x < region.x1; x++) {
      const start = y * width + x;
      if (!mask[start] || seen[start]) continue;
      const pixels = [];
      let x0 = x, y0 = y, x1 = x, y1 = y;
      seen[start] = 1;
      stack.push(start);
      while (stack.length) {
        const at = stack.pop();
        pixels.push(at);
        const px = at % width, py = (at - px) / width;
        if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx, ny = py + dy;
            if (nx < region.x0 || nx >= region.x1 || ny < region.y0 || ny >= region.y1) continue;
            const next = ny * width + nx;
            if (mask[next] && !seen[next]) { seen[next] = 1; stack.push(next); }
          }
        }
      }
      if (!best || pixels.length > best.pixels.length) best = { pixels, box: { x0, y0, x1: x1 + 1, y1: y1 + 1 } };
    }
  }
  if (!best) throw new Error(`nothing is drawn in x ${region.x0}-${region.x1}`);
  return best;
}

/** The shut leaf (left half) and the open leaf (right half) of a two-cell strip. */
export function leafShapes(image) {
  const { mask } = buildMask(image, { mode: 'alpha' });
  const half = Math.floor(image.width / 2);
  return [
    { x0: 0, y0: 0, x1: half, y1: image.height },
    { x0: half, y0: 0, x1: image.width, y1: image.height },
  ].map(region => {
    const shape = largestShape(mask, image.width, region);
    const only = new Uint8Array(mask.length);
    for (const at of shape.pixels) only[at] = 1;
    return { box: shape.box, mask: only };
  });
}

/** Draw a source box into a destination box of `out`, each axis at its own scale. */
function render(image, mask, box, out, target) {
  const sw = box.x1 - box.x0, sh = box.y1 - box.y0;
  for (let dy = 0; dy < target.height; dy++) {
    for (let dx = 0; dx < target.width; dx++) {
      const sx0 = box.x0 + (dx / target.width) * sw, sx1 = box.x0 + ((dx + 1) / target.width) * sw;
      const sy0 = box.y0 + (dy / target.height) * sh, sy1 = box.y0 + ((dy + 1) / target.height) * sh;
      let red = 0, green = 0, blue = 0, covered = 0, samples = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          samples++;
          if (!mask[sy * image.width + sx]) continue;
          const at = (sy * image.width + sx) * 4;
          red += image.data[at]; green += image.data[at + 1]; blue += image.data[at + 2];
          covered++;
        }
      }
      if (!covered) continue;
      const at = ((target.y + dy) * out.width + target.x + dx) * 4;
      out.data[at] = Math.round(red / covered);
      out.data[at + 1] = Math.round(green / covered);
      out.data[at + 2] = Math.round(blue / covered);
      out.data[at + 3] = Math.round((255 * covered) / samples);
    }
  }
}

/**
 * The two-cell sheet, shut then open, and the scales each cell took.
 *
 * The shut leaf fills its cell: down by the cell's height over the leaf's, across by the cell's
 * width over the leaf's. The open leaf keeps that across-to-down ratio at the largest scale, no
 * bigger than the shut one's, that fits its height in the cell.
 */
export function buildLeaf(image, { cell = CELL } = {}) {
  const [shut, open] = leafShapes(image);
  const size = box => ({ width: box.x1 - box.x0, height: box.y1 - box.y0 });
  const shutSize = size(shut.box), openSize = size(open.box);
  const shutScale = { scaleX: cell.width / shutSize.width, scaleY: cell.height / shutSize.height };
  const squeeze = shutScale.scaleX / shutScale.scaleY;
  const openY = Math.min(shutScale.scaleY, cell.height / openSize.height);
  const openScale = { scaleX: openY * squeeze, scaleY: openY };
  const sheet = blank(cell.width * 2, cell.height);
  render(image, shut.mask, shut.box, sheet, { x: 0, y: 0, width: cell.width, height: cell.height });
  const openWidth = Math.min(cell.width, Math.round(openSize.width * openScale.scaleX));
  const openHeight = Math.min(cell.height, Math.round(openSize.height * openScale.scaleY));
  render(image, open.mask, open.box, sheet, {
    x: cell.width, y: Math.round((cell.height - openHeight) / 2), width: openWidth, height: openHeight,
  });
  return {
    sheet,
    squeeze,
    shut: { source: shut.box, ...shutScale, drawn: { width: cell.width, height: cell.height } },
    open: { source: open.box, ...openScale, drawn: { width: openWidth, height: openHeight } },
  };
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function main(argv = process.argv.slice(2)) {
  const options = { source: null, manifest: null, out: join(root, 'public/assets/activity-room/door-leaf.png') };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index + 1];
    if (argv[index] === '--source') options.source = resolve(value);
    else if (argv[index] === '--manifest') options.manifest = resolve(value);
    else if (argv[index] === '--out') options.out = resolve(value);
    else { console.error(`Unknown argument ${argv[index]}.`); return 2; }
    index++;
  }
  if (!options.source || !existsSync(options.source)) {
    console.error('--source <attempt-1/strip-raw.png> is required: ticket 94\'s kept attempt, in the main checkout');
    return 2;
  }
  const bytes = readFileSync(options.source);
  const manifestPath = options.manifest ?? join(dirname(options.source), '..', '..', 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const shot = manifest.shots?.find(entry => entry.kept);
    const kept = shot?.attempts?.find(attempt => attempt.runId === shot.kept);
    if (kept && kept.imageSha256 !== sha256(bytes)) {
      console.error(`${options.source} is not the kept ${shot.kept} (sha256 ${kept.imageSha256})`);
      return 1;
    }
  }
  const built = buildLeaf(decodePng(bytes));
  writeFileSync(options.out, encodePng(built.sheet));
  const units = ({ width, height }) => `${(width / 2).toFixed(1)} x ${(height / 2).toFixed(1)}`;
  console.log(JSON.stringify({
    source: { sha256: sha256(bytes) },
    out: options.out,
    squeeze: +built.squeeze.toFixed(4),
    shut: { ...built.shut, units: units(built.shut.drawn), unsqueezedUnits: `${((built.shut.source.x1 - built.shut.source.x0) * built.shut.scaleY / 2).toFixed(1)} x ${(CELL.height / 2).toFixed(1)}` },
    open: { ...built.open, units: units(built.open.drawn) },
  }));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
