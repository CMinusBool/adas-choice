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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { encodePng } from './png.mjs';
import {
  CYCLE_ONLY_RULES,
  FRAME_BOXES,
  TOLERANCES,
  actorFromFile,
  beatHint,
  checkSheet,
  decodeSheet,
  frameBoxForActor,
  monotonic,
  parseArguments,
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

// --- the Beat contract: the same sheet rules, minus the four a Beat breaks ------

/**
 * A sheet that breaks every Cycle-only rule at once and no other: the figure
 * grows, lifts off the floor and walks across its own frames, which is what a
 * Beat is for. Nothing here touches a frame edge or a spare cell.
 */
function buildBeat({ frames = 8, columns = 4 } = {}) {
  return buildSheet({
    frames,
    columns,
    figure: index => ({ width: 40, height: 150 + index * 10, centreOffset: -60 + index * 18, feetUp: index * 5 }),
  });
}

test('the four Cycle-only rules are exactly the ones a Beat is excused', () => {
  assert.deepEqual([...CYCLE_ONLY_RULES].sort(), ['centre', 'drift', 'feet', 'height-variance']);
});

test('a Beat fails the Cycle contract on the four rules and nothing else', () => {
  const result = check(buildBeat());
  assert.equal(result.ok, false);
  assert.deepEqual([...new Set(rules(result))].sort(), ['centre', 'drift', 'feet', 'height-variance']);
});

test('the same Beat passes under beat: true', () => {
  const result = check(buildBeat(), { beat: true });
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
});

test('a Beat of the wrong size still fails on dimensions', () => {
  const result = check(buildBeat(), { beat: true, columns: 2 });
  assert.deepEqual(rules(result), ['dimensions']);
  assert.match(result.failures[0].message, /is 768x640; 8 frames of 192x320 in 2 columns needs 384x1280/);
});

test('a Beat that declares no grid still fails on grid', () => {
  const result = check(buildBeat(), { beat: true, frames: 0 });
  assert.deepEqual(rules(result), ['grid']);
});

test('an RGB Beat still fails the rgba rule', () => {
  assert.deepEqual(rules(check(buildBeat(), { beat: true, colourType: 2 })), ['rgba']);
});

test('a Beat that is one soft ramp still fails the alpha-binary rule', () => {
  const sheet = buildBeat();
  for (let index = 0; index < sheet.image.width * sheet.image.height; index += 4) {
    sheet.image.data[index * 4 + 3] = 200;
  }
  // The ramp paints every fourth pixel, edges included, so edge-bleed rides along.
  assert.equal(rules(check(sheet, { beat: true }))[0], 'alpha-binary');
});

test('colour under a transparent pixel of a Beat still fails the residue rule', () => {
  const sheet = buildBeat();
  sheet.image.data[0] = 12; // alpha is still 0 here.
  assert.deepEqual(rules(check(sheet, { beat: true })), ['colour-residue']);
});

test('an empty frame in a Beat still fails the content rule', () => {
  const sheet = buildBeat({ frames: 7 });
  sheet.frames = 8;
  const result = check(sheet, { beat: true });
  assert.deepEqual(rules(result), ['content']);
  assert.match(result.failures[0].message, /frame 8 is empty/);
});

test('a Beat frame touching its right edge still fails the edge-bleed rule', () => {
  const sheet = buildSheet({
    figure: index => (index === 3 ? { width: 180, height: 200, centreOffset: 6 } : { width: 40, height: 150 + index * 10 }),
  });
  const result = check(sheet, { beat: true });
  assert.deepEqual(rules(result), ['edge-bleed']);
  assert.match(result.failures[0].message, /frame 4 touches the frame's right edge/);
});

test('content in a spare cell of a Beat still fails the spare-cell rule', () => {
  const sheet = buildBeat();
  sheet.frames = 7;
  assert.deepEqual(rules(check(sheet, { beat: true })), ['spare-cell']);
});

test('a default run that only broke Cycle-only rules is told --beat exists', () => {
  const hint = beatHint(check(buildBeat()));
  assert.match(hint, /--beat/);
});

test('no hint when the sheet would fail under --beat too', () => {
  // rgba is a sprite-sheet rule, so --beat would not save this one.
  assert.equal(beatHint(check(buildBeat(), { colourType: 2 })), null);
});

test('no hint for a sheet that passes, nor for one already checked as a Beat', () => {
  assert.equal(beatHint(check(buildSheet())), null);
  assert.equal(beatHint(check(buildBeat(), { beat: true })), null);
});

test('a Beat run records which contract was applied, and a Cycle run does not', () => {
  assert.equal(check(buildBeat(), { beat: true }).stats.contract, 'beat');
  assert.equal('contract' in check(buildSheet()).stats, false);
});

const BEAT_ARGS = ['--beat', 'beat.png', '--frames', '8', '--columns', '4', '--frame', '360x360'];

test('--beat is off by default and on when asked for', () => {
  assert.equal(parseArguments(['public/assets/actors/boy-walk-right.png']).beat, false);
  const options = parseArguments(BEAT_ARGS);
  assert.equal(options.beat, true);
  assert.deepEqual(options.paths, ['beat.png']);
  assert.deepEqual(options.frame, { width: 360, height: 360 });
});

test('--beat with no sheet named is refused: index.html declares Cycles, not Beats', () => {
  assert.throws(() => parseArguments(['--beat', '--frames', '8', '--columns', '4', '--frame', '360x360']), {
    message: /--beat needs the sheets? to check.*index\.html declares Cycles/s,
  });
});

test('--beat without a frame box is refused, because a Beat has no standard one', () => {
  assert.throws(() => parseArguments(['--beat', 'beat.png', '--frames', '8', '--columns', '4']), {
    message: /--beat needs --frame <width>x<height>/,
  });
});

test('--beat without --frames and --columns is refused', () => {
  assert.throws(() => parseArguments(['--beat', 'beat.png', '--columns', '4', '--frame', '360x360']), {
    message: /--beat needs --frames and --columns/,
  });
  assert.throws(() => parseArguments(['--beat', 'beat.png', '--frames', '8', '--frame', '360x360']), {
    message: /--beat needs --frames and --columns/,
  });
});

test('--beat with --actor is refused: --actor is a Cycle frame box by another name', () => {
  assert.throws(() => parseArguments([...BEAT_ARGS, '--actor', 'mira']), {
    message: /--actor names a Cycle's frame box/,
  });
});

// --- the command line, end to end, over a Beat written to a temp file ----------

/** Run the script the way a person would, and hand back what they would see. */
function runCli(args) {
  const run = spawnSync(process.execPath, [join(root, 'scripts', 'check-assets.mjs'), ...args], { encoding: 'utf8' });
  return { status: run.status, out: `${run.stdout}${run.stderr}` };
}

test('the command line checks a Beat under --beat and refuses it under neither', t => {
  const directory = mkdtempSync(join(tmpdir(), 'beat-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const frame = { width: 120, height: 160 };
  const sheet = buildSheet({
    frames: 8,
    columns: 4,
    frame,
    figure: index => ({ width: 20, height: 70 + index * 6, centreOffset: -40 + index * 11, feetUp: index * 4 }),
  });
  const path = join(directory, 'mira-startle-right.png');
  writeFileSync(path, encodePng(sheet.image));
  const grid = ['--frames', '8', '--columns', '4', '--frame', '120x160'];

  const beat = runCli(['--beat', path, ...grid]);
  assert.equal(beat.status, 0, beat.out);
  assert.match(beat.out, /^PASS/m);
  assert.match(beat.out, /1\/1 sheets pass the Beat contract\./);

  const cycle = runCli([path, ...grid]);
  assert.equal(cycle.status, 1, cycle.out);
  assert.match(cycle.out, /^FAIL/m);
  assert.match(cycle.out, /re-run with --beat/);
  assert.match(cycle.out, /1 sheets pass the Cycle contract\./);
});

test('the command line refuses --beat with nothing to check', () => {
  const refused = runCli(['--beat', '--frames', '8', '--columns', '4', '--frame', '120x160']);
  assert.equal(refused.status, 1);
  assert.match(refused.out, /check-assets: --beat needs the sheets to check/);
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
