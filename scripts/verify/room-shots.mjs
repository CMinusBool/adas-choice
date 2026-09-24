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
 * - waits, before any screenshot, for the Room to be at rest — the whole Cast on its
 *   stage and none of it drawn by an arrival Beat — and reports that Cast as `atRest`,
 *   so the Entryway is pictured after its 11.9 s arrival rather than 2 s into it;
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

/** How long the rAF check watches an Actor for, at minimum. Two seconds is a patrol leg's worth. */
const MOTION_WINDOW_MS = 2000;

/**
 * How long the full-motion pass keeps polling before giving up on ever seeing movement.
 *
 * Diagnosed on ticket 55: the Entryway's 11.9 s arrival is held still for the first ~2 s
 * after `SETTLED` — the door-opening beat — so a window that closes at 2 s samples only
 * the hold and reports "nothing moved" for a Room whose Arrival hasn't started walking
 * yet. 6 s is the figure that reproduced real movement when this was diagnosed. `WATCH`
 * polls for movement rather than sleeping through the whole span and stops the moment it
 * sees any, so this ceiling is paid only by a Room that never moves at all — every other
 * Room exits on its first or second poll, at close to `MOTION_WINDOW_MS` cost as before.
 * The reduced-motion pass is not given this cap: nothing is ever supposed to move there,
 * so there is nothing to wait longer for, and it keeps `MOTION_WINDOW_MS`'s cost exactly
 * as it was.
 */
const MOTION_CAP_MS = 6000;

/**
 * How long a pass waits for the Room to be at rest before its screenshots (ticket 58).
 *
 * `WATCH` stops at the first movement it sees, which in the Entryway is the Girl
 * stepping off the threshold about 1.4 s into an 11.9 s arrival: the Boy is not
 * through the door until 2.2 s and the cats are not out of the backpack until 9.35 s
 * to 11.85 s, the coats go up at 6.9 s and 8.05 s, the backpack lands at 4.65 s. So
 * the `actors` that `WATCH` reports is who had come in by the moment motion was
 * proved, and a screenshot taken straight after it is a frame from early in the
 * arrival. Ticket 33's verifier read that as "1 Actor, no coats, no backpack". The
 * doorstep (0.6 s) plus the arrival plus slack is under 15 s; every other Room is at
 * rest at once, because its whole Cast is on the stage from its first frame.
 */
const AT_REST_CAP_MS = 15000;

/** How often the full-motion pass re-checks for movement while it waits. */
const MOTION_POLL_MS = 100;

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
 *
 * `read()` re-queries `.actor` on the stage every time it is called rather than closing
 * over one snapshot taken before the window opens. `SETTLED` only means the loading
 * screen is gone; with full motion `attach()` in `src/dom/actors.ts` has not necessarily
 * reparented the Cast onto the stage yet, so a snapshot taken too early carries an empty
 * NodeList through the whole window and the check reports nobody there and nothing
 * moving. Before opening the window, this also gives the Cast up to `attachTimeoutMs` to
 * attach — capped well under `windowMs` so a Room that genuinely has no Actors on its
 * stage does not hang, it just samples an empty stage as it always could.
 *
 * Sampling itself (ticket 55) polls for movement rather than sleeping for one fixed
 * span: it re-reads every `pollMs` and stops as soon as any Actor has moved more than
 * `movedPx`, up to `capMs`. A Room whose Arrival is already walking when the window
 * opens — every Room but the Entryway — exits on an early poll at close to the old
 * fixed-window cost; a Room held still for a beat before it starts (the Entryway's
 * door-opening hold) gets the rest of `capMs` to prove it eventually moves. A Room that
 * never moves, playing or reduced, pays the full `capMs` exactly as it paid the full
 * `windowMs` before — the poll changes when a positive answer arrives, not the cost of
 * a negative one.
 */
const WATCH = async ({ room, windowMs, capMs, pollMs, movedPx }) => {
  const stage = document.querySelector(`[data-stage="${room}"]`);
  const query = () => (stage ? [...stage.querySelectorAll('.actor')] : []);
  const read = () =>
    query().map(actor => {
      const box = actor.getBoundingClientRect();
      return { actor: actor.dataset.actor ?? '?', x: box.left, y: box.top };
    });
  const attachTimeoutMs = Math.min(windowMs, 1000);
  const attachDeadline = Date.now() + attachTimeoutMs;
  while (query().length === 0 && Date.now() < attachDeadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  let frames = 0;
  let watching = true;
  const count = () => {
    if (!watching) return;
    frames += 1;
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
  const before = read();
  const distance = current =>
    before.length === 0
      ? 0
      : Math.max(...before.map((start, index) => {
          const end = current[index] ?? start;
          return Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
        }));
  const cap = Math.max(capMs ?? windowMs, windowMs, pollMs);
  const deadline = Date.now() + cap;
  let after = before;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, pollMs));
    after = read();
    if (distance(after) > movedPx) break;
  }
  watching = false;
  const moved = before.map((start, index) => {
    const end = after[index] ?? start;
    return {
      actor: start.actor,
      dx: Number((end.x - start.x).toFixed(2)),
      dy: Number((end.y - start.y).toFixed(2)),
    };
  });
  return {
    actors: after.length,
    frames,
    moved,
    maxPx: moved.length === 0 ? 0 : Math.max(...moved.map(entry => Math.abs(entry.dx) + Math.abs(entry.dy))),
    motionOff: document.documentElement.classList.contains('motion-off'),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    lang: document.documentElement.lang,
  };
};

/**
 * Wait until the whole Cast is standing on this Room's stage, and say how many that was.
 *
 * "At rest" is read off the page rather than off a clock or a route name: every Actor
 * the document has (`.actor`, on a stage or parked in `#cast`) is on this Room's stage,
 * and none is `is-acted` — hidden while an arrival Beat draws them. That is true from
 * the first frame in a Room whose Cast walks in together, and true in the Entryway only
 * once the last cat is out of the backpack. `atRest: false` after `capMs` is a Room
 * whose Cast never all arrived, which is the thing worth reporting.
 */
const AT_REST = async ({ room, capMs, pollMs }) => {
  const stage = document.querySelector(`[data-stage="${room}"]`);
  const cast = () => document.querySelectorAll('.actor').length;
  const standing = () =>
    stage ? [...stage.querySelectorAll('.actor')].filter(actor => !actor.classList.contains('is-acted')) : [];
  const started = Date.now();
  let atRest = false;
  while (true) {
    atRest = cast() > 0 && standing().length === cast();
    if (atRest || Date.now() - started >= capMs) break;
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  return {
    atRest,
    waitedMs: Date.now() - started,
    actors: standing().length,
    cast: cast(),
    who: standing().map(actor => actor.dataset.actor ?? '?'),
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

      result.watch = await page.evaluate(WATCH, {
        room: route,
        windowMs: MOTION_WINDOW_MS,
        // Only the full-motion pass gets the longer ceiling: reduced motion is never
        // supposed to move, so there is nothing worth waiting longer to see.
        capMs: reduced ? MOTION_WINDOW_MS : MOTION_CAP_MS,
        pollMs: MOTION_POLL_MS,
        movedPx: MOVED_PX,
      });
      result.lang = result.watch.lang;
      result.moving = result.watch.maxPx > MOVED_PX;

      // Ticket 58: the pictures are of the Room at rest, not of whichever frame of
      // an arrival the motion check happened to stop on.
      result.rest = await page.evaluate(AT_REST, { room: route, capMs: AT_REST_CAP_MS, pollMs: MOTION_POLL_MS });

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
    // Who was on the stage when motion was first proved. In the Entryway that is an
    // early frame of the arrival; `atRest` below is the Cast the Room ends up with.
    actors: result.watch.actors,
    atRest: result.rest ?? null,
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
