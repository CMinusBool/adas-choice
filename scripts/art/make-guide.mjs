#!/usr/bin/env node
// The layout guide one generation call is anchored on, in the shape OpenAI's `hatch-pet` sprite
// skill uses: a chroma-key canvas divided into cells, a ground line per cell, and the frame number
// as dots so the model can tell cell 3 from cell 7 without any text to copy.
//
// Promoted from `.scratch/COOP-001-apartment/art/cycles/experiments/boy-walk-01/make-guide.mjs`,
// where it produced the guide both measured runs followed: eight figures in eight cells, no cell
// crossing, no guide lines reproduced in the output.
//
// 1536x1024 is the size the built-in `image_gen` tool returns for landscape requests — it has no
// size control and ignored twelve explicit requests for a larger canvas — so the guide shares that
// frame and the output's cells can be cut by division.
//
// Usage:
//
//   node scripts/art/make-guide.mjs --out <path> [--cols 4] [--rows 2] [--width 1536]
//     [--height 1024] [--ground 32] [--key '#00FF00' | --actor boy] [--no-dots]
//
// `--actor` reads `art/characters/v1/palette.json` and picks a key colour that is not in that
// Actor's palette. None of the four Cast members has a near-green base colour today, so the answer
// is `#00FF00` for all of them; the check is here so an Actor that ever does gets magenta instead
// of a costume the chroma key eats.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { blank, encodePng } from '../png.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Tried in order; the first that is far enough from every palette colour wins. */
export const KEY_CANDIDATES = [
  { name: 'green', hex: '#00FF00' },
  { name: 'magenta', hex: '#FF00FF' },
  { name: 'cyan', hex: '#00FFFF' },
];

/** An opaque palette colour this close to the key colour would be eaten by the chroma key. */
export const KEY_CLEARANCE = 140;

export const parseHex = (hex) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`Not a hex colour: ${hex}`);
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
};

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Every colour the given Actor's entry in `palette.json` names, plus the shared outline. */
export function paletteColours(palette, actor) {
  const own = palette[actor];
  if (!own) throw new Error(`palette.json has no entry for ${actor}.`);
  return [...Object.values(own), ...Object.values(palette.shared ?? {})].map(parseHex);
}

export function chooseKey(colours) {
  const scored = KEY_CANDIDATES.map((candidate) => {
    const key = parseHex(candidate.hex);
    const nearest = colours.reduce((best, colour) => Math.min(best, distance(key, colour)), Infinity);
    return { ...candidate, nearest };
  });
  const clear = scored.find((candidate) => candidate.nearest >= KEY_CLEARANCE);
  return clear ?? scored.reduce((best, candidate) => (candidate.nearest > best.nearest ? candidate : best));
}

export function parseArguments(argv) {
  const options = {
    out: null, cols: 4, rows: 2, width: 1536, height: 1024, ground: 32,
    key: null, actor: null, dots: true,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${argument} needs a value.`);
      return value;
    };
    if (argument === '--out') options.out = next();
    else if (argument === '--cols' || argument === '--columns') options.cols = Number(next());
    else if (argument === '--rows') options.rows = Number(next());
    else if (argument === '--width') options.width = Number(next());
    else if (argument === '--height') options.height = Number(next());
    else if (argument === '--ground') options.ground = Number(next());
    else if (argument === '--key') options.key = next();
    else if (argument === '--actor') options.actor = next();
    else if (argument === '--no-dots') options.dots = false;
    else throw new Error(`Unknown argument ${argument}.`);
  }
  if (!options.out) throw new Error('--out <path> is required.');
  for (const field of ['cols', 'rows', 'width', 'height', 'ground']) {
    if (!Number.isInteger(options[field]) || options[field] <= 0) throw new Error(`--${field} must be a positive integer.`);
  }
  if (options.width % options.cols !== 0 || options.height % options.rows !== 0) {
    throw new Error('The canvas must divide evenly into cells; cut frames by division, never by eye.');
  }
  return options;
}

export function drawGuide({ width, height, cols, rows, ground, key, dots }) {
  const cellWidth = width / cols;
  const cellHeight = height / rows;
  const ink = [0x33, 0x33, 0x33];
  const image = blank(width, height);
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = (y * width + x) * 4;
    image.data[index] = r; image.data[index + 1] = g; image.data[index + 2] = b; image.data[index + 3] = 255;
  };
  const rect = (x0, y0, x1, y1, colour) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, colour);
  };
  const disc = (cx, cy, r, colour) => {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(x, y, colour);
    }
  };

  rect(0, 0, width, height, key);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * cellWidth;
      const y0 = row * cellHeight;
      rect(x0, y0, x0 + cellWidth, y0 + 2, ink);
      rect(x0, y0 + cellHeight - 2, x0 + cellWidth, y0 + cellHeight, ink);
      rect(x0, y0, x0 + 2, y0 + cellHeight, ink);
      rect(x0 + cellWidth - 2, y0, x0 + cellWidth, y0 + cellHeight, ink);
      const groundY = y0 + cellHeight - ground;
      rect(x0 + 24, groundY, x0 + cellWidth - 24, groundY + 3, ink);
      rect(x0 + cellWidth / 2 - 1, groundY - 10, x0 + cellWidth / 2 + 2, groundY, ink);
      if (dots) {
        const n = row * cols + col + 1;
        for (let d = 0; d < n; d++) disc(x0 + 20 + d * 18, y0 + 20, 5, ink);
      }
    }
  }
  return image;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  let keyHex = options.key;
  let why = 'given on the command line';
  if (!keyHex) {
    if (options.actor) {
      const palettePath = resolve(root, 'art/characters/v1/palette.json');
      if (!existsSync(palettePath)) throw new Error(`No palette at ${palettePath}.`);
      const palette = JSON.parse(readFileSync(palettePath, 'utf8'));
      const chosen = chooseKey(paletteColours(palette, options.actor));
      keyHex = chosen.hex;
      why = `chosen for ${options.actor}: nearest palette colour is ${Math.round(chosen.nearest)} away`;
    } else {
      keyHex = KEY_CANDIDATES[0].hex;
      why = 'default';
    }
  }

  const image = drawGuide({ ...options, key: parseHex(keyHex) });
  const out = resolve(options.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(image));
  console.log(
    `${out} ${options.width}x${options.height}, ${options.cols}x${options.rows} cells of `
    + `${options.width / options.cols}x${options.height / options.rows}, ground line ${options.ground} px above `
    + `each cell's bottom, key ${keyHex} (${why})`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(`make-guide: ${error.message}`);
    process.exit(1);
  }
}
