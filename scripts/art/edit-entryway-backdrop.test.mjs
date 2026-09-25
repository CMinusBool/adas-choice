// What `edit-entryway-backdrop.mjs` promises: ticket 84's two pixel edits on the Entryway's S01
// attempt-4 — the front doorway narrowed to the one door by moving its right-hand jamb, and the
// hook rail lifted — made so that neither seam shows, and measured rather than assumed.
//
// The real attempt-4 lives in the main checkout's effort directory and never in a worktree, so
// these fixtures are synthetic: a small painted hall with a doorway, a doormat and a hook rail,
// every expected number a literal the fixture drew.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { contactSheet, editEntrywayBackdrop, measureHookTips, measureOpening } from './edit-entryway-backdrop.mjs';
import { blank } from '../png.mjs';

const WALL = [112, 71, 70];
const SKIRTING = [55, 36, 28];
const FLOOR = [95, 56, 31];
const CASING = [75, 45, 29];
const INTERIOR = [32, 44, 70];
const MAT = [150, 110, 70];
const PLATE = [100, 58, 32];
const BRASS = [200, 150, 60];

/** A deterministic grain, ±2 levels, so a copied or smoothed strip can be told from painted wall. */
function grain(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return (h % 5) - 2;
}

function set(image, x, y, [r, g, b]) {
  const at = (y * image.width + x) * 4;
  image.data[at] = r; image.data[at + 1] = g; image.data[at + 2] = b; image.data[at + 3] = 255;
}

function get(image, x, y) {
  const at = (y * image.width + x) * 4;
  return [image.data[at], image.data[at + 1], image.data[at + 2]];
}

/** Paint a rectangle, x1/y1 exclusive. */
function fill(image, [x0, y0, x1, y1], colour) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(image, x, y, colour);
}

/**
 * The hall, 240 x 140: wall down to row 100 darkening by a level every ten rows, skirting to 112,
 * floor below. The doorway's casing runs cols 10–16 and 76–84 (its opening 16–76, 60 wide) from
 * the header at row 20 to the floor, a doormat covers rows 108+ left of col 82, and a rail with two
 * hooks sits at cols 120–180, its hooks' lowest brass at row 72.
 */
function hall() {
  const image = blank(240, 140);
  for (let y = 0; y < 140; y++) {
    for (let x = 0; x < 240; x++) {
      const base = y < 100 ? WALL.map(v => v - Math.floor(y / 10)) : y < 112 ? SKIRTING : FLOOR;
      set(image, x, y, base.map(v => v + grain(x, y)));
    }
  }
  fill(image, [10, 20, 84, 26], CASING);    // header
  fill(image, [10, 20, 16, 112], CASING);   // left jamb
  fill(image, [76, 20, 84, 112], CASING);   // right jamb
  fill(image, [16, 26, 76, 112], INTERIOR);
  fill(image, [0, 108, 82, 124], MAT);
  fill(image, [120, 62, 180, 70], PLATE);
  for (const x of [134, 164]) {
    fill(image, [x, 56, x + 3, 73], BRASS);   // the hook's shank, down to its lowest row, 72
    fill(image, [x - 3, 66, x + 6, 72], BRASS);
  }
  return image;
}

test('the opening is measured between the two jambs, on the casing colour', () => {
  assert.deepEqual(measureOpening(hall(), { seed: 46, rows: [30, 100] }), { left: 16, right: 76, width: 60 });
});

/** The fixture's edits, in the shape `ATTEMPT_4` gives the real ones. */
const EDITS = {
  jamb: {
    columns: [76, 86], shift: 10, rows: [20, 108], fillRows: [20, 112], skirtingTop: 100,
    tone: [86, 90], grain: [0, 10], keep: [[0, 108, 82, 140]],
  },
  rail: { box: [116, 50, 184, 76], lift: 30, grainRows: 20 },
};

const rowMean = (image, y, [x0, x1]) => {
  const sum = [0, 0, 0];
  for (let x = x0; x < x1; x++) get(image, x, y).forEach((v, k) => { sum[k] += v; });
  return sum.map(v => v / (x1 - x0));
};

test('the right jamb moves across by the shift, and the opening narrows by exactly that much', () => {
  const after = editEntrywayBackdrop(hall(), EDITS);
  assert.deepEqual(measureOpening(after, { seed: 46, rows: [30, 100] }), { left: 16, right: 66, width: 50 });
});

test('the strip the jamb leaves is wall and skirting at the tone beside it, and the doormat is not touched', () => {
  const before = hall();
  const after = editEntrywayBackdrop(before, EDITS);
  for (let y = 20; y < 108; y++) {
    const strip = rowMean(after, y, [76, 86]);
    const beside = rowMean(before, y, [90, 100]);
    strip.forEach((v, k) => assert.ok(Math.abs(v - beside[k]) <= 1.5, `row ${y}: strip ${strip} against ${beside}`));
  }
  for (let y = 108; y < 140; y++) {
    for (let x = 0; x < 82; x++) assert.deepEqual(get(after, x, y), get(before, x, y), `doormat pixel (${x}, ${y})`);
  }
  for (let y = 108; y < 112; y++) {
    for (let x = 82; x < 86; x++) {
      get(after, x, y).forEach((v, k) => assert.ok(Math.abs(v - SKIRTING[k]) <= 4, `skirting (${x}, ${y}) reads ${get(after, x, y)}`));
    }
  }
});

const isBrass = ([r, g, b]) => r >= 140 && g >= 90 && r - b >= 80 && g - b >= 40;

test('each hook tip is its lowest row of brass, and the rail plate and its screws are not hooks', () => {
  assert.deepEqual(measureHookTips(hall(), [116, 50, 184, 76]), [72, 72]);
});

test('the rail and its hooks go up by the lift, and where they hung is wall again', () => {
  const before = hall();
  const after = editEntrywayBackdrop(before, EDITS);
  assert.deepEqual(measureHookTips(after, [116, 20, 184, 46]), [42, 42]);
  assert.deepEqual(get(after, 150, 34), get(before, 150, 64), 'the plate is copied, not repainted');
  for (let y = 50; y < 76; y++) {
    for (let x = 116; x < 184; x++) assert.ok(!isBrass(get(after, x, y)), `brass left behind at (${x}, ${y})`);
    const where = rowMean(after, y, [116, 184]);
    const beside = rowMean(before, y, [190, 230]);
    where.forEach((v, k) => assert.ok(Math.abs(v - beside[k]) <= 1.5, `row ${y}: ${where} against ${beside}`));
  }
});

test('nothing outside the two edits changes, and the input is left as it was', () => {
  const before = hall();
  const copy = Buffer.from(before.data);
  const after = editEntrywayBackdrop(before, EDITS);
  assert.ok(before.data.equals(copy), 'the input image was written to');
  const edited = [[66, 20, 86, 112], [116, 50, 184, 76], [116, 20, 184, 46]];
  for (let y = 0; y < 140; y++) {
    for (let x = 0; x < 240; x++) {
      if (edited.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1)) continue;
      assert.deepEqual(get(after, x, y), get(before, x, y), `(${x}, ${y}) changed`);
    }
  }
});

test('the contact sheet sets each region before beside after, blown up without smoothing', () => {
  const before = hall();
  const after = editEntrywayBackdrop(before, EDITS);
  const sheet = contactSheet(before, after, { zoom: 2, regions: [[60, 20, 100, 60]], gap: 4 });
  assert.deepEqual([sheet.width, sheet.height], [4 + 80 + 4 + 80 + 4, 4 + 80 + 4]);
  // Col 80 row 40 is the old right jamb: casing before, wall after. Each is a 2 x 2 block.
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    assert.deepEqual(get(sheet, 4 + 40 + dx, 4 + 40 + dy), get(before, 80, 40));
    assert.deepEqual(get(sheet, 4 + 80 + 4 + 40 + dx, 4 + 40 + dy), get(after, 80, 40));
  }
});
