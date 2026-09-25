#!/usr/bin/env node
/**
 * Watch a cat knock a Breakable over, and say whether it actually fell.
 *
 * ## Why this exists
 *
 * Ticket 48 put the wobble-tip-fall back over ticket 09's bare state swap, and
 * nobody ever saw it run. Its verifier tried to force one by stubbing
 * `Math.random` and reported the Breakable reaching `broken` with
 * `.is-breakable-falling` never appearing — so the animation shipped confirmed
 * by source reading alone, which is how a dead animation stays dead.
 *
 * That attempt could not have worked. **The apartment does not use
 * `Math.random` for any of this.** `createWorld` in `src/world/world.ts` falls
 * back to `seededRandom(DEFAULT_SEED)` (`src/world/actors.ts`) and `src/main.ts`
 * passes no `random`, so the cats' whole itinerary is deterministic from load.
 * Stubbing `Math.random` changes nothing in the model; it only perturbs the
 * Game Room's particle field, which is the one place the DOM layer rolls dice.
 *
 * Which means no forcing is needed at all — and, since ticket 68, no table of
 * when to look either. A Breakable falls on two rolls off the model's own dice:
 * whether it falls this visit (`FALL_CHANCE`), then where in the minute after
 * the Room's Arrival ends (`FALL_WINDOW_MS`). The hand-copied table this file
 * used to carry was wrong within a ticket of being written (ticket 51 found the
 * mug at 126.6 s against the table's 7.8 s), so this script now **plays the
 * visit through the model itself**: it bundles `src/world/` with esbuild, opens
 * the same Room with the same seed on the model's clock, and reads off which
 * Breakables fall and when. The page is then opened on that seed with
 * `?seed=N` (`seedFromSearch` in the model), so both run one afternoon.
 *
 * `--seed knock` (the default) takes the first seed of a fixed, scattered
 * list whose rolls bring something in the Room down; `--seed none` the first
 * whose rolls bring nothing down; a number is that seed. The report names the
 * seed, so any run can be repeated with `--seed <N>`. The default `--for` is the whole window
 * whatever the seed: the doorstep and the Arrival, the minute, the longest a
 * cat can take to get there late, and the 620 ms fall.
 *
 * ## What it does
 *
 * Opens the Room, clears session storage so nothing is already broken, installs
 * a `MutationObserver` over the Breakable's two Props *before* the world starts
 * ticking, and records every class and `hidden` change until the swap lands.
 * Then it says, in order: did `.is-breakable-falling` appear, how long did it
 * stay, and did the broken Prop only appear after it went.
 *
 * Runs twice, with motion and under emulated `prefers-reduced-motion`. The
 * contract from ticket 48 is that the fall is a **motion-on-only flourish**:
 * with motion off the Prop must hold and swap with no animation at all, which
 * is ticket 09's original path and the reduced-motion fallback the design notes
 * specify. So a fall seen under reduced motion is a failure, not a bonus.
 *
 * With a `none` seed the motion-on run is proving a negative: the whole window
 * passes and nothing in the Room may fall.
 *
 * Exit 0 when every condition behaves, 1 when one does not, 3 with no
 * Playwright on the host.
 *
 * ## Usage
 *
 *   node scripts/verify/breakable-fall.mjs --launch preview
 *   node scripts/verify/breakable-fall.mjs --launch preview --room entryway --seed none
 *   node scripts/verify/breakable-fall.mjs --base-url http://localhost:4173 --room games --seed 7
 */

import { Buffer } from 'node:buffer';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { loadPlaywright, startServer } from './room-shots.mjs';

const ROOMS = ['entryway', 'games', 'cinema', 'activities'];

/** `styles.css`: `.is-breakable-falling` runs `breakable-fall` for 620 ms. */
const FALL_MS = 620;

/**
 * How long a cat who could not make the moment can add to it, in ms: a walk
 * clean across the stage at the walk Cycle's 190 units/s is 8.4 s, and she
 * holds her knock (at most 2.3 s, the vase) once she is there.
 */
const LATE_CAT_MS = 12_000;

/**
 * `src/dom/arrival.ts` and `src/dom/entryway.ts`: the page dispatches
 * `arrival-started` this long after the loading screen goes, which is when
 * this script starts watching. The model's clock below starts at the dispatch.
 */
const DOORSTEP_MS = { entryway: 600, games: 400, cinema: 400, activities: 400 };

/** The model's tick, in ms: a 60 Hz frame, as near the page's rAF as it gets. */
const TICK_MS = 16;

/** How far the page's break may land from the model's and still be the same one. */
const MODEL_TOLERANCE_MS = 3_000;

/** How many seeds `--seed knock` / `--seed none` try before giving up. */
const SEED_SEARCH = 200;

/** Where the candidate seeds for that search come from. Any fixed number will do. */
const SEED_SEARCH_SEED = 68;

const HOW_TO = 'usage: node scripts/verify/breakable-fall.mjs (--launch <name> | --base-url <url>) [--room activities] [--seed knock|none|N] [--for MS] [--port N]';

function fail(message) {
  console.error(`breakable-fall: ${message}`);
  console.error(HOW_TO);
  process.exit(2);
}

function parseArguments(argv) {
  const options = { launch: null, baseUrl: null, room: 'activities', seed: 'knock', forMs: null, port: null };
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
    else if (flag === '--room') options.room = value();
    else if (flag === '--seed') options.seed = value();
    else if (flag === '--for') options.forMs = Number(value());
    else if (flag === '--port') options.port = Number(value());
    else if (flag === '--help' || flag === '-h') { console.log(HOW_TO); process.exit(0); }
    else fail(`unknown argument ${flag}`);
  }
  if (!options.launch && !options.baseUrl) fail('one of --launch or --base-url is required');
  if (!ROOMS.includes(options.room)) fail(`--room wants one of ${ROOMS.join(', ')}`);
  if (!['knock', 'none'].includes(options.seed) && !/^\d+$/.test(options.seed)) fail('--seed wants knock, none or a whole number');
  return options;
}

/**
 * The world model, exactly as the page bundles it: `src/world/index.ts` through
 * esbuild (Vite's own dependency), imported from memory. Pure TypeScript with
 * no DOM, which is what lets a Node script run the same afternoon the page does.
 */
async function loadModel(repoRoot) {
  const esbuild = await import('esbuild');
  const built = await esbuild.build({
    entryPoints: [path.join(repoRoot, 'src', 'world', 'index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
}

/**
 * One visit to the Room on the model's clock, as the page opens it here: no
 * session storage, motion on, this seed, `arrival-started` at 0 ms and a tick
 * every frame after it. Answers when both arrivals were over and when each of
 * the Room's Breakables went over, within the whole window.
 */
function playVisit(model, room, seed) {
  let world = model.createWorld({
    hash: model.roomHash(room),
    storedLanguage: null,
    reducedMotion: false,
    random: model.seededRandom(seed),
  });
  world = model.advance(world, { type: 'arrival-started' });
  const breakables = model.BREAKABLE_IDS.filter(id => model.breakableById(id).room === room);
  const falls = {};
  let arrivalEndsMs = null;
  let horizon = Infinity;
  for (let now = TICK_MS; now <= horizon; now += TICK_MS) {
    world = model.advance(world, { type: 'actor-tick', now });
    if (arrivalEndsMs === null && model.roomArrivalState(world) === 'done' && model.arrivalView(world).state === 'done') {
      arrivalEndsMs = now;
      horizon = now + model.FALL_WINDOW_MS + LATE_CAT_MS;
    }
    for (const id of breakables) {
      if (!(id in falls) && model.breakableState(world, id) === 'broken') falls[id] = now;
    }
    if (now > 120_000 && arrivalEndsMs === null) throw new Error(`the ${room} Arrival never ended in the model`);
  }
  const first = Object.entries(falls).sort((one, other) => one[1] - other[1])[0] ?? null;
  return { seed, breakables, arrivalEndsMs, falls, first: first ? { breakable: first[0], atMs: first[1] } : null };
}

/**
 * The visit this run watches: a numbered seed, or the first that knocks / does not.
 *
 * The candidates are scattered, not 1, 2, 3: `seededRandom` is a Lehmer
 * generator, and for neighbouring seeds its n-th draw steps evenly through a
 * narrow band — after the Entryway's own draws, seeds 1 to 200 all roll "yes"
 * for the vase. So the candidates come off a stream of their own.
 */
function chooseVisit(model, room, wanted) {
  if (/^\d+$/.test(wanted)) return playVisit(model, room, Number(wanted));
  const candidates = model.seededRandom(SEED_SEARCH_SEED);
  for (let tries = 0; tries < SEED_SEARCH; tries += 1) {
    const visit = playVisit(model, room, 1 + Math.floor(candidates() * 2_000_000_000));
    if ((wanted === 'knock') === (visit.first !== null)) return visit;
  }
  throw new Error(`no seed in ${SEED_SEARCH} tries ${wanted === 'knock' ? 'knocks anything down' : 'leaves everything standing'} in the ${room}`);
}

/** The apartment has opened its door: loading screen gone, nothing left inert. */
const SETTLED = () => {
  const screen = document.getElementById('loading-screen');
  return Boolean(screen) && screen.hidden && document.querySelectorAll('[inert]').length === 0;
};

/**
 * Record every Breakable's class and `hidden` changes, from document start.
 *
 * Installed as an init script rather than after the page settles, because a
 * Breakable the visit already broke is painted on the **first** paint — behind
 * the loading screen, before anything a normal `page.evaluate` could attach.
 * Polling would be worse still: a 620 ms animation between two paints is
 * exactly what a poll steps over, which is the failure this script exists to
 * rule out.
 */
const RECORDER = () => {
  const log = [];
  Object.defineProperty(window, '__breakableLog', { value: log });
  const observer = new MutationObserver(records => {
    for (const entry of records) {
      const target = entry.target;
      if (!(target instanceof Element)) continue;
      // The Entryway's vase predates the `data-breakable` pair and is found by
      // `data-prop` (`src/dom/entryway.ts`); every other Breakable by the pair.
      const vase = target.getAttribute('data-prop');
      const id = target.getAttribute('data-breakable') ?? (vase === 'vaseIntact' || vase === 'vaseBroken' ? 'entryway-vase' : null);
      if (id === null) continue;
      log.push({
        at: Number(performance.now().toFixed(1)),
        id,
        state: target.getAttribute('data-breakable-state') ?? (vase === 'vaseBroken' ? 'broken' : 'intact'),
        attribute: entry.attributeName,
        falling: target.classList.contains('is-breakable-falling'),
        hidden: target.hasAttribute('hidden'),
      });
    }
  });
  // `document`, not `document.documentElement`: an init script can run before
  // the parser has produced an `<html>` element at all, and observing `null`
  // throws, which silently leaves an empty log and a false "it never fell".
  observer.observe(document, { attributes: true, subtree: true, attributeFilter: ['class', 'hidden'] });
};

/** Wait for the swap (or the window to run out), then read the recorder back. */
const WATCH_FALL = async ({ breakable, forMs, inRoom }) => {
  const startedAt = performance.now();
  // The same two ways of naming a Breakable's Props as the recorder above.
  const propOf = (id, state) =>
    id === 'entryway-vase'
      ? document.querySelector(`[data-prop="${state === 'broken' ? 'vaseBroken' : 'vaseIntact'}"]`)
      : document.querySelector(`[data-breakable="${id}"][data-breakable-state="${state}"]`);
  if (!propOf(breakable, 'intact')) return { error: `no intact Prop for ${breakable} in this Room` };
  const broken = propOf(breakable, 'broken');
  if (!broken) return { error: 'the Breakable has no broken Prop' };

  await new Promise(resolve => {
    const deadline = setTimeout(resolve, forMs);
    const done = setInterval(() => {
      // Stop as soon as the swap has landed and settled, so a run that works
      // takes nine seconds rather than the whole window.
      if (!broken.hidden) { clearInterval(done); clearTimeout(deadline); setTimeout(resolve, 200); }
    }, 50);
  });

  const events = window.__breakableLog.filter(entry => entry.id === breakable);
  const gained = events.find(entry => entry.falling);
  const lost = gained ? events.find(entry => entry.at > gained.at && !entry.falling && entry.state === 'intact') : null;
  const swapped = events.find(entry => entry.state === 'broken' && entry.hidden === false);
  // Every Breakable of this Room showing its broken Prop by the end, so a seed
  // that should bring nothing down is held to all of them, not just one.
  const brokenInRoom = inRoom.filter(id => {
    const prop = propOf(id, 'broken');
    return Boolean(prop) && !prop.hidden;
  });
  return {
    broke: !broken.hidden,
    brokeAt: swapped ? swapped.at : null,
    brokeAfterWatchMs: swapped ? Number((swapped.at - startedAt).toFixed(1)) : null,
    brokenInRoom,
    fell: Boolean(gained),
    fallStartedAt: gained ? gained.at : null,
    fallHeldMs: gained && lost ? Number((lost.at - gained.at).toFixed(1)) : null,
    // The point of the whole feature: it falls *before* it is broken, rather
    // than the broken Prop simply appearing.
    fellBeforeSwap: Boolean(gained && swapped && gained.at <= swapped.at),
    motionOff: document.documentElement.classList.contains('motion-off'),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    events,
  };
};

/** `src/dom/breakables.ts` remembers the visit's breakages under this key. */
const BROKEN_STORAGE_KEY = 'ada-broken-breakables';

async function watch(browser, { baseUrl, room, seed, reduced, breakable, inRoom, forMs, alreadyBroken }) {
  const context = await browser.newContext({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`));
  // Session storage decides what the Room opens with, so it is set before the
  // first script runs: cleared for a whole apartment, seeded to arrive at one
  // that a previous visit in this tab already broke.
  await context.clearCookies();
  await page.addInitScript(
    ([key, stored]) => {
      try {
        if (stored) sessionStorage.setItem(key, stored);
        else sessionStorage.clear();
      } catch { /* none needed */ }
    },
    [BROKEN_STORAGE_KEY, alreadyBroken ? JSON.stringify([breakable]) : null],
  );
  await page.addInitScript(RECORDER);
  // The query string is the page's seed (`seedFromSearch`); the hash its Room.
  await page.goto(`${baseUrl.replace(/\/$/, '')}/?seed=${seed}#/${room}`, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(SETTLED, null, { timeout: 30_000 });
  const result = await page.evaluate(WATCH_FALL, { breakable, forMs, inRoom });
  await context.close();
  return { ...result, reducedMotion: reduced, alreadyBroken: Boolean(alreadyBroken), consoleErrors };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const room = options.room;
  const model = await loadModel(repoRoot);
  const visit = chooseVisit(model, room, options.seed);
  const knocks = visit.first !== null;
  // The one this run watches: what the model says falls first, or — for a
  // seed that brings nothing down — the Room's first Breakable, with all of
  // them held to staying up.
  const breakable = knocks ? visit.first.breakable : visit.breakables[0];
  // When the page should show it broken, counted from when this script starts
  // watching: the doorstep, then the model's own clock, then the fall the
  // painter plays before it swaps the broken Prop in.
  const expectedAtMs = knocks ? DOORSTEP_MS[room] + visit.first.atMs + FALL_MS : null;
  // The whole window, whatever this seed rolled: the doorstep and the Arrival,
  // the minute, a late cat, and the fall itself.
  const forMs = options.forMs ?? DOORSTEP_MS[room] + visit.arrivalEndsMs + model.FALL_WINDOW_MS + LATE_CAT_MS + FALL_MS;

  const playwright = await loadPlaywright();
  const server = options.launch
    ? await startServer(repoRoot, options.launch, options.port)
    : { baseUrl: options.baseUrl, stop: async () => {} };

  let browser = null;
  const report = {
    tool: 'breakable-fall/2',
    at: new Date().toISOString(),
    baseUrl: server.baseUrl,
    room,
    seed: visit.seed,
    model: { knocks, arrivalEndsMs: visit.arrivalEndsMs, falls: visit.falls },
    breakable,
    expectedAtMs,
    forMs,
  };
  const seen = { baseUrl: server.baseUrl, room, seed: visit.seed, breakable, inRoom: visit.breakables };
  try {
    browser = await playwright.chromium.launch({ headless: true });
    // The headline: a whole apartment, motion on, left alone for the whole
    // window — until a cat does it, or to the end if this seed says none will.
    report.withMotion = await watch(browser, { ...seen, reduced: false, forMs });
    // Motion off, and nothing should happen at all — `roamCats` is gated on
    // motion, so with it off no cat walks anywhere and nothing is ever knocked.
    // A shorter window: this one is proving a negative and the knock, if it
    // were coming, would have come by now.
    report.withReducedMotion = await watch(browser, { ...seen, reduced: true, forMs: Math.min(forMs, 15_000) });
    // Arriving at something this tab already broke. The session-restored state
    // is painted on the first paint, which is the one place the motion-off
    // synchronous swap in `src/dom/breakables.ts` is actually reachable — and
    // the one place a *replayed* fall would be wrong.
    report.restored = await watch(browser, { ...seen, reduced: false, forMs: 4_000, alreadyBroken: true });
  } finally {
    if (browser) await browser.close();
    await server.stop();
  }

  const on = report.withMotion;
  const off = report.withReducedMotion;
  const back = report.restored;
  report.verdict = knocks
    ? {
        // Ticket 48's acceptance criterion 1, and the thing no one had ever seen.
        breaksWithMotion: on.broke === true,
        fallsWithMotion: on.fell === true && on.fellBeforeSwap === true,
        fallCloseToStylesheet: on.fallHeldMs === null ? null : Math.abs(on.fallHeldMs - FALL_MS) < 400,
        // 68: and it is the fall the model rolled, not some other one.
        breaksWhenTheModelSays:
          on.brokeAfterWatchMs !== null && Math.abs(on.brokeAfterWatchMs - expectedAtMs) < MODEL_TOLERANCE_MS,
      }
    : {
        // 68: the first roll said no for every Breakable here, so the whole
        // window passes with all of them standing.
        nothingKnockedWithMotion: on.brokenInRoom.length === 0 && on.fell === false,
      };
  Object.assign(report.verdict, {
    // With motion off the cats do not roam, so nothing is knocked over at all.
    // That is ticket 08's gate working, not this feature failing.
    nothingKnockedWithReducedMotion: off.broke === false && off.fell === false,
    // Ticket 48's acceptance criterion 3: broken survives a reload in the tab.
    staysBrokenAcrossReload: back.broke === true,
    // ...and does so without playing the fall a second time, because it fell
    // when it fell and a reload is not a cat.
    doesNotReplayFallOnReload: back.fell === false,
  });
  report.ok = Object.values(report.verdict).every(answer => answer === true || answer === null);

  console.log(JSON.stringify(report, null, 2));
  const motionOn = knocks
    ? `model says ${expectedAtMs}ms; motion on: ${on.broke ? `broke at +${on.brokeAfterWatchMs}ms` : 'NEVER BROKE'}` +
      `, ${on.fell ? `fell for ${on.fallHeldMs}ms` : 'NEVER FELL'}`
    : `model says none; motion on for ${forMs}ms: ${on.brokenInRoom.length === 0 ? 'nothing knocked' : `KNOCKED ${on.brokenInRoom.join(', ')}`}`;
  console.error(
    `breakable-fall: ${room}, seed ${visit.seed}, ${breakable} — ${motionOn}` +
      `; reduced: ${off.broke ? 'BROKE (cats should not roam)' : 'nothing knocked'}` +
      `; reloaded: ${back.broke ? 'still broken' : 'CAME BACK WHOLE'}, ${back.fell ? 'REPLAYED THE FALL' : 'no replay'}`,
  );
  process.exit(report.ok ? 0 : 1);
}

main().catch(error => {
  console.error(`breakable-fall: ${error.stack ?? error.message}`);
  process.exit(1);
});
