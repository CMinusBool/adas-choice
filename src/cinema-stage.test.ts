// 63: the Cinema Room's stage as `index.html` furnishes it, held against the
// painted screen of S01 and against the marks the world model stands the Cast on.
//
// The world model owns the marks and the markup owns the Props, and nothing
// else ties the two together: ticket 36 moved the screen and left three
// shelves and the Poster board standing in front of it, with every world test
// still green. This file is that tie. It reads the markup as text — no DOM, no
// painter — so it tests what the page declares, not how the DOM layer draws it.
import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import { CINEMA_MARKS, CINEMA_SHELVES, breakableById, isWalkable, type Point } from './world';

interface Box { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

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

const boxOf = (vars: Record<string, number>): Box => ({ x: vars.x, y: vars.y, w: vars.w, h: vars.h });

function propBox(className: string): Box {
  const tag = tags.find(candidate => candidate.classes.includes(className));
  if (!tag) throw new Error(`no .${className} on the Cinema stage`);
  return boxOf(tag.vars);
}

/**
 * A shelf is its button and the image standing on the button's base: wider and
 * taller than the button, because the crown ornament rises above it, and drawn
 * at the shelf's own `--scale` of the note's size.
 */
function shelfBoxes(shelf: string): { button: Box; art: Box } {
  const at = tags.findIndex(tag => tag.shelf === shelf && tag.classes.includes('cinema-shelf'));
  const button = boxOf(tags[at].vars);
  const scale = tags[at].vars.scale ?? 1;
  const art = tags[at + 1];
  if (!art?.classes.includes('shelf-art')) throw new Error(`the ${shelf} shelf has no image`);
  const w = art.vars['art-w'] * scale;
  const h = art.vars['art-h'] * scale;
  return { button, art: { x: button.x + (button.w - w) / 2, y: button.y + button.h - h, w, h } };
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const onStage = (box: Box) => box.x >= 0 && box.y >= 0 && box.x + box.w <= 1600 && box.y + box.h <= 900;
const within = (point: Point, box: Box) => point.x >= box.x && point.x <= box.x + box.w;

/** The screen sheet, measured off S01 in ticket 36: where the Bumper and the title card play. */
const screen = propBox('cinema-film');
const board = propBox('cinema-board');
const shelves = CINEMA_SHELVES.map(shelf => ({ shelf, ...shelfBoxes(shelf) }));

/**
 * S01's floor line: the foot of its skirting board. A Prop that stands above it
 * is standing in mid-air; a Prop that hangs below it is hanging off the floor.
 */
const FLOOR_LINE = 600;

describe('the Cinema Room’s screen', () => {
  it('is the sheet measured off the delivered backdrop', () => {
    expect(screen).toEqual({ x: 727, y: 148, w: 566, h: 316 });
  });

  it('is in full view: no shelf and no part of the Poster board stands in front of it', () => {
    for (const { shelf, button, art } of shelves) {
      expect(overlaps(button, screen), `${shelf} shelf`).toBe(false);
      expect(overlaps(art, screen), `${shelf} shelf's image`).toBe(false);
    }
    expect(overlaps(board, screen), 'the Poster board').toBe(false);
  });
});

describe('the Cinema Room’s shelves and board', () => {
  it('keeps every shelf and the board on the stage', () => {
    for (const { shelf, button, art } of shelves) {
      expect(onStage(button), `${shelf} shelf`).toBe(true);
      expect(onStage(art), `${shelf} shelf's image`).toBe(true);
    }
    expect(onStage(board)).toBe(true);
  });

  it('stands the three shelves side by side on one base, comedy first, on the floor', () => {
    const bases = shelves.map(({ button }) => button.y + button.h);
    expect(new Set(bases).size).toBe(1);
    expect(bases[0]).toBeGreaterThanOrEqual(FLOOR_LINE);
    for (let next = 1; next < shelves.length; next += 1) {
      const left = shelves[next - 1].button;
      const right = shelves[next].button;
      // Next to each other, not on top of each other and not a Room apart.
      expect(right.x).toBeGreaterThanOrEqual(left.x + left.w);
      expect(right.x - (left.x + left.w)).toBeLessThanOrEqual(20);
    }
  });

  it('hangs the board on the wall, above the floor line', () => {
    expect(board.y + board.h).toBeLessThan(FLOOR_LINE);
  });
});

describe('the marks that follow the shelves and the board', () => {
  it('stands the Boy just left of each shelf’s bay, on the floor in front of it', () => {
    for (const { shelf, button } of shelves) {
      const mark = CINEMA_MARKS.shelves[shelf];
      expect(mark.x, shelf).toBe(button.x - 18);
      expect(mark.y, shelf).toBeGreaterThan(button.y + button.h);
      expect(isWalkable('cinema', mark), shelf).toBe(true);
    }
  });

  it('stands him in front of the board for each Poster slot, left to right', () => {
    const xs = CINEMA_MARKS.boardSlots.map(slot => slot.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    for (const slot of CINEMA_MARKS.boardSlots) {
      expect(within(slot, board)).toBe(true);
      expect(slot.y).toBeGreaterThan(board.y + board.h);
      expect(isWalkable('cinema', slot)).toBe(true);
    }
  });

  it('keeps the lucky cat in the comedy shelf and sends Mira to it there', () => {
    const comedy = shelves[0].button;
    const luckyCat = propBox('cinema-lucky-cat');
    expect(luckyCat.x).toBeGreaterThanOrEqual(comedy.x);
    expect(luckyCat.x + luckyCat.w).toBeLessThanOrEqual(comedy.x + comedy.w);
    expect(luckyCat.y + luckyCat.h).toBeLessThanOrEqual(comedy.y + comedy.h);
    const mark = breakableById('cinema-lucky-cat').mark;
    expect(within(mark, { ...comedy, x: comedy.x - 40, w: comedy.w + 80 })).toBe(true);
    // Where it lands when she knocks it: on the floor at the shelf's foot.
    const broken = propBox('cinema-lucky-cat-broken');
    expect(overlaps(broken, { ...comedy, x: comedy.x - 40, w: comedy.w + 80, h: comedy.h + 60 })).toBe(true);
  });
});
