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
// which is what the sheet really is (S19's declaration in the model is ticket
// 100's to correct); the sheet file is the one `index.html`'s Beat layer names.
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
  const sheet = { image, columns: entry.columns, cellWidth, cellHeight, file: layer[1] };
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

const gap = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const fmt = p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;

let handOffs;

before(async () => {
  const world = await loadWorldModel();
  const { ARRIVAL_SECONDS, actorView, advance, arrivalView, createWorld } = world;
  let state = advance(createWorld({ hash: '', storedLanguage: null, reducedMotion: false }), { type: 'arrival-started' });
  const last = { boy: null, girl: null };
  handOffs = [];
  for (let now = TICK_MS; now <= (ARRIVAL_SECONDS + 1) * 1000; now += TICK_MS) {
    state = advance(state, { type: 'actor-tick', now });
    const view = arrivalView(state);
    const seconds = view.seconds;
    for (const actor of ['boy', 'girl']) {
      const at = actorView(state, actor);
      const beat = view.beats.find(one => one.hides.includes(actor)) ?? null;
      const here = at && at.room === 'entryway' ? { at: at.at, beat } : null;
      const before = last[actor];
      if (before && here) {
        if (!before.beat && here.beat) {
          handOffs.push({ actor, seconds, what: `sprite → ${here.beat.id}`, from: before.at, to: figureFeet(here.beat, actor) });
        } else if (before.beat && !here.beat) {
          handOffs.push({ actor, seconds, what: `${before.beat.id} → sprite`, from: figureFeet(before.beat, actor), to: here.at });
        } else if (before.beat && here.beat && before.beat.id !== here.beat.id) {
          handOffs.push({ actor, seconds, what: `${before.beat.id} → ${here.beat.id}`, from: figureFeet(before.beat, actor), to: figureFeet(here.beat, actor) });
        }
      }
      last[actor] = here;
    }
    if (view.state === 'done') break;
  }
});

describe('the Entryway arrival hands the Boy and the Girl to their Beats without a jump', () => {
  test('every one of S15–S19 is handed to and handed back', () => {
    const seen = new Set(handOffs.flatMap(one => one.what.match(/S\d+/g)));
    assert.deepEqual([...seen].sort(), ['S15', 'S16', 'S17', 'S18', 'S19']);
  });

  test(`no hand-off moves the feet more than ${MAX_JUMP} units`, () => {
    const jumps = handOffs
      .map(one => ({ ...one, distance: gap(one.from, one.to) }))
      .filter(one => one.distance > MAX_JUMP)
      .map(one => `${one.actor} ${one.what} at ${one.seconds.toFixed(2)} s: ${fmt(one.from)} → ${fmt(one.to)}, ${one.distance.toFixed(1)} units`);
    assert.deepEqual(jumps, []);
  });
});
