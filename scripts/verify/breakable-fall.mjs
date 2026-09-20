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
 * Which means no forcing is needed at all. Driving the shipped seed forward
 * gives the first knock in each Room exactly:
 *
 * | Room       | Breakable             | falls at |
 * | ---------- | --------------------- | -------- |
 * | activities | `activity-pencil-mug` |  ~7.8 s  |
 * | entryway   | `entryway-vase`       | ~69.1 s  |
 * | cinema     | `cinema-film-can`     | ~124.0 s |
 * | games      | `snow-globe`          | ~133.2 s |
 *
 * So the Activity Room is where you look: the mug goes over about eight seconds
 * after the Room settles, every single time. (Those are model-clock figures from
 * a 16 ms tick; a real page's rAF clock is close but not identical, hence the
 * generous default `--for`.)
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
 * Exit 0 when both conditions behave, 1 when either does not, 3 with no
 * Playwright on the host.
 *
 * ## Usage
 *
 *   node scripts/verify/breakable-fall.mjs --launch preview
 *   node scripts/verify/breakable-fall.mjs --base-url http://localhost:4173 --room games
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { loadPlaywright, startServer } from './room-shots.mjs';

/** Where the first knock lands in each Room, driving the shipped seed forward. */
const FIRST_KNOCK = {
  activities: { breakable: 'activity-pencil-mug', atMs: 7824 },
  entryway: { breakable: 'entryway-vase', atMs: 69136 },
  cinema: { breakable: 'cinema-film-can', atMs: 124016 },
  games: { breakable: 'snow-globe', atMs: 133152 },
};

/** `styles.css`: `.is-breakable-falling` runs `breakable-fall` for 620 ms. */
const FALL_MS = 620;

const HOW_TO = 'usage: node scripts/verify/breakable-fall.mjs (--launch <name> | --base-url <url>) [--room activities] [--for MS] [--port N]';

function fail(message) {
  console.error(`breakable-fall: ${message}`);
  console.error(HOW_TO);
  process.exit(2);
}

function parseArguments(argv) {
  const options = { launch: null, baseUrl: null, room: 'activities', forMs: null, port: null };
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
    else if (flag === '--for') options.forMs = Number(value());
    else if (flag === '--port') options.port = Number(value());
    else if (flag === '--help' || flag === '-h') { console.log(HOW_TO); process.exit(0); }
    else fail(`unknown argument ${flag}`);
  }
  if (!options.launch && !options.baseUrl) fail('one of --launch or --base-url is required');
  if (!FIRST_KNOCK[options.room]) fail(`--room wants one of ${Object.keys(FIRST_KNOCK).join(', ')}`);
  return options;
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
      if (!(target instanceof Element) || !target.hasAttribute('data-breakable')) continue;
      log.push({
        at: Number(performance.now().toFixed(1)),
        id: target.getAttribute('data-breakable'),
        state: target.getAttribute('data-breakable-state'),
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
const WATCH_FALL = async ({ breakable, forMs }) => {
  const props = [...document.querySelectorAll(`[data-breakable="${breakable}"]`)];
  if (props.length === 0) return { error: `no [data-breakable="${breakable}"] in this Room` };
  const broken = props.find(prop => prop.dataset.breakableState === 'broken');
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
  return {
    broke: !broken.hidden,
    brokeAt: swapped ? swapped.at : null,
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

async function watch(browser, { baseUrl, room, reduced, breakable, forMs, alreadyBroken }) {
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
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/${room}`, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(SETTLED, null, { timeout: 30_000 });
  const result = await page.evaluate(WATCH_FALL, { breakable, forMs });
  await context.close();
  return { ...result, reducedMotion: reduced, alreadyBroken: Boolean(alreadyBroken), consoleErrors };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { breakable, atMs } = FIRST_KNOCK[options.room];
  // Three times the model-clock figure, floored at 20 s: the page's rAF clock
  // runs a little behind a 16 ms tick and the arrival spends the first 3 s.
  const forMs = options.forMs ?? Math.max(20_000, atMs * 3);

  const playwright = await loadPlaywright();
  const server = options.launch
    ? await startServer(repoRoot, options.launch, options.port)
    : { baseUrl: options.baseUrl, stop: async () => {} };

  let browser = null;
  const report = { tool: 'breakable-fall/1', at: new Date().toISOString(), baseUrl: server.baseUrl, room: options.room, breakable, expectedAtMs: atMs, forMs };
  try {
    browser = await playwright.chromium.launch({ headless: true });
    // The headline: a whole apartment, motion on, left alone until a cat does it.
    report.withMotion = await watch(browser, { baseUrl: server.baseUrl, room: options.room, reduced: false, breakable, forMs });
    // Motion off, and nothing should happen at all — `roamCats` is gated on
    // motion, so with it off no cat walks anywhere and nothing is ever knocked.
    // A shorter window: this one is proving a negative and the knock, if it
    // were coming, would have come by now.
    report.withReducedMotion = await watch(browser, { baseUrl: server.baseUrl, room: options.room, reduced: true, breakable, forMs: Math.min(forMs, 15_000) });
    // Arriving at something this tab already broke. The session-restored state
    // is painted on the first paint, which is the one place the motion-off
    // synchronous swap in `src/dom/breakables.ts` is actually reachable — and
    // the one place a *replayed* fall would be wrong.
    report.restored = await watch(browser, { baseUrl: server.baseUrl, room: options.room, reduced: false, breakable, forMs: 4_000, alreadyBroken: true });
  } finally {
    if (browser) await browser.close();
    await server.stop();
  }

  const on = report.withMotion;
  const off = report.withReducedMotion;
  const back = report.restored;
  report.verdict = {
    // Ticket 48's acceptance criterion 1, and the thing no one had ever seen.
    breaksWithMotion: on.broke === true,
    fallsWithMotion: on.fell === true && on.fellBeforeSwap === true,
    fallCloseToStylesheet: on.fallHeldMs === null ? null : Math.abs(on.fallHeldMs - FALL_MS) < 400,
    // With motion off the cats do not roam, so nothing is knocked over at all.
    // That is ticket 08's gate working, not this feature failing.
    nothingKnockedWithReducedMotion: off.broke === false && off.fell === false,
    // Ticket 48's acceptance criterion 3: broken survives a reload in the tab.
    staysBrokenAcrossReload: back.broke === true,
    // ...and does so without playing the fall a second time, because it fell
    // when it fell and a reload is not a cat.
    doesNotReplayFallOnReload: back.fell === false,
  };
  report.ok = Object.values(report.verdict).every(answer => answer === true || answer === null);

  console.log(JSON.stringify(report, null, 2));
  console.error(
    `breakable-fall: ${breakable} — motion on: ${on.broke ? `broke at ${on.brokeAt}ms` : 'NEVER BROKE'}` +
      `, ${on.fell ? `fell for ${on.fallHeldMs}ms` : 'NEVER FELL'}` +
      `; reduced: ${off.broke ? 'BROKE (cats should not roam)' : 'nothing knocked'}` +
      `; reloaded: ${back.broke ? 'still broken' : 'CAME BACK WHOLE'}, ${back.fell ? 'REPLAYED THE FALL' : 'no replay'}`,
  );
  process.exit(report.ok ? 0 : 1);
}

main().catch(error => {
  console.error(`breakable-fall: ${error.stack ?? error.message}`);
  process.exit(1);
});
