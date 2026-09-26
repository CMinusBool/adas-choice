import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { decodePng, encodePng } from '../png.mjs';
import { main, measureFeature, measureOpening, narrowDoorway, seamContrast, shrinkFeature } from './edit-game-room-backdrop.mjs';

/** An opaque RGB test image painted by `paint(x, y) -> [r, g, b]`. */
function paint(width, height, fill) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

const pixel = (image, x, y) => [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 3)];

const CASING = [80, 50, 35];
const OPENING = [20, 22, 22];
const FLOOR = [110, 70, 40];
const wall = x => [40 + (x % 7) * 3, 70, 80];

// Casing 0-3, opening 4-19, casing 20-23, textured wall from 24; floor from row 16.
const doorway = () =>
  paint(40, 20, (x, y) => (y >= 16 ? FLOOR : x < 4 || (x >= 20 && x < 24) ? CASING : x < 20 ? OPENING : wall(x)));

test('narrowing the doorway moves the right casing left and fills behind it with the wall beside it', () => {
  const before = doorway();
  assert.deepEqual(measureOpening(before, { rows: [2, 12], probe: 10 }), { left: 4, right: 20, width: 16 });

  const after = narrowDoorway(before, { strip: [20, 23], shift: 6, rows: [0, 15] });

  assert.deepEqual(measureOpening(after, { rows: [2, 12], probe: 10 }), { left: 4, right: 14, width: 10 });
  assert.deepEqual(pixel(after, 14, 5), CASING);
  assert.deepEqual(pixel(after, 17, 5), CASING);
  // Columns 18-23 were casing and are wall now, cloned from the six columns right of it.
  for (let x = 18; x < 24; x++) assert.deepEqual(pixel(after, x, 5), wall(x + 6), `column ${x}`);
  assert.deepEqual(pixel(after, 30, 5), wall(30));
  // Below the rows the edit names, and the source itself, nothing moves.
  assert.deepEqual(pixel(after, 20, 17), FLOOR);
  assert.deepEqual(pixel(before, 20, 5), CASING);
});

test('a feathered move cross-fades its two edges into the painting instead of cutting', () => {
  const before = doorway();
  const after = narrowDoorway(before, { strip: [20, 23], shift: 6, rows: [0, 15], feather: 3 });
  // Right of the fill, the clone gives way to the wall that was there over three columns...
  const blend = (x, t) => wall(x + 6).map((channel, c) => Math.round(channel * (1 - t) + wall(x)[c] * t));
  assert.deepEqual(pixel(after, 24, 5), blend(24, 1 / 4));
  assert.deepEqual(pixel(after, 26, 5), blend(26, 3 / 4));
  assert.deepEqual(pixel(after, 27, 5), wall(27));
  // ...and left of the moved casing, the opening that was there gives way to the one moved in.
  assert.deepEqual(pixel(after, 10, 5), OPENING);
  assert.deepEqual(pixel(after, 14, 5), CASING);
  assert.deepEqual(measureOpening(after, { rows: [2, 12], probe: 8 }), { left: 4, right: 14, width: 10 });
});

// A wall, a skirting and a planked floor, all running horizontally, lit more brightly to the
// right; a pink bed 25 px across (x 58-82) and 16 tall (y 17-32) stands on the floor in front of
// the skirting.
const room = (x, y) => {
  const glow = Math.floor(x / 12);
  if (y < 14) return [40 + glow, 70, 80];
  if (y < 19) return [70 + glow, 50, 40];
  return y % 5 === 0 ? [90 + glow, 57, 33] : [110 + glow, 70, 40];
};
const inBed = (x, y) => ((x - 70) / 12.5) ** 2 + ((y - 24.5) / 7.5) ** 2 <= 1;
const BED = [150, 80, 75];
const bedroom = () => paint(120, 40, (x, y) => (inBed(x, y) ? BED : room(x, y)));
const BOX = [50, 6, 90, 36];
const isPink = ([r, g, b]) => r - g > 28 && g - b < 14;

test('shrinking the bed scales it about its bottom-centre and rebuilds the room behind the ring it uncovers', () => {
  const before = bedroom();
  assert.deepEqual(measureFeature(before, { box: BOX, isFeature: isPink }), { x0: 58, y0: 17, x1: 82, y1: 32 });

  const after = shrinkFeature(before, { box: BOX, factor: 0.6, isFeature: isPink, grow: 0, feather: 1 });

  // 25 x 16 at 0.6 is 15 x 9.6, still centred on x 70.5 and still standing on row 32.
  const shrunk = measureFeature(after, { box: BOX, isFeature: isPink });
  assert.ok(Math.abs(shrunk.x0 - 63) <= 1 && Math.abs(shrunk.x1 - 77) <= 1, JSON.stringify(shrunk));
  assert.ok(Math.abs(shrunk.y0 - 23) <= 1 && shrunk.y1 === 32, JSON.stringify(shrunk));
  // The uncovered ring is the room again, each pixel with the glow of its own column: the floor
  // either side, a plank line, and the skirting the bed stood in front of.
  for (const [x, y] of [[59, 27], [81, 27], [61, 25], [70, 21], [70, 17], [66, 18]]) {
    const got = pixel(after, x, y);
    room(x, y).forEach((channel, index) => assert.ok(Math.abs(got[index] - channel) <= 3, `(${x},${y}) ${got}`));
  }
  // Outside the box nothing moves.
  assert.deepEqual(pixel(after, 40, 30), room(40, 30));
  assert.deepEqual(pixel(after, 100, 30), room(100, 30));
});

test('a seam is the step across a line measured against the steps beside it', () => {
  const grain = (x, y) => (x * 7 + y * 13) % 5;
  const even = paint(40, 20, (x, y) => [60 + grain(x, y), 60, 60]);
  const stepped = paint(40, 20, (x, y) => [60 + grain(x, y) + (x >= 20 ? 12 : 0), 60, 60]);
  const across = { axis: 'x', at: 20, along: [0, 19] };
  assert.ok(seamContrast(even, across) < 1.5, String(seamContrast(even, across)));
  assert.ok(seamContrast(stepped, across) > 3, String(seamContrast(stepped, across)));
  // Rows work the same way.
  const banded = paint(40, 40, (x, y) => [60 + grain(x, y) + (y >= 10 ? 12 : 0), 60, 60]);
  assert.ok(seamContrast(banded, { axis: 'y', at: 10, along: [0, 39] }) > 3);
  assert.ok(seamContrast(banded, { axis: 'y', at: 26, along: [0, 39] }) < 1.5);
  assert.throws(() => seamContrast(banded, { axis: 'y', at: 3, along: [0, 39] }), /six lines/);
});

// S01 as ticket 34 measured it, 1672 x 940 raw px: casings 46-69 and 276-300 under a lintel from
// row 120, the opening 70-275, a skirting 525-561 and planks from 562, and a bed 1116-1303 across.
function paintedGameRoom() {
  const grain = (x, y) => (x * 7 + y * 13) % 5;
  return paint(1672, 940, (x, y) => {
    if (((x - 1209.5) / 94) ** 2 + ((y - 572.5) / 41.5) ** 2 <= 1) return BED;
    const casing = x >= 46 && x <= 300 && y >= 120 && y <= 561 && (y <= 141 || x <= 69 || x >= 276);
    if (casing) return [80 + grain(x, y), 50, 35];
    if (x >= 70 && x <= 275 && y > 141 && y <= 561) return [20, 22, 22];
    if (y < 525) return [40 + grain(x, y), 70, 80];
    if (y < 562) return [70 + grain(x, y), 50, 40];
    return y % 24 === 10 ? [90, 57, 33] : [110 + grain(x, y), 70, 40];
  });
}

function effortWithS01() {
  const effort = mkdtempSync(join(tmpdir(), 'edit-s01-'));
  const attempt = join(effort, '41-game-room', 's01-room', 'attempt-1');
  mkdirSync(attempt, { recursive: true });
  const bytes = encodePng(paintedGameRoom());
  writeFileSync(join(attempt, 'strip-raw.png'), bytes);
  const manifest = {
    schema: 'illustrator-manifest/1',
    shots: [
      { id: 'S01', attempts: [{ runId: 'attempt-1', image: 's01-room/attempt-1/strip-raw.png', imageSha256: sha256(bytes) }], kept: 'attempt-1', file: 's01-room/attempt-1/strip-raw.png' },
      { id: 'S02', kept: 'attempt-5' },
    ],
    revisions: [{ date: '2026-09-25', what: 'an earlier revision' }],
  };
  writeFileSync(join(effort, '41-game-room', 'manifest.json'), JSON.stringify(manifest));
  return { source: join(attempt, 'strip-raw.png'), manifest: join(effort, '41-game-room', 'manifest.json'), bytes };
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const quiet = { log() {}, error() {} };

test('the command writes attempt-1-edit beside attempt-1, quotes the door and the bed, and records the edit additively', () => {
  const { source, manifest, bytes } = effortWithS01();
  assert.equal(main(['--source', source], quiet), 0);

  const edited = join(dirname(dirname(source)), 'attempt-1-edit');
  const metrics = JSON.parse(readFileSync(join(edited, 'metrics.json'), 'utf8'));
  // 168 raw px is 160.8 of today's 1600 units (x 1600/1672), and 141.5 once the Room is x 0.88.
  assert.deepEqual([metrics.opening.before.rawPx, metrics.opening.after.rawPx], [206, 168]);
  assert.ok(Math.abs(metrics.opening.after.stageUnits - 141.5) < 0.2, String(metrics.opening.after.stageUnits));
  // 188 raw px is 95.0 cm; three quarters of it lands inside 70 cm +/- 10 %.
  assert.equal(metrics.bed.before.rawPx, 188);
  assert.ok(Math.abs(metrics.bed.before.cm - 95.0) < 0.1, String(metrics.bed.before.cm));
  assert.ok(metrics.bed.after.cm >= 69 && metrics.bed.after.cm <= 73, String(metrics.bed.after.cm));
  assert.equal(metrics.bed.after.bottom, metrics.bed.before.bottom);
  assert.ok(metrics.seams.every(seam => seam.pass), JSON.stringify(metrics.seams));

  const out = readFileSync(join(edited, 'strip-raw.png'));
  assert.deepEqual([decodePng(out).width, decodePng(out).height], [1672, 940]);
  assert.ok(decodePng(readFileSync(join(edited, 'contact-2x.png'))).width > 0);
  assert.equal(sha256(readFileSync(source)), sha256(bytes), 'attempt-1 is never written');

  const after = JSON.parse(readFileSync(manifest, 'utf8'));
  const s01 = after.shots.find(shot => shot.id === 'S01');
  assert.equal(s01.kept, 'attempt-1');
  assert.equal(s01.file, 's01-room/attempt-1/strip-raw.png');
  assert.equal(s01.edits.length, 1);
  assert.equal(s01.edits[0].image, 's01-room/attempt-1-edit/strip-raw.png');
  assert.equal(s01.edits[0].imageSha256, sha256(out));
  assert.equal(s01.edits[0].fromSha256, sha256(bytes));
  assert.deepEqual(after.shots[1], { id: 'S02', kept: 'attempt-5' });
  assert.equal(after.revisions.length, 2);
  assert.ok(existsSync(join(dirname(manifest), 'manifest.pre-edit-87.json')));

  // Run again: the same edit is replaced, not appended.
  assert.equal(main(['--source', source], quiet), 0);
  const again = JSON.parse(readFileSync(manifest, 'utf8'));
  assert.equal(again.shots.find(shot => shot.id === 'S01').edits.length, 1);
  assert.equal(again.revisions.length, 2);
});

test('the command refuses a source that is not the attempt the manifest recorded', () => {
  const { source } = effortWithS01();
  writeFileSync(source, encodePng(paint(1672, 940, () => [40, 70, 80])));
  assert.throws(() => main(['--source', source], quiet), /sha256/);
  assert.equal(existsSync(join(dirname(dirname(source)), 'attempt-1-edit')), false);
});
