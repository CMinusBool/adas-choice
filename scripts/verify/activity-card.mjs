#!/usr/bin/env node
/**
 * Ticket 109: the Activity Room fills the screen, and an opened Activity reads without
 * scrolling. Checked in a real Chromium, on whatever server `--base-url` names (a
 * `vite preview` of `dist/` for a verdict).
 *
 * Per layout and per language (zh-Hant, then English through the toggle):
 *
 * - **at rest** — the page does not scroll sideways; at 1440 x 900 it does not scroll
 *   down either, and the stage uses the height the chrome leaves: no more than
 *   `SPARE_BELOW_PX` between the Room's bottom edge and the screen's.
 * - **each Activity** — opened from its station with Enter, the way a keyboard visitor
 *   opens it: every line of body copy on the card is at least 16 CSS px; at 1440 x 900
 *   the whole card is on screen and reads without scrolling inside it
 *   (`scrollHeight <= clientHeight`, and nothing cut off sideways either); at 390 x 844
 *   the card may be long, but the page still does not scroll sideways.
 * - **chosen and put back** — the hunt's primary action marks its chalkboard chosen and
 *   shows the way to take it back, and taking it back clears both. At 1440 x 900 the
 *   chosen Room does not scroll either.
 *
 * Playwright is imported the way `room-shots.mjs` does (see there). Exit 0 all clear,
 * 1 on a failed check, 2 on a usage error, 3 with no Playwright on the host.
 *
 * ## Usage
 *
 *   node scripts/verify/activity-card.mjs --base-url http://localhost:4273/
 */

import process from 'node:process';

import { loadPlaywright } from './room-shots.mjs';

const LAYOUTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, mustFit: true },
  { name: 'narrow', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, mustFit: false },
];
const LANGUAGES = ['zh-Hant', 'en'];
const ACTIVITIES = ['draw', 'hunt', 'map'];

/** The body copy on the card: everything but its title, its labels and its buttons. */
const BODY = '.activity-card-line, .activity-card-meta dd, .activity-card-steps li, .activity-card-extra:not([hidden]), .activity-card-why';
const BODY_MIN_PX = 16;
/** Ticket 109: "use the height the chrome leaves" — what may stay empty under the Room. */
const SPARE_BELOW_PX = 24;

function fail(message) {
  console.error(`activity-card: ${message}`);
  process.exit(2);
}

function parseArguments(argv) {
  const options = { baseUrl: null };
  for (let at = 0; at < argv.length; at += 1) {
    const flag = argv[at];
    if (flag === '--base-url') options.baseUrl = argv[++at] ?? fail('--base-url needs a value');
    else fail(`unknown argument ${flag}`);
  }
  if (!options.baseUrl) fail('pass --base-url');
  return options;
}

/** The loading screen gone and nothing inert: the apartment has opened its door. */
const SETTLED = () => {
  const screen = document.getElementById('loading-screen');
  return Boolean(screen) && screen.hidden && document.querySelectorAll('[inert]').length === 0;
};

/** The page's own scroll extent against the screen. */
const PAGE = () => ({
  scrollWidth: document.documentElement.scrollWidth,
  scrollHeight: document.documentElement.scrollHeight,
  width: window.innerWidth,
  height: window.innerHeight,
});

function round(box) {
  return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 10) / 10]));
}

async function readRest(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('.stage[data-stage="activities"]').getBoundingClientRect();
    const room = document.getElementById('room-activities').getBoundingClientRect();
    return {
      stage: { left: stage.left, top: stage.top, width: stage.width, height: stage.height, bottom: stage.bottom },
      roomBottom: room.bottom,
      page: {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };
  });
}

async function readCard(page) {
  return page.evaluate(body => {
    const card = document.getElementById('activity-card');
    const box = card.getBoundingClientRect();
    const sizes = [...card.querySelectorAll(body)].map(element => parseFloat(getComputedStyle(element).fontSize));
    return {
      box: { left: box.left, top: box.top, width: box.width, height: box.height, bottom: box.bottom, right: box.right },
      clientHeight: card.clientHeight,
      scrollHeight: card.scrollHeight,
      clientWidth: card.clientWidth,
      scrollWidth: card.scrollWidth,
      bodyMinPx: Math.min(...sizes),
      bodyCount: sizes.length,
      titlePx: parseFloat(getComputedStyle(card.querySelector('.activity-card-title')).fontSize),
      page: {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };
  }, BODY);
}

function pageProblems(pageReading, mustFit) {
  const problems = [];
  if (pageReading.scrollWidth > pageReading.width) problems.push(`page scrolls sideways (${pageReading.scrollWidth} > ${pageReading.width})`);
  if (mustFit && pageReading.scrollHeight > pageReading.height) problems.push(`page scrolls down (${pageReading.scrollHeight} > ${pageReading.height})`);
  return problems;
}

async function openActivity(page, activity) {
  const station = page.locator(`.a-station[data-activity="${activity}"]`);
  await station.focus();
  await page.keyboard.press('Enter');
  await page.locator('#activity-card').waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForFunction(() => document.getElementById('activity-card-title').textContent.trim().length > 0);
  // The card fades in over 150 ms with motion on; read it once it is there.
  await page.waitForTimeout(300);
}

async function closeActivity(page) {
  await page.click('#activity-close');
  await page.locator('#activity-card').waitFor({ state: 'hidden', timeout: 10_000 });
}

async function readOne(browser, baseUrl, layout, language) {
  const context = await browser.newContext({
    viewport: layout.viewport,
    hasTouch: layout.hasTouch ?? false,
    isMobile: layout.isMobile ?? false,
  });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(error.message));
  try {
    await page.goto(new URL('#/activities', baseUrl).href);
    await page.waitForFunction(SETTLED, null, { timeout: 60_000 });
    if (language === 'en') {
      await page.click('#language-toggle');
      await page.waitForFunction(() => document.documentElement.lang === 'en');
    }
    await page.waitForTimeout(300);

    const problems = [];
    const rest = await readRest(page);
    problems.push(...pageProblems(rest.page, layout.mustFit).map(problem => `at rest: ${problem}`));
    if (layout.mustFit && rest.page.height - rest.roomBottom > SPARE_BELOW_PX) {
      problems.push(`at rest: ${Math.round(rest.page.height - rest.roomBottom)} px left under the Room (> ${SPARE_BELOW_PX})`);
    }

    const cards = {};
    for (const activity of ACTIVITIES) {
      await openActivity(page, activity);
      const card = await readCard(page);
      cards[activity] = { ...card, box: round(card.box) };
      const say = problem => problems.push(`${activity}: ${problem}`);
      if (card.bodyCount === 0) say('no body copy found on the card');
      if (card.bodyMinPx < BODY_MIN_PX) say(`body text ${card.bodyMinPx} px (< ${BODY_MIN_PX})`);
      pageProblems(card.page, layout.mustFit).forEach(say);
      if (layout.mustFit) {
        if (card.scrollHeight > card.clientHeight) say(`card scrolls (${card.scrollHeight} > ${card.clientHeight})`);
        if (card.scrollWidth > card.clientWidth) say(`card cut off sideways (${card.scrollWidth} > ${card.clientWidth})`);
        if (card.box.top < 0 || card.box.bottom > card.page.height) say(`card off screen (${Math.round(card.box.top)}..${Math.round(card.box.bottom)})`);
      }
      await closeActivity(page);
    }

    await openActivity(page, 'hunt');
    await page.click('#activity-pick');
    await page.waitForTimeout(300);
    const chosen = await page.evaluate(() => ({
      chalkboard: document.querySelector('.a-chalkboard[data-chalkboard="hunt"]').hasAttribute('data-chosen'),
      unpickShowing: !document.getElementById('activity-unpick').hidden,
      page: {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        width: window.innerWidth,
        height: window.innerHeight,
      },
    }));
    if (!chosen.chalkboard) problems.push('chosen: the hunt chalkboard is not marked chosen');
    if (!chosen.unpickShowing) problems.push('chosen: no way to take it back is showing');
    problems.push(...pageProblems(chosen.page, layout.mustFit).map(problem => `chosen: ${problem}`));
    await page.click('#activity-unpick');
    await page.waitForTimeout(300);
    const putBack = await page.evaluate(() => document.querySelectorAll('.a-chalkboard[data-chosen]').length === 0 && document.getElementById('activity-unpick').hidden);
    if (!putBack) problems.push('put back: a chalkboard is still chosen, or the way back still shows');

    if (consoleErrors.length > 0) problems.push(`console errors: ${consoleErrors.join(' | ')}`);
    return { layout: layout.name, language, rest: { ...rest, stage: round(rest.stage) }, cards, chosen, putBack, problems, ok: problems.length === 0 };
  } catch (error) {
    return { layout: layout.name, language, error: error.message, ok: false };
  } finally {
    await context.close();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const readings = [];
  try {
    for (const layout of LAYOUTS) {
      for (const language of LANGUAGES) readings.push(await readOne(browser, options.baseUrl, layout, language));
    }
  } finally {
    await browser.close();
  }
  const ok = readings.every(reading => reading.ok);
  console.log(JSON.stringify({ tool: 'activity-card/1', at: new Date().toISOString(), baseUrl: options.baseUrl, readings, ok }, null, 2));
  for (const reading of readings) {
    const stage = reading.rest?.stage;
    const size = stage ? ` stage ${Math.round(stage.width)} x ${Math.round(stage.height)}` : '';
    console.error(`activity-card: ${reading.layout} ${reading.language}${size} — ${reading.ok ? 'ok' : 'FAIL'}`);
    for (const problem of reading.problems ?? [reading.error]) console.error(`  ${problem}`);
  }
  process.exit(ok ? 0 : 1);
}

main().catch(error => {
  console.error(`activity-card: ${error.stack ?? error.message}`);
  process.exit(1);
});
