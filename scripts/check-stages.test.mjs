// Every Room's stage size, as the model gives it in `STAGES`, held against the
// three places outside the model that have to say the same thing (ticket 81).
//
//   node --test scripts/check-stages.test.mjs      (also runs as part of `npm test`)
//
// - `styles.css`: each `.stage[data-stage="<room>"]` sets `--stage-w` / `--stage-h`,
//   and every placement percentage and `--u` is worked out from those two, so a
//   stage whose CSS disagreed with the model would draw its Props in one size of
//   Room and its Cast (placed by `src/dom/actors.ts` off `STAGES`) in another.
// - `index.html`: each Room's backdrop is a Prop whose box is the whole stage.
// - `public/assets/<room>/manifest.json`: the backdrop's entry names the `stage`
//   the file is stretched to. Its `frame` is the file's own pixel size, which no
//   longer has to equal the stage's units (design 75 §2.1).
//
// A Room ticket that resizes a stage changes its entry in `STAGES`, and this
// file then names each of the other three that still has the old size. It reads
// the markup and the stylesheet as text, like `check-cinema-stage`: what the page
// declares, not how a browser draws it.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadWorldModel } from './world-model.mjs';

const read = relative => readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');
const indexHtml = read('index.html');
const stylesCss = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** The markup from a Room's stage's opening tag to the next stage's, or the end of the page. */
function stageMarkup(room) {
  const start = indexHtml.indexOf(`data-stage="${room}"`);
  assert.notEqual(start, -1, `index.html has no stage for the ${room}`);
  const next = indexHtml.indexOf('data-stage="', start + 1);
  return indexHtml.slice(start, next < 0 ? undefined : next);
}

/** The Room's backdrop: the Prop on its stage whose `data-still` is `assets/<dir>/backdrop.png`. */
function backdropOf(room) {
  const tag = /<[a-z]+\b[^>]*\bdata-still="assets\/([\w-]+)\/backdrop\.png"[^>]*>/.exec(stageMarkup(room));
  assert.ok(tag, `the ${room} stage has no backdrop`);
  const style = /\bstyle="([^"]*)"/.exec(tag[0])?.[1] ?? '';
  const vars = Object.fromEntries([...style.matchAll(/--([\w-]+):\s*([-\d.]+)/g)].map(([, name, value]) => [name, Number(value)]));
  return { dir: tag[1], box: { x: vars.x, y: vars.y, w: vars.w, h: vars.h } };
}

/** Every `--stage-w` / `--stage-h` the stylesheet declares for a Room's stage. */
function cssStage(room) {
  const selector = `.stage[data-stage="${room}"]`;
  const declared = { w: [], h: [] };
  for (const [, selectors, body] of stylesCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectors.split(',').some(part => part.trim() === selector)) continue;
    for (const [, axis, value] of body.matchAll(/--stage-([wh]):\s*([^;]+);/g)) declared[axis].push(value.trim());
  }
  return declared;
}

let STAGES;
let ROOM_IDS;

before(async () => {
  ({ STAGES, ROOM_IDS } = await loadWorldModel());
});

describe('every Room is drawn on the stage the model gives it', () => {
  test('the stylesheet sets each stage’s --stage-w / --stage-h once, to its STAGES entry', () => {
    for (const room of ROOM_IDS) {
      const { width, height } = STAGES[room];
      assert.deepEqual(cssStage(room), { w: [String(width)], h: [String(height)] }, `.stage[data-stage="${room}"]`);
    }
  });

  test('nothing else in the stylesheet sets a stage size', () => {
    const everywhere = [...stylesCss.matchAll(/--stage-[wh]:/g)].length;
    assert.equal(everywhere, ROOM_IDS.length * 2);
  });

  test('each Room’s backdrop covers its stage exactly', () => {
    for (const room of ROOM_IDS) {
      const { width, height } = STAGES[room];
      assert.deepEqual(backdropOf(room).box, { x: 0, y: 0, w: width, h: height }, `the ${room} backdrop`);
    }
  });

  test('each backdrop’s manifest entry names the stage it is stretched to', () => {
    for (const room of ROOM_IDS) {
      const { width, height } = STAGES[room];
      const { dir } = backdropOf(room);
      const manifest = JSON.parse(read(`public/assets/${dir}/manifest.json`));
      // A manifest names its files either beside it or from `public/assets/`.
      const entry = manifest.assets.find(asset => asset.file === 'backdrop.png' || asset.file === `${dir}/backdrop.png`);
      assert.ok(entry, `public/assets/${dir}/manifest.json has no backdrop.png`);
      assert.equal(entry.stage, `${width}x${height}`, `the ${room} backdrop's stage`);
    }
  });
});

// 110: ticket 106's fault was class-wide. A `perspective()` written in px is in page
// pixels, not stage units, so an open leaf's swinging edge grew with the page width
// and stood over the lintel and below the doorway's foot (19% at 1440 x 900 on the
// Cinema's leaf, 6% at 390). Swung flat, a leaf keeps its doorway's height at every
// width, so no leaf in any Room swings under one.
describe('every Room’s open leaf stays in its doorway (ticket 110)', () => {
  /** Each Room's leaf, by the class its swing rules end on. */
  const LEAVES = {
    entryway: '.prop-front-door',
    games: '.door-leaf',
    cinema: '.door-leaf',
    activities: '.a-door-leaf',
  };
  /** The rule each Room's leaf stands open under. */
  const OPEN = {
    entryway: '.prop-front-door.is-open',
    games: '.stage[data-door="open"] .door-leaf',
    cinema: '.stage-cinema[data-door="open"] .cinema-door .door-leaf',
    activities: '.stage[data-door="open"] .a-door-leaf',
  };

  /** Every rule in the stylesheet: each selector in its list, and its declarations. */
  const rules = [...stylesCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
    selectors: selectors.split(',').map(part => part.trim()).filter(Boolean),
    body,
  }));
  const valueOf = (body, property) => new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(body)?.[1]?.trim();
  const leafSelector = selector => Object.values(LEAVES).some(leaf => new RegExp(`${leaf.replace(/[.[\]"=]/g, '\\$&')}(?![\\w-])[^\\s]*$`).test(selector));

  test('no leaf swings under a px perspective, and nothing lends one a perspective from outside', () => {
    const swings = rules.filter(rule => rule.selectors.some(leafSelector) && valueOf(rule.body, 'transform'));
    for (const leaf of new Set(Object.values(LEAVES))) {
      assert.ok(swings.some(rule => rule.selectors.some(selector => selector.includes(leaf))), `no rule swings ${leaf}`);
    }
    for (const rule of swings) {
      assert.doesNotMatch(valueOf(rule.body, 'transform'), /perspective\([^)]*px/, `${rule.selectors.join(', ')} swings its leaf under a px perspective`);
    }
    const lent = rules.filter(rule => /(?:^|;)\s*perspective\s*:/.test(rule.body));
    assert.deepEqual(lent.map(rule => rule.selectors.join(', ')), [], 'a perspective property sizes the leaves inside it by the page');
  });

  test('stands every Room’s leaf 60 to 80 degrees open, hinged on its left edge', () => {
    for (const [room, selector] of Object.entries(OPEN)) {
      const rule = rules.find(candidate => candidate.selectors.includes(selector));
      assert.ok(rule, `the ${room} has no "${selector}" rule`);
      const angle = Number(/rotateY\((-?[\d.]+)deg\)/.exec(valueOf(rule.body, 'transform') ?? '')?.[1]);
      assert.ok(angle <= -60 && angle >= -80, `the ${room}'s open leaf stands ${angle}deg open`);
      const hinged = rules.some(candidate => candidate.selectors.some(part => part.endsWith(LEAVES[room]) || part === selector) && /^left\b/.test(valueOf(candidate.body, 'transform-origin') ?? ''));
      assert.ok(hinged, `the ${room}'s leaf is not hinged on its left edge`);
    }
  });
});
