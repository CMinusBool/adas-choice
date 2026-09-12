#!/usr/bin/env node
// A contact sheet of the raw generations, for the owner's eye at the taste gate.
//
// The illustrator never crops, aligns or resizes a delivered asset — that is the asset-builder's
// job — so this draws a *review* image and nothing the pipeline consumes: each raw strip scaled to
// a common width over a checkerboard (so a stray chroma pixel or a soft edge is visible), stacked
// in the order given, with the shot's index as dots in its top-left corner, the same counting the
// layout guide uses.
//
// It cannot tell you whether the legs alternate. Nothing that looks at still frames can; see
// `docs/actor-cycles-shot-list.md` and the motion-phase check.
//
// Usage:
//
//   node scripts/art/make-contact-sheet.mjs --out contact-sheet.png [--max-width 1024]
//     [--gutter 12] <strip.png>...

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { blank, decodePng, encodePng } from '../png.mjs';

const CHECKER = [[0xdd, 0xdd, 0xdd], [0xbb, 0xbb, 0xbb]];
const CHECKER_SIZE = 16;
const INK = [0x22, 0x22, 0x22];

export function parseArguments(argv) {
  const options = { out: null, maxWidth: 1024, gutter: 12, inputs: [] };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${argument} needs a value.`);
      return value;
    };
    if (argument === '--out') options.out = next();
    else if (argument === '--max-width') options.maxWidth = Number(next());
    else if (argument === '--gutter') options.gutter = Number(next());
    else if (argument.startsWith('--')) throw new Error(`Unknown argument ${argument}.`);
    else options.inputs.push(argument);
  }
  if (!options.out) throw new Error('--out <path> is required.');
  if (options.inputs.length === 0) throw new Error('Give at least one image.');
  if (!Number.isInteger(options.maxWidth) || options.maxWidth <= 0) throw new Error('--max-width must be a positive integer.');
  if (!Number.isInteger(options.gutter) || options.gutter < 0) throw new Error('--gutter must be a non-negative integer.');
  return options;
}

/** Box-average downscale. Averaging rather than sampling keeps a one-pixel chroma rim visible. */
export function downscale(image, targetWidth) {
  if (targetWidth >= image.width) return image;
  const scale = image.width / targetWidth;
  const targetHeight = Math.max(1, Math.round(image.height / scale));
  const out = blank(targetWidth, targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    const y0 = Math.floor(y * image.height / targetHeight);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * image.height / targetHeight));
    for (let x = 0; x < targetWidth; x++) {
      const x0 = Math.floor(x * image.width / targetWidth);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * image.width / targetWidth));
      let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const index = (sy * image.width + sx) * 4;
          const alpha = image.data[index + 3];
          r += image.data[index] * alpha; g += image.data[index + 1] * alpha; b += image.data[index + 2] * alpha;
          a += alpha; n++;
        }
      }
      const index = (y * targetWidth + x) * 4;
      out.data[index] = a > 0 ? Math.round(r / a) : 0;
      out.data[index + 1] = a > 0 ? Math.round(g / a) : 0;
      out.data[index + 2] = a > 0 ? Math.round(b / a) : 0;
      out.data[index + 3] = Math.round(a / n);
    }
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const tiles = options.inputs.map((input) => downscale(decodePng(readFileSync(resolve(input))), options.maxWidth));

  const width = Math.max(...tiles.map((tile) => tile.width)) + options.gutter * 2;
  const height = tiles.reduce((total, tile) => total + tile.height + options.gutter, options.gutter);
  const sheet = blank(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const colour = CHECKER[((x / CHECKER_SIZE | 0) + (y / CHECKER_SIZE | 0)) % 2];
      const index = (y * width + x) * 4;
      sheet.data[index] = colour[0]; sheet.data[index + 1] = colour[1];
      sheet.data[index + 2] = colour[2]; sheet.data[index + 3] = 255;
    }
  }

  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = (y * width + x) * 4;
    sheet.data[index] = r; sheet.data[index + 1] = g; sheet.data[index + 2] = b;
  };

  let top = options.gutter;
  tiles.forEach((tile, order) => {
    const left = Math.round((width - tile.width) / 2);
    for (let y = 0; y < tile.height; y++) {
      for (let x = 0; x < tile.width; x++) {
        const from = (y * tile.width + x) * 4;
        const alpha = tile.data[from + 3] / 255;
        if (alpha === 0) continue;
        const to = ((top + y) * width + left + x) * 4;
        for (let channel = 0; channel < 3; channel++) {
          sheet.data[to + channel] = Math.round(tile.data[from + channel] * alpha + sheet.data[to + channel] * (1 - alpha));
        }
      }
    }
    for (let dot = 0; dot <= order; dot++) {
      const cx = left + 14 + dot * 16;
      const cy = top + 14;
      for (let y = cy - 5; y <= cy + 5; y++) {
        for (let x = cx - 5; x <= cx + 5; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= 25) put(x, y, INK);
      }
    }
    top += tile.height + options.gutter;
  });

  const out = resolve(options.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(sheet));
  console.log(`${out} ${width}x${height}, ${tiles.length} strip${tiles.length === 1 ? '' : 's'}, index as dots`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(`make-contact-sheet: ${error.message}`);
    process.exit(1);
  }
}
