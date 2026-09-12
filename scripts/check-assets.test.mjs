// Tests for the Cycle asset validator.
//
//   node --test scripts/check-assets.test.mjs      (also runs as part of `npm test`)
//
// Two halves. The synthetic half builds sheets in memory, so every rule has a
// deterministic pass and a deterministic fail and the suite needs no artwork.
// The fixture half runs the validator over the only two real generations that
// exist — the boy-walk-01 experiment's candidate sheets — which live in
// gitignored `.scratch/` and are therefore not always on disk; those tests skip
// with a message rather than fail when the fixture is absent.
//
// Copy the fixtures somewhere the suite can find them, or point at them:
//
//   CHECK_ASSETS_FIXTURES=/path/to/dir node --test scripts/check-assets.test.mjs
//
// where the directory holds `candidate-sheet.png` and `v2/candidate-sheet.png`.
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { encodePng } from './png.mjs';
import {
  FRAME_BOXES,
  TOLERANCES,
  actorFromFile,
  checkSheet,
  decodeSheet,
  frameBoxForActor,
  monotonic,
  readDeclarations,
} from './check-assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const PERSON = FRAME_BOXES.person;

/** Paint one solid rectangle into a cell: a figure of a known size, standing where told. */
function drawFigure(image, cellX, cellY, frame, { width, height, centreOffset = 0, feetUp = 0, colour = [40, 60, 90] }) {
  const left = cellX + Math.round((frame.width - width) / 2 + centreOffset);
  const bottom = cellY + frame.height - 1 - feetUp;
  for (let row = bottom - height + 1; row <= bottom; row++) {
    for (let column = left; column < left + width; column++) {
      const at = (row * image.width + column) * 4;
      image.data[at] = colour[0];
      image.data[at + 1] = colour[1];
      image.data[at + 2] = colour[2];
      image.data[at + 3] = 255;
    }
  }
}

/** A synthetic sheet: `figure(index)` describes the rectangle in each frame. */
function buildSheet({ frames = 8, columns = 4, frame = PERSON, figure = () => ({ width: 60, height: 200 }) } = {}) {
  const rows = Math.ceil(frames / columns);
  const width = frame.width * columns;
  const height = frame.height * rows;
  const image = { width, height, data: Buffer.alloc(width * height * 4, 0) };
  for (let index = 0; index < frames; index++) {
    const column = index % columns;
    const row = (index - column) / columns;
    drawFigure(image, column * frame.width, row * frame.height, frame, figure(index));
  }
  return { image, frames, columns, frame };
}

function check(sheet, overrides = {}) {
  return checkSheet({ name: 'synthetic.png', colourType: 6, depth: 8, ...sheet, ...overrides });
}

const rules = result => result.failures.map(failure => failure.rule);

test('a correct eight-frame sheet passes every rule', () => {
  const result = check(buildSheet());
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
  assert.equal(result.stats.sheet.width, 768);
  assert.equal(result.stats.sheet.height, 640);
});

test('feet 3 px above the frame bottom fail the feet rule', () => {
  const result = check(buildSheet({ figure: () => ({ width: 60, height: 200, feetUp: 3 }) }));
  assert.equal(result.ok, false);
  assert.deepEqual([...new Set(rules(result))], ['feet']);
  assert.match(result.failures[0].message, /stands 3 px above the frame's bottom edge/);
});

test('feet 1 px above the frame bottom still pass', () => {
  assert.equal(check(buildSheet({ figure: () => ({ width: 60, height: 200, feetUp: 1 }) })).ok, true);
});

test('one frame 8 % taller fails the height-variance rule', () => {
  const result = check(
    buildSheet({ figure: index => ({ width: 60, height: index === 2 ? 216 : 200 }) }),
  );
  assert.equal(result.ok, false);
  assert.deepEqual(rules(result), ['height-variance']);
  assert.match(result.failures[0].message, /varies 8\.0% in content height/);
});

test('a 5 % pop in one frame also fails, and 3 % passes', () => {
  const pop = check(buildSheet({ figure: index => ({ width: 60, height: index === 5 ? 210 : 200 }) }));
  assert.deepEqual(rules(pop), ['height-variance']);
  const within = check(buildSheet({ figure: index => ({ width: 60, height: index === 5 ? 206 : 200 }) }));
  assert.equal(within.ok, true);
});

test('a frame touching the right edge fails the edge-bleed rule', () => {
  const result = check(
    buildSheet({
      figure: index => (index === 3 ? { width: 180, height: 200, centreOffset: 6 } : { width: 60, height: 200 }),
    }),
  );
  assert.equal(result.ok, false);
  assert.deepEqual(rules(result), ['edge-bleed']);
  assert.match(result.failures[0].message, /frame 4 touches the frame's right edge/);
});

test('a drift of 4 px per frame fails the drift rule and nothing else', () => {
  const result = check(
    buildSheet({ figure: index => ({ width: 40, height: 200, centreOffset: -14 + index * 4 }) }),
  );
  assert.equal(result.ok, false);
  assert.deepEqual(rules(result), ['drift']);
  assert.match(result.failures[0].message, /walks 28\.0 px across its own frames/);
});

test('an arm-swing wobble that is not monotonic does not read as drift', () => {
  const wobble = [0, 3, 6, 3, 0, -3, -6, -3];
  const result = check(buildSheet({ figure: index => ({ width: 40, height: 200, centreOffset: wobble[index] }) }));
  assert.equal(result.ok, true);
});

test('content far off the frame centre fails the centre rule', () => {
  const result = check(buildSheet({ figure: () => ({ width: 40, height: 200, centreOffset: 40 }) }));
  assert.equal(result.ok, false);
  assert.deepEqual([...new Set(rules(result))], ['centre']);
  assert.match(result.failures[0].message, /the tolerance is 19\.2 px/);
});

test('a sheet of the wrong size fails on dimensions and says what was expected', () => {
  const sheet = buildSheet();
  const result = check(sheet, { columns: 2 });
  assert.equal(result.ok, false);
  assert.deepEqual(rules(result), ['dimensions']);
  assert.match(result.failures[0].message, /is 768x640; 8 frames of 192x320 in 2 columns needs 384x1280/);
});

test('an empty frame fails the content rule', () => {
  const sheet = buildSheet({ frames: 7 });
  sheet.frames = 8;
  const result = check(sheet);
  assert.equal(result.ok, false);
  assert.deepEqual(rules(result), ['content']);
  assert.match(result.failures[0].message, /frame 8 is empty/);
});

test('content in a cell past the declared frame count fails the spare-cell rule', () => {
  const sheet = buildSheet();
  sheet.frames = 7;
  const result = check(sheet);
  assert.equal(result.ok, false);
  assert.deepEqual(rules(result), ['spare-cell']);
});

test('colour left under a fully transparent pixel fails the residue rule', () => {
  const sheet = buildSheet();
  sheet.image.data[0] = 12; // alpha is still 0 here.
  const result = check(sheet);
  assert.equal(result.ok, false);
  assert.deepEqual(rules(result), ['colour-residue']);
});

test('a sheet that is one soft ramp fails the alpha-binary rule', () => {
  const sheet = buildSheet();
  for (let index = 0; index < sheet.image.width * sheet.image.height; index += 4) {
    sheet.image.data[index * 4 + 3] = 200;
  }
  const result = check(sheet);
  assert.equal(result.ok, false);
  assert.equal(rules(result)[0], 'alpha-binary');
});

test('the measured soft-alpha fraction of a clean sheet is zero', () => {
  const result = check(buildSheet());
  assert.equal(result.stats.intermediateAlphaFraction, 0);
  assert.equal(result.stats.colourResidue, 0);
});

test('an RGB sheet fails the rgba rule', () => {
  const result = check(buildSheet(), { colourType: 2 });
  assert.equal(result.ok, false);
  assert.equal(rules(result)[0], 'rgba');
});

test('a single-frame placeholder passes: one frame is a legal grid', () => {
  const result = check(buildSheet({ frames: 1, columns: 1 }));
  assert.equal(result.ok, true);
  assert.equal(result.stats.heightVariance, undefined);
  assert.equal(result.stats.centreDrift, undefined);
});

test('a cat placeholder passes in its own frame box', () => {
  const result = check(buildSheet({ frames: 1, columns: 1, frame: FRAME_BOXES.cat, figure: () => ({ width: 200, height: 150 }) }));
  assert.equal(result.ok, true);
  assert.equal(result.stats.sheet.width, 256);
});

test('the Actor and its frame box are read off the contract filename', () => {
  assert.equal(actorFromFile('public/assets/actors/mica-run-left.png'), 'mica');
  assert.equal(actorFromFile('assets/actors/boy-walk-right.png'), 'boy');
  assert.equal(actorFromFile('assets/operation-tango-sprite.webp'), null);
  assert.deepEqual(frameBoxForActor('girl'), { width: 192, height: 320 });
  assert.deepEqual(frameBoxForActor('mira'), { width: 256, height: 192 });
  assert.equal(frameBoxForActor('nobody'), null);
});

test('monotonic() is true only for a sequence that moves one way', () => {
  assert.equal(monotonic([0, 1, 2, 3]), true);
  assert.equal(monotonic([3, 3, 2, 1]), true);
  assert.equal(monotonic([0, 2, 1, 3]), false);
});

test('decodeSheet reads the colour type out of the IHDR, which decodePng drops', () => {
  const sheet = buildSheet({ frames: 1, columns: 1 });
  const decoded = decodeSheet(encodePng(sheet.image));
  assert.equal(decoded.colourType, 6);
  assert.equal(decoded.depth, 8);
  assert.equal(decoded.image.width, 192);
});

test('readDeclarations finds the .cycle layers and not the scene sprites', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const declarations = readDeclarations(html);
  assert.ok(declarations.length >= 6, `expected the cast's cycle layers, found ${declarations.length}`);
  for (const declaration of declarations) {
    assert.match(declaration.sheet, /^assets\/actors\/.*\.png$/);
    assert.ok(Number.isInteger(declaration.frames) && declaration.frames >= 1);
    assert.ok(Number.isInteger(declaration.columns) && declaration.columns >= 1);
  }
  assert.ok(!declarations.some(declaration => declaration.sheet.endsWith('.webp')));
});

test('every sheet index.html declares passes the validator as it stands today', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  for (const declaration of readDeclarations(html)) {
    const relative = declaration.sheet.replace(/^\.\//, '');
    const { image, colourType, depth } = decodeSheet(readFileSync(join(root, 'public', relative)));
    const result = checkSheet({
      name: relative,
      image,
      colourType,
      depth,
      frames: declaration.frames,
      columns: declaration.columns,
      frame: frameBoxForActor(actorFromFile(relative)),
    });
    assert.equal(result.ok, true, `${relative}: ${result.failures.map(f => `${f.rule}: ${f.message}`).join('; ')}`);
  }
});

// --- the two real generations, when they are on disk ---------------------------

const fixtureRoots = [
  process.env.CHECK_ASSETS_FIXTURES,
  join(root, 'scripts', '__fixtures__', 'cycles'),
  join(root, '.scratch', 'COOP-001-apartment', 'art', 'cycles', 'experiments', 'boy-walk-01'),
].filter(Boolean);

function fixture(relative) {
  for (const base of fixtureRoots) {
    const path = join(base, relative);
    if (existsSync(path)) return path;
  }
  return null;
}

for (const relative of ['candidate-sheet.png', join('v2', 'candidate-sheet.png')]) {
  test(`the boy-walk-01 ${relative} generation passes the contract`, { skip: fixture(relative) ? false : `fixture ${relative} is not on disk; see the header of this file` }, () => {
    const { image, colourType, depth } = decodeSheet(readFileSync(fixture(relative)));
    const result = checkSheet({
      name: relative,
      image,
      colourType,
      depth,
      frames: 8,
      columns: 4,
      frame: FRAME_BOXES.person,
    });
    assert.equal(result.ok, true, result.failures.map(f => `${f.rule}: ${f.message}`).join('; '));
    // The thresholds in the script's header were derived from exactly these two
    // sheets. If this drifts, the header is stale.
    assert.ok(
      result.stats.intermediateAlphaFraction < TOLERANCES.intermediateAlpha,
      `soft alpha ${result.stats.intermediateAlphaFraction}`,
    );
    assert.ok(result.stats.heightVariance < TOLERANCES.heightVariance, `height variance ${result.stats.heightVariance}`);
  });
}
