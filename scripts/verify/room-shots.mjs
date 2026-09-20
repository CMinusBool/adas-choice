#!/usr/bin/env node
/**
 * Open each Room in a real browser, look at it, and leave the pictures behind.
 *
 * The health commands cannot tell a Room is wrong, and the desktop app's embedded
 * browser pane cannot either: it reports `visibilityState: hidden` most of the time,
 * so `requestAnimationFrame` never fires there and an Actor never moves, and it can
 * emulate a colour scheme but not `prefers-reduced-motion`. This script is the other
 * half — a headless Chromium that is really visible, really ticking, and really able
 * to say it prefers reduced motion.
 *
 * ## Where Playwright comes from
 *
 * Nothing is added to `package.json`, on purpose (decided 2026-09-12): `npm ci` gains
 * no step and the Windows EPERM surface does not grow. Playwright 1.62.0 is already in
 * this machine's npx cache with a matching Chromium, and this script imports it by
 * `file:///` URL:
 *
 * - package: `%LOCALAPPDATA%/npm-cache/_npx/81bbc6515d992ace/node_modules/playwright/index.mjs`
 * - browsers: `%LOCALAPPDATA%/ms-playwright/chromium-1234`
 *   (the default `PLAYWRIGHT_BROWSERS_PATH` on Windows, so it is found without help)
 *
 * Override either with `PLAYWRIGHT_PACKAGE` / `PLAYWRIGHT_BROWSERS_PATH`. A host with
 * no Playwright exits 3 and says so, which is the signal to fall back to the pane.
 *
 * The facts that make the reduced-motion half work, measured on 2026-09-11 and kept in
 * the project memory note `reduced-motion-browser-verification.md`:
 *
 * - `browser.newContext({ reducedMotion: 'reduce' | 'no-preference' })` and
 *   `page.emulateMedia({ reducedMotion })` mid-page both fire the page's `matchMedia`
 *   change listener. The context form is used here so the preference is in place before
 *   the first paint, which is when `src/dom/motion.ts` reads it.
 * - Chrome reports a computed `transition-duration` set by one `!important` value as a
 *   single `1e-05s`, not a per-property list.
 *
 * ## What it does per route
 *
 * Loads `<base>/#/<route>`, waits for the door to open (`#loading-screen` hidden and no
 * `inert` left on the shell), then:
 *
 * - screenshots at a desktop and a narrow width, and again at the desktop width in a
 *   reduced-motion context: `<NN>-<route>-{desktop,narrow,desktop-reduced}.png`;
 * - counts `requestAnimationFrame` callbacks and measures whether an Actor's position
 *   advanced over two seconds — the check the pane could not do — with motion on and
 *   again with reduced motion emulated;
 * - measures whether the Room **fits** each of `--fit-at`'s viewports without the page
 *   scrolling, reporting the document's scroll height and the Room's own bottom edge
 *   side by side so the two can never be confused for each other again;
 * - records the document's `lang` attribute and every console error and page error.
 *
 * Screenshots land under `<effort>/notes/screens/`, which is gitignored scratch and is
 * never committed. The names carry the ticket number and the variant so a later ticket
 * can pixel-diff one run against the last approved one; this script does no diffing.
 *
 * Output: a JSON summary on stdout and at `<effort>/notes/screens/<NN>-summary.json`.
 * Exit 0 all clear, 1 when a route failed to load or a console error was seen, 2 on a
 * usage error, 3 when Playwright is not on this host.
 *
 * ## Usage
 *
 *   node scripts/verify/room-shots.mjs --launch preview --routes entryway,games,cinema,activities
 *   node scripts/verify/room-shots.mjs --base-url http://localhost:5173 --ticket 14
 *
 * `--launch <name>` starts the named server from `.claude/launch.json` itself and stops
 * it again at the end; a server already answering on that port is reused and left alone.
 * A running `vite preview` makes a later `npm ci` fail with EPERM on Windows, so the
 * stop matters.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Where the npx cache put Playwright on this machine. */
const PLAYWRIGHT_PACKAGE =
  process.env.PLAYWRIGHT_PACKAGE ??
  '%LOCALAPPDATA%/npm-cache/_npx/81bbc6515d992ace/node_modules/playwright/index.mjs';

/** The two widths every Room is looked at in. */
const WIDTHS = {
  desktop: { width: 1280, height: 800 },
  narrow: { width: 390, height: 844 },
};

/**
 * The viewports the fit check measures a Room against.
 *
 * Separate from `WIDTHS`, which is about screenshots. These are about one
 * question ADR 0004 turns on — *does the Room fit without scrolling?* — so they
 * are all 900 tall but the phone, which never had a 900 px screen to fit.
 * Override with `--fit-at 1440x900,390x844`.
 */
const FIT_VIEWPORTS = [
  { width: 1600, height: 900 },
  { width: 1440, height: 900 },
  { width: 1100, height: 900 },
  { width: 390, height: 844 },
];

/** How long the rAF check watches an Actor for. Two seconds is a patrol leg's worth. */
const MOTION_WINDOW_MS = 2000;

/** Movement under this many CSS pixels over the window is noise, not a walk. */
const MOVED_PX = 1;

const HOW_TO = 'usage: node scripts/verify/room-shots.mjs (--launch <name> | --base-url <url>) [--routes a,b,c] [--ticket NN] [--effort <dir>] [--out <dir>] [--port N] [--keep-server] [--fit-at 1440x900,390x844] [--no-fit]';

// ---------------------------------------------------------------- arguments

function parseArguments(argv) {
  const options = {
    launch: null,
    baseUrl: null,
    routes: ['entryway', 'games', 'cinema', 'activities'],
    ticket: '00',
    effort: null,
    out: null,
    port: null,
    keepServer: false,
    fitAt: FIT_VIEWPORTS,
  };
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
    else if (flag === '--routes') options.routes = value().split(',').map(route => route.trim()).filter(Boolean);
    else if (flag === '--ticket') options.ticket = value();
    else if (flag === '--effort') options.effort = value();
    else if (flag === '--out') options.out = value();
    else if (flag === '--port') options.port = Number(value());
    else if (flag === '--keep-server') options.keepServer = true;
    else if (flag === '--fit-at') options.fitAt = parseViewports(value());
    else if (flag === '--no-fit') options.fitAt = [];
    else if (flag === '--help' || flag === '-h') { console.log(HOW_TO); process.exit(0); }
    else fail(`unknown argument ${flag}`);
  }
  if (!options.launch && !options.baseUrl) fail('one of --launch or --base-url is required');
  if (options.routes.length === 0) fail('--routes listed nothing');
  options.ticket = /^\d+$/.test(options.ticket) ? String(options.ticket).padStart(2, '0') : options.ticket;
  return options;
}

/** `1440x900,390x844` → the viewports the fit check measures against. */
function parseViewports(text) {
  const sizes = text.split(',').map(entry => entry.trim()).filter(Boolean).map(entry => {
    const match = /^(\d+)x(\d+)$/.exec(entry);
    if (!match) fail(`--fit-at wants WIDTHxHEIGHT, not ${entry}`);
    return { width: Number(match[1]), height: Number(match[2]) };
  });
  if (sizes.length === 0) fail('--fit-at listed no viewport');
  return sizes;
}

function fail(message) {
  console.error(`room-shots: ${message}`);
  console.error(HOW_TO);
  process.exit(2);
}

// ------------------------------------------------------------------ effort

/**
 * The effort directory the screenshots belong to.
 *
 * The integration branch carries the effort key (`COOP-001-apartment` → `COOP-001`), and
 * the effort is `.scratch/<KEY>-<slug>/`, exactly as `/implement-parallel` resolves it.
 */
function resolveEffort(repoRoot, given) {
  if (given) return path.resolve(repoRoot, given);
  const scratch = path.join(repoRoot, '.scratch');
  if (!existsSync(scratch)) return null;
  const branch = currentBranch(repoRoot);
  const key = branch ? branch.split('-').slice(0, 2).join('-') : null;
  const candidates = readdirSync(scratch, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && (!key || entry.name.startsWith(`${key}-`)))
    .map(entry => path.join(scratch, entry.name));
  return candidates[0] ?? null;
}

function currentBranch(repoRoot) {
  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

// ------------------------------------------------------------------ server

/**
 * Start the server a launch configuration names, or reuse one already answering.
 *
 * Node has refused to spawn a `.cmd` shim since the CVE-2024-27980 mitigation, and `npm`
 * on Windows is one, so where the configuration is `npm run <script>` over a local bin
 * (`vite preview`) this walks it back to that bin's own JS and spawns it with this Node.
 * One process, killable without `taskkill`. Anything else falls back to a shell spawn.
 */
export async function startServer(repoRoot, name, wanted) {
  const configPath = path.join(repoRoot, '.claude', 'launch.json');
  if (!existsSync(configPath)) fail(`no ${configPath} to read --launch ${name} from`);
  const configurations = JSON.parse(readFileSync(configPath, 'utf8')).configurations ?? [];
  const configuration = configurations.find(entry => entry.name === name);
  if (!configuration) fail(`--launch ${name} is not in .claude/launch.json (have: ${configurations.map(c => c.name).join(', ')})`);

  const declared = configuration.port;
  const declaredUrl = configuration.url ?? `http://localhost:${declared}/`;
  // Reuse only when the caller did not name a port. A server already answering
  // on the declared one belongs to whoever started it, and on this machine that
  // is routinely a `vite preview` left running in a *different* worktree — so
  // reusing it silently measures somebody else's `dist/` and reports the number
  // as if it came from yours. `--port` is how a caller says "my build, my
  // server, measured here"; it has to win over the convenience.
  if (wanted === null || wanted === undefined) {
    if (await answers(declaredUrl)) {
      console.error(`room-shots: ${declaredUrl} already answers; reusing it and leaving it running`);
      console.error('room-shots: that server is serving whatever checkout started it — pass --port to be sure of yours');
      return { baseUrl: declaredUrl, stop: async () => {} };
    }
  }

  // Windows reserves whole hundred-port ranges for Hyper-V and WinNAT, and a reserved
  // port answers `listen` with EACCES rather than EADDRINUSE — `.claude/launch.json`'s
  // 4173 sits inside one on this machine. Probe upward for a port that really binds
  // rather than failing on a configuration file that is fine everywhere else.
  const port = wanted ?? (await usablePort(declared));
  if (port !== declared) {
    console.error(`room-shots: port ${declared} will not bind here; using ${port} instead`);
  }
  const baseUrl = configuration.url ? configuration.url.replace(`:${declared}`, `:${port}`) : `http://localhost:${port}/`;
  const runtimeArgs = withPort(configuration.runtimeArgs ?? [], port);

  const direct = localBin(repoRoot, configuration, runtimeArgs);
  const command = direct ? process.execPath : configuration.runtimeExecutable;
  const args = direct ?? runtimeArgs;
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: 'ignore',
    shell: !direct && process.platform === 'win32',
  });
  child.on('error', error => {
    console.error(`room-shots: could not start --launch ${name}: ${error.message}`);
  });

  const stop = async () => {
    if (child.exitCode !== null || child.killed) return;
    if (!direct && process.platform === 'win32') {
      // A shell spawn leaves npm and vite under a cmd.exe we did not get the pid of.
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill();
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  };

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await answers(baseUrl)) return { baseUrl, stop };
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  await stop();
  fail(`--launch ${name} never answered on ${baseUrl}`);
}

/** The launch arguments with `--port` pointed at the port that actually binds. */
function withPort(runtimeArgs, port) {
  const args = [...runtimeArgs];
  const at = args.indexOf('--port');
  if (at >= 0 && at + 1 < args.length) args[at + 1] = String(port);
  else args.push('--port', String(port));
  return args;
}

/** The first port from `start` upward that this host will really let us listen on. */
async function usablePort(start) {
  for (let port = start; port < start + 1000; port += 1) {
    if (await canBind(port)) return port;
  }
  return start;
}

function canBind(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, 'localhost', () => server.close(() => resolve(true)));
  });
}

/** `npm run <script>` over a bin this repo has installed, as arguments for our own Node. */
function localBin(repoRoot, configuration, runtimeArgs) {
  const args = runtimeArgs ?? configuration.runtimeArgs ?? [];
  if (configuration.runtimeExecutable !== 'npm' || args[0] !== 'run' || !args[1]) return null;
  const packageJson = path.join(repoRoot, 'package.json');
  if (!existsSync(packageJson)) return null;
  const script = (JSON.parse(readFileSync(packageJson, 'utf8')).scripts ?? {})[args[1]];
  if (!script) return null;
  const words = script.split(/\s+/).filter(Boolean);
  const bin = path.join(repoRoot, 'node_modules', words[0], 'bin', `${words[0]}.js`);
  if (!existsSync(bin)) return null;
  const passthrough = args.slice(2).filter(argument => argument !== '--');
  return [bin, ...words.slice(1), ...passthrough];
}

async function answers(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.status < 500;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ browser

export async function loadPlaywright() {
  try {
    return await import(pathToFileURL(PLAYWRIGHT_PACKAGE).href);
  } catch (error) {
    console.error(`room-shots: no Playwright on this host (${PLAYWRIGHT_PACKAGE}): ${error.message}`);
    console.error('room-shots: fall back to the browser pane, or set PLAYWRIGHT_PACKAGE.');
    process.exit(3);
  }
}

function playwrightVersion() {
  try {
    const manifest = path.join(path.dirname(PLAYWRIGHT_PACKAGE), 'package.json');
    return JSON.parse(readFileSync(manifest, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

/** Wait for the apartment to open the door: the loading screen gone and nothing inert. */
const SETTLED = () => {
  const screen = document.getElementById('loading-screen');
  return Boolean(screen) && screen.hidden && document.querySelectorAll('[inert]').length === 0;
};

/**
 * Does anything actually move?
 *
 * Counts `requestAnimationFrame` callbacks and reads each Actor's box before and after,
 * which is the one check the embedded pane could never make: there `visibilityState` is
 * `hidden`, rAF never fires, and every Actor sits exactly where the model first put it.
 */
const WATCH = async ({ room, windowMs }) => {
  const stage = document.querySelector(`[data-stage="${room}"]`);
  const actors = stage ? [...stage.querySelectorAll('.actor')] : [];
  const read = () =>
    actors.map(actor => {
      const box = actor.getBoundingClientRect();
      return { actor: actor.dataset.actor ?? '?', x: box.left, y: box.top };
    });
  let frames = 0;
  let watching = true;
  const count = () => {
    if (!watching) return;
    frames += 1;
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
  const before = read();
  await new Promise(resolve => setTimeout(resolve, windowMs));
  watching = false;
  const after = read();
  const moved = before.map((start, index) => ({
    actor: start.actor,
    dx: Number((after[index].x - start.x).toFixed(2)),
    dy: Number((after[index].y - start.y).toFixed(2)),
  }));
  return {
    actors: actors.length,
    frames,
    moved,
    maxPx: moved.length === 0 ? 0 : Math.max(...moved.map(entry => Math.abs(entry.dx) + Math.abs(entry.dy))),
    motionOff: document.documentElement.classList.contains('motion-off'),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    lang: document.documentElement.lang,
  };
};

/**
 * Does the Room fit the viewport, or does the visitor have to scroll?
 *
 * ADR 0004 turns on this one number and nobody had measured it: ticket 45's
 * implementer reported the Game Room "ending at 863-885 px" and ticket 44's
 * verifier reported `scrollHeight` 1001 px against `innerHeight` 900, from two
 * different harnesses. Those are **different quantities** — a Room's bottom
 * edge is not the document's scroll height, and everything below the Room
 * (the page's own footer and padding) sits between them — so neither refuted
 * the other and the question stayed open through the whole run.
 *
 * So both are taken here, at once, side by side, and the derived answer is
 * `scrolls`: the document's scroll height against the viewport, which is the
 * only one of them the visitor can feel. `roomBottom` is kept beside it to say
 * *why* a page scrolls when it does — a Room taller than the viewport and a
 * short Room under a tall page are different problems with different fixes.
 *
 * `scrollsSideways` is here because `#games-scene` is deliberately a horizontal
 * scroller below 1080 px of rendered width (ticket 47): that is the Room's own
 * pan and is expected, but the *document* scrolling sideways never is.
 */
const FIT = ({ room }) => {
  const doc = document.documentElement;
  const roomElement = document.querySelector(`[data-room="${room}"]`);
  const stage = document.querySelector(`[data-stage="${room}"]`);
  const bottomOf = element => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return Number((box.bottom + window.scrollY).toFixed(1));
  };
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scrollHeight: doc.scrollHeight,
    bodyScrollHeight: document.body.scrollHeight,
    clientHeight: doc.clientHeight,
    roomBottom: bottomOf(roomElement),
    stageBottom: bottomOf(stage),
    // One pixel of slack: a fractional layout height rounds up into an integer
    // `scrollHeight` and that is not a scrollbar anybody sees.
    scrolls: doc.scrollHeight > window.innerHeight + 1,
    scrollsSideways: doc.scrollWidth > doc.clientWidth + 1,
  };
};

/**
 * One pass over every route in one motion condition.
 *
 * `about:blank` between routes forces a real load rather than a hash change, so every
 * route is measured from the same cold start the visitor gets.
 */
async function walkRoutes(context, { baseUrl, routes, outDir, ticket, reduced, widths, fitAt }) {
  const page = await context.newPage();
  const results = [];
  let bucket = null;
  page.on('console', message => {
    if (message.type() === 'error' && bucket) bucket.consoleErrors.push(message.text());
  });
  page.on('pageerror', error => {
    if (bucket) bucket.consoleErrors.push(`pageerror: ${error.message}`);
  });

  for (const route of routes) {
    const result = { route, reducedMotion: reduced, ok: true, consoleErrors: [], screenshots: [], fit: [], error: null };
    bucket = result;
    results.push(result);
    try {
      await page.setViewportSize(widths[0].size);
      await page.goto('about:blank');
      const response = await page.goto(`${baseUrl.replace(/\/$/, '')}/#/${route}`, { waitUntil: 'load', timeout: 30_000 });
      if (response && !response.ok()) throw new Error(`HTTP ${response.status()}`);
      await page.waitForFunction(SETTLED, null, { timeout: 30_000 });
      const roomShown = await page.evaluate(
        name => {
          const element = document.querySelector(`[data-room="${name}"]`);
          return Boolean(element) && !element.hidden;
        },
        route,
      );
      if (!roomShown) throw new Error(`the ${route} Room never became the standing one`);

      result.watch = await page.evaluate(WATCH, { room: route, windowMs: MOTION_WINDOW_MS });
      result.lang = result.watch.lang;
      result.moving = result.watch.maxPx > MOVED_PX;

      for (const width of widths) {
        await page.setViewportSize(width.size);
        // One frame at the new width before the shutter, so the stage has re-laid out.
        await page.waitForTimeout(200);
        const file = path.join(outDir, `${ticket}-${route}-${width.name}.png`);
        // Full page, not the viewport: the stage the Cast walks on sits below the
        // doors, so a viewport shot of the Entryway crops the Boy off at the ankles
        // and the owner cannot see the one thing they were sent the picture for.
        await page.screenshot({ path: file, fullPage: true });
        result.screenshots.push(file);
      }

      // Last, because it leaves the viewport wherever the final size put it and
      // every route re-sets it on the way in anyway.
      for (const size of fitAt ?? []) {
        await page.setViewportSize(size);
        await page.waitForTimeout(200);
        result.fit.push(await page.evaluate(FIT, { room: route }));
      }
    } catch (error) {
      result.ok = false;
      result.error = error.message;
    }
  }
  bucket = null;
  await page.close();
  return results;
}

// --------------------------------------------------------------------- main

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

  let outDir;
  if (options.out) {
    outDir = path.resolve(repoRoot, options.out);
  } else {
    const effort = resolveEffort(repoRoot, options.effort);
    if (!effort) fail('no effort directory found under .scratch/; pass --effort or --out');
    outDir = path.join(effort, 'notes', 'screens');
  }
  mkdirSync(outDir, { recursive: true });

  const playwright = await loadPlaywright();
  const server = options.launch
    ? await startServer(repoRoot, options.launch, options.port)
    : { baseUrl: options.baseUrl, stop: async () => {} };

  const summary = {
    tool: 'room-shots/1',
    ticket: options.ticket,
    at: new Date().toISOString(),
    baseUrl: server.baseUrl,
    outDir,
    playwright: { package: PLAYWRIGHT_PACKAGE, version: playwrightVersion() },
    routes: [],
  };

  let browser = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const motionContext = await browser.newContext({ reducedMotion: 'no-preference' });
    const withMotion = await walkRoutes(motionContext, {
      baseUrl: server.baseUrl,
      routes: options.routes,
      outDir,
      ticket: options.ticket,
      reduced: false,
      widths: [
        { name: 'desktop', size: WIDTHS.desktop },
        { name: 'narrow', size: WIDTHS.narrow },
      ],
      // Only this pass: reduced motion stops things moving, it does not re-lay
      // the page out, so measuring the fit twice would cost time and say the same.
      fitAt: options.fitAt,
    });
    await motionContext.close();

    const reducedContext = await browser.newContext({ reducedMotion: 'reduce' });
    const withReduced = await walkRoutes(reducedContext, {
      baseUrl: server.baseUrl,
      routes: options.routes,
      outDir,
      ticket: options.ticket,
      reduced: true,
      widths: [{ name: 'desktop-reduced', size: WIDTHS.desktop }],
    });
    await reducedContext.close();

    for (const route of options.routes) {
      const normal = withMotion.find(entry => entry.route === route);
      const reduced = withReduced.find(entry => entry.route === route);
      summary.routes.push({
        route,
        ok: normal.ok && reduced.ok,
        error: normal.error ?? reduced.error,
        lang: normal.lang ?? null,
        consoleErrors: [...normal.consoleErrors, ...reduced.consoleErrors],
        motion: {
          // The pane's blind spot: with motion on an Actor should really travel.
          withMotion: summarise(normal),
          withReducedMotion: summarise(reduced),
        },
        fit: normal.fit,
        screenshots: [...normal.screenshots, ...reduced.screenshots],
      });
    }
  } finally {
    if (browser) await browser.close();
    if (!options.keepServer) await server.stop();
  }

  const errors = summary.routes.reduce((total, route) => total + route.consoleErrors.length, 0);
  const failed = summary.routes.filter(route => !route.ok).map(route => route.route);
  summary.consoleErrorCount = errors;
  summary.failedRoutes = failed;
  summary.screenshotCount = summary.routes.reduce((total, route) => total + route.screenshots.length, 0);
  summary.ok = errors === 0 && failed.length === 0;

  const summaryPath = path.join(outDir, `${options.ticket}-summary.json`);
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  console.error(`room-shots: ${summary.screenshotCount} PNG(s) and ${summaryPath}`);
  process.exit(summary.ok ? 0 : 1);
}

function summarise(result) {
  if (!result || !result.watch) return { actors: 0, frames: 0, moving: false, maxPx: 0 };
  return {
    actors: result.watch.actors,
    frames: result.watch.frames,
    maxPx: result.watch.maxPx,
    moving: result.watch.maxPx > MOVED_PX,
    motionOff: result.watch.motionOff,
    reducedMotion: result.watch.reducedMotion,
  };
}

// Only when run as a command. `startServer` and `loadPlaywright` above are the
// two pieces of plumbing every other check in this directory would otherwise
// copy — `breakable-fall.mjs` imports them — and importing this file must not
// walk all four Rooms as a side effect of that.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`room-shots: ${error.stack ?? error.message}`);
    process.exit(1);
  });
}
