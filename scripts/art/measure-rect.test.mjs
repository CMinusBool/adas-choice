// What `measure-rect.mjs` promises: the painted rectangle a delivered image carries, found from
// its pixels rather than assumed from the prompt that asked for it.
//
// Two of the Cinema Room's images carry geometry the page depends on (design/13-cinema-room.md
// §0, "Measured, not assumed"): the backdrop's doorway and screen sheet, and each Poster's frame
// inside its spill. The fixtures below are synthetic, so every expected rectangle is a literal the
// test drew, not one recomputed the way the code computes it.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { measureFrame, measureRect, parseInside } from './measure-rect.mjs';
import { blank } from '../png.mjs';

/** Paint an opaque rectangle, x1/y1 exclusive. */
function fill(image, [x0, y0, x1, y1], [r, g, b, a] = [200, 180, 150, 255]) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const at = (y * image.width + x) * 4;
      image.data[at] = r; image.data[at + 1] = g; image.data[at + 2] = b; image.data[at + 3] = a;
    }
  }
}

const opaque = parseInside('alpha');

test('a lone rectangle measures as itself', () => {
  const image = blank(100, 80);
  fill(image, [20, 10, 70, 60]);
  assert.deepEqual(measureRect(image, opaque, { seed: [40, 30] }), { x: 20, y: 10, width: 50, height: 50 });
});

test('a figure breaking out over the frame does not widen the frame', () => {
  const image = blank(120, 120);
  fill(image, [30, 30, 90, 100]);          // the frame
  fill(image, [5, 50, 40, 115]);           // a figure crossing its left and bottom edges
  fill(image, [70, 5, 100, 40]);           // a prop crossing its top-right corner
  assert.deepEqual(measureRect(image, opaque, { seed: [60, 60] }), { x: 30, y: 30, width: 60, height: 70 });
});

test('something painted elsewhere, not touching the frame, is not the frame', () => {
  const image = blank(100, 100);
  fill(image, [10, 10, 30, 30]);
  fill(image, [50, 40, 90, 95]);
  assert.deepEqual(measureRect(image, opaque, { seed: [70, 60] }), { x: 50, y: 40, width: 40, height: 55 });
});

test('a doorway is found by colour on an opaque backdrop', () => {
  const image = blank(200, 120);
  fill(image, [0, 0, 200, 120], [72, 53, 55, 255]);   // plum wall, luminance about 59
  fill(image, [20, 25, 60, 110], [40, 26, 29, 255]);  // the dark doorway, about 31
  assert.deepEqual(measureRect(image, parseInside('dark:48'), { seed: [40, 60] }), { x: 20, y: 25, width: 40, height: 85 });
});

test('a pale screen sheet is found by colour', () => {
  const image = blank(200, 120);
  fill(image, [0, 0, 200, 120], [72, 53, 55, 255]);
  fill(image, [90, 20, 180, 80], [205, 171, 133, 255]);
  assert.deepEqual(measureRect(image, parseInside('light:120'), { seed: [120, 50] }), { x: 90, y: 20, width: 90, height: 60 });
});

test('a seed outside the drawing is refused rather than measured as nothing', () => {
  const image = blank(50, 50);
  fill(image, [10, 10, 20, 20]);
  assert.throws(() => measureRect(image, opaque, { seed: [40, 40] }), /seed/);
});

// A Poster's spill is not polite: on the delivered Knives Out a figure stands in front of the
// frame's whole left edge for half its height, so a rectangle grown outward from the centre walks
// straight over it. The frame's four edges are the only long straight lines in the image, and
// most of each is still exposed, so voting for them finds the frame where growing does not.
test('a frame is found by its edges when figures cover much of them', () => {
  const image = blank(300, 400);
  fill(image, [50, 60, 250, 340]);            // the frame, 200 x 280
  fill(image, [10, 60, 70, 250]);             // a figure over the top two-thirds of the left edge
  fill(image, [150, 20, 290, 90]);            // one leaning over the top-right corner
  fill(image, [30, 300, 200, 390]);           // one in front of most of the bottom edge
  assert.deepEqual(measureFrame(image, opaque), { x: 50, y: 60, width: 200, height: 280 });
  assert.notDeepEqual(measureRect(image, opaque, { seed: [150, 200] }), { x: 50, y: 60, width: 200, height: 280 });
});

test('a frame with no straight edge at all is refused', () => {
  const image = blank(100, 100);
  assert.throws(() => measureFrame(image, opaque), /edge/);
});

test('an unknown inside rule is refused', () => {
  assert.throws(() => parseInside('bright'), /inside/);
});
