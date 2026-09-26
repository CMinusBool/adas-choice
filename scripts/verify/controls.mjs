#!/usr/bin/env node
/**
 * Ticket 101: every control does what it says, checked in a real Chromium.
 *
 * The closing function audit (`notes/closing/function-and-ship-audit.md`) found four
 * controls that did not; this drives each one on the built page the way a visitor
 * would, and exits non-zero when any of them still does not.
 *
 * - **slate** — with the Cinema's slate up, at 1440 x 900 and at 390 x 844, the element
 *   at the "Find it on Apple TV" link's centre is the link; a mouse click (desktop) and
 *   a tap (touch, narrow) each open `tv.apple.com` in a new tab with `window.opener`
 *   null; Enter on the focused link does the same. `tv.apple.com` is a stub page.
 * - **invitation** — the Worker mocked to answer 429, 503, 403 and a network error, and a
 *   Turnstile stub that hands over a fresh token 1.5 s after `reset()`. At 5 s after the
 *   failure, the failure message and `data-state="error"` are still on screen, in both
 *   languages, and the send button is back; withdrawing consent then clears it. A 200
 *   still says "sent".
 * - **hash** — `location.hash = '#/not-a-room'` from every Room ends at `#/entryway`
 *   with the Entryway's title focused, the rewrite adding no history entry, and Back
 *   returning to the Room left rather than to the junk.
 * - **sound** — while `SOUNDS` is empty, `#sound-toggle` is hidden and never reached by
 *   Tab, in either language.
 *
 * **No request leaves the machine.** Every request that is not to the page's own origin
 * is intercepted: the Worker's `*.workers.dev` endpoint and its CORS preflight are
 * answered by the mock, `tv.apple.com` by a stub page, and anything else is aborted and
 * reported. `unmockedRequests` in the report lists what was aborted; `workerRequests`
 * lists every Worker call and what the mock answered.
 *
 * Playwright is imported the way `room-shots.mjs` does (see there). Exit 0 all clear,
 * 1 on a failed check, 2 on a usage error, 3 with no Playwright on the host.
 *
 * ## Usage
 *
 *   node scripts/verify/controls.mjs --base-url http://localhost:4273/
 *   node scripts/verify/controls.mjs --launch preview [--port N] [--only slate,invitation,hash,sound]
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { loadPlaywright, startServer } from './room-shots.mjs';

const ROOMS = ['entryway', 'games', 'cinema', 'activities'];
const CHECKS = ['slate', 'invitation', 'hash', 'sound'];

/** The failure strings, copied from `src/copy.ts` so the check does not share the page's source. */
const STATUS = {
  'zh-Hant': {
    rateLimited: '邀請送得有點快，請稍等一下再試。',
    sendError: '邀請暫時無法送出，請稍後再試。',
    verifyError: '請重新完成安全驗證，再送出邀請。',
    sent: '邀請已送出，期待一起玩 ♡',
  },
  en: {
    rateLimited: 'A few too many invitations. Please wait a little before trying again.',
    sendError: 'The invitation couldn’t be sent. Please try again later.',
    verifyError: 'Please complete a fresh security check and try again.',
    sent: 'Invitation sent. Here’s to playing together ♡',
  },
};

const FAILURES = [
  { answer: 429, expect: 'rateLimited' },
  { answer: 503, expect: 'sendError' },
  { answer: 403, expect: 'verifyError' },
  { answer: 'network', expect: 'sendError' },
];

/** How long after `reset()` the stub hands over a fresh token, and when the message is read. */
const RESOLVE_AFTER_RESET_MS = 1500;
const READ_AT_MS = 5000;

function fail(message) {
  console.error(`controls: ${message}`);
  process.exit(2);
}

function parseArguments(argv) {
  const options = { baseUrl: null, launch: null, port: null, only: CHECKS };
  for (let at = 0; at < argv.length; at += 1) {
    const flag = argv[at];
    const value = () => argv[++at] ?? fail(`${flag} needs a value`);
    if (flag === '--base-url') options.baseUrl = value();
    else if (flag === '--launch') options.launch = value();
    else if (flag === '--port') options.port = Number(value());
    else if (flag === '--only') options.only = value().split(',');
    else fail(`unknown argument ${flag}`);
  }
  if (!options.baseUrl && !options.launch) fail('pass --base-url or --launch');
  for (const check of options.only) if (!CHECKS.includes(check)) fail(`--only: no check called ${check}`);
  return options;
}

/** The loading screen gone and nothing inert: the apartment has opened its door. */
const SETTLED = () => {
  const screen = document.getElementById('loading-screen');
  return Boolean(screen) && screen.hidden && document.querySelectorAll('[inert]').length === 0;
};

/**
 * A Turnstile that solves itself: a token 200 ms after render, and a fresh one
 * `RESOLVE_AFTER_RESET_MS` after every `reset()` — what a managed widget does.
 */
function turnstileStub(afterReset) {
  const widgets = new Map();
  let next = 0;
  window.__turnstile = { renders: 0, resets: 0, tokens: 0 };
  const hand = (id, token, delay) =>
    setTimeout(() => {
      const options = widgets.get(id);
      if (!options) return;
      window.__turnstile.tokens += 1;
      options.callback(token);
    }, delay);
  window.turnstile = {
    render(_selector, options) {
      const id = `stub-${++next}`;
      widgets.set(id, options);
      window.__turnstile.renders += 1;
      hand(id, `token-${next}`, 200);
      return id;
    },
    reset(id) {
      window.__turnstile.resets += 1;
      hand(id, `token-${id}-reset`, afterReset);
    },
    remove(id) {
      widgets.delete(id);
    },
  };
}

/** A context whose every off-origin request is mocked, stubbed or aborted — never sent. */
async function sealedContext(browser, baseUrl, contextOptions, network) {
  const context = await browser.newContext(contextOptions);
  const origin = new URL(baseUrl).origin;
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.hostname.endsWith('.workers.dev')) {
      const cors = {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const answer = network.answer;
      network.workerRequests.push({ method: request.method(), url: url.href, answer });
      if (answer === 'network') return route.abort('failed');
      const ok = answer === 200;
      return route.fulfill({
        status: answer,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify(ok ? { ok: true } : { ok: false, error: 'mocked' }),
      });
    }
    if (url.hostname === 'tv.apple.com') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title><p>stub</p>' });
    }
    network.unmockedRequests.push(url.href);
    return route.abort('blockedbyclient');
  });
  return context;
}

async function openRoom(page, baseUrl, room, consoleErrors) {
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(error.message));
  await page.goto(new URL(`#/${room}`, baseUrl).href);
  await page.waitForFunction(SETTLED, null, { timeout: 60_000 });
}

async function toEnglish(page) {
  await page.click('#language-toggle');
  await page.waitForFunction(() => document.documentElement.lang === 'en');
}

// ------------------------------------------------------------------ slate

/** Choose a Film from the comedy shelf and wait for the slate's link to show. */
async function raiseSlate(page) {
  await page.click('button.cinema-shelf[data-shelf="comedy"]');
  const poster = page.locator('button.cinema-poster').first();
  await poster.waitFor({ state: 'visible', timeout: 30_000 });
  await poster.click();
  const choose = page.locator('#poster-details .details-choose');
  await choose.waitFor({ state: 'visible', timeout: 10_000 });
  await choose.click();
  const link = page.locator('.film-slate-link');
  await link.waitFor({ state: 'visible', timeout: 30_000 });
  // The card fades in; read the link once it has stopped moving.
  await page.waitForTimeout(800);
  return link;
}

/** The element at the link's centre, and whether it is the link. */
async function hitAtCentre(link) {
  return link.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const name = hit ? `${hit.tagName.toLowerCase()}${hit.className ? `.${String(hit.className).split(' ').join('.')}` : ''}` : null;
    return { isLink: hit === element, hit: name, pointerEvents: getComputedStyle(element).pointerEvents };
  });
}

/** Run `act`, and read the tab it opens: its host and whether it can reach back. */
async function opensApple(context, act) {
  const popup = context.waitForEvent('page', { timeout: 10_000 }).catch(error => error);
  try {
    await act();
  } catch (error) {
    await popup;
    return { error: error.message.split('\n')[0], ok: false };
  }
  const tab = await popup;
  if (tab instanceof Error) return { error: tab.message.split('\n')[0], ok: false };
  await tab.waitForLoadState('domcontentloaded');
  const reading = { host: new URL(tab.url()).hostname, openerIsNull: await tab.evaluate(() => window.opener === null) };
  await tab.close();
  return { ...reading, ok: reading.host === 'tv.apple.com' && reading.openerIsNull };
}

async function checkSlate(browser, baseUrl, network) {
  const readings = [];
  const layouts = [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, pointer: 'mouse' },
    { name: 'narrow', viewport: { width: 390, height: 844 }, pointer: 'touch', hasTouch: true, isMobile: true },
  ];
  for (const layout of layouts) {
    const context = await sealedContext(
      browser,
      baseUrl,
      { viewport: layout.viewport, hasTouch: layout.hasTouch ?? false, isMobile: layout.isMobile ?? false, reducedMotion: 'reduce' },
      network,
    );
    const consoleErrors = [];
    try {
      const page = await context.newPage();
      await openRoom(page, baseUrl, 'cinema', consoleErrors);
      const link = await raiseSlate(page);
      await link.scrollIntoViewIfNeeded();
      const centre = await hitAtCentre(link);
      const pointer = await opensApple(context, () => (layout.pointer === 'touch' ? link.tap({ timeout: 5_000 }) : link.click({ timeout: 5_000 })));
      const keyboard = await opensApple(context, async () => {
        await link.focus();
        await page.keyboard.press('Enter');
      });
      const ok = centre.isLink && pointer.ok && keyboard.ok && consoleErrors.length === 0;
      readings.push({ layout: layout.name, pointer: layout.pointer, centre, [layout.pointer]: pointer, keyboard, consoleErrors, ok });
    } catch (error) {
      readings.push({ layout: layout.name, error: error.message, consoleErrors, ok: false });
    } finally {
      await context.close();
    }
  }
  return readings;
}

// ------------------------------------------------------------------ invitation

async function sendOnce(browser, baseUrl, network, { language, answer }) {
  const context = await sealedContext(browser, baseUrl, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }, network);
  await context.addInitScript(turnstileStub, RESOLVE_AFTER_RESET_MS);
  const consoleErrors = [];
  try {
    const page = await context.newPage();
    await openRoom(page, baseUrl, 'games', consoleErrors);
    if (language === 'en') await toEnglish(page);
    await page.click('button.portal[data-game="tango"]');
    await page.locator('#portal-invite').waitFor({ state: 'visible', timeout: 10_000 });
    await page.click('#portal-invite');
    await page.waitForFunction(() => document.getElementById('game-dialog').open);
    await page.check('#invite-consent');
    await page.waitForFunction(() => !document.getElementById('send-invite').disabled, null, { timeout: 5_000 });
    network.answer = answer;
    await page.click('#send-invite');
    // The failure has landed once the page has asked Turnstile for a fresh token
    // (or, for a success, once it says so).
    await page.waitForFunction(
      ok => (ok ? document.getElementById('invite-status').dataset.state === 'ok' && !document.getElementById('send-invite').textContent.includes('…') : window.__turnstile.resets > 0),
      answer === 200,
      { timeout: 25_000 },
    );
    await page.waitForTimeout(READ_AT_MS);
    const shown = await page.evaluate(() => ({
      text: document.getElementById('invite-status').textContent,
      state: document.getElementById('invite-status').dataset.state,
      sendEnabled: !document.getElementById('send-invite').disabled,
      tokens: window.__turnstile.tokens,
      resets: window.__turnstile.resets,
    }));
    // A withdrawn consent is one of the three things that take a failure down.
    await page.uncheck('#invite-consent');
    const afterWithdrawn = await page.evaluate(() => document.getElementById('invite-status').textContent);
    return { consoleErrors, ...shown, afterWithdrawn };
  } finally {
    await context.close();
  }
}

async function checkInvitation(browser, baseUrl, network) {
  const readings = [];
  for (const language of ['zh-Hant', 'en']) {
    for (const failure of FAILURES) {
      const wanted = STATUS[language][failure.expect];
      try {
        const shown = await sendOnce(browser, baseUrl, network, { language, answer: failure.answer });
        // The fresh token must really have arrived, or the check proves nothing.
        const ok = shown.text === wanted && shown.state === 'error' && shown.resets === 1 && shown.tokens >= 2 && shown.sendEnabled && shown.afterWithdrawn === '';
        readings.push({ language, answer: failure.answer, atMs: READ_AT_MS, wanted, ...shown, ok });
      } catch (error) {
        readings.push({ language, answer: failure.answer, error: error.message, ok: false });
      }
    }
    try {
      const wanted = STATUS[language].sent;
      const shown = await sendOnce(browser, baseUrl, network, { language, answer: 200 });
      readings.push({ language, answer: 200, atMs: READ_AT_MS, wanted, ...shown, ok: shown.text === wanted && shown.state === 'ok' });
    } catch (error) {
      readings.push({ language, answer: 200, error: error.message, ok: false });
    }
  }
  return readings;
}

// ------------------------------------------------------------------ hash

async function checkHash(browser, baseUrl, network) {
  const readings = [];
  for (const room of ROOMS) {
    const context = await sealedContext(browser, baseUrl, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }, network);
    const consoleErrors = [];
    try {
      const page = await context.newPage();
      await openRoom(page, baseUrl, room, consoleErrors);
      const before = await page.evaluate(() => history.length);
      await page.evaluate(() => { location.hash = '#/not-a-room'; });
      await page.waitForTimeout(1500);
      const after = await page.evaluate(() => ({
        hash: location.hash,
        historyLength: history.length,
        titleFocused: document.activeElement === document.querySelector('[data-room="entryway"] [data-room-title]'),
      }));
      await page.goBack();
      await page.waitForTimeout(800);
      const back = await page.evaluate(() => location.hash);
      // The page's own assignment is one entry; the rewrite must add none, and
      // the junk must not be what Back finds.
      const ok = after.hash === '#/entryway' && after.historyLength === before + 1 && after.titleFocused && back === `#/${room}` && consoleErrors.length === 0;
      readings.push({ from: room, historyBefore: before, ...after, backTo: back, consoleErrors, ok });
    } catch (error) {
      readings.push({ from: room, error: error.message, consoleErrors, ok: false });
    } finally {
      await context.close();
    }
  }
  return readings;
}

// ------------------------------------------------------------------ sound

async function checkSound(browser, baseUrl, network) {
  const readings = [];
  const context = await sealedContext(browser, baseUrl, { viewport: { width: 1440, height: 900 } }, network);
  const consoleErrors = [];
  try {
    const page = await context.newPage();
    await openRoom(page, baseUrl, 'entryway', consoleErrors);
    for (const language of ['zh-Hant', 'en']) {
      if (language === 'en') await toEnglish(page);
      const toggle = await page.evaluate(() => {
        const element = document.getElementById('sound-toggle');
        return { hidden: element.hidden, display: getComputedStyle(element).display };
      });
      // Walk the Tab order from the top of the page, well past the header.
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await page.locator('body').focus();
      let reached = false;
      for (let step = 0; step < 12; step += 1) {
        await page.keyboard.press('Tab');
        if (await page.evaluate(() => document.activeElement?.id === 'sound-toggle')) reached = true;
      }
      readings.push({ language, ...toggle, reachedByTab: reached, ok: toggle.hidden && toggle.display === 'none' && !reached });
    }
  } catch (error) {
    readings.push({ error: error.message, ok: false });
  } finally {
    await context.close();
  }
  if (consoleErrors.length) readings.push({ consoleErrors, ok: false });
  return readings;
}

// ------------------------------------------------------------------ main

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const playwright = await loadPlaywright();
  const server = options.launch
    ? await startServer(repoRoot, options.launch, options.port)
    : { baseUrl: options.baseUrl, stop: async () => {} };

  const network = { answer: 200, workerRequests: [], unmockedRequests: [] };
  const results = {};
  let browser = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const run = { slate: checkSlate, invitation: checkInvitation, hash: checkHash, sound: checkSound };
    for (const check of options.only) results[check] = await run[check](browser, server.baseUrl, network);
  } finally {
    if (browser) await browser.close();
    await server.stop();
  }

  const verdicts = Object.fromEntries(Object.entries(results).map(([check, readings]) => [check, readings.every(reading => reading.ok)]));
  const ok = Object.values(verdicts).every(Boolean);
  const report = {
    tool: 'controls/1',
    at: new Date().toISOString(),
    baseUrl: server.baseUrl,
    verdicts,
    results,
    workerRequests: network.workerRequests,
    unmockedRequests: network.unmockedRequests,
    ok,
  };
  console.log(JSON.stringify(report, null, 2));
  for (const [check, verdict] of Object.entries(verdicts)) console.error(`controls: ${check} — ${verdict ? 'ok' : 'FAIL'}`);
  process.exit(ok ? 0 : 1);
}

main().catch(error => {
  console.error(`controls: ${error.stack ?? error.message}`);
  process.exit(1);
});
