#!/usr/bin/env node
/**
 * Hover each Cinema bookshelf, and say whether the Boy ends up standing beside it.
 *
 * ## Why this exists
 *
 * Ticket 63 moved the shelves into the corner right of the screen, about 650 to
 * 830 units from his beanbag, and its verifier looked 2.5 s after the hover: he
 * was still walking, some 250 units short, and "hover a shelf and the Boy stands
 * beside it" went through unconfirmed. Ticket 70 measured it — he reaches the
 * mark at 3.6 s (comedy), 4.1 s (romance) and 4.5 s (horror) — and found the real
 * miss elsewhere: a pointer already on a shelf while the Room's entrance was
 * still bringing him in was dropped, and he sat down in his beanbag instead.
 *
 * Ticket 73 moves the shelves again, so nothing here waits a fixed time or
 * knows where a shelf is. **When** he should arrive is played through the model
 * (`scripts/world-model.mjs`): the same Room, the hover, the frame loop, until he
 * stops. **Where** is read off the page: the shelf button's own box, in stage
 * units. He is beside it when his feet are just left of its bay (no more than
 * `BESIDE_UNITS` short of its left edge, and not past it) and on the floor in
 * front of it. The model's mark is checked too, because the page drawing him
 * somewhere else than the model put him is a different bug worth naming.
 *
 * ## What it does
 *
 * For every shelf, with motion on: opens `#/cinema`, lets the entrance finish,
 * hovers the shelf and waits for him to stop — up to the model's walk plus
 * `SLACK_MS`. Then once more per shelf the way ticket 70's miss happened: the
 * pointer goes onto the shelf the moment the loading screen lifts, while the
 * entrance is still playing. Under emulated `prefers-reduced-motion` he is put
 * there at once, so that pass waits only for the next paint.
 *
 * Exit 0 when he stands beside every shelf in every pass, 1 when he does not,
 * 3 with no Playwright on the host.
 *
 * ## Usage
 *
 *   node scripts/verify/shelf-hover.mjs --launch preview
 *   node scripts/verify/shelf-hover.mjs --base-url http://localhost:4173
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { loadWorldModel } from '../world-model.mjs';
import { loadPlaywright, startServer } from './room-shots.mjs';

/** The model's tick, in ms: a 60 Hz frame. */
const TICK_MS = 16;

/**
 * How much later than the model the page may have him stop: the page's own
 * hover delay (`src/dom/cinema-room.ts`, 120 ms), a frame or two, and the poll.
 */
const SLACK_MS = 1_500;

/** How long his box has to hold still before he counts as stopped. */
const STILL_MS = 400;

/** How often the page is read. */
const POLL_MS = 50;

/** How far left of a shelf's bay his feet may be and still be beside it. */
const BESIDE_UNITS = 40;

/** How far the page may draw him from the model's mark, in stage units. */
const MARK_UNITS = 4;

const HOW_TO = 'usage: node scripts/verify/shelf-hover.mjs (--launch <name> | --base-url <url>) [--port N]';

function fail(message) {
  console.error(`shelf-hover: ${message}`);
  console.error(HOW_TO);
  process.exit(2);
}

function parseArguments(argv) {
  const options = { launch: null, baseUrl: null, port: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) fail(`${flag} needs a value`);
      index += 1;
      return next;
    };
    if (flag === '--launch') options.launch = value();
    else if (flag === '--base-url' || flag === '--url') options.baseUrl = value();
    else if (flag === '--port') options.port = Number(value());
    else if (flag === '--help' || flag === '-h') { console.log(HOW_TO); process.exit(0); }
    else fail(`unknown argument ${flag}`);
  }
  if (!options.launch && !options.baseUrl) fail('one of --launch or --base-url is required');
  return options;
}

/**
 * How long, on the model's clock, from the hover to the Boy standing still at
 * the shelf, with the Room's entrance over and him in his beanbag first.
 */
function walkMs(model, shelf) {
  let world = model.createWorld({ hash: model.roomHash('cinema'), storedLanguage: null, reducedMotion: false, random: model.seededRandom(1) });
  world = model.advance(world, { type: 'arrival-started' });
  let now = 0;
  const boy = () => model.actorView(world, 'boy');
  const tick = () => { now += TICK_MS; world = model.advance(world, { type: 'actor-tick', now }); };
  while (model.roomArrivalState(world) !== 'done' || !boy() || boy().moving) {
    tick();
    if (now > 60_000) throw new Error('the Cinema entrance never settled in the model');
  }
  const hoveredAt = now;
  world = model.advance(world, { type: 'cinema-shelf-attended', shelf });
  do tick(); while (boy().moving && now - hoveredAt < 60_000);
  return { ms: now - hoveredAt, mark: model.CINEMA_MARKS.shelves[shelf] };
}

/** The apartment has opened its door: loading screen gone, nothing left inert. */
const SETTLED = () => {
  const screen = document.getElementById('loading-screen');
  return Boolean(screen) && screen.hidden && document.querySelectorAll('[inert]').length === 0;
};

/**
 * Wait until the Boy has stood still for `stillMs`, or `capMs` runs out, and
 * say where he is and where the shelf is, both in stage units.
 *
 * His position is his feet, the bottom-centre of his box, as `src/dom/actors.ts`
 * draws it; the shelf is its `[data-shelf]` button. `null` feet is a Boy who
 * never came onto the Cinema stage. `stageWidth` is the Cinema's width in units,
 * `STAGES.cinema.width`, handed in from the model because the page cannot import it.
 */
const WAIT_FOR_BOY = async ({ shelf, stillMs, capMs, pollMs, stageWidth }) => {
  const stage = document.querySelector('[data-stage="cinema"]');
  const units = () => stageWidth / stage.getBoundingClientRect().width;
  const feet = () => {
    const boy = stage.querySelector('[data-actor="boy"]');
    if (!boy || boy.classList.contains('is-acted')) return null;
    const box = boy.getBoundingClientRect();
    const origin = stage.getBoundingClientRect();
    if (box.width === 0) return null;
    return { x: (box.left + box.width / 2 - origin.left) * units(), y: (box.bottom - origin.top) * units() };
  };
  const started = performance.now();
  let last = feet();
  let stillSince = performance.now();
  while (performance.now() - started < capMs) {
    await new Promise(resolve => setTimeout(resolve, pollMs));
    const now = feet();
    const same = now && last && Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5;
    if (!same) stillSince = performance.now();
    last = now;
    if (now && performance.now() - stillSince >= stillMs) break;
  }
  const box = document.querySelector(`[data-shelf="${shelf}"]`).getBoundingClientRect();
  const origin = stage.getBoundingClientRect();
  const round = value => Number(value.toFixed(1));
  return {
    stoppedAfterMs: round(stillSince - started),
    feet: last ? { x: round(last.x), y: round(last.y) } : null,
    bay: {
      left: round((box.left - origin.left) * units()),
      right: round((box.right - origin.left) * units()),
      bottom: round((box.bottom - origin.top) * units()),
    },
    attended: document.querySelector(`[data-shelf="${shelf}"]`).classList.contains('is-attended'),
  };
};

/** Is he just left of the shelf's bay, on the floor in front of it? */
function beside(reading) {
  const { feet, bay } = reading;
  return Boolean(feet) && feet.x <= bay.left && feet.x >= bay.left - BESIDE_UNITS && feet.y > bay.bottom;
}

const onMark = (feet, mark) => Boolean(feet) && Math.abs(feet.x - mark.x) <= MARK_UNITS && Math.abs(feet.y - mark.y) <= MARK_UNITS;

async function hover(browser, baseUrl, { shelf, reduced, early, walk, stageWidth }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`));
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/cinema`, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(SETTLED, null, { timeout: 30_000 });
  const target = page.locator(`[data-shelf="${shelf}"]`).first();
  const capMs = reduced ? 1_000 : walk.ms + SLACK_MS + (early ? 8_000 : 0);
  if (!early) {
    // Let the entrance play out and him sit down, read off the page, not a clock.
    await page.evaluate(WAIT_FOR_BOY, { shelf, stillMs: STILL_MS, capMs: 15_000, pollMs: POLL_MS, stageWidth });
  }
  await target.hover();
  const reading = await page.evaluate(WAIT_FOR_BOY, { shelf, stillMs: STILL_MS, capMs, pollMs: POLL_MS, stageWidth });
  await context.close();
  return { shelf, reduced, early, ...reading, consoleErrors };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const model = await loadWorldModel(repoRoot);
  const walks = Object.fromEntries(model.CINEMA_SHELVES.map(shelf => [shelf, walkMs(model, shelf)]));

  const playwright = await loadPlaywright();
  const server = options.launch
    ? await startServer(repoRoot, options.launch, options.port)
    : { baseUrl: options.baseUrl, stop: async () => {} };

  const readings = [];
  let browser = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    for (const shelf of model.CINEMA_SHELVES) {
      const walk = walks[shelf];
      for (const pass of [{ reduced: false, early: false }, { reduced: false, early: true }, { reduced: true, early: false }]) {
        readings.push({ ...(await hover(browser, server.baseUrl, { shelf, walk, stageWidth: model.STAGES.cinema.width, ...pass })), modelWalkMs: walk.ms, mark: walk.mark });
      }
    }
  } finally {
    if (browser) await browser.close();
    await server.stop();
  }

  for (const reading of readings) {
    reading.verdict = {
      standsBeside: beside(reading),
      onTheModelsMark: onMark(reading.feet, reading.mark),
      stillAttended: reading.attended,
      // Only the settled, motion-on pass has a walk to time: the early one
      // includes the entrance, and reduced motion has no walk at all.
      arrivesWhenTheModelSays:
        reading.reduced || reading.early ? null : reading.stoppedAfterMs <= reading.modelWalkMs + SLACK_MS,
      noConsoleErrors: reading.consoleErrors.length === 0,
    };
    reading.ok = Object.values(reading.verdict).every(answer => answer === true || answer === null);
  }
  const report = { tool: 'shelf-hover/1', at: new Date().toISOString(), baseUrl: server.baseUrl, readings, ok: readings.every(reading => reading.ok) };
  console.log(JSON.stringify(report, null, 2));
  for (const reading of readings) {
    const pass = reading.reduced ? 'reduced' : reading.early ? 'during the entrance' : 'motion on';
    const where = reading.feet ? `feet ${reading.feet.x},${reading.feet.y}` : 'NOT ON THE STAGE';
    console.error(
      `shelf-hover: ${reading.shelf}, ${pass} — ${where}; bay ${reading.bay.left}..${reading.bay.right}, base ${reading.bay.bottom}` +
        `; stopped after ${reading.stoppedAfterMs} ms (model ${reading.modelWalkMs} ms) — ${reading.ok ? 'beside it' : 'FAIL'}`,
    );
  }
  process.exit(report.ok ? 0 : 1);
}

main().catch(error => {
  console.error(`shelf-hover: ${error.stack ?? error.message}`);
  process.exit(1);
});
