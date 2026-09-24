#!/usr/bin/env node
// Lay two or more already-built, equal-size cells side by side into one sheet.
//
// The contract this ticket's door leaf and its Music Source both need is "a separate transparent
// two-cell asset (shut / open, off / on)" whose two states are two independent generations, each
// already cut to a Prop's exact box by `build-prop.mjs`. `background-size: 200% 100%` (the pattern
// the Activity Room's door leaf and boombox both use) only reads correctly when the two cells are
// pixel-identical in size, so this refuses anything else rather than silently padding one.
//
// node scripts/art/stack-cells.mjs <out.png> <cell1.png> <cell2.png> [<cell3.png> ...]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { blank, decodePng, encodePng } from '../png.mjs';

export function parseArguments(argv) {
  if (argv.length < 3) throw new Error('Usage: stack-cells.mjs <out.png> <cell1.png> <cell2.png> [...]');
  const [out, ...cells] = argv;
  return { out, cells };
}

export function stackCells(images) {
  const { width, height } = images[0];
  for (const image of images) {
    if (image.width !== width || image.height !== height) {
      throw new Error(`Every cell must share one size; got ${width}x${height} and ${image.width}x${image.height}.`);
    }
  }
  const sheet = blank(width * images.length, height);
  images.forEach((image, index) => {
    for (let y = 0; y < height; y++) {
      const from = y * width * 4;
      image.data.copy(sheet.data, (y * sheet.width + index * width) * 4, from, from + width * 4);
    }
  });
  return sheet;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const images = options.cells.map(path => decodePng(readFileSync(resolve(path))));
  const sheet = stackCells(images);
  const out = resolve(options.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(sheet));
  console.log(`${options.out}: ${sheet.width}x${sheet.height}, ${images.length} cells`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(`stack-cells: ${error.message}\n`);
    process.exit(2);
  }
}
