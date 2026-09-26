// What `build-activity-door-leaf.mjs` promises (COOP-001 ticket 96, design 75 §4.1 D7): ticket 94's
// kept leaf, which draws the shut door 152 x 350 units (+7 %, outside the one door's ± 3 %), built
// into a two-cell sheet whose shut cell is exactly the one door — 142 x 350 units, 284 x 700 px —
// by squeezing it across, never by generating, padding or cropping into the leaf.
//
// The fixture is a synthetic strip laid out like the kept attempt: a transparent ground, a shut leaf
// in the left half, a narrower and taller open leaf (its near edge in perspective) in the right
// half, and a stray speck of the generator's fringe in each. Every expected number is a literal
// read off the fixture, not recomputed the way the script computes it.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildLeaf, leafShapes } from './build-activity-door-leaf.mjs';
import { blank } from '../png.mjs';

function paint(image, [x0, y0, x1, y1], [r, g, b]) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const at = (y * image.width + x) * 4;
      image.data[at] = r; image.data[at + 1] = g; image.data[at + 2] = b; image.data[at + 3] = 255;
    }
  }
}

/** 200 x 160: shut leaf (8,20)-(84,140), 76 x 120; open leaf (112,10)-(136,150), 24 x 140; a speck in each half. */
function fixture() {
  const image = blank(200, 160);
  paint(image, [8, 20, 84, 140], [200, 160, 40]);
  paint(image, [112, 10, 136, 150], [190, 150, 40]);
  paint(image, [90, 150, 92, 152], [200, 40, 40]);
  paint(image, [180, 4, 182, 6], [200, 40, 40]);
  return image;
}

test('each half’s leaf is its largest drawn shape, so the generator’s stray specks are not the leaf', () => {
  const [shut, open] = leafShapes(fixture());
  assert.deepEqual(shut.box, { x0: 8, y0: 20, x1: 84, y1: 140 });
  assert.deepEqual(open.box, { x0: 112, y0: 10, x1: 136, y1: 150 });
});

test('the shut cell is the leaf edge to edge: the door’s full height, squeezed across to the cell', () => {
  // A 28 x 70 cell is the one door, 142 x 350 units, at 0.2 px a unit, give or take a pixel.
  const { sheet, shut } = buildLeaf(fixture(), { cell: { width: 28, height: 70 } });
  assert.equal(sheet.width, 56);
  assert.equal(sheet.height, 70);
  // 120 px tall onto 70: 70 / 120 down; 76 px wide onto 28: 28 / 76 across.
  assert.equal(shut.scaleY.toFixed(4), '0.5833');
  assert.equal(shut.scaleX.toFixed(4), '0.3684');
  for (const [x, y] of [[0, 0], [27, 0], [0, 69], [27, 69], [14, 35]]) {
    assert.equal(sheet.data[(y * 56 + x) * 4 + 3], 255, `shut cell (${x},${y}) is leaf`);
  }
});

test('the open cell keeps the shut cell’s squeeze, hangs on its hinge edge, and nothing leaves the cell', () => {
  const { sheet, open } = buildLeaf(fixture(), { cell: { width: 28, height: 70 } });
  // 140 px tall is more than the shut leaf's 120, so it takes 70 / 140 down and the same
  // across-to-down ratio as the shut cell, (28 / 76) / (70 / 120).
  assert.equal(open.scaleY.toFixed(4), '0.5000');
  assert.equal((open.scaleX / open.scaleY).toFixed(4), '0.6316');
  const alpha = (x, y) => sheet.data[(y * 56 + 28 + x) * 4 + 3];
  assert.equal(alpha(0, 35), 255, 'hinge edge on the cell’s left');
  assert.equal(alpha(0, 0), 255, 'top of the near edge');
  assert.equal(alpha(0, 69), 255, 'foot of the near edge');
  // 24 px across x 0.5 x 0.6316 is 7.6 px: nothing past column 8.
  for (let y = 0; y < 70; y++) assert.equal(alpha(9, y), 0, `open cell (9,${y}) is ground`);
});
