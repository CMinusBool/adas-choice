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
 * - **challenge** (ticket 104) — a Turnstile that cannot run here, in both languages: a
 *   stub answering `render` with `error-callback('110200')` (the code the real widget gives
 *   on a hostname its dashboard does not list), and no stub at all, so `api.js` itself
 *   fails to load. Either way the dialog shows its own note where the widget was, and
 *   none of Cloudflare's error box; the send button stays off, and withdrawing consent
 *   takes the note down. A stub failing with `300010` (a challenge that did not pass,
 *   which the widget retries by itself) keeps the widget and says "try again" instead.
 * - **film** (ticket 108) — "Watch this one tonight" opens the same Invitation dialog with
 *   the Film named, title in the visitor's language and year, in both languages; a send
 *   reaches the mocked Worker with the Film's id, title and year; the Bumper does not play
 *   while the dialog is open, and does once it is closed, sent or dismissed. Four runs: the
 *   keyboard (Tab into the card, Enter, Space, Enter, Escape) and a mouse at 1440 x 900, and
 *   a tap at 390 x 844 that dismisses and one that sends; two with motion on, two off.
 * - **hash** — `location.hash = '#/not-a-room'` from every Room ends at `#/entryway`
 *   with the Entryway's title focused, the rewrite adding no history entry, and Back
 *   returning to the Room left rather than to the junk.
 * - **sound** — while `SOUNDS` is empty, `#sound-toggle` is hidden and never reached by
 *   Tab, in either language.
 * - **cats** (ticket 103) — at 1440 x 900 (mouse) and 390 x 844 (touch), on all four
 *   routes and in both languages, once the Room's Arrival has ended: the element at every
 *   cat's feet point is that cat's button (her `::before` pad hit-tests as the button),
 *   and a click or tap there pets her. Another cat or a control over her is waited out,
 *   since the cats roam; anything else over her — an Actor's `.cycle` layer, a Prop that
 *   takes no input, a control that says it is off — fails the reading.
 * - **pointers** (ticket 103) — the same Rooms and widths: nothing on a stage takes a
 *   pointer unless it is a control or inside one, and every control showing in the Room
 *   (Portal, door, shelf, Poster, Activity, switch, link) takes the pointer at its centre.
 *   The Cinema is read again with a shelf chosen, so its Posters are showing.
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
 *   node scripts/verify/controls.mjs --launch preview [--port N] [--only slate,invitation,challenge,film,hash,sound,cats,pointers]
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { loadPlaywright, startServer } from './room-shots.mjs';

const ROOMS = ['entryway', 'games', 'cinema', 'activities'];
const CHECKS = ['slate', 'invitation', 'challenge', 'film', 'hash', 'sound', 'cats', 'pointers'];

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

/** The note a widget that cannot load leaves in its place, copied from `src/copy.ts` like `STATUS`. */
const CHALLENGE_NOTE = {
  'zh-Hant': '安全驗證無法在這個網址載入，所以暫時無法從這裡寄送邀請。還是可以先去 Steam 看看。',
  en: 'The security check can’t load at this address, so the invitation can’t be sent from here. You can still check the game on Steam.',
};

/** The comedy shelf's three Films, copied from `src/world/films.ts` like `STATUS`. */
const COMEDY = {
  'knives-out': { title: { 'zh-Hant': '鋒迴路轉', en: 'Knives Out' }, year: 2019 },
  'kung-fu-hustle': { title: { 'zh-Hant': '功夫', en: 'Kung Fu Hustle' }, year: 2004 },
  'eat-drink-man-woman': { title: { 'zh-Hant': '飲食男女', en: 'Eat Drink Man Woman' }, year: 1994 },
};

/** What the dialog says when it is a Film being chosen, copied from `src/copy.ts` like `STATUS`. */
const FILM_DIALOG = {
  'zh-Hant': {
    title: '今晚一起看電影，好嗎？',
    consent: '我同意將這部電影的選擇、IP 位址、大約所在國家，以及基本裝置／瀏覽器資訊寄給網站主人。',
    invite: '想跟你一起看這部～',
    link: '在 Apple TV 找到它',
    sent: '邀請已送出，今晚一起看 ♡',
  },
  en: {
    title: 'A movie night, maybe?',
    consent: 'I agree to share this film choice, my IP address, approximate country, and basic device/browser details with the page owner by email.',
    invite: 'I want to watch this with u~',
    link: 'Find it on Apple TV',
    sent: 'Invitation sent. Here’s to movie night ♡',
  },
};

const FILM_RUNS = [
  { language: 'zh-Hant', layout: 'desktop', input: 'keyboard', send: true, motion: false },
  { language: 'en', layout: 'desktop', input: 'mouse', send: true, motion: true },
  { language: 'zh-Hant', layout: 'narrow', input: 'tap', send: false, motion: true },
  { language: 'en', layout: 'narrow', input: 'tap', send: true, motion: false },
];

const CHALLENGE_FAILURES = [
  { cause: '110200', note: true },
  { cause: 'script', note: true },
  { cause: '300010', note: false },
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

/**
 * A Turnstile that cannot run here: it paints a stand-in for Cloudflare's own error box
 * into the container, then calls `error-callback(code)` 300 ms after `render`.
 */
function failingTurnstileStub(code) {
  const widgets = new Map();
  let next = 0;
  window.__turnstile = { renders: 0, removes: 0 };
  window.turnstile = {
    render(selector, options) {
      const id = `stub-${++next}`;
      widgets.set(id, options);
      window.__turnstile.renders += 1;
      const box = document.createElement('div');
      box.className = 'stub-cloudflare-error';
      box.dataset.stub = id;
      box.textContent = 'Unable to connect to website';
      (typeof selector === 'string' ? document.querySelector(selector) : selector).append(box);
      setTimeout(() => { if (widgets.has(id)) options['error-callback']?.(code); }, 300);
      return id;
    },
    reset() {},
    remove(id) {
      widgets.delete(id);
      window.__turnstile.removes += 1;
      document.querySelector(`[data-stub="${id}"]`)?.remove();
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
      let body = null;
      try { body = request.postDataJSON(); } catch { body = request.postData(); }
      network.workerRequests.push({ method: request.method(), url: url.href, answer, body });
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
  // 108: the choice offers the Invitation first; the Film rolls once it is dismissed.
  await page.waitForFunction(() => document.getElementById('game-dialog').open, null, { timeout: 5_000 });
  await page.keyboard.press('Escape');
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

// ------------------------------------------------------------------ challenge

/** The dialog's reading 2 s after consent, once the widget has failed, and again after consent is withdrawn. */
async function failOnce(browser, baseUrl, network, { language, cause }) {
  const context = await sealedContext(browser, baseUrl, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }, network);
  // No stub for `script`: the sealed context aborts `challenges.cloudflare.com`, so `api.js` fails to load.
  if (cause !== 'script') await context.addInitScript(failingTurnstileStub, cause);
  const consoleErrors = [];
  const read = () => {
    const note = document.getElementById('turnstile-unavailable');
    const widget = document.getElementById('turnstile-widget');
    return {
      note: note && !note.hidden && note.getBoundingClientRect().height > 0 ? note.textContent : null,
      cloudflareBox: Boolean(widget.querySelector('.stub-cloudflare-error')),
      widgetShowing: !widget.hidden,
      status: document.getElementById('invite-status').textContent,
      sendEnabled: !document.getElementById('send-invite').disabled,
    };
  };
  try {
    const page = await context.newPage();
    await openRoom(page, baseUrl, 'games', consoleErrors);
    if (language === 'en') await toEnglish(page);
    await page.click('button.portal[data-game="tango"]');
    await page.locator('#portal-invite').waitFor({ state: 'visible', timeout: 10_000 });
    await page.click('#portal-invite');
    await page.waitForFunction(() => document.getElementById('game-dialog').open);
    await page.check('#invite-consent');
    await page.waitForTimeout(2000);
    const shown = await page.evaluate(read);
    await page.uncheck('#invite-consent');
    const afterWithdrawn = await page.evaluate(read);
    // An aborted `api.js` is a failed request the check caused on purpose, not a page error.
    const pageErrors = consoleErrors.filter(text => !(cause === 'script' && text.startsWith('Failed to load resource')));
    return { ...shown, afterWithdrawn, pageErrors };
  } finally {
    await context.close();
  }
}

async function checkChallenge(browser, baseUrl, network) {
  const readings = [];
  for (const language of ['zh-Hant', 'en']) {
    for (const failure of CHALLENGE_FAILURES) {
      try {
        const shown = await failOnce(browser, baseUrl, network, { language, cause: failure.cause });
        const ok = failure.note
          ? shown.note === CHALLENGE_NOTE[language] && !shown.cloudflareBox && !shown.widgetShowing && shown.status === '' && !shown.sendEnabled
            && shown.afterWithdrawn.note === null && shown.pageErrors.length === 0
          : shown.note === null && shown.cloudflareBox && shown.widgetShowing && shown.status === STATUS[language].verifyError && !shown.sendEnabled
            && shown.pageErrors.length === 0;
        readings.push({ language, cause: failure.cause, wanted: failure.note ? CHALLENGE_NOTE[language] : STATUS[language].verifyError, ...shown, ok });
      } catch (error) {
        readings.push({ language, cause: failure.cause, error: error.message, ok: false });
      }
    }
  }
  return readings;
}

// ------------------------------------------------------------------ film

/** The Invitation dialog, and whether the Film has started rolling behind it. */
const READ_FILM_DIALOG = () => {
  const text = selector => document.querySelector(selector)?.textContent ?? null;
  const film = document.querySelector('.cinema-film');
  const link = document.getElementById('dialog-steam');
  let linkHost = null;
  try { linkHost = new URL(link.href).hostname; } catch { linkHost = null; }
  return {
    open: document.getElementById('game-dialog').open,
    named: text('#dialog-game'),
    title: text('#dialog-title'),
    consent: text('#invite-consent + span'),
    invite: text('#send-label'),
    link: text('#dialog-steam > span'),
    linkHost,
    filmRolling: Boolean(film && !film.hidden),
  };
};

/** From the Bumper's first unhidden frame on, `window.__bumperSeen` is true. */
const WATCH_FOR_BUMPER = () => {
  window.__bumperSeen = false;
  const film = document.querySelector('.cinema-film');
  const bumper = film?.querySelector('.bumper');
  const look = () => { if (film && bumper && !film.hidden && !bumper.hidden) window.__bumperSeen = true; };
  if (film) new MutationObserver(look).observe(film, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
  look();
};

async function chooseFilmOnce(browser, baseUrl, network, run) {
  const layout = POINTER_LAYOUTS.find(candidate => candidate.name === run.layout);
  const context = await sealedContext(
    browser,
    baseUrl,
    {
      viewport: layout.viewport, hasTouch: layout.hasTouch ?? false, isMobile: layout.isMobile ?? false,
      reducedMotion: run.motion ? 'no-preference' : 'reduce',
    },
    network,
  );
  await context.addInitScript(turnstileStub, RESOLVE_AFTER_RESET_MS);
  const consoleErrors = [];
  try {
    const page = await context.newPage();
    await openRoom(page, baseUrl, 'cinema', consoleErrors);
    if (run.language === 'en') await toEnglish(page);
    const press = async locator => {
      if (run.input === 'tap') await locator.tap({ timeout: 10_000 });
      else if (run.input === 'mouse') await locator.click({ timeout: 10_000 });
      else {
        await locator.focus();
        await page.keyboard.press('Enter');
      }
    };
    // With motion on, the Room's Arrival is let run out first, as `pointers` does.
    if (run.motion) await page.waitForTimeout(ARRIVAL_OVER_MS.cinema);
    await press(page.locator('button.cinema-shelf[data-shelf="comedy"]'));
    const poster = page.locator('button.cinema-poster').first();
    await poster.waitFor({ state: 'visible', timeout: 45_000 });
    const film = await poster.getAttribute('data-film');
    const choose = page.locator('#poster-details .details-choose');
    if (run.input === 'keyboard') {
      // Focus opens the Poster, and Tab hands on into the card's first action.
      await poster.focus();
      await choose.waitFor({ state: 'visible', timeout: 10_000 });
      await page.keyboard.press('Tab');
      if (!(await choose.evaluate(element => document.activeElement === element))) throw new Error('Tab from the open Poster did not reach "watch this one tonight"');
      await page.keyboard.press('Enter');
    } else {
      await press(poster);
      await choose.waitFor({ state: 'visible', timeout: 10_000 });
      await press(choose);
    }
    await page.waitForFunction(() => document.getElementById('game-dialog').open, null, { timeout: 5_000 });
    const opened = await page.evaluate(READ_FILM_DIALOG);
    const before = network.workerRequests.length;
    let status = null;
    if (run.send) {
      const consent = page.locator('#invite-consent');
      if (run.input === 'keyboard') {
        await consent.focus();
        await page.keyboard.press('Space');
      } else if (run.input === 'tap') await consent.tap();
      else await consent.click();
      await page.waitForFunction(() => !document.getElementById('send-invite').disabled, null, { timeout: 5_000 });
      network.answer = 200;
      await press(page.locator('#send-invite'));
      await page
        .waitForFunction(wanted => document.getElementById('invite-status').textContent === wanted, FILM_DIALOG[run.language].sent, { timeout: 10_000 })
        .catch(() => {});
      status = await page.evaluate(() => document.getElementById('invite-status').textContent);
    }
    const sent = network.workerRequests.slice(before).map(request => request.body);
    const whileOpen = await page.evaluate(READ_FILM_DIALOG);
    await page.evaluate(WATCH_FOR_BUMPER);
    if (run.input === 'keyboard') await page.keyboard.press('Escape');
    else await press(page.locator('#dialog-close'));
    await page.waitForFunction(() => window.__bumperSeen, null, { timeout: 15_000 }).catch(() => {});
    const after = await page.evaluate(() => ({
      dialogOpen: document.getElementById('game-dialog').open,
      bumperSeen: window.__bumperSeen,
      focusOnGate: document.activeElement?.matches('[data-projector-gate]') ?? false,
    }));
    return { film, opened, status, sent, whileOpen, ...after, consoleErrors };
  } finally {
    await context.close();
  }
}

async function checkFilm(browser, baseUrl, network) {
  const readings = [];
  for (const run of FILM_RUNS) {
    try {
      const shown = await chooseFilmOnce(browser, baseUrl, network, run);
      const facts = COMEDY[shown.film];
      const words = FILM_DIALOG[run.language];
      const named = facts ? `${facts.title[run.language]} (${facts.year})` : null;
      const dialogRight = shown.opened.open && shown.opened.named === named && shown.opened.title === words.title
        && shown.opened.consent === words.consent && shown.opened.invite === words.invite && shown.opened.link === words.link
        && shown.opened.linkHost === 'tv.apple.com';
      const body = shown.sent[0];
      const sendRight = run.send
        ? shown.status === words.sent && shown.sent.length === 1 && body?.film === shown.film && body?.title === facts?.title[run.language]
          && body?.year === facts?.year && body?.action === 'watch-together' && body?.consent === true && !('game' in (body ?? {}))
        : shown.sent.length === 0;
      const bumperAfter = !shown.opened.filmRolling && !shown.whileOpen.filmRolling && !shown.dialogOpen && shown.bumperSeen;
      const ok = dialogRight && sendRight && bumperAfter && (run.input !== 'keyboard' || shown.focusOnGate) && shown.consoleErrors.length === 0;
      readings.push({ ...run, wanted: { named, ...words }, ...shown, dialogRight, sendRight, bumperAfter, ok });
    } catch (error) {
      readings.push({ ...run, error: error.message, ok: false });
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

// ------------------------------------------------------------------ cats and pointers

/**
 * Ticket 103: the two layouts the verifier reads, a mouse on the desktop and a finger on
 * the phone. Motion stays on: the Arrival plays and the cats roam, as a visitor sees them.
 */
const POINTER_LAYOUTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, pointer: 'mouse' },
  { name: 'narrow', viewport: { width: 390, height: 844 }, pointer: 'touch', hasTouch: true, isMobile: true },
];

/**
 * How long after the loading screen lifts each Room's Arrival has certainly ended: the
 * Entryway's 11.9 s entrance, and the ~3 s Arrival whose last stride lands by 3.60 s.
 */
const ARRIVAL_OVER_MS = { entryway: 12_900, games: 4_600, cinema: 4_600, activities: 4_600 };

/** Tries per cat, and the wait between them, while another cat or a control stands over her. */
const CAT_TRIES = 12;
const CAT_RETRY_MS = 600;

/**
 * What takes a pointer by right: a control. Everything else on a stage — an Actor's
 * `.cycle` layer, a Prop that takes no input, a control that says it is off — must let
 * the pointer through. Kept here rather than read from the page's source. A `role="group"`
 * is the narrow Game Room's Portal chooser, which takes a sideways swipe across its dots
 * (ticket 47's `touch-action: pan-y`), so it is input too.
 */
const CONTROL = 'a[href], button, input, select, textarea, summary, label, [role="button"], [role="group"], [tabindex]:not([tabindex="-1"])';

async function openAfterArrival(browser, baseUrl, network, layout, room) {
  const context = await sealedContext(
    browser,
    baseUrl,
    { viewport: layout.viewport, hasTouch: layout.hasTouch ?? false, isMobile: layout.isMobile ?? false },
    network,
  );
  const consoleErrors = [];
  const page = await context.newPage();
  await openRoom(page, baseUrl, room, consoleErrors);
  await page.waitForTimeout(ARRIVAL_OVER_MS[room]);
  return { context, page, consoleErrors };
}

/**
 * Scroll one cat into view (a narrow Room pans) and read what is under her feet point —
 * the bottom centre of her sprite, which her hit pad is centred on. The scroll is instant:
 * `html` scrolls smoothly, and a point read mid-scroll is not where the tap lands.
 */
function readFeet({ room, actor, control }) {
  const stage = document.querySelector(`.stage[data-stage="${room}"]`);
  const cat = stage.querySelector(`.actor.cat[data-actor="${actor}"]`);
  const name = element => {
    if (!element) return null;
    const classes = typeof element.className === 'string' && element.className ? `.${element.className.trim().split(/\s+/).join('.')}` : '';
    return `${element.tagName.toLowerCase()}${element.dataset.actor ? `[${element.dataset.actor}]` : ''}${classes}`;
  };
  if (!cat || getComputedStyle(cat).display === 'none') return { kind: 'absent' };
  cat.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  const box = cat.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.bottom - 1;
  const hit = document.elementFromPoint(x, y);
  let kind;
  if (!hit || !stage.contains(hit)) kind = 'outside';
  else if (hit === cat || cat.contains(hit)) kind = 'self';
  else if (hit.closest('.actor.cat')) kind = 'cat';
  else if (hit.closest(control) && !hit.closest(control).matches('[aria-disabled="true"]')) kind = 'control';
  else kind = 'non-control';
  const owner = hit?.closest('.actor');
  return { kind, x: Math.round(x), y: Math.round(y), hit: `${name(hit)}${owner && owner !== hit ? ` in ${name(owner)}` : ''}` };
}

/** Wait until no cat in the Room is being fussed over, so the next tap is a fresh petting. */
async function settleCats(page, room) {
  await page.waitForFunction(
    room => ![...document.querySelectorAll(`.stage[data-stage="${room}"] .actor.cat`)].some(cat => cat.matches('.is-petted, .is-fussed')),
    room,
    { timeout: 10_000 },
  );
}

/**
 * One cat: read her feet point until it is hers (another cat or a control standing over
 * her is waited out — they walk on), then tap there and see her petted. A non-control
 * over her feet fails the reading however it ends: that is the layering this guards.
 */
async function petAtFeet(page, layout, room, actor) {
  const readings = [];
  for (let attempt = 0; attempt < CAT_TRIES; attempt += 1) {
    const reading = await page.evaluate(readFeet, { room, actor, control: CONTROL });
    readings.push(reading);
    if (reading.kind === 'self') {
      if (layout.pointer === 'touch') await page.touchscreen.tap(reading.x, reading.y);
      else await page.mouse.click(reading.x, reading.y);
      const petted = await page
        .waitForFunction(
          ({ room, actor }) => document.querySelector(`.stage[data-stage="${room}"] .actor.cat[data-actor="${actor}"]`).matches('.is-petted, .is-fussed'),
          { room, actor },
          { timeout: 2_000 },
        )
        .then(() => true, () => false);
      const coveredBy = readings.filter(r => r.kind === 'non-control').map(r => r.hit);
      return { actor, first: readings[0], at: reading, attempts: readings.length, petted, coveredBy, ok: petted && coveredBy.length === 0 };
    }
    await page.waitForTimeout(CAT_RETRY_MS);
  }
  const coveredBy = readings.filter(r => r.kind === 'non-control').map(r => r.hit);
  return { actor, first: readings[0], last: readings.at(-1), attempts: readings.length, petted: false, coveredBy, ok: false };
}

/** Every cat's feet point is hers, and a tap there pets her — four Rooms, two widths, both languages. */
async function checkCats(browser, baseUrl, network) {
  const readings = [];
  for (const layout of POINTER_LAYOUTS) {
    for (const room of ROOMS) {
      let opened = null;
      try {
        opened = await openAfterArrival(browser, baseUrl, network, layout, room);
        const { page, consoleErrors } = opened;
        for (const language of ['zh-Hant', 'en']) {
          if (language === 'en') {
            await settleCats(page, room);
            await toEnglish(page);
          }
          const cats = [];
          for (const actor of ['mica', 'mira', 'luna']) cats.push(await petAtFeet(page, layout, room, actor));
          readings.push({ layout: layout.name, room, language, cats, consoleErrors: [...consoleErrors], ok: cats.every(cat => cat.ok) && consoleErrors.length === 0 });
        }
      } catch (error) {
        readings.push({ layout: layout.name, room, error: error.message, ok: false });
      } finally {
        await opened?.context.close();
      }
    }
  }
  return readings;
}

/**
 * The other side of the same rule. Everything in the Room that takes a pointer is a
 * control, or inside one — the stage itself aside, which lies under everything on it —
 * and every control that is showing takes the pointer at its own centre.
 */
function auditRoom({ room, control }) {
  const section = document.getElementById(`room-${room}`);
  const stage = section.querySelector('.stage');
  const name = element => {
    const classes = typeof element.className === 'string' && element.className ? `.${element.className.trim().split(/\s+/).join('.')}` : '';
    return `${element.tagName.toLowerCase()}${classes}`;
  };
  const showing = element => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0 && !element.closest('[hidden]');
  };
  const nonControls = [];
  for (const element of stage.querySelectorAll('*')) {
    if (getComputedStyle(element).pointerEvents === 'none' || !showing(element)) continue;
    const owner = element.closest(control);
    if (owner && !owner.matches('[aria-disabled="true"]')) continue;
    nonControls.push(name(element));
  }
  const controls = [...section.querySelectorAll(control)].filter(element => showing(element) && !element.matches('[aria-disabled="true"]'));
  controls.forEach((element, index) => element.setAttribute('data-audit', String(index)));
  return { nonControls, controls: controls.map((element, index) => ({ index, name: `${name(element)}${element.dataset.shelf ? `[${element.dataset.shelf}]` : ''}` })) };
}

/** The element at one audited control's centre, after scrolling it into view. */
function hitControl(index) {
  const element = document.querySelector(`[data-audit="${index}"]`);
  element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  const box = element.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  const classes = hit && typeof hit.className === 'string' && hit.className ? `.${hit.className.trim().split(/\s+/).join('.')}` : '';
  return { own: Boolean(hit) && (hit === element || element.contains(hit)), byCat: Boolean(hit?.closest('.actor.cat')), hit: hit ? `${hit.tagName.toLowerCase()}${classes}` : null };
}

async function auditControls(page, room) {
  const audit = await page.evaluate(auditRoom, { room, control: CONTROL });
  const missed = [];
  for (const { index, name } of audit.controls) {
    let reading = await page.evaluate(hitControl, index);
    // A cat roaming across a control's centre is passing, not covering: wait her out.
    for (let attempt = 0; !reading.own && reading.byCat && attempt < 6; attempt += 1) {
      await page.waitForTimeout(CAT_RETRY_MS);
      reading = await page.evaluate(hitControl, index);
    }
    if (!reading.own) missed.push({ control: name, hit: reading.hit });
  }
  return { nonControls: audit.nonControls, controls: audit.controls.length, missed };
}

async function checkPointers(browser, baseUrl, network) {
  const readings = [];
  for (const layout of POINTER_LAYOUTS) {
    for (const room of ROOMS) {
      let opened = null;
      try {
        opened = await openAfterArrival(browser, baseUrl, network, layout, room);
        const { page, consoleErrors } = opened;
        const passes = [{ state: 'at rest', ...(await auditControls(page, room)) }];
        if (room === 'cinema') {
          // The Posters only show once a shelf is chosen.
          await page.evaluate(() => document.querySelector('button.cinema-shelf').scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
          await page.click('button.cinema-shelf');
          await page.locator('button.cinema-poster').first().waitFor({ state: 'visible', timeout: 30_000 });
          await page.waitForTimeout(800);
          passes.push({ state: 'shelf chosen', ...(await auditControls(page, room)) });
        }
        const ok = passes.every(pass => pass.nonControls.length === 0 && pass.missed.length === 0) && consoleErrors.length === 0;
        readings.push({ layout: layout.name, room, passes, consoleErrors: [...consoleErrors], ok });
      } catch (error) {
        readings.push({ layout: layout.name, room, error: error.message, ok: false });
      } finally {
        await opened?.context.close();
      }
    }
  }
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
    const run = { slate: checkSlate, invitation: checkInvitation, challenge: checkChallenge, film: checkFilm, hash: checkHash, sound: checkSound, cats: checkCats, pointers: checkPointers };
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
