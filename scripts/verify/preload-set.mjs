#!/usr/bin/env node
/**
 * Ask a real browser whether the apartment really waited for its artwork.
 *
 * ## Why this exists
 *
 * `CLAUDE.md`: *"The apartment waits for its artwork. Nothing is reachable until
 * every declared asset has loaded behind the loading screen."* The gate in
 * `src/dom/loading.ts` builds its list by sweeping the page for `data-still`,
 * `data-animated` and `data-sheet` and for the `<img src>`s inside `#apartment`,
 * so a Room is preloaded by declaring its artwork in markup and nothing else.
 *
 * Ticket 35 furnished the Activity Room by writing fourteen `url("…")`s into
 * `styles.css` instead, which that sweep cannot see: the screen lifted onto a
 * Room whose furniture had not loaded, and nothing in `npm test` or
 * `npm run build` noticed, because both look at files rather than at a running
 * page. Reading the markup could not have caught it either — the markup looked
 * fine; the URL was somewhere else.
 *
 * So this measures the only thing that settles it, in a browser that is really
 * ticking:
 *
 *   1. **what the gate really fetched** — every resource whose `responseEnd`
 *      falls before the moment `#loading-screen` gained `hidden`, taken from
 *      `PerformanceObserver` and a `MutationObserver` installed before the
 *      page's own scripts run; and
 *   2. **what the Rooms really paint with** — every `url()` in the *computed*
 *      `background-image` of every element inside `#apartment`, plus every
 *      `<img>`'s resolved `src`. Computed style is what the browser will ask
 *      the network for, whoever wrote it and wherever they wrote it: a CSS
 *      rule, an inline style, or a custom property a painter set from a
 *      `data-` attribute. A `hidden` Prop still has one, so the tableaux and
 *      the broken mug are measured without being shown.
 *
 * The verdict is set arithmetic: **(2) must be a subset of (1)**. An image a
 * Room paints with that the gate did not already finish is an image that paints
 * in after the door opens, which is the invariant broken.
 *
 * ## Why it loads every route
 *
 * A first pass ran one page and compared those two sets, and it nearly lied.
 * Over a local `vite preview` the Activity Room's fourteen stylesheet URLs came
 * back inside 250 ms — before the gate had finished its own list — so eighteen
 * of that Room's twenty-two images looked preloaded when not one of them was in
 * the gate's list at all. They had simply won a race that a cold cache or a
 * phone would lose.
 *
 * What removes the luck is loading a route the Room is **not** on. A Room that
 * is not the current one carries `hidden`, so it is `display: none`, and Chrome
 * fetches no background image for a `display: none` element — measured here, not
 * assumed: the three tableaux and the broken mug, which stay `hidden` even in
 * the open Room, never loaded at all. So on a page opened at another route, a
 * Room's artwork can only have arrived one way: something asked for it by URL,
 * behind the screen, which is the gate. Every route is therefore loaded in turn,
 * and a Room's image counts as preloaded only on the evidence of runs where that
 * Room was hidden. The run a Room is open on proves nothing about it and is not
 * counted.
 *
 * Note what is *not* here: no list of expected files, and no mention of the
 * Activity Room. Both sides are measured off the running page, so the Rooms
 * that tickets 33, 34 and 36 furnish are checked by this script the day they
 * land, with nothing added to it. `--expect <n>` is only a guard against a
 * vacuous pass — a Room that painted nothing at all trivially satisfies a
 * subset test.
 *
 * ## `--inject`, which is how the "and it is general" claim is answered
 *
 * Ticket 53 had to show that a Room furnished *later* is preloaded without
 * anybody editing `src/dom/loading.ts` again, and the honest way to show that is
 * to furnish one and look, rather than to argue from the code.
 *
 * `--inject <room>` rewrites the served `index.html` on the way past, adding one
 * Prop to that Room's stage with a `data-still` on it — nothing else, no build,
 * no TypeScript, no stylesheet rule. That is exactly the edit furnishing a Room
 * consists of. The Prop then falls into the measurement above like any other, so
 * the ordinary verdict answers the question: the file has to turn up in the
 * preload set of the runs where that Room was hidden, and the Prop has to be
 * painted with it.
 *
 * `--inject-url` defaults to a picture that ships in `dist/` and that nothing on
 * the page references — Mira's mug Beat, delivered by ticket 35 and not yet used
 * — so a pass cannot be something else's fetch mistaken for this one. If that
 * ever stops being true, point the flag at another unreferenced file.
 *
 * ## Usage
 *
 *   node scripts/verify/preload-set.mjs --launch preview --expect 28
 *   node scripts/verify/preload-set.mjs --launch preview --inject cinema
 *   node scripts/verify/preload-set.mjs --base-url http://localhost:4173 --routes games,cinema
 *
 * Run it against `preview`, not `dev`: `dist/` is what ships, and it is the
 * only place a relative URL in the bundled stylesheet resolves the way the
 * built page resolves it.
 *
 * Exit 0 when every image every Room paints with was loaded behind the screen,
 * 1 when one was not, 2 on a usage error, 3 with no Playwright on the host.
 */

import process from 'node:process';

import { loadPlaywright, startServer } from './room-shots.mjs';

const HOW_TO =
  'usage: node scripts/verify/preload-set.mjs (--launch <name> | --base-url <url>) [--routes a,b,c] [--expect N] [--inject <room>] [--inject-url <url>] [--settle MS] [--port N]';

/** The four Rooms, which are also the four routes. A Room id is its route's path word. */
const ROUTES = ['entryway', 'games', 'cinema', 'activities'];

/**
 * The picture `--inject` furnishes a Room with.
 *
 * Mira's mug Beat: delivered into `public/assets/activity-room/` by ticket 35,
 * so it is really in `dist/`, and referenced by nothing on the page, so its
 * appearance in a preload set can only be the injected Prop's doing.
 */
const INJECT_URL = 'assets/activity-room/mira-mug-beat.png';

function fail(message) {
  console.error(`preload-set: ${message}`);
  console.error(HOW_TO);
  process.exit(2);
}

function parseArguments(argv) {
  const options = { launch: null, baseUrl: null, routes: ROUTES, expect: 1, settleMs: 1500, port: null, inject: null, injectUrl: INJECT_URL };
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
    else if (flag === '--routes' || flag === '--route') options.routes = value().split(',').map(route => route.trim()).filter(Boolean);
    else if (flag === '--expect') options.expect = Number(value());
    else if (flag === '--settle') options.settleMs = Number(value());
    else if (flag === '--port') options.port = Number(value());
    else if (flag === '--inject') options.inject = value();
    else if (flag === '--inject-url') options.injectUrl = value();
    else if (flag === '--help' || flag === '-h') { console.log(HOW_TO); process.exit(0); }
    else fail(`unknown argument ${flag}`);
  }
  if (!options.launch && !options.baseUrl) fail('one of --launch or --base-url is required');
  if (options.routes.length === 0) fail('--routes listed nothing');
  if (options.inject && !ROUTES.includes(options.inject)) fail(`--inject wants one of ${ROUTES.join(', ')}`);
  // The injected Prop is only evidence from a run where its Room is hidden, so
  // there has to be at least one route that is not it.
  if (options.inject && !options.routes.some(route => route !== options.inject)) {
    fail(`--inject ${options.inject} needs a route other than ${options.inject} in --routes to be witnessed from`);
  }
  return options;
}

/**
 * Watch the gate from before the page's own scripts run.
 *
 * Both halves have to be in place before `src/main.ts` mounts anything: the
 * loading painter declares and warms its whole list inside `mountLoading`, and
 * on a warm HTTP cache the screen can lift within a frame of that. A
 * `page.evaluate` after `page.goto` would arrive to find the door already open
 * and no way left to ask when it opened.
 */
const PROBE = () => {
  const probe = { liftedAt: null, resources: [] };
  window.__preloadProbe = probe;

  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      probe.resources.push({ name: entry.name, responseEnd: entry.responseEnd, initiatorType: entry.initiatorType });
    }
  }).observe({ type: 'resource', buffered: true });

  // `#loading-screen` is in the first-paint markup, so its `hidden` attribute is
  // the honest moment the apartment became reachable — the same attribute
  // `src/dom/loading.ts` writes and `room-shots.mjs` waits on. The observer's
  // target is `document` rather than `document.documentElement`, because at the
  // time an init script runs there is no document element yet to observe.
  const watch = new MutationObserver(() => {
    const screen = document.getElementById('loading-screen');
    if (probe.liftedAt === null && screen && screen.hidden) probe.liftedAt = performance.now();
  });
  watch.observe(document, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
};

/**
 * Every image URL the page will really ask for, per Room, read off computed style.
 *
 * `getComputedStyle` resolves a `url()` against the document, so these come back
 * absolute and compare directly with a resource entry's `name`. It also resolves
 * through `var()` and through a `display: none` ancestor, which is the whole
 * point: a Prop that is `hidden` until a cat knocks it over is measured now
 * rather than the first time somebody sees it.
 */
const IMAGES_BY_ROOM = () => {
  const apartment = document.getElementById('apartment');
  const byRoom = {};
  const add = (room, url) => {
    (byRoom[room] ??= []).includes(url) || byRoom[room].push(url);
  };
  for (const element of apartment.querySelectorAll('*')) {
    const section = element.closest('[data-room]');
    const room = section ? section.getAttribute('data-room') : 'shell';
    const background = getComputedStyle(element).backgroundImage;
    if (background && background !== 'none') {
      for (const match of background.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
        if (!match[2].startsWith('data:')) add(room, new URL(match[2], location.href).href);
      }
    }
    if (element instanceof HTMLImageElement && element.getAttribute('src')) {
      add(room, new URL(element.getAttribute('src'), location.href).href);
    }
  }
  return byRoom;
};

/** Everything a Prop declares a still for, and whether anything painted it. */
const DECLARED_STILLS = () => {
  const apartment = document.getElementById('apartment');
  const unpainted = [];
  let declared = 0;
  for (const element of apartment.querySelectorAll('[data-still]:not(img)')) {
    declared += 1;
    if (getComputedStyle(element).backgroundImage === 'none') unpainted.push(element.getAttribute('data-still'));
  }
  return { declared, unpainted };
};

/**
 * Furnish a Room on the way past: one Prop, one `data-still`, nothing else.
 *
 * The Prop is dropped in immediately after the Room's stage opens, which is
 * where a furnishing ticket would put it, and it is given a box in stage units
 * because that is what a Prop is. It carries no class, so no rule in
 * `styles.css` knows anything about it — whatever paints it is the general
 * mechanism and not a Room's own arrangement.
 */
function furnish(html, room, url) {
  const stage = new RegExp(`(data-stage="${room}"[^>]*>)`);
  if (!stage.test(html)) throw new Error(`no stage for ${room} in the served page`);
  const prop = `<div data-still="${url}" style="--x:40;--y:40;--w:120;--h:120;--z:900" aria-hidden="true"></div>`;
  return html.replace(stage, `$1${prop}`);
}

async function measure(browser, { baseUrl, route, settleMs, inject, injectUrl }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(String(error)));

  if (inject) {
    await page.route(
      requested => requested.pathname === '/' || requested.pathname.endsWith('.html'),
      async apiRoute => {
        const response = await apiRoute.fetch();
        apiRoute.fulfill({ response, body: furnish(await response.text(), inject, injectUrl) });
      },
    );
  }

  await page.addInitScript(PROBE);
  const url = new URL(`#/${route}`, baseUrl).href;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__preloadProbe?.liftedAt !== null, null, { timeout: 60_000 });
  // Long enough for anything the Rooms fetch *after* the door opens to appear in
  // the timeline, so the report can say when it arrived rather than only that it
  // was late.
  await page.waitForTimeout(settleMs);

  const probe = await page.evaluate(() => window.__preloadProbe);
  const imagesByRoom = await page.evaluate(IMAGES_BY_ROOM);
  const stills = await page.evaluate(DECLARED_STILLS);
  await context.close();
  return { probe, imagesByRoom, stills, consoleErrors };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repoRoot = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const server = options.baseUrl
    ? { baseUrl: options.baseUrl, stop: async () => {} }
    : await startServer(repoRoot, options.launch, options.port);

  const { chromium } = await loadPlaywright();
  const runs = [];
  let browser = null;
  try {
    browser = await chromium.launch();
    for (const route of options.routes) {
      const measured = await measure(browser, {
        baseUrl: server.baseUrl,
        route,
        settleMs: options.settleMs,
        inject: options.inject,
        injectUrl: options.injectUrl,
      });
      runs.push({ route, ...measured });
    }
  } finally {
    if (browser) await browser.close();
    await server.stop();
  }

  const origin = server.baseUrl.replace(/\/$/, '');
  const short = url => url.replace(origin, '');

  // Per run: what the gate finished before the door opened, and how long it held.
  const evidence = new Map(); // route → Set of URLs completed behind that run's screen
  for (const run of runs) {
    evidence.set(
      run.route,
      new Set(run.probe.resources.filter(entry => entry.responseEnd > 0 && entry.responseEnd <= run.probe.liftedAt).map(entry => entry.name)),
    );
  }

  // The images each Room paints with are the same on every run; take the first.
  const imagesByRoom = runs[0].imagesByRoom;
  const rooms = {};
  const late = [];
  const unwitnessed = [];
  let total = 0;
  for (const [room, images] of Object.entries(imagesByRoom)) {
    total += images.length;
    // Only runs where this Room was hidden are evidence: on its own route its
    // stylesheet asks for the same files, and an image that merely won that race
    // is not an image the gate waited for.
    const witnesses = options.routes.filter(route => route !== room);
    // With `--routes` narrowed to this Room alone there is no such run, and the
    // honest answer is "not measured" rather than a pass or a fail: saying late
    // would condemn a Room nobody looked away from, and saying preloaded would
    // let the race back in.
    const missing = witnesses.length === 0 ? [] : images.filter(image => !witnesses.some(route => evidence.get(route).has(image)));
    rooms[room] = {
      paintsWith: images.length,
      preloadedWhileHidden: witnesses.length === 0 ? null : images.length - missing.length,
      witnessedFrom: witnesses,
      late: missing.map(short),
    };
    if (witnesses.length === 0) unwitnessed.push(room);
    late.push(...missing.map(short));
  }

  // The injected Prop, called out of the Room totals it is already counted in,
  // because it is the whole answer to "and the next Room gets this for free".
  const injectedUrl = options.inject ? new URL(options.injectUrl, server.baseUrl).href : null;
  const injected = options.inject
    ? {
        room: options.inject,
        url: short(injectedUrl),
        preloadedWhileHidden: options.routes
          .filter(route => route !== options.inject)
          .filter(route => evidence.get(route).has(injectedUrl)),
        painted: (imagesByRoom[options.inject] ?? []).includes(injectedUrl),
      }
    : null;

  const report = {
    injected,
    routesLoaded: runs.map(run => ({
      route: run.route,
      liftedAtMs: Math.round(run.probe.liftedAt),
      loadedBehindTheScreen: evidence.get(run.route).size,
    })),
    imagesTheRoomsPaintWith: total,
    rooms,
    declaredStills: runs[0].stills,
    consoleErrors: [...new Set(runs.flatMap(run => run.consoleErrors))],
    verdict: {
      // The invariant itself: nothing a Room paints with arrives after the door.
      everyImagePreloaded: late.length === 0,
      // And every Room was looked away from at least once, so the line above
      // was answered for all of them rather than skipped for some.
      everyRoomWitnessed: unwitnessed.length === 0,
      // A Room that paints with nothing would pass the line above for free.
      sawEnoughArtwork: total >= options.expect,
      // Every `data-still` on a Prop reached a surface. Zero declared is fine —
      // a Room can be furnished entirely with `<img>` — but a declared one that
      // painted nothing means the URL moved and the surface did not follow.
      everyStillPainted: runs[0].stills.unpainted.length === 0,
      noConsoleErrors: runs.every(run => run.consoleErrors.length === 0),
      // Only asked when a Room was furnished on the way past.
      ...(injected ? { injectedPropPreloaded: injected.preloadedWhileHidden.length > 0 && injected.painted } : {}),
    },
  };
  report.ok = Object.values(report.verdict).every(answer => answer === true);

  console.log(JSON.stringify(report, null, 2));
  console.error(
    `preload-set: ${total} images across the Rooms, ${total - late.length} loaded behind the screen while their Room was hidden` +
      (late.length ? `, ${late.length} LATE: ${late.join(', ')}` : '') +
      `; ${runs.map(run => `${run.route} lifted at ${Math.round(run.probe.liftedAt)}ms`).join(', ')}`,
  );
  process.exit(report.ok ? 0 : 1);
}

main().catch(error => {
  console.error(`preload-set: ${error.stack ?? error.message}`);
  process.exit(1);
});
