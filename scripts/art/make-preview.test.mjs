// What the motion-phase reviewer's inputs can be proved on without a vision model.
//
// The defect these images exist to expose — the leading leg never swapping — is not decidable by
// code; that is the whole reason ticket 09 spends an agent and a human on it. What *is* decidable
// is that the reviewer gets the frames it was promised, in the right order, at the right size, and
// that the two side-by-sides really pair frames half a cycle apart: a compare image built from the
// wrong pair would let a shuffling cycle through while looking like a check.
//
// The two measured Boy walks are fixtures here, skipped with a message when `.scratch/` is absent,
// which it is in every worktree the harness cuts.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  composeTiles, comparePairs, cutFrames, parseArguments, REVIEW, upscale, writeReviewImages,
} from './make-preview.mjs';
import { FRAME_BOXES } from '../check-assets.mjs';
import { blank, decodePng, encodePng } from '../png.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const EXPERIMENT = join(root, '.scratch/COOP-001-apartment/art/cycles/experiments/boy-walk-01');
const PERSON = FRAME_BOXES.person;

const temporary = () => mkdtempSync(join(tmpdir(), 'make-preview-'));

/** A sheet whose every frame is a flat colour, so a mis-cut frame is a wrong pixel value. */
function syntheticSheet({ frames = 8, columns = 4, width = 8, height = 10 } = {}) {
  const rows = Math.ceil(frames / columns);
  const sheet = blank(width * columns, height * rows);
  for (let index = 0; index < frames; index++) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const at = ((row * height + y) * sheet.width + column * width + x) * 4;
        sheet.data[at] = index * 10 + 1;
        sheet.data[at + 1] = 0x40;
        sheet.data[at + 2] = 0x80;
        sheet.data[at + 3] = 255;
      }
    }
  }
  return sheet;
}

test('--review-images and --zoom parse, and a fractional zoom is refused', () => {
  const options = parseArguments(['--sheet', 'a.png', '--review-images', 'out/review', '--zoom', '3']);
  assert.equal(options.reviewImages, 'out/review');
  assert.equal(options.zoom, 3);
  assert.equal(parseArguments(['--sheet', 'a.png']).zoom, 2, 'the default zoom is 2x');
  assert.equal(parseArguments(['--sheet', 'a.png']).reviewImages, null);
  assert.throws(() => parseArguments(['--zoom', '1.5']), /whole number/);
  assert.throws(() => parseArguments(['--zoom', '0']), /1 or more/);
});

test('cutFrames returns the frames in the contract order, left to right then top to bottom', () => {
  const tiles = cutFrames(syntheticSheet(), { frameWidth: 8, frameHeight: 10, frames: 8, columns: 4 });
  assert.equal(tiles.length, 8);
  assert.deepEqual(tiles.map(one => one.number), [1, 2, 3, 4, 5, 6, 7, 8]);
  tiles.forEach((tile, index) => {
    assert.equal(tile.image.width, 8);
    assert.equal(tile.image.height, 10);
    assert.equal(tile.image.data[0], index * 10 + 1, `frame ${index + 1} came from the wrong cell`);
  });
});

test('cutFrames refuses a sheet too small for the frame box rather than cutting rubbish', () => {
  assert.throws(
    () => cutFrames(blank(100, 100), { frameWidth: PERSON.width, frameHeight: PERSON.height, frames: 8, columns: 4 }),
    /too small/,
  );
});

test('upscale is nearest-neighbour: no invented edge between the near and the far leg', () => {
  const image = blank(2, 1);
  image.data.set([10, 20, 30, 255, 200, 210, 220, 255]);
  assert.equal(upscale(image, 1), image);
  const bigger = upscale(image, 3);
  assert.equal(bigger.width, 6);
  assert.equal(bigger.height, 3);
  // Every destination pixel is a source pixel verbatim; nothing between 30 and 220 appears.
  const blues = new Set();
  for (let index = 0; index < bigger.width * bigger.height; index++) blues.add(bigger.data[index * 4 + 2]);
  assert.deepEqual([...blues].sort((a, b) => a - b), [30, 220]);
});

test('comparePairs pairs frames half a cycle apart, which is where the leg must have swapped', () => {
  assert.deepEqual(comparePairs(8), [[1, 5], [4, 8]]);
  assert.deepEqual(comparePairs(4), [[1, 3], [2, 4]]);
  assert.deepEqual(comparePairs(6), [[1, 4], [3, 6]]);
  assert.deepEqual(comparePairs(1), []);
});

test('composeTiles lays tiles on the neutral, keeps them opaque, and stamps a number', () => {
  const tiles = cutFrames(syntheticSheet(), { frameWidth: 8, frameHeight: 10, frames: 8, columns: 4 });
  const canvas = composeTiles([tiles[0], tiles[4]], { zoom: 2 });
  assert.equal(canvas.width, REVIEW.gutter + 2 * (16 + REVIEW.gutter));
  assert.equal(canvas.height, REVIEW.gutter + (20 + REVIEW.gutter));
  const pixel = (x, y) => [...canvas.data.subarray((y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 4)];
  assert.deepEqual(pixel(0, 0), [...REVIEW.background, 255], 'the ground is the flat neutral');
  // Frame 5's flat colour lands in the second column, at the tile's bottom-right corner.
  const right = REVIEW.gutter + 16 + REVIEW.gutter + 15;
  assert.deepEqual(pixel(right, REVIEW.gutter + 19), [41, 0x40, 0x80, 255]);
  const inked = canvas.data.filter((value, index) => index % 4 === 0 && value === REVIEW.ink[0]).length;
  assert.ok(inked > 0, 'the frame number is stamped in ink');
});

test('writeReviewImages writes a frame per frame, the strip and the two side-by-sides', () => {
  const dir = temporary();
  const sheetPath = join(dir, 'sheet.png');
  const sheet = syntheticSheet();
  const run = {
    sheet: sheetPath, frameWidth: 8, frameHeight: 10, frames: 8, columns: 4,
  };
  const written = writeReviewImages(run, join(dir, 'review'), { zoom: 2, read: () => encodePng(sheet) });
  const names = readdirSync(join(dir, 'review')).sort();
  assert.deepEqual(names, [
    'compare-1-5.png', 'compare-4-8.png',
    'frame-01.png', 'frame-02.png', 'frame-03.png', 'frame-04.png',
    'frame-05.png', 'frame-06.png', 'frame-07.png', 'frame-08.png',
    'frame-strip-2x.png',
  ]);
  assert.equal(written.length, 11);
  const strip = decodePng(readFileSync(join(dir, 'review', 'frame-strip-2x.png')));
  assert.equal(strip.width, REVIEW.gutter + 8 * (16 + REVIEW.gutter), 'the strip is one row of every frame');
  const compare = decodePng(readFileSync(join(dir, 'review', 'compare-1-5.png')));
  assert.equal(compare.width, REVIEW.gutter + 2 * (16 + REVIEW.gutter));
});

test('the measured Boy walks cut into eleven review images each', { skip: skipWithout(EXPERIMENT) }, () => {
  for (const sheet of ['candidate-sheet.png', 'v2/candidate-sheet.png']) {
    const dir = join(temporary(), 'review');
    const run = {
      sheet: join(EXPERIMENT, sheet),
      frameWidth: PERSON.width, frameHeight: PERSON.height, frames: 8, columns: 4,
    };
    const written = writeReviewImages(run, dir, { zoom: 2 });
    assert.equal(written.length, 11, `${sheet} produced ${written.length} review images`);
    const compare = decodePng(readFileSync(join(dir, 'compare-1-5.png')));
    assert.equal(compare.height, REVIEW.gutter + PERSON.height * 2 + REVIEW.gutter);
    // Both contact frames carry drawing: an empty tile would make the reviewer's "no" meaningless.
    let opaque = 0;
    for (let index = 0; index < compare.width * compare.height; index++) {
      if (compare.data[index * 4 + 3] === 255) opaque++;
    }
    assert.equal(opaque, compare.width * compare.height, 'every review pixel is opaque over the neutral');
  }
});

function skipWithout(path) {
  return existsSync(path) ? false : `${path} is absent (the effort's .scratch/ is not in a worktree)`;
}
