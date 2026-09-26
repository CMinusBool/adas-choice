// The Entryway's arrival, played through the world model and held against the
// Beat sheets it hands the Boy and the Girl to (ticket 86).
//
//   node --test scripts/check-entryway-handoffs.test.mjs      (also runs as part of `npm test`)
//
// The closing rule (`CLOSING.md` §7): no Actor's feet jump more than 6 units when
// a sprite hands over to a Beat, or a Beat back to the sprite. The model knows
// where each Actor stands and which Beat frame is showing, and only the sheet
// knows where inside that frame the figure's feet are — S15 alone ends with the
// Boy's feet 26 units from where it starts them. So this file plays the whole
// script at the page's frame rate, and at every moment an Actor gives way to a
// Beat, takes over from one, or passes from one Beat to the next, measures the
// figure's feet off the sheet's own pixels and compares.
//
// A figure's feet are the bottom of its opaque pixels and the middle of their
// span across the lowest 12 px — the same bottom-centre a Cycle frame is seated
// by. The sheet's grid is read from `public/assets/entryway/manifest.json`,
// which is what the sheet really is; the sheet file is the one `index.html`'s
// Beat layer names.
//
// 100: the three cats too. A cat's Beat (S20–S22) hides nobody, because the cat
// is not an Actor until it lands: the Beat plays, and the cue that places the
// cat on its mark fires on the frame the Beat ends. So a cat's hand-off is its
// Beat's last frame to its sprite, and the same 6 units hold. So does its
// size: the cat in that last frame stands at the Actor's `data-height`, ± 5 %.
// And every Beat the model plays declares the grid its sheet really has, which
// is what S19 at 4 frames of an 8-frame sheet got wrong (two squashed Girls).
//
// 105: the Boy and the Girl too. In every frame that hands one of them to or
// from a Beat, the figure the sheet draws stands at the Actor's `data-height`,
// ± 5 %, so nobody grows or shrinks as a sprite gives way to a Beat. And the
// backpack S15 sets down is drawn exactly once from the moment it leaves his
// back: by S15 while it draws the bag, then by the Prop, which stands where
// S15's last bag frame leaves it and at the size that frame draws it.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { decodePng } from './png.mjs';
import { loadWorldModel } from './world-model.mjs';

const read = relative => readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)));
const indexHtml = read('index.html').toString('utf8');
const manifest = JSON.parse(read('public/assets/entryway/manifest.json').toString('utf8'));

/** The rule, in stage units. */
const MAX_JUMP = 6;
/** How many px of a figure's lowest rows its feet are taken across. */
const FEET_BAND = 12;
/** The page's frame loop, which is also how the model is ticked everywhere else. */
const TICK_MS = 16;

/**
 * Which columns of a duet frame are whose, in the sheet's own px.
 *
 * S16 draws the Boy on the left and the Girl on the right in all eight frames;
 * their shoes never cross x 215 of the 438-px cell.
 */
const DUET_COLUMNS = { S16: { boy: [0, 215], girl: [215, 438] } };
/**
 * Which columns a duet figure's height is read across: the Boy's hair crosses
 * x 215 in the first frames, so the Girl's head is read right of x 225.
 */
const DUET_HEADS = { S16: { boy: [0, 215], girl: [225, 438] } };

/**
 * Where S15 draws the backpack once it is off his back, in its 336 × 570 cell.
 *
 * From frame 5 he holds it by the handle, down at his right, and from frame 8
 * he has let go and stood up. In frames 5–7 everything right of x 189 (the
 * bag's own left edge, which the toe of his shoe touches) and below y 403
 * (under his fingertips) is the bag.
 */
const BAG = { beat: 'S15', frames: [4, 5, 6], window: { x: 189, y: 403 } };

/** Each cat's own Beat, which draws her climbing out of the backpack. */
const CAT_BEATS = { mica: 'S20', mira: 'S21', luna: 'S22' };
/** How far a cat's size in her last Beat frame may be from her Actor's. */
const HEIGHT_TOLERANCE = 0.05;
const ACTORS = ['boy', 'girl', ...Object.keys(CAT_BEATS)];

/** The Actor's `data-height` on the `#cast` block, in stage units. */
function dataHeight(actor) {
  const match = new RegExp(`data-actor="${actor}"[^>]*data-height="([\\d.]+)"`).exec(indexHtml);
  assert.ok(match, `index.html has no data-height for the ${actor}`);
  return Number(match[1]);
}

/** Which Beat is standing in for this Actor right now, if any. */
function standIn(view, actor) {
  const cat = CAT_BEATS[actor];
  return view.beats.find(one => (cat ? one.id === cat : one.hides.includes(actor))) ?? null;
}

const sheets = new Map();

/** A Beat's sheet: its pixels and its real grid. */
function sheetOf(beatId) {
  if (sheets.has(beatId)) return sheets.get(beatId);
  const layer = new RegExp(`data-beat="${beatId}"[^>]*data-still="assets/entryway/([\\w-]+\\.png)"`).exec(indexHtml);
  assert.ok(layer, `index.html has no Entryway layer for ${beatId}`);
  const entry = manifest.assets.find(asset => asset.file === layer[1]);
  assert.ok(entry, `the Entryway manifest has no entry for ${layer[1]}`);
  const [cellWidth, cellHeight] = entry.frame.split('x').map(Number);
  const image = decodePng(read(`public/assets/entryway/${layer[1]}`));
  const sheet = { image, frames: entry.frames, columns: entry.columns, cellWidth, cellHeight, file: layer[1] };
  sheets.set(beatId, sheet);
  return sheet;
}

/** Where the actor's feet are on the stage while `beat` shows its current frame. */
function figureFeet(beat, actor) {
  const { image, columns, cellWidth, cellHeight, file } = sheetOf(beat.id);
  const left = (beat.frame % columns) * cellWidth;
  const top = Math.floor(beat.frame / columns) * cellHeight;
  const [from, to] = DUET_COLUMNS[beat.id]?.[actor] ?? [0, cellWidth];
  const opaque = (x, y) => image.data[((top + y) * image.width + left + x) * 4 + 3] >= 128;
  let bottom = -1;
  for (let y = cellHeight - 1; y >= 0 && bottom < 0; y--) {
    for (let x = from; x < to; x++) if (opaque(x, y)) { bottom = y + 1; break; }
  }
  assert.ok(bottom > 0, `${file} frame ${beat.frame + 1} draws nothing for the ${actor}`);
  let min = Infinity;
  let max = -Infinity;
  for (let y = Math.max(0, bottom - FEET_BAND); y < bottom; y++) {
    for (let x = from; x < to; x++) {
      if (opaque(x, y)) { min = Math.min(min, x); max = Math.max(max, x + 1); }
    }
  }
  return {
    x: beat.box.x + ((min + max) / 2) * (beat.box.width / cellWidth),
    y: beat.box.y + bottom * (beat.box.height / cellHeight),
  };
}

/** How tall the actor's figure in `beat`'s current frame is drawn, in stage units. */
function figureHeight(beat, actor) {
  const { image, columns, cellWidth, cellHeight } = sheetOf(beat.id);
  const left = (beat.frame % columns) * cellWidth;
  const top = Math.floor(beat.frame / columns) * cellHeight;
  const [from, to] = DUET_HEADS[beat.id]?.[actor] ?? [0, cellWidth];
  let first = -1;
  let last = -1;
  for (let y = 0; y < cellHeight; y++) {
    for (let x = from; x < to; x++) {
      if (image.data[((top + y) * image.width + left + x) * 4 + 3] >= 128) {
        if (first < 0) first = y;
        last = y;
        break;
      }
    }
  }
  return (last + 1 - first) * (beat.box.height / cellHeight);
}

/** The opaque box of `image`'s pixels inside a rectangle, in its px. */
function opaqueBox(image, left, top, right, bottom) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] >= 128) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1);
        y1 = Math.max(y1, y + 1);
      }
    }
  }
  return { x0, y0, x1, y1 };
}

/** Where S15's current frame draws the backpack on the stage. */
function bagInBeat(beat) {
  const { image, columns, cellWidth, cellHeight } = sheetOf(beat.id);
  const left = (beat.frame % columns) * cellWidth;
  const top = Math.floor(beat.frame / columns) * cellHeight;
  const px = opaqueBox(image, left + BAG.window.x, top + BAG.window.y, left + cellWidth, top + cellHeight);
  const perX = beat.box.width / cellWidth;
  const perY = beat.box.height / cellHeight;
  return {
    x0: beat.box.x + (px.x0 - left) * perX,
    x1: beat.box.x + (px.x1 - left) * perX,
    y0: beat.box.y + (px.y0 - top) * perY,
    y1: beat.box.y + (px.y1 - top) * perY,
  };
}

/** Where the backpack Prop draws the bag, shut, on the stage: its box in `index.html` over its sheet's first cell. */
function bagOfProp() {
  const tag = /<[^>]*data-prop="backpack"[^>]*>/.exec(indexHtml);
  assert.ok(tag, 'index.html has no backpack Prop');
  const vars = Object.fromEntries([...tag[0].matchAll(/--([xywh]):([-\d.]+)/g)].map(([, side, value]) => [side, Number(value)]));
  const file = /data-still="assets\/entryway\/([\w-]+\.png)"/.exec(tag[0])[1];
  const entry = manifest.assets.find(asset => asset.file === file);
  const [cellWidth, cellHeight] = entry.frame.split('x').map(Number);
  const px = opaqueBox(decodePng(read(`public/assets/entryway/${file}`)), 0, 0, cellWidth, cellHeight);
  return {
    x0: vars.x + px.x0 * (vars.w / cellWidth),
    x1: vars.x + px.x1 * (vars.w / cellWidth),
    y0: vars.y + px.y0 * (vars.h / cellHeight),
    y1: vars.y + px.y1 * (vars.h / cellHeight),
  };
}

const gap = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const fmt = p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;

let handOffs;
/** Every Beat the model played, by id: the grid it declared and its last frame shown. */
let played;
/** The Boy's and the Girl's Beat frames at each of their hand-offs, and how tall each draws them. */
let handedFrames;
/** At every tick from S15's first bag frame on: who draws the backpack, and the last S15 frame that did. */
let bagTicks;
let lastBagFrame;

before(async () => {
  const world = await loadWorldModel();
  const { ARRIVAL_SECONDS, actorView, advance, arrivalView, createWorld, entrywayProps } = world;
  let state = advance(createWorld({ hash: '', storedLanguage: null, reducedMotion: false }), { type: 'arrival-started' });
  const last = Object.fromEntries(ACTORS.map(actor => [actor, { at: null, beat: null }]));
  handOffs = [];
  handedFrames = [];
  bagTicks = [];
  lastBagFrame = null;
  played = new Map();
  for (let now = TICK_MS; now <= (ARRIVAL_SECONDS + 1) * 1000; now += TICK_MS) {
    state = advance(state, { type: 'actor-tick', now });
    const view = arrivalView(state);
    const seconds = view.seconds;
    for (const beat of view.beats) played.set(beat.id, beat);
    const setting = view.beats.find(beat => beat.id === BAG.beat && BAG.frames.includes(beat.frame));
    if (setting) lastBagFrame = setting;
    if (setting || bagTicks.length) bagTicks.push({ seconds, beat: Boolean(setting), prop: entrywayProps(state).backpack !== 'carried' });
    for (const actor of ACTORS) {
      const standing = actorView(state, actor);
      // A cat is nowhere until she lands; the Boy and the Girl are nowhere until they walk in.
      const at = standing && standing.room === 'entryway' ? standing.at : null;
      const here = { at, beat: standIn(view, actor) };
      const before = last[actor];
      if (!CAT_BEATS[actor]) {
        const frames = [];
        if (here.beat && here.beat.id !== before.beat?.id) frames.push(here.beat);
        if (before.beat && before.beat.id !== here.beat?.id) frames.push(before.beat);
        for (const beat of frames) handedFrames.push({ actor, seconds, id: beat.id, frame: beat.frame, drawn: figureHeight(beat, actor) });
      }
      if (!before.beat && here.beat && before.at) {
        handOffs.push({ actor, seconds, what: `sprite → ${here.beat.id}`, from: before.at, to: figureFeet(here.beat, actor) });
      } else if (before.beat && !here.beat && here.at) {
        handOffs.push({ actor, seconds, what: `${before.beat.id} → sprite`, from: figureFeet(before.beat, actor), to: here.at });
      } else if (before.beat && here.beat && before.beat.id !== here.beat.id) {
        handOffs.push({ actor, seconds, what: `${before.beat.id} → ${here.beat.id}`, from: figureFeet(before.beat, actor), to: figureFeet(here.beat, actor) });
      }
      last[actor] = here;
    }
    if (view.state === 'done') break;
  }
});

describe('every Entryway Beat is played at the grid its sheet really has', () => {
  test('each Beat declares the frames and columns the Entryway manifest gives its sheet', () => {
    const wrong = [...played.values()]
      .map(beat => ({ beat, sheet: sheetOf(beat.id) }))
      .filter(({ beat, sheet }) => beat.frames !== sheet.frames || beat.columns !== sheet.columns)
      .map(({ beat, sheet }) => `${beat.id} declares ${beat.frames} frames in ${beat.columns} columns; ${sheet.file} is ${sheet.frames} in ${sheet.columns}`);
    assert.deepEqual(wrong, []);
    assert.deepEqual([...played.keys()].sort(), ['S15', 'S16', 'S17', 'S18', 'S19', 'S20', 'S21', 'S22']);
  });
});

describe('the cats climb out of the backpack at their own size', () => {
  for (const [actor, id] of Object.entries(CAT_BEATS)) {
    test(`${id}'s last frame draws the ${actor} at her data-height, ± ${HEIGHT_TOLERANCE * 100} %`, () => {
      const beat = played.get(id);
      assert.ok(beat, `${id} never played`);
      const drawn = figureHeight(beat, actor);
      const wanted = dataHeight(actor);
      assert.ok(
        Math.abs(drawn - wanted) <= wanted * HEIGHT_TOLERANCE,
        `${id} frame ${beat.frame + 1} draws the ${actor} ${drawn.toFixed(1)} units tall; her Actor is ${wanted}`,
      );
    });
  }
});

describe('the Entryway arrival hands every Actor to and from its Beats without a jump', () => {
  test('every one of S15–S19 is handed to and handed back, and each cat is handed on from S20–S22', () => {
    const seen = new Set(handOffs.flatMap(one => one.what.match(/S\d+/g)));
    assert.deepEqual([...seen].sort(), ['S15', 'S16', 'S17', 'S18', 'S19', 'S20', 'S21', 'S22']);
    for (const [actor, id] of Object.entries(CAT_BEATS)) {
      assert.ok(handOffs.some(one => one.actor === actor && one.what === `${id} → sprite`), `${id} never hands the ${actor} on`);
    }
  });

  test(`no hand-off moves the feet more than ${MAX_JUMP} units`, t => {
    const measured = handOffs.map(one => ({ ...one, distance: gap(one.from, one.to) }));
    // Every distance, on the test's own output, so a report can quote them.
    for (const one of measured) t.diagnostic(`${one.actor} ${one.what} at ${one.seconds.toFixed(2)} s: ${one.distance.toFixed(1)} units`);
    const jumps = measured
      .filter(one => one.distance > MAX_JUMP)
      .map(one => `${one.actor} ${one.what} at ${one.seconds.toFixed(2)} s: ${fmt(one.from)} → ${fmt(one.to)}, ${one.distance.toFixed(1)} units`);
    assert.deepEqual(jumps, []);
  });
});

describe('the Boy and the Girl keep their own height through every Beat they are handed to', () => {
  test(`every frame that hands either of them over draws them at their data-height, ± ${HEIGHT_TOLERANCE * 100} %`, t => {
    const seen = new Set(handedFrames.map(one => one.id));
    assert.deepEqual([...seen].sort(), ['S15', 'S16', 'S17', 'S18', 'S19']);
    for (const one of handedFrames) {
      t.diagnostic(`${one.actor} ${one.id} frame ${one.frame + 1} at ${one.seconds.toFixed(2)} s: ${one.drawn.toFixed(1)} units`);
    }
    const wrong = handedFrames
      .filter(one => Math.abs(one.drawn - dataHeight(one.actor)) > dataHeight(one.actor) * HEIGHT_TOLERANCE)
      .map(one => `${one.id} frame ${one.frame + 1} draws the ${one.actor} ${one.drawn.toFixed(1)} units tall; the Actor is ${dataHeight(one.actor)}`);
    assert.deepEqual(wrong, []);
  });
});

describe('the backpack S15 sets down stays where it was set down', () => {
  test('from S15’s first bag frame on, the bag is drawn exactly once at every tick: by S15, then by the Prop', () => {
    assert.ok(lastBagFrame, `${BAG.beat} never drew the bag`);
    const twice = bagTicks.filter(one => one.beat && one.prop).map(one => `both at ${one.seconds.toFixed(3)} s`);
    const never = bagTicks.filter(one => !one.beat && !one.prop).map(one => `neither at ${one.seconds.toFixed(3)} s`);
    assert.deepEqual([...twice, ...never], []);
  });

  test(`the Prop stands where S15’s last bag frame leaves the bag, within ${MAX_JUMP} units, at its drawn height ± ${HEIGHT_TOLERANCE * 100} %`, t => {
    const beat = bagInBeat(lastBagFrame);
    const prop = bagOfProp();
    const base = box => ({ x: (box.x0 + box.x1) / 2, y: box.y1 });
    const tall = box => box.y1 - box.y0;
    t.diagnostic(`S15 frame ${lastBagFrame.frame + 1} leaves the bag at (${beat.x0.toFixed(1)}, ${beat.y0.toFixed(1)})–(${beat.x1.toFixed(1)}, ${beat.y1.toFixed(1)})`);
    t.diagnostic(`the Prop draws it at (${prop.x0.toFixed(1)}, ${prop.y0.toFixed(1)})–(${prop.x1.toFixed(1)}, ${prop.y1.toFixed(1)})`);
    const moved = gap(base(beat), base(prop));
    assert.ok(moved <= MAX_JUMP, `the bag's base moves ${moved.toFixed(1)} units, ${fmt(base(beat))} → ${fmt(base(prop))}`);
    assert.ok(
      Math.abs(tall(prop) - tall(beat)) <= tall(beat) * HEIGHT_TOLERANCE,
      `the bag is ${tall(beat).toFixed(1)} units tall in S15 and ${tall(prop).toFixed(1)} as the Prop`,
    );
  });
});
