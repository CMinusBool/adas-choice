#!/usr/bin/env node
// Cut one rectangle out of a raw generation, byte for byte, no masking and no scaling.
//
// A grid strip carries several frames the illustrator drew as one generation; most of this
// ticket's tooling (`build-cycle.mjs`, `build-prop.mjs`) wants either the whole strip or every
// cell in it. A two-cell "shut / open" or "off / on" static object instead needs exactly one
// named cell out of a strip that was drawn with more frames than that — a door leaf's closed and
// fully-open poses out of its six-frame swing, say — and nothing here invents a pixel: it copies
// the requested rectangle out of the source image unchanged, ready for `build-prop.mjs` to mask,
// scale and seat on its own.
//
// node scripts/art/crop-cell.mjs <strip.png> --region <x0>,<y0>,<x1>,<y1> --out <cell.png>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { blank, decodePng, encodePng } from '../png.mjs';

export function parseArguments(argv) {
  const options = { input: null, out: null, region: null };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${argument} needs a value.`);
      return value;
    };
    if (argument === '--out' || argument === '-o') options.out = next();
    else if (argument === '--region') {
      const match = /^(\d+),(\d+),(\d+),(\d+)$/.exec(next());
      if (!match) throw new Error('--region takes <x0>,<y0>,<x1>,<y1>, for example 0,0,384,512.');
      const [, x0, y0, x1, y1] = match.map(Number);
      options.region = { x0, y0, x1, y1 };
    } else if (argument.startsWith('-')) throw new Error(`Unknown argument ${argument}.`);
    else if (options.input) throw new Error('Takes one strip.');
    else options.input = argument;
  }
  if (!options.input) throw new Error('A raw strip is required.');
  if (!options.out) throw new Error('--out <cell.png> is required.');
  if (!options.region) throw new Error('--region <x0>,<y0>,<x1>,<y1> is required.');
  return options;
}

export function cropCell(image, region) {
  const width = region.x1 - region.x0;
  const height = region.y1 - region.y0;
  const out = blank(width, height);
  for (let y = 0; y < height; y++) {
    const from = ((region.y0 + y) * image.width + region.x0) * 4;
    image.data.copy(out.data, y * width * 4, from, from + width * 4);
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const image = decodePng(readFileSync(resolve(options.input)));
  if (options.region.x1 > image.width || options.region.y1 > image.height) {
    throw new Error(
      `--region ${options.region.x0},${options.region.y0},${options.region.x1},${options.region.y1} ` +
        `falls outside the ${image.width}x${image.height} source.`,
    );
  }
  const cell = cropCell(image, options.region);
  const out = resolve(options.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(cell));
  console.log(`${options.out}: ${cell.width}x${cell.height}, cropped from ${options.region.x0},${options.region.y0}-${options.region.x1},${options.region.y1}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(`crop-cell: ${error.message}\n`);
    process.exit(2);
  }
}
