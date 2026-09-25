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

test('--fit fill is refused for anything but one frame', () => {
  // Filling each cell of a sheet would stretch every frame to the box: a Prop keeps its painted
  // proportions, and only a single opaque backdrop is resampled whole.
  assert.throws(() => parseArguments(['raw.png', '--out', 'x.png', '--frame', '10x10', '--fit', 'fill', '--frames', '2', '--columns', '2']), /one frame/);
});
