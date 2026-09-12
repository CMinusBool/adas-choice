// What the Cycle toolchain can be proved on without spending a generation.
//
// Two kinds of case. The **fixtures** are the only real generations that exist — the two measured
// Boy walks in the effort's experiment directory and the first real shot — and they are skipped
// with a message when `.scratch/` is absent, which it is in every worktree the harness cuts. The
// **synthetic negatives** are the failures the builder must not paper over: a frame 6% taller than
// its neighbours has to come out of the builder as a rejected sheet rather than a quietly rescaled
// one, and mirroring a cat has to be an error rather than a shortcut.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  attributeChanges, applyAttributes, blobsInBand, buildMask, cellRegions, main, measureCell,
  nameParts, parseArguments, renderFrame,
} from './build-cycle.mjs';
import { render, runFor, parseArguments as previewArguments } from './make-preview.mjs';
import { checkSheet, decodeSheet, FRAME_BOXES } from '../check-assets.mjs';
import { blank, decodePng, encodePng } from '../png.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const EXPERIMENT = join(root, '.scratch/COOP-001-apartment/art/cycles/experiments/boy-walk-01');
const GENERATED = join(root, '.scratch/COOP-001-apartment/art/generated/22-boy-walk/boy-walk-right/attempt-1');
const PERSON = FRAME_BOXES.person;

const temporary = () => mkdtempSync(join(tmpdir(), 'build-cycle-'));

/** Run `main` without its progress output; the assertions read the files, not the log. */
function quietly(argv) {
  const log = console.log;
  console.log = () => {};
  try {
    return main(argv);
  } finally {
    console.log = log;
  }
}

/**
 * A synthetic strip in the shape a generation comes back in: figures on a chroma ground, at a
 * generator's size rather than the contract's, laid out 4 across and 2 down.
 */
function syntheticStrip(cells, { width = 1536, height = 1024, columns = 4, rows = 2, key = [0, 255, 0] } = {}) {
  const image = blank(width, height);
  for (let index = 0; index < width * height; index++) {
    image.data[index * 4] = key[0];
    image.data[index * 4 + 1] = key[1];
    image.data[index * 4 + 2] = key[2];
    image.data[index * 4 + 3] = 255;
  }
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  cells.forEach((cell, index) => {
    if (!cell) return;
    const { figureWidth = 120, figureHeight = 400, feetUp = 0, colour = [40, 60, 90], farSide = null } = cell;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = Math.round(column * cellWidth + (cellWidth - figureWidth) / 2);
    const bottom = Math.round((row + 1) * cellHeight) - 1 - feetUp;
    for (let y = bottom - figureHeight + 1; y <= bottom; y++) {
      for (let x = left; x < left + figureWidth; x++) {
        // `farSide` paints the right half a second colour, so a horizontal flip is readable.
        const paint = farSide && x >= left + figureWidth / 2 ? farSide : colour;
        const at = (y * width + x) * 4;
        image.data[at] = paint[0];
        image.data[at + 1] = paint[1];
        image.data[at + 2] = paint[2];
        image.data[at + 3] = 255;
      }
    }
  });
  return image;
}

/** Eight default figures, with `extra` overriding by index; `null` there leaves that cell empty. */
const eight = extra => Array.from({ length: 8 }, (unused, index) => {
  if (extra && index in extra && extra[index] === null) return null;
  return { figureHeight: 400, ...(extra?.[index] ?? {}) };
});

function buildSynthetic(cells, argv = []) {
  const directory = temporary();
  const strip = join(directory, 'strip-raw.png');
  writeFileSync(strip, encodePng(syntheticStrip(cells)));
  const out = join(directory, 'boy-walk-right.png');
  const code = quietly([strip, '--out', out, '--no-manifest', ...argv]);
  return { directory, out, code, exists: existsSync(out) };
}

function measureSheet(path, frame = PERSON) {
  const { image, colourType, depth } = decodeSheet(readFileSync(path));
  return checkSheet({ name: path, image, colourType, depth, frames: 8, columns: 4, frame });
}

test('parseArguments reads the Actor off the contract filename and fixes the frame box', () => {
  const options = parseArguments(['strip.png', '--out', 'mica-walk-right.png']);
  assert.equal(options.actor, 'mica');
  assert.equal(options.cycle, 'walk');
  assert.equal(options.facing, 'right');
  assert.deepEqual(options.frame, FRAME_BOXES.cat);
  assert.equal(options.fps, 10);
  assert.equal(parseArguments(['s.png', '--out', 'boy-run-left.png']).fps, 14);
});

test('parseArguments refuses a sheet whose Actor it cannot name', () => {
  assert.throws(() => parseArguments(['strip.png', '--out', 'candidate.png']), /--actor/);
});

test('--mirror is refused for a cat and allowed for the people', () => {
  // Míca's nose dot must not change sides, so a mirrored cat is a wrong asset, not a cheap one.
  assert.throws(() => parseArguments(['s.png', '--out', 'mica-walk-left.png', '--mirror']), /mirror/);
  assert.throws(() => parseArguments(['s.png', '--out', 'mira-walk-left.png', '--mirror']), /mirror/);
  assert.equal(parseArguments(['s.png', '--out', 'boy-walk-left.png', '--mirror']).mirror, true);
});

test('main exits non-zero when --mirror names a cat', () => {
  const directory = temporary();
  const strip = join(directory, 'strip-raw.png');
  writeFileSync(strip, encodePng(syntheticStrip(eight())));
  assert.throws(
    () => quietly([strip, '--out', join(directory, 'mica-walk-left.png'), '--mirror', '--no-manifest']),
    /mirror/,
  );
});

test('nameParts reads <actor>-<cycle>-<facing>.png and shrugs at anything else', () => {
  assert.deepEqual(nameParts('girl-run-left.png'), { actor: 'girl', cycle: 'run', facing: 'left' });
  assert.deepEqual(nameParts('strip-raw.png'), { actor: null, cycle: null, facing: null });
});

test('buildMask keys out a chroma ground and trusts real alpha when there is some', () => {
  const chroma = syntheticStrip(eight());
  const keyed = buildMask(chroma);
  assert.match(keyed.source, /chroma key/);
  assert.ok(keyed.background > chroma.width * chroma.height * 0.5);

  const transparent = blank(100, 100);
  for (let index = 0; index < 100 * 30; index++) transparent.data[index * 4 + 3] = 255;
  const alpha = buildMask(transparent);
  assert.equal(alpha.source, 'alpha');
  assert.equal(alpha.background, 100 * 70);
});

test('cellRegions walks the grid left to right, then top to bottom', () => {
  const regions = cellRegions(1536, 1024, 4, 2);
  assert.equal(regions.length, 8);
  assert.deepEqual(regions[0], { x0: 0, y0: 0, x1: 384, y1: 512 });
  assert.deepEqual(regions[4], { x0: 0, y0: 512, x1: 384, y1: 1024 });
});

test('blobsInBand counts the figures the generator actually drew', () => {
  const image = syntheticStrip(eight());
  const { mask } = buildMask(image);
  assert.equal(blobsInBand(image, mask, 0, 512), 4);
  const short = syntheticStrip(eight({ 1: null, 2: null }));
  assert.equal(blobsInBand(short, buildMask(short).mask, 0, 512), 2);
});

test('a clean strip becomes a 768x640 sheet the Cycle contract passes', () => {
  const built = buildSynthetic(eight());
  assert.equal(built.code, 0);
  const result = measureSheet(built.out);
  assert.ok(result.ok, result.failures.map(one => `${one.rule}: ${one.message}`).join('; '));
  assert.deepEqual(result.stats.sheet, { width: 768, height: 640 });
  assert.equal(JSON.parse(readFileSync(join(built.directory, 'metrics.json'), 'utf8')).motionPhase, 'not verified');
});

test('a frame 6% taller than its neighbours comes out as a rejected sheet', () => {
  // One shared scale carries the generator's height pop straight through to the sheet, which is
  // the point: the builder never rescales one frame to hide it, and the validator fails it.
  const built = buildSynthetic(eight({ 3: { figureHeight: 424 } }));
  assert.equal(built.code, 1);
  assert.ok(built.exists, 'the sheet is still written, so the failure can be looked at');
  const result = measureSheet(built.out);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(one => one.rule === 'height-variance'), JSON.stringify(result.failures));
});

test('a 3 px feet offset in the generation comes out anchored on the frame bottom', () => {
  const built = buildSynthetic(eight({ 2: { feetUp: 3 }, 6: { feetUp: 3 } }));
  assert.equal(built.code, 0);
  const result = measureSheet(built.out);
  for (const frame of result.stats.measured) assert.equal(frame.feet, 0, `frame ${frame.index} is off the floor`);
});

test('every transparent pixel in a built sheet is colourless', () => {
  const built = buildSynthetic(eight());
  const image = decodePng(readFileSync(built.out));
  let residue = 0;
  for (let index = 0; index < image.width * image.height; index++) {
    if (image.data[index * 4 + 3] === 0 && (image.data[index * 4] || image.data[index * 4 + 1] || image.data[index * 4 + 2])) residue++;
  }
  assert.equal(residue, 0);
  assert.equal(measureSheet(built.out).stats.colourResidue, 0);
});

test('--mirror flips the drawing and leaves it anchored and centred', () => {
  const directory = temporary();
  const strip = join(directory, 'strip-raw.png');
  const red = [200, 30, 30];
  const blue = [30, 60, 200];
  writeFileSync(strip, encodePng(syntheticStrip(eight().map(cell => ({ ...cell, colour: red, farSide: blue })))));
  const plain = join(directory, 'boy-walk-right.png');
  const mirrored = join(directory, 'boy-walk-left.png');
  assert.equal(quietly([strip, '--out', plain, '--no-manifest']), 0);
  assert.equal(quietly([strip, '--out', mirrored, '--mirror', '--no-manifest']), 0);
  const left = measureSheet(mirrored);
  assert.ok(left.ok, left.failures.map(one => one.rule).join('; '));
  // The figure is red on its left and blue on its right; mirrored, those swap. The contract's
  // anchoring does not: feet stay on the bottom edge and the content stays centred.
  const nearest = (image, y) => {
    for (let x = 0; x < PERSON.width; x++) {
      const at = (y * image.width + x) * 4;
      if (image.data[at + 3] === 255) return [image.data[at], image.data[at + 1], image.data[at + 2]];
    }
    return null;
  };
  assert.deepEqual(nearest(decodePng(readFileSync(plain)), 300), red);
  assert.deepEqual(nearest(decodePng(readFileSync(mirrored)), 300), blue);
  for (const frame of left.stats.measured) assert.equal(frame.feet, 0);
});

test('renderFrame leaves an empty cell empty rather than inventing a figure', () => {
  const image = syntheticStrip(eight({ 5: null }));
  const { mask } = buildMask(image);
  const region = cellRegions(image.width, image.height, 4, 2)[5];
  const cell = measureCell(image, mask, region);
  assert.equal(cell.empty, true);
  const frame = renderFrame(image, mask, cell, { frame: PERSON, scale: 0.5 });
  assert.ok(frame.data.every(byte => byte === 0));
});

test('attributeChanges names what a delivery changes in index.html, and applyAttributes makes it', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const change = attributeChanges(html, { file: 'boy-walk-right.png', frames: 8, columns: 4, fps: 10 });
  assert.equal(change.declared, true);
  assert.deepEqual(
    change.changes.map(one => [one.name, one.from, one.to]),
    [['data-frames', '1', '8'], ['data-columns', '1', '4']],
  );
  const updated = applyAttributes(html, change);
  assert.match(updated, /data-frames="8" data-columns="4" data-fps="10" data-sheet="assets\/actors\/boy-walk-right\.png"/);
  assert.equal(attributeChanges(updated, { file: 'boy-walk-right.png', frames: 8, columns: 4, fps: 10 }).changes.length, 0);
  assert.equal(attributeChanges(html, { file: 'boy-run-right.png', frames: 8, columns: 4, fps: 14 }).declared, false);
});

test('make-preview labels a sheet with the rate the contract fixes, not a guess', () => {
  const walk = runFor({ path: '/x/boy-walk-right.png', label: null }, { declaration: null, options: previewArguments([]) });
  assert.equal(walk.fps, 10);
  assert.equal(walk.frames, 8);
  assert.equal(walk.frameWidth, 192);
  assert.match(walk.note, /motion phase not verified/);
  const run = runFor({ path: '/x/mica-run-left.png', label: 'cat' }, { declaration: null, options: previewArguments([]) });
  assert.equal(run.fps, 14);
  assert.equal(run.frameHeight, 192);
  assert.equal(run.title, 'cat');
});

test('make-preview inlines every sheet, so the page opens straight off disk', () => {
  const template = readFileSync(fileURLToPath(new URL('./preview.src.html', import.meta.url)), 'utf8');
  const { html, bytes } = render(
    template,
    { title: 'two runs', runs: [{ title: 'a', note: 'n', sheet: 'a.png', frameWidth: 192, frameHeight: 320, columns: 4, frames: 8, fps: 10 }] },
    () => Buffer.from([1, 2, 3, 4]),
  );
  assert.equal(bytes, 4);
  assert.match(html, /data:image\/png;base64,AQIDBA==/);
  assert.doesNotMatch(html, /sheet": "a\.png/);
  assert.match(html, /BUILD:END/);
  assert.throws(() => render('<html></html>', { title: 't', runs: [] }, () => Buffer.alloc(0)), /BUILD:CONFIG/);
});

for (const [label, strip] of [
  ['the first measured run', join(EXPERIMENT, 'strip-raw.png')],
  ['the second measured run', join(EXPERIMENT, 'v2/strip-raw.png')],
  ['the first real shot', join(GENERATED, 'strip-raw.png')],
]) {
  test(`${label} cuts to a sheet that passes the Cycle contract`, { skip: existsSync(strip) ? false : `${strip} is absent (.scratch/ is gitignored)` }, () => {
    const directory = temporary();
    const out = join(directory, 'boy-walk-right.png');
    assert.equal(quietly([strip, '--out', out, '--no-manifest']), 0);
    const result = measureSheet(out);
    assert.ok(result.ok, result.failures.map(one => `${one.rule}: ${one.message}`).join('; '));
    const metrics = JSON.parse(readFileSync(join(directory, 'metrics.json'), 'utf8'));
    assert.deepEqual(metrics.blobsPerRow, [4, 4]);
    assert.equal(metrics.motionPhase, 'not verified');
  });
}
