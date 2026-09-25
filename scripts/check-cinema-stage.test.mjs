// The Cinema Room's stage as `index.html` furnishes it, held against the
// painted screen of S01 and against the marks the world model stands the Cast on.
//
//   node --test scripts/check-cinema-stage.test.mjs      (also runs as part of `npm test`)
//
// The world model owns the marks and the markup owns the Props, and nothing
// else ties the two together: ticket 36 moved the screen and left three
// shelves and the Poster board standing in front of it, with every world test
// still green. This file is that tie (ticket 63). It reads the markup as text —
// no DOM, no painter — so it checks what the page declares, not how the DOM
// layer draws it, and it asks the model through `scripts/world-model.mjs`.
//
// It lives here rather than beside the model because it is a markup check, like
// `check-assets` and `check-styles`: `src/world/` stays the only thing Vitest
// tests (ticket 70).
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadWorldModel } from './world-model.mjs';

const indexHtml = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

/** The Cinema Room's stage, from its opening tag to the Beats nobody plays yet. */
const stage = (() => {
  const start = indexHtml.indexOf('data-stage="cinema"');
  const end = indexHtml.indexOf('data-beats="cinema"', start);
  if (start < 0 || end < 0) throw new Error('index.html has no Cinema stage');
  return indexHtml.slice(start, end);
})();

/** Every opening tag on the stage, with its classes and its inline custom properties. */
const tags = [...stage.matchAll(/<[a-z]+\b[^>]*>/g)].map(([tag]) => ({
  classes: (/\bclass="([^"]*)"/.exec(tag)?.[1] ?? '').split(/\s+/),
  shelf: /\bdata-shelf="([^"]*)"/.exec(tag)?.[1],
  vars: Object.fromEntries(
    [...(/\bstyle="([^"]*)"/.exec(tag)?.[1] ?? '').matchAll(/--([\w-]+):\s*([-\d.]+)/g)].map(([, name, value]) => [name, Number(value)]),
  ),
}));

const boxOf = vars => ({ x: vars.x, y: vars.y, w: vars.w, h: vars.h });

function propBox(className) {
  const tag = tags.find(candidate => candidate.classes.includes(className));
  if (!tag) throw new Error(`no .${className} on the Cinema stage`);
  return boxOf(tag.vars);
}

/**
 * A shelf is its button and the image standing on the button's base: wider and
 * taller than the button, because the crown ornament rises above it, and drawn
 * at the shelf's own `--scale` of the note's size.
 *
 * The image's box is worked out the way `styles.css`'s `.cinema-shelf
 * .shelf-art` rule lays it out — bottom on the button's base, centred across
 * it, `--art-w` x `--art-h` note units at the shelf's `--scale` — because the
 * markup declares only those numbers, and a box no browser has drawn has no
 * other source. Change that rule and this has to change with it.
 */
function shelfBoxes(shelf) {
  const at = tags.findIndex(tag => tag.shelf === shelf && tag.classes.includes('cinema-shelf'));
  const button = boxOf(tags[at].vars);
  const scale = tags[at].vars.scale ?? 1;
  const art = tags[at + 1];
  if (!art?.classes.includes('shelf-art')) throw new Error(`the ${shelf} shelf has no image`);
  const w = art.vars['art-w'] * scale;
  const h = art.vars['art-h'] * scale;
  return { button, art: { x: button.x + (button.w - w) / 2, y: button.y + button.h - h, w, h } };
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const onStage = box => box.x >= 0 && box.y >= 0 && box.x + box.w <= 1600 && box.y + box.h <= 900;
const within = (point, box) => point.x >= box.x && point.x <= box.x + box.w;

/** The screen sheet, measured off S01 in ticket 36: where the Bumper and the title card play. */
const screen = propBox('cinema-film');
const board = propBox('cinema-board');

/**
 * S01's floor line: the foot of its skirting board. A Prop that stands above it
 * is standing in mid-air; a Prop that hangs below it is hanging off the floor.
 */
const FLOOR_LINE = 600;

let model;
let shelves;
before(async () => {
  model = await loadWorldModel();
  shelves = model.CINEMA_SHELVES.map(shelf => ({ shelf, ...shelfBoxes(shelf) }));
});

describe('the Cinema Room’s screen', () => {
  test('is the sheet measured off the delivered backdrop', () => {
    assert.deepEqual(screen, { x: 727, y: 148, w: 566, h: 316 });
  });

  test('is in full view: no shelf and no part of the Poster board stands in front of it', () => {
    for (const { shelf, button, art } of shelves) {
      assert.equal(overlaps(button, screen), false, `${shelf} shelf`);
      assert.equal(overlaps(art, screen), false, `${shelf} shelf's image`);
    }
    assert.equal(overlaps(board, screen), false, 'the Poster board');
  });
});

describe('the Cinema Room’s shelves and board', () => {
  test('keeps every shelf and the board on the stage', () => {
    for (const { shelf, button, art } of shelves) {
      assert.equal(onStage(button), true, `${shelf} shelf`);
      assert.equal(onStage(art), true, `${shelf} shelf's image`);
    }
    assert.equal(onStage(board), true);
  });

  test('stands the three shelves side by side on one base, comedy first, on the floor', () => {
    const bases = shelves.map(({ button }) => button.y + button.h);
    assert.equal(new Set(bases).size, 1);
    assert.ok(bases[0] >= FLOOR_LINE, `base ${bases[0]} is above the floor line`);
    for (let next = 1; next < shelves.length; next += 1) {
      const left = shelves[next - 1].button;
      const right = shelves[next].button;
      // Next to each other, not on top of each other and not a Room apart.
      assert.ok(right.x >= left.x + left.w, `${shelves[next].shelf} overlaps the shelf before it`);
      assert.ok(right.x - (left.x + left.w) <= 20, `${shelves[next].shelf} stands too far from the shelf before it`);
    }
  });

  test('hangs the board on the wall, above the floor line', () => {
    assert.ok(board.y + board.h < FLOOR_LINE);
  });
});

describe('the marks that follow the shelves and the board', () => {
  test('stands the Boy just left of each shelf’s bay, on the floor in front of it', () => {
    for (const { shelf, button } of shelves) {
      const mark = model.CINEMA_MARKS.shelves[shelf];
      assert.equal(mark.x, button.x - 18, shelf);
      assert.ok(mark.y > button.y + button.h, shelf);
      assert.equal(model.isWalkable('cinema', mark), true, shelf);
    }
  });

  test('stands him in front of the board for each Poster slot, left to right', () => {
    const xs = model.CINEMA_MARKS.boardSlots.map(slot => slot.x);
    assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
    for (const slot of model.CINEMA_MARKS.boardSlots) {
      assert.equal(within(slot, board), true);
      assert.ok(slot.y > board.y + board.h);
      assert.equal(model.isWalkable('cinema', slot), true);
    }
  });

  test('keeps the lucky cat in the comedy shelf and sends Mira to it there', () => {
    const comedy = shelves[0].button;
    const luckyCat = propBox('cinema-lucky-cat');
    assert.ok(luckyCat.x >= comedy.x);
    assert.ok(luckyCat.x + luckyCat.w <= comedy.x + comedy.w);
    assert.ok(luckyCat.y + luckyCat.h <= comedy.y + comedy.h);
    const mark = model.breakableById('cinema-lucky-cat').mark;
    assert.equal(within(mark, { ...comedy, x: comedy.x - 40, w: comedy.w + 80 }), true);
    // Where it lands when she knocks it: on the floor at the shelf's foot.
    const broken = propBox('cinema-lucky-cat-broken');
    assert.equal(overlaps(broken, { ...comedy, x: comedy.x - 40, w: comedy.w + 80, h: comedy.h + 60 }), true);
  });
});
