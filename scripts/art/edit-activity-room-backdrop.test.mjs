// What `edit-activity-room-backdrop.mjs` promises (COOP-001 ticket 93, design 75 §4.5 "T13's edit"):
// the Activity Room backdrop's painted doorway brought to the one door, 142 x 350 units (± 3 %), by
// moving its right-hand casing across the plain wall — a pixel edit, never a generation.
//
// The fixture is a synthetic backdrop the size of the kept S01 source (1672 x 941 raw px), with
// its casings, reveal, skirting and floor drawn at the columns and rows measured on that source.
// Every expected number below is a literal read off the fixture or taken from the design note,
// not recomputed the way the script computes it.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { editBackdrop, main, measureDoorway, stageUnits } from './edit-activity-room-backdrop.mjs';
import { blank, decodePng, encodePng } from '../png.mjs';

const WIDTH = 1672;
const HEIGHT = 941;

/**
 * The wall's texture: a slow mottle across x (period 64 px, ± 12 levels) under a per-pixel grain
 * (-2..1). Neighbouring columns of it differ by at most 5 levels; a strip cloned from 26 columns
 * away and butted against the wall it came from differs by up to 10 at the join, which is what a
 * seam is. The real wall's mottle is lower still, so this is the harder case.
 */
function grain(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return Math.round(12 * Math.sin((2 * Math.PI * x) / 64)) + (h & 3) - 2;
}

/** Paint a box, x1/y1 exclusive, in one colour, optionally with the wall's grain. */
function paint(image, [x0, y0, x1, y1], [r, g, b], { textured = false } = {}) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const at = (y * image.width + x) * 4;
      const n = textured ? grain(x, y) : 0;
      image.data[at] = r + n; image.data[at + 1] = g + n; image.data[at + 2] = b + n; image.data[at + 3] = 255;
    }
  }
}

/**
 * The S01 doorway as measured on attempt-2 (raw px): the left casing's face to x 117 and its
 * brown reveal 118-125, the opening 126-322, the right casing 323-348, the wall from 349; the
 * casing head from y 172, the opening from 198, the skirting 605-646, the floor from 647.
 */
function backdrop() {
  const image = blank(WIDTH, HEIGHT);
  paint(image, [0, 0, WIDTH, 605], [96, 112, 98], { textured: true });  // wall
  paint(image, [0, 605, WIDTH, 647], [60, 64, 58], { textured: true }); // skirting
  paint(image, [0, 647, WIDTH, HEIGHT], [150, 100, 60]);                 // floor
  paint(image, [92, 172, 349, 647], [88, 63, 40]);                       // casings and head
  paint(image, [118, 198, 126, 647], [45, 31, 21]);                      // left reveal
  paint(image, [126, 198, 323, 640], [15, 15, 14]);                      // the opening
  paint(image, [126, 640, 323, 647], [110, 80, 50]);                     // threshold
  return image;
}

test('the doorway measures from the left casing to the right casing, reveal included', () => {
  assert.deepEqual(measureDoorway(backdrop()), { x0: 118, x1: 323, width: 205 });
});

test('the edit brings the doorway to the one door, 142 units ± 3 % on the 1328-unit stage', () => {
  const after = editBackdrop(backdrop());
  assert.deepEqual(measureDoorway(after), { x0: 118, x1: 297, width: 179 });
  const units = stageUnits(179, WIDTH);
  assert.ok(units >= 138 && units <= 146, `${units} units is outside 138-146 (design 75 §2.2)`);
});

test('the right casing is moved, not redrawn: the same pixels, 26 px to the left', () => {
  const before = backdrop();
  const after = editBackdrop(before);
  for (const y of [180, 400, 620]) {
    for (let x = 323; x < 349; x++) {
      const from = (y * WIDTH + x) * 4, to = (y * WIDTH + x - 26) * 4;
      assert.deepEqual([...after.data.subarray(to, to + 4)], [...before.data.subarray(from, from + 4)], `(${x},${y})`);
    }
  }
});

test('the casing takes its contact shadow on the first floor row with it', () => {
  const before = backdrop();
  paint(before, [340, 647, 348, 648], [40, 30, 20]); // the shadow under the casing's outer foot
  const after = editBackdrop(before);
  const red = (x, y) => after.data[(y * WIDTH + x) * 4];
  for (let x = 314; x < 322; x++) assert.equal(red(x, 647), 40, `no shadow under the moved foot at x ${x}`);
  for (let x = 340; x < 348; x++) assert.equal(red(x, 647), 150, `the old shadow is left on the floor at x ${x}`);
});

test('nothing outside the doorway strip changes, and the source image is left as it was', () => {
  const before = backdrop();
  const pristine = Buffer.from(before.data);
  const after = editBackdrop(before);
  assert.ok(before.data.equals(pristine), 'the input image was written to');
  // Design 75 §4.5's box, rows 160-620 and x 285.5-359 of 1600u, is raw 165-647 by 297-376; the
  // edit may also touch the few rows above it and the columns after it that feather the join.
  const touched = (x, y) => x >= 297 && x <= 366 && y >= 160 && y <= 647;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (touched(x, y)) continue;
      const at = (y * WIDTH + x) * 4;
      if (!after.data.subarray(at, at + 4).equals(before.data.subarray(at, at + 4))) {
        assert.fail(`(${x},${y}) changed outside the edit`);
      }
    }
  }
});

test('no seam: neighbouring wall pixels across the joins differ no more than the wall itself does', () => {
  const after = editBackdrop(backdrop());
  const green = (x, y) => after.data[(y * WIDTH + x) * 4 + 1];
  // The right-hand join, from the wall the casing vacated (325) well into the unedited wall.
  for (let y = 150; y < 600; y++) {
    for (let x = 325; x < 390; x++) {
      const step = Math.abs(green(x + 1, y) - green(x, y));
      assert.ok(step <= 5, `column step ${step} at (${x},${y})`);
    }
  }
  // The top join, above the casing head, where the shifted wall meets the wall above it.
  for (let x = 297; x < 390; x++) {
    for (let y = 150; y < 171; y++) {
      const step = Math.abs(green(x, y + 1) - green(x, y));
      assert.ok(step <= 5, `row step ${step} at (${x},${y})`);
    }
  }
  // And the strip the casing left is wall (green 112 ± 14), not casing (63).
  for (let x = 325; x <= 350; x++) assert.ok(green(x, 400) > 95, `x ${x} is not wall`);
});

/** A generation directory like ticket 42's: the kept S01 attempt and its illustrator manifest. */
function generationDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'edit-activity-room-'));
  const attempt = join(directory, 'A-S01-backdrop', 'attempt-2');
  mkdirSync(attempt, { recursive: true });
  const source = join(attempt, 'strip-raw.png');
  writeFileSync(source, encodePng(backdrop()));
  const manifest = {
    schema: 'illustrator-manifest/1',
    ticket: '42-art-activity-room',
    shots: [
      { id: 'A-S01-backdrop', file: 'A-S01-backdrop/attempt-2/strip-raw.png', sha256: sha256(readFileSync(source)), delivered: true },
      { id: 'A-S02-table', file: 'A-S02-table/attempt-1/strip-raw.png', sha256: 'ab'.repeat(32), delivered: true },
    ],
  };
  writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { directory, source, manifest };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('the edit is written as an -edit attempt beside the source, which stays byte for byte', () => {
  const { directory, source } = generationDirectory();
  const sourceBytes = readFileSync(source);
  assert.equal(main(['--source', source, '--quiet']), 0);
  assert.ok(readFileSync(source).equals(sourceBytes), 'the source was rewritten');
  const output = join(directory, 'A-S01-backdrop', 'attempt-2-edit');
  const edited = decodePng(readFileSync(join(output, 'strip.png')));
  assert.deepEqual([edited.width, edited.height], [WIDTH, HEIGHT]);
  assert.deepEqual(measureDoorway(edited), { x0: 118, x1: 297, width: 179 });
  const sheet = decodePng(readFileSync(join(output, 'contact-sheet-2x.png')));
  assert.ok(sheet.width > sheet.height, 'the contact sheet is before and after, side by side');
});

test('the manifest gains the edit and keeps everything it had', () => {
  const { directory, source, manifest } = generationDirectory();
  main(['--source', source, '--quiet']);
  main(['--source', source, '--quiet']); // a re-run replaces its own record, it does not add a second
  const after = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  const { edits, ...kept } = after.shots[0];
  assert.deepEqual(kept, manifest.shots[0]);
  assert.deepEqual(after.shots[1], manifest.shots[1]);
  assert.equal(after.schema, manifest.schema);
  assert.equal(edits.length, 1);
  const [edit] = edits;
  assert.equal(edit.file, 'A-S01-backdrop/attempt-2-edit/strip.png');
  assert.equal(edit.sha256, sha256(readFileSync(join(directory, edit.file))));
  assert.deepEqual(edit.editOf, { file: manifest.shots[0].file, sha256: manifest.shots[0].sha256 });
  assert.equal(edit.ticket, '93-activity-room-doorway');
  assert.equal(edit.script, 'scripts/art/edit-activity-room-backdrop.mjs');
  assert.equal(edit.generated, false);
});

test('a source that is not the kept attempt is refused, and nothing is written', () => {
  const { directory, source } = generationDirectory();
  const other = backdrop();
  other.data[0] ^= 1;
  writeFileSync(source, encodePng(other));
  const before = readFileSync(join(directory, 'manifest.json'), 'utf8');
  assert.equal(main(['--source', source, '--quiet']), 1);
  assert.equal(readFileSync(join(directory, 'manifest.json'), 'utf8'), before);
  assert.ok(!existsSync(join(directory, 'A-S01-backdrop', 'attempt-2-edit')));
});
