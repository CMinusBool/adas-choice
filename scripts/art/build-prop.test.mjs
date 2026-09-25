// What `build-prop.mjs` promises about the one fit an opaque backdrop needs.
//
// A backdrop is the bottom of its stage: nothing is behind it but the Room section's own
// background, so the image has to cover the whole 1600 x 900 frame edge to edge. `--fit contain`
// leaves the Cycle contract's headroom (`MARGIN`) round the cell, which is right for a Beat and
// left the Cinema and Activity Room backdrops with a two-pixel transparent band down each side.
// `--fit fill` is the backdrop's: the whole raw image resampled onto the whole frame.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { main, parseArguments } from './build-prop.mjs';
import { blank, decodePng, encodePng } from '../png.mjs';

const temporary = () => mkdtempSync(join(tmpdir(), 'build-prop-'));

function quietly(argv) {
  const log = console.log;
  console.log = () => {};
  try {
    return main(argv);
  } finally {
    console.log = log;
  }
}

/** An opaque image, left half red and right half blue, at a generator's size rather than the frame's. */
function opaqueHalves(width, height) {
  const image = blank(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      const left = x < width / 2;
      image.data[at] = left ? 200 : 20;
      image.data[at + 1] = 30;
      image.data[at + 2] = left ? 20 : 200;
      image.data[at + 3] = 255;
    }
  }
  return image;
}

test('--fit fill covers the whole frame with an opaque image, edge to edge', () => {
  const directory = temporary();
  const input = join(directory, 'raw.png');
  const out = join(directory, 'backdrop.png');
  writeFileSync(input, encodePng(opaqueHalves(167, 94)));
  assert.equal(quietly([input, '--out', out, '--frame', '160x90', '--fit', 'fill', '--key', 'alpha']), 0);
  const built = decodePng(readFileSync(out));
  assert.equal(built.width, 160);
  assert.equal(built.height, 90);
  for (let index = 0; index < built.width * built.height; index++) {
    assert.equal(built.data[index * 4 + 3], 255, `pixel ${index} should be opaque`);
  }
  // Nothing moved: the corners are still the halves they came from.
  const at = (x, y) => [...built.data.subarray((y * 160 + x) * 4, (y * 160 + x) * 4 + 3)];
  assert.deepEqual(at(0, 0), [200, 30, 20]);
  assert.deepEqual(at(159, 89), [20, 30, 200]);
});

/** A flat #00FF00 strip with solid rectangles painted on it: `[x0, y0, x1, y1, [r, g, b]]`, inclusive. */
function keyedStrip(width, height, rectangles) {
  const image = blank(width, height);
  for (let index = 0; index < width * height; index++) image.data.set([0, 255, 0, 255], index * 4);
  for (const [x0, y0, x1, y1, colour] of rectangles) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) image.data.set([...colour, 255], (y * width + x) * 4);
  }
  return image;
}

const RED = [200, 30, 20];
const BLUE = [20, 30, 200];
const YELLOW = [230, 200, 30];
const WHITE = [240, 240, 240];

/** The opaque box of one built frame, and how many of its opaque pixels are a given colour. */
function frameBox(sheet, frame, column, row, colour) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, matching = 0;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const at = ((row * frame.height + y) * sheet.width + column * frame.width + x) * 4;
      if (sheet.data[at + 3] < 128) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      if (colour && Math.hypot(sheet.data[at] - colour[0], sheet.data[at + 1] - colour[1], sheet.data[at + 2] - colour[2]) < 30) matching++;
    }
  }
  return { x0, y0, x1, y1, matching };
}

// Ticket 57: the generator does not keep a Beat's figures on an even grid (S22's Luna pokes an ear
// or a tail a few pixels into the next cell), so a grid cut hands one frame a sliver of its
// neighbour and clips the figure it belongs to. `--pack shapes` cuts each figure out as its own
// connected shape and seats it on its frame's bottom edge, centred.
test('--pack shapes puts a figure that crosses its cell line whole into its own frame', () => {
  const directory = temporary();
  const input = join(directory, 'raw.png');
  const out = join(directory, 'beat.png');
  // A 2 x 2 grid of 40 x 40 cells. The yellow figure belongs to cell 3 (its middle is in row 2) but
  // its top three rows sit in cell 1, above the row line at y 40.
  writeFileSync(input, encodePng(keyedStrip(80, 80, [
    [10, 5, 19, 24, RED],
    [50, 10, 59, 29, BLUE],
    [12, 37, 21, 66, YELLOW],
    [55, 50, 64, 69, WHITE],
  ])));
  assert.equal(quietly([input, '--out', out, '--frames', '4', '--columns', '2', '--frame', '60x60', '--fit', 'contain', '--pack', 'shapes']), 0);
  const sheet = decodePng(readFileSync(out));
  const frame = { width: 60, height: 60 };
  // Frame 1 is the red figure alone: none of the yellow one came with it.
  assert.equal(frameBox(sheet, frame, 0, 0, YELLOW).matching, 0);
  // Frame 3 is the whole yellow figure, 10 x 30 raw at the cell's own scale of 1.4 (56 / 40), so
  // 14 x 42: centred across the 60-wide frame (23-36) and standing on its bottom row (18-59).
  const third = frameBox(sheet, frame, 0, 1, YELLOW);
  assert.deepEqual([third.x0, third.y0, third.x1, third.y1], [23, 18, 36, 59]);
  assert.equal(third.matching, 14 * 42);
});

test('--pack shapes stops on a strip that is not one shape per frame, rather than guess', () => {
  const directory = temporary();
  const input = join(directory, 'raw.png');
  const out = join(directory, 'beat.png');
  const argv = [input, '--out', out, '--frames', '2', '--columns', '2', '--frame', '60x60', '--fit', 'contain', '--pack', 'shapes'];
  // A stray piece beside the first figure makes three shapes for two frames.
  writeFileSync(input, encodePng(keyedStrip(80, 40, [[5, 5, 14, 34, RED], [25, 5, 28, 8, RED], [50, 5, 59, 34, BLUE]])));
  assert.throws(() => quietly(argv), /found 3 shapes .* declares 2/);
  // Two figures in the first cell and none in the second.
  writeFileSync(input, encodePng(keyedStrip(80, 40, [[2, 5, 11, 34, RED], [24, 5, 33, 34, BLUE]])));
  assert.throws(() => quietly(argv), /two shapes in cell 1/);
});

test('--fit fill is refused for anything but one frame', () => {
  // Filling each cell of a sheet would stretch every frame to the box: a Prop keeps its painted
  // proportions, and only a single opaque backdrop is resampled whole.
  assert.throws(() => parseArguments(['raw.png', '--out', 'x.png', '--frame', '10x10', '--fit', 'fill', '--frames', '2', '--columns', '2']), /one frame/);
});
