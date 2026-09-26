// The Game Room's stage as `index.html` furnishes it, held against the doorway
// painted in S01, the poufs painted under the seated stills, and the marks the
// world model seats the Cast on (ticket 89, design 75 §4.3).
//
//   node --test scripts/check-game-room-stage.test.mjs      (also runs as part of `npm test`)
//
// The Cinema Room has had this tie since ticket 63 (`check-cinema-stage`): the
// markup owns the Props, the model owns the marks, and the painted features are
// measured numbers that neither of them can see. It reads the markup and the
// stylesheet as text, so it checks what the page declares, not how a browser
// draws it, and it asks the model through `scripts/world-model.mjs`.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadWorldModel } from './world-model.mjs';

const read = relative => readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');
const indexHtml = read('index.html');
const stylesCss = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** The Game Room's stage, from its opening tag to the end of its door link. */
const stage = (() => {
  const start = indexHtml.indexOf('data-stage="games"');
  const end = indexHtml.indexOf('</a>', indexHtml.indexOf('prop-door', start));
  if (start < 0 || end < 0) throw new Error('index.html has no Game Room stage');
  return indexHtml.slice(start, end);
})();

/** Every opening tag on the stage, with its classes, its data attributes and its inline box. */
const tags = [...stage.matchAll(/<[a-z]+\b[^>]*>/g)].map(([tag]) => ({
  classes: (/\bclass="([^"]*)"/.exec(tag)?.[1] ?? '').split(/\s+/),
  seat: /\bdata-seat="([^"]*)"/.exec(tag)?.[1],
  game: /\bdata-game="([^"]*)"/.exec(tag)?.[1],
  vars: Object.fromEntries(
    [...(/\bstyle="([^"]*)"/.exec(tag)?.[1] ?? '').matchAll(/--([\w-]+):\s*([-\d.]+)/g)].map(([, name, value]) => [name, Number(value)]),
  ),
}));

const boxOf = ({ vars }) => ({ x: vars.x, y: vars.y, w: vars.w, h: vars.h });
function propBox(className, match = () => true) {
  const tag = tags.find(candidate => candidate.classes.includes(className) && match(candidate));
  if (!tag) throw new Error(`no .${className} on the Game Room stage`);
  return boxOf(tag);
}
const right = box => box.x + box.w;
const bottom = box => box.y + box.h;
const centreX = box => box.x + box.w / 2;
const near = (actual, expected, slack, what) =>
  assert.ok(Math.abs(actual - expected) <= slack, `${what}: ${actual.toFixed(1)} against ${expected.toFixed(1)} ± ${slack}`);

/**
 * The leaf's box: the link's box less the four insets `.prop-door .door-leaf`
 * gives it in `styles.css`, as percentages of the link.
 */
function leafBox(link) {
  const rule = /\.prop-door \.door-leaf\s*\{([^}]*)\}/.exec(stylesCss)?.[1];
  if (!rule) throw new Error('styles.css has no .prop-door .door-leaf rule');
  const inset = side => Number(new RegExp(`(?:^|[;\\s])${side}:\\s*([-\\d.]+)%`).exec(rule)?.[1] ?? NaN);
  const [left, rightInset, top, bottomInset] = ['left', 'right', 'top', 'bottom'].map(inset);
  const x = link.x + (link.w * left) / 100;
  const y = link.y + (link.h * top) / 100;
  return { x, y, w: link.x + link.w * (1 - rightInset / 100) - x, h: link.y + link.h * (1 - bottomInset / 100) - y };
}

/**
 * S01's doorway as ticket 87's edit leaves it, read off
 * `attempt-1-edit/strip-raw.png` (1672 x 940 raw px) by colour-jump scans and
 * turned into this stage's units (× 1408 / 1672 across, × 792 / 940 down): the
 * casing's outer edge raw (46,119)-(263,561), the dark opening raw
 * (70,143)-(237,561), both standing on the floor line at raw 561.
 */
const PAINTED_CASING = { x: 38.7, y: 100.3, w: 182.8, h: 372.4 };
const PAINTED_OPENING = { x: 58.9, y: 120.5, w: 140.6, h: 352.2 };

/**
 * The pouf painted under each seated still, as a share of the still's own box:
 * its left, right and lowest edges read off the pouf's colour, and its top the
 * crown of its dome (the Girl sits in the middle of hers, so her pouf's crown
 * is the ellipse through the rim either side of her). Measured on the delivered
 * `girl-pouf.png` (480 x 520 px) and `boy-pouf.png` (520 x 560 px).
 */
const PAINTED_POUF = {
  girl: { left: 31 / 480, right: 449 / 480, top: 300 / 520, bottom: 518 / 520 },
  boy: { left: 45 / 520, right: 483 / 520, top: 365 / 560, bottom: 553 / 560 },
};

/** The one door (design 75 §2.2), and the drop check's tolerance on it. */
const DOOR = { w: 142, h: 350, slack: 0.03 };

let model;
before(async () => {
  model = await loadWorldModel();
});

describe('the Game Room’s door', () => {
  const link = propBox('prop-door');
  const leaf = leafBox(link);

  test('the link takes the painted casing', () => {
    for (const side of ['x', 'y', 'w', 'h']) near(link[side], PAINTED_CASING[side], 1.5, `the link's ${side}`);
  });

  test('the leaf fills the painted opening', () => {
    for (const side of ['x', 'y', 'w', 'h']) near(leaf[side], PAINTED_OPENING[side], 1.5, `the leaf's ${side}`);
  });

  test('the opening and the leaf are the one door, 142 x 350 within 3 %', () => {
    for (const [what, box] of [['the painted opening', PAINTED_OPENING], ['the leaf', leaf]]) {
      near(box.w, DOOR.w, DOOR.w * DOOR.slack, `${what}'s width`);
      near(box.h, DOOR.h, DOOR.h * DOOR.slack, `${what}'s height`);
    }
  });

  test('the left Portal clears the casing', () => {
    const portal = propBox('portal', tag => tag.game === 'tango');
    assert.ok(portal.x > right(link), `the left Portal starts at ${portal.x}, inside the casing that ends at ${right(link)}`);
  });
});

describe('the Game Room’s sideboard', () => {
  const sideboard = propBox('prop-sideboard');

  test('is 400 units long, free-standing under the middle Portal', () => {
    near(sideboard.w, 400, 1, 'the sideboard');
    near(centreX(sideboard), centreX(propBox('portal', tag => tag.game === 'lovers')), 1, 'its middle');
  });

  test('carries the snow globe on its right end, past the game cases', () => {
    const globe = propBox('prop-globe');
    // S02 re-cut: the top surface runs from its back edge, 35 units under the
    // box's top, to its front edge at 49; the cases end 312 units in.
    assert.ok(bottom(globe) >= sideboard.y + 35 && bottom(globe) <= sideboard.y + 49, `the globe stands at ${bottom(globe)}`);
    assert.ok(globe.x >= sideboard.x + 312 && right(globe) <= right(sideboard), 'the globe is off the cases and on the sideboard');
  });
});

describe('the Game Room’s seats', () => {
  function seatedAt(id) {
    const world = model.advance(
      model.createWorld({ hash: '#/games', storedLanguage: null, reducedMotion: true }),
      { type: 'visitor-input' },
    );
    const view = model.actorView(world, id);
    assert.equal(view?.room, 'games');
    assert.equal(view?.seated, true, `${id} is seated`);
    return view.at;
  }

  for (const id of ['girl', 'boy']) {
    test(`hands the ${id} over to a seated still with no jump over 6 units`, () => {
      const still = propBox('prop-seated', tag => tag.seat === id);
      const mark = seatedAt(id);
      near(centreX(still), mark.x, 6, `the ${id}'s still across`);
      near(bottom(still), mark.y, 6, `the ${id}'s still down`);
    });

    test(`draws the ${id}'s empty pouf where the still paints it, within 5 units`, () => {
      const still = propBox('prop-seated', tag => tag.seat === id);
      const pouf = propBox(`prop-pouf-${id}`);
      const painted = PAINTED_POUF[id];
      near(pouf.x, still.x + still.w * painted.left, 5, `the ${id}'s pouf's left`);
      near(right(pouf), still.x + still.w * painted.right, 5, `the ${id}'s pouf's right`);
      near(pouf.y, still.y + still.h * painted.top, 5, `the ${id}'s pouf's top`);
      near(bottom(pouf), still.y + still.h * painted.bottom, 5, `the ${id}'s pouf's foot`);
    });
  }

  test('stands the low table between the two poufs', () => {
    const table = centreX(propBox('prop-table'));
    assert.ok(table > centreX(propBox('prop-pouf-girl')) && table < centreX(propBox('prop-pouf-boy')));
  });
});
