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
  seat: /\bdata-seat="([^"]*)"/.exec(tag)?.[1],
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
/** Inside the Cinema's own stage, `STAGES.cinema` — read once the model has loaded. */
const onStage = box =>
  box.x >= 0 && box.y >= 0 && box.x + box.w <= model.STAGES.cinema.width && box.y + box.h <= model.STAGES.cinema.height;
const within = (point, box) => point.x >= box.x && point.x <= box.x + box.w;

/** The screen sheet, measured off S01 in ticket 36: where the Bumper and the title card play. */
const screen = propBox('cinema-film');
const board = propBox('cinema-board');

/**
 * S01's floor line: the foot of its skirting board. A Prop that stands above it
 * is standing in mid-air; a Prop that hangs below it is hanging off the floor.
 * 92: y 469 on the 1360 x 765 stage (design 80 section 2.2).
 */
const FLOOR_LINE = 469;

/** Design 75's R1, the map from the 1600 x 900 stage to the 1360 x 765 one. */
const R1 = 0.78;

const near = (actual, expected, slack, label) =>
  assert.ok(Math.abs(actual - expected) <= slack, `${label}: ${actual} is not within ${slack} of ${expected}`);
const bottomCentre = box => ({ x: box.x + box.w / 2, y: box.y + box.h });

let model;
let shelves;
before(async () => {
  model = await loadWorldModel();
  shelves = model.CINEMA_SHELVES.map(shelf => ({ shelf, ...shelfBoxes(shelf) }));
});

describe('the Cinema Room’s screen', () => {
  test('is the sheet measured off the delivered backdrop', () => {
    // 36's (727, 148, 566 x 316) by R1, which ticket 91's sheet measures
    // (606.7, 115.4, 441.4 x 246.4) on the 1360 x 765 stage.
    assert.deepEqual(screen, { x: 607.06, y: 115.44, w: 441.48, h: 246.48 });
    const sheet = { x: 606.7, y: 115.4, w: 441.4, h: 246.4 };
    for (const side of ['x', 'y', 'w', 'h']) near(screen[side], sheet[side], 0.5, `the screen's ${side}`);
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
      // 63's 18 units left of the bay, by R1 until ticket 73 re-lays the wall.
      near(mark.x, button.x - 18 * R1, 0.01, shelf);
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

// 92: the Cinema on its 1360 x 765 stage, design 75 sections 4.1 (D6) and 4.4.
describe('the Cinema Room at true size', () => {
  test('keeps the one door: the doorway link is 142 x 350 units within 3 per cent', () => {
    const door = propBox('cinema-door');
    near(door.w, 142, 142 * 0.03, 'the door’s width');
    near(door.h, 350, 350 * 0.03, 'the door’s height');
    // Its foot is the painted floor line's doorway, left of everything on the wall.
    assert.ok(door.x + door.w <= board.x, 'the door stands clear of the board');
  });

  test('stands the beanbags, the cabinet and the film can apart, at their true sizes', () => {
    const girl = propBox('beanbag-girl');
    const boy = propBox('beanbag-boy');
    const cabinet = propBox('cinema-cabinet');
    const can = propBox('cinema-film-can');
    assert.deepEqual([girl, cabinet, boy].map(({ w, h }) => [w, h]), [[180, 110], [140, 100], [180, 110]]);
    assert.deepEqual([can.w, can.h], [60, 38]);
    for (const [a, b, label] of [[girl, cabinet, 'her beanbag and the cabinet'], [cabinet, boy, 'the cabinet and his beanbag'], [girl, boy, 'the two beanbags'], [girl, can, 'her beanbag and the can'], [boy, can, 'his beanbag and the can']]) {
      assert.equal(overlaps(a, b), false, label);
    }
    // The can lies on the cabinet's top.
    assert.equal(can.y + can.h, cabinet.y);
    assert.ok(can.x >= cabinet.x && can.x + can.w <= cabinet.x + cabinet.w);
  });

  test('stands the projector on the cabinet top, and the reel on its front hub', () => {
    const cabinet = propBox('cinema-cabinet');
    const projector = propBox('cinema-projector');
    near(projector.y + projector.h, cabinet.y, 0.5, 'the projector’s foot on the cabinet top');
    assert.ok(projector.x >= cabinet.x && projector.x + projector.w <= cabinet.x + cabinet.w, 'the projector is on the cabinet');
    // Design 75 section 4.4: the front hub at (440.1, 455.3), the reel 60 x 0.78 across.
    const reel = propBox('cinema-reel');
    near(reel.x + reel.w / 2, 440.1, 0.05, 'the reel’s centre x');
    near(reel.y + reel.h / 2, 455.3, 0.05, 'the reel’s centre y');
    near(reel.w, 60 * R1, 0.05, 'the reel’s size');
    // Ticket 71, folded in: no spindles overlay any more.
    assert.equal(tags.some(tag => tag.classes.includes('cinema-spindles')), false);
    assert.equal(stage.includes('spindles.png'), false);
  });

  test('seats each of the two on a still whose bottom-centre is the seat mark, within 6 units', () => {
    const seats = tags.filter(tag => tag.seat);
    assert.deepEqual(seats.map(tag => tag.seat).sort(), ['boy', 'girl']);
    for (const tag of seats) {
      const at = bottomCentre(boxOf(tag.vars));
      const mark = model.CINEMA_MARKS[`${tag.seat}Seat`];
      assert.ok(Math.hypot(at.x - mark.x, at.y - mark.y) <= 6, `${tag.seat}'s still stands ${at.x}, ${at.y} against ${mark.x}, ${mark.y}`);
    }
  });
});
