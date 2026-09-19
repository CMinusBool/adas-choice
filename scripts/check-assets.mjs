// Mechanical acceptance for Cycle sheets.
//
// A generator cannot be trusted to hit the Cycle contract, and a human looking
// at a strip cannot see that a figure is three pixels off the floor. So "done"
// for an Actor asset is this script passing, plus the owner's taste gate on how
// it looks — neither alone. The contract itself is in CLAUDE.md under
// "Cycle assets travel as a set too"; every rule below is one sentence of it.
//
//   node scripts/check-assets.mjs                     # every sheet index.html declares
//   node scripts/check-assets.mjs <path> ...          # named sheets
//   node scripts/check-assets.mjs --json              # machine-readable, for the orchestrator
//   node scripts/check-assets.mjs --palette art/characters/v2/palette.json
//
// A path that `index.html` declares inherits that layer's `data-frames` and
// `data-columns`; any other path needs `--frames N --columns N` and either
// `--actor <boy|girl|mica|mira|luna>` or `--frame <W>x<H>`.
//
// `--non-fatal` reports and exits 0. `npm run build` runs it that way for now,
// because every sheet in the repository today is a placeholder; it becomes fatal
// when the first real Cycle lands (ticket 30).
//
// THRESHOLDS, measured 2026-09-12 on the only real generations that exist —
// `art/cycles/experiments/boy-walk-01/candidate-sheet.png` and its `v2/`, both
// 768x640 eight-frame Boy walks — and on the six shipped placeholders:
//
//   intermediate alpha   measured 0.81–2.66% of the sheet   ->  fails above 5%
//   height variance      measured 2.04% and 3.85% (max/min) ->  fails above 4.5%
//   feet off the bottom  measured 0 px everywhere           ->  fails above 1 px
//   centre offset        measured 0 or 0.5 px               ->  fails above 10% of the frame width
//   drift across frames  measured 0.5 px, not monotonic     ->  fails when monotonic and above 2% of the frame width
//   colour residue       measured 0 pixels everywhere       ->  fails above 0
//
// The height number is the one to know: the ticket that asked for this expected
// the runs to hold about 1%, because `metrics.json` measured the *raw* strip.
// Measured on the delivered sheets the worse run spreads 3.85%, so the tolerance
// is 4.5% — it still fails a 5% pop, but the headroom is 0.65 points and a
// third real Cycle should be measured before anyone loosens it.
import { readFileSync } from 'node:fs';
import { argv, exit, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

import { decodePng } from './png.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

/** A pixel is the drawing, rather than its soft rim, at or above this alpha. */
export const OPAQUE = 128;

/** See the header block; every number here was measured, not guessed. */
export const TOLERANCES = {
  measuredOn: '2026-09-12',
  /** Fraction of the sheet's pixels allowed to carry an alpha that is neither 0 nor 255. */
  intermediateAlpha: 0.05,
  /** `max / min - 1` of the frames' content heights. */
  heightVariance: 0.045,
  /** How far the lowest opaque row may sit above the frame's bottom row, in pixels. */
  feet: 1,
  /** How far the content's centre may sit from the frame's centre, as a fraction of the frame width. */
  centre: 0.1,
  /** Monotonic centre movement across the Cycle, as a fraction of the frame width. */
  drift: 0.02,
  /** RGB distance at which an opaque pixel counts as "near" a bible colour, for `--palette`. */
  paletteDistance: 40,
};

/** The two frame boxes the Cycle contract defines, and who gets which. */
export const FRAME_BOXES = {
  person: { width: 192, height: 320 },
  cat: { width: 256, height: 192 },
};

export const ACTOR_SHAPES = { boy: 'person', girl: 'person', mica: 'cat', mira: 'cat', luna: 'cat' };

/** `<actor>-<cycle>-<facing>.png` is the contract's filename, so the actor is readable off it. */
export function actorFromFile(file) {
  const base = file.replace(/\\/g, '/').split('/').pop() ?? '';
  const actor = base.split('-')[0];
  return actor in ACTOR_SHAPES ? actor : null;
}

export function frameBoxForActor(actor) {
  const shape = ACTOR_SHAPES[actor];
  return shape ? FRAME_BOXES[shape] : null;
}

/**
 * Read a PNG and keep the header fields `decodePng` throws away.
 *
 * The contract wants RGBA, and an RGB sheet decodes perfectly well into opaque
 * RGBA — so the only place the difference survives is the IHDR, read here.
 */
export function decodeSheet(bytes) {
  let colourType = null;
  let depth = null;
  for (let offset = 8; offset + 8 <= bytes.length; ) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      depth = bytes[offset + 16];
      colourType = bytes[offset + 17];
      break;
    }
    offset += 12 + length;
  }
  return { image: decodePng(bytes), colourType, depth };
}

/**
 * Every `.cycle` layer in the page, with the sheet and grid it declares.
 *
 * `assert-built-page.mjs` sweeps every `data-sheet` in the document, which also
 * catches the scene sprites; those are WebP posters, not Cycles. This narrows to
 * the `.cycle` layers, which are the only elements the Cycle contract covers.
 */
export function readDeclarations(html) {
  const declarations = [];
  for (const [, tag] of html.matchAll(/<div\b([^>]*\bclass="cycle"[^>]*)>/g)) {
    const attribute = name => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
    const sheet = attribute('data-sheet');
    if (!sheet) continue;
    declarations.push({
      sheet,
      frames: Number(attribute('data-frames')),
      columns: Number(attribute('data-columns')),
      cycle: attribute('data-cycle'),
      facing: attribute('data-facing'),
      // Playback rate is not a rule this script checks — the contract fixes it at walk 10, run 14
      // — but `scripts/art/make-preview.mjs` plays a sheet back at the rate the page declares.
      fps: attribute('data-fps'),
    });
  }
  return declarations;
}

/** The tight box of opaque content inside one cell, or null when the cell is empty. */
function contentBox(image, x0, y0, width, height) {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  let count = 0;
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      if (image.data[((y0 + row) * image.width + x0 + column) * 4 + 3] < OPAQUE) continue;
      count++;
      if (column < left) left = column;
      if (column > right) right = column;
      if (row < top) top = row;
      if (row > bottom) bottom = row;
    }
  }
  if (right < left) return null;
  return { left, right, top, bottom, count, width: right - left + 1, height: bottom - top + 1 };
}

/** A sequence that only ever moves one way is a translation baked into the Cycle. */
function monotonic(values) {
  let up = true;
  let down = true;
  for (let index = 1; index < values.length; index++) {
    if (values[index] < values[index - 1]) up = false;
    if (values[index] > values[index - 1]) down = false;
  }
  return up || down;
}

/**
 * Check one decoded sheet against the Cycle contract.
 *
 * Returns every violation it finds, in a fixed rule order, so a caller can print
 * the first one and a JSON consumer can have them all.
 */
export function checkSheet({ name, image, colourType, depth, frames, columns, frame, tolerances = TOLERANCES }) {
  const failures = [];
  const fail = (rule, message) => failures.push({ rule, message });
  const rows = Math.ceil(frames / columns);
  const stats = {
    name,
    frames,
    columns,
    rows,
    frame,
    sheet: { width: image.width, height: image.height },
    expected: { width: frame.width * columns, height: frame.height * rows },
    colourType,
    depth,
  };

  if (!(frames >= 1 && columns >= 1)) {
    fail('grid', `declares ${frames} frames in ${columns} columns, which is not a grid`);
    return { name, ok: false, failures, stats };
  }

  if (image.width !== stats.expected.width || image.height !== stats.expected.height) {
    fail(
      'dimensions',
      `is ${image.width}x${image.height}; ${frames} frames of ${frame.width}x${frame.height} in ` +
        `${columns} columns needs ${stats.expected.width}x${stats.expected.height}`,
    );
    // Every rule below indexes into cells, so there is nothing more to say.
    return { name, ok: false, failures, stats };
  }

  if (colourType !== 6 || depth !== 8) {
    fail('rgba', `is PNG colour type ${colourType} depth ${depth}; the contract is 8-bit RGBA (type 6)`);
  }

  let intermediate = 0;
  let residue = 0;
  for (let index = 0; index < image.width * image.height; index++) {
    const alpha = image.data[index * 4 + 3];
    if (alpha !== 0 && alpha !== 255) intermediate++;
    if (alpha === 0 && (image.data[index * 4] || image.data[index * 4 + 1] || image.data[index * 4 + 2]))
      residue++;
  }
  const pixels = image.width * image.height;
  stats.intermediateAlpha = intermediate;
  stats.intermediateAlphaFraction = intermediate / pixels;
  stats.colourResidue = residue;
  if (stats.intermediateAlphaFraction > tolerances.intermediateAlpha) {
    fail(
      'alpha-binary',
      `carries ${intermediate} partly transparent pixels, ` +
        `${(stats.intermediateAlphaFraction * 100).toFixed(2)}% of the sheet; ` +
        `alpha is 0 or 255 except along an edge, so the ceiling is ` +
        `${(tolerances.intermediateAlpha * 100).toFixed(0)}%`,
    );
  }
  if (residue) {
    fail(
      'colour-residue',
      `has ${residue} fully transparent pixels still carrying colour; premultiply or zero them`,
    );
  }

  const cells = [];
  for (let index = 0; index < rows * columns; index++) {
    const column = index % columns;
    const row = (index - column) / columns;
    cells.push(contentBox(image, column * frame.width, row * frame.height, frame.width, frame.height));
  }

  const frameCentre = (frame.width - 1) / 2;
  const centreLimit = tolerances.centre * frame.width;
  const measured = [];
  for (let index = 0; index < frames; index++) {
    const box = cells[index];
    const at = `frame ${index + 1}`;
    if (!box) {
      fail('content', `${at} is empty; ${frames} frames were declared`);
      continue;
    }
    const feet = frame.height - 1 - box.bottom;
    const offset = (box.left + box.right) / 2 - frameCentre;
    measured.push({ index: index + 1, height: box.height, width: box.width, feet, centreOffset: offset });
    if (feet > tolerances.feet) {
      fail(
        'feet',
        `${at} stands ${feet} px above the frame's bottom edge; the Actor's position is its feet, ` +
          `so the tolerance is ${tolerances.feet} px`,
      );
    }
    if (box.left === 0 || box.right === frame.width - 1) {
      fail('edge-bleed', `${at} touches the frame's ${box.left === 0 ? 'left' : 'right'} edge and bleeds into its neighbour`);
    }
    if (Math.abs(offset) > centreLimit) {
      fail(
        'centre',
        `${at} sits ${offset.toFixed(1)} px off the frame's centre; the tolerance is ` +
          `${centreLimit.toFixed(1)} px (${(tolerances.centre * 100).toFixed(0)}% of ${frame.width})`,
      );
    }
  }
  for (let index = frames; index < cells.length; index++) {
    if (cells[index]) fail('spare-cell', `cell ${index + 1} carries content but only ${frames} frames were declared`);
  }
  stats.measured = measured;

  if (measured.length >= 2) {
    const heights = measured.map(entry => entry.height);
    const low = Math.min(...heights);
    const high = Math.max(...heights);
    const variance = low > 0 ? high / low - 1 : Infinity;
    stats.heightVariance = variance;
    if (variance > tolerances.heightVariance) {
      fail(
        'height-variance',
        `varies ${(variance * 100).toFixed(1)}% in content height across its frames (${low}–${high} px); ` +
          `the tolerance is ${(tolerances.heightVariance * 100).toFixed(1)}%`,
      );
    }
  }

  if (measured.length >= 3) {
    const offsets = measured.map(entry => entry.centreOffset);
    const span = Math.max(...offsets) - Math.min(...offsets);
    stats.centreDrift = span;
    if (monotonic(offsets) && span > tolerances.drift * frame.width) {
      fail(
        'drift',
        `walks ${span.toFixed(1)} px across its own frames, one way the whole Cycle; the world model does ` +
          `the travelling, so a Cycle that translates moves the Actor twice`,
      );
    }
  }

  return { name, ok: failures.length === 0, failures, stats };
}

/** How much of the drawing sits near each of an Actor's bible colours. Printed, never failed on. */
export function paletteReport(image, colours, distance = TOLERANCES.paletteDistance) {
  const near = Object.fromEntries(Object.keys(colours).map(key => [key, 0]));
  const targets = Object.entries(colours).map(([key, hex]) => {
    const value = hex.replace('#', '');
    return [key, parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  });
  let opaque = 0;
  for (let index = 0; index < image.width * image.height; index++) {
    if (image.data[index * 4 + 3] < OPAQUE) continue;
    opaque++;
    const red = image.data[index * 4];
    const green = image.data[index * 4 + 1];
    const blue = image.data[index * 4 + 2];
    for (const [key, r, g, b] of targets) {
      if (Math.hypot(red - r, green - g, blue - b) < distance) near[key]++;
    }
  }
  return Object.fromEntries(
    Object.entries(near).map(([key, count]) => [key, opaque ? Number(((count / opaque) * 100).toFixed(1)) : 0]),
  );
}

function parseArguments(args) {
  const options = { paths: [], json: false, nonFatal: false, palette: null, frames: null, columns: null, frame: null, actor: null };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--json') options.json = true;
    else if (argument === '--non-fatal') options.nonFatal = true;
    else if (argument === '--palette') options.palette = args[++index];
    else if (argument === '--frames') options.frames = Number(args[++index]);
    else if (argument === '--columns') options.columns = Number(args[++index]);
    else if (argument === '--actor') options.actor = args[++index];
    else if (argument === '--frame') {
      const match = /^(\d+)x(\d+)$/.exec(args[++index] ?? '');
      if (!match) throw new Error('--frame takes <width>x<height>, for example 192x320.');
      options.frame = { width: Number(match[1]), height: Number(match[2]) };
    } else if (argument.startsWith('--')) throw new Error(`Unknown option ${argument}.`);
    else options.paths.push(argument);
  }
  return options;
}

function main(args) {
  const options = parseArguments(args);
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const declared = new Map();
  for (const declaration of readDeclarations(html)) {
    declared.set(declaration.sheet.replace(/^\.\//, '').split('/').pop(), declaration);
  }

  const targets = [];
  if (options.paths.length === 0) {
    for (const declaration of readDeclarations(html)) {
      const relative = declaration.sheet.replace(/^\.\//, '');
      targets.push({
        path: join(root, 'public', relative),
        name: relative,
        frames: declaration.frames,
        columns: declaration.columns,
      });
    }
    if (targets.length === 0) throw new Error('index.html declares no `.cycle` layer; nothing to check.');
  } else {
    for (const path of options.paths) {
      const resolved = resolve(path);
      const base = resolved.replace(/\\/g, '/').split('/').pop();
      const declaration = declared.get(base);
      const frames = options.frames ?? declaration?.frames ?? null;
      const columns = options.columns ?? declaration?.columns ?? null;
      if (frames === null || columns === null) {
        throw new Error(
          `${path} is not declared in index.html; pass --frames and --columns (and --actor or --frame).`,
        );
      }
      targets.push({ path: resolved, name: path, frames, columns });
    }
  }

  const palette = options.palette ? JSON.parse(readFileSync(resolve(options.palette), 'utf8')) : null;
  const results = [];
  for (const target of targets) {
    const actor = options.actor ?? actorFromFile(target.name);
    const frame = options.frame ?? frameBoxForActor(actor);
    if (!frame) {
      results.push({
        name: target.name,
        ok: false,
        failures: [
          {
            rule: 'actor',
            message:
              `has no Actor in its name (expected <actor>-<cycle>-<facing>.png for one of ` +
              `${Object.keys(ACTOR_SHAPES).join(', ')}); pass --actor or --frame`,
          },
        ],
        stats: { name: target.name },
      });
      continue;
    }
    const { image, colourType, depth } = decodeSheet(readFileSync(target.path));
    const result = checkSheet({
      name: target.name,
      image,
      colourType,
      depth,
      frames: target.frames,
      columns: target.columns,
      frame,
    });
    result.stats.actor = actor;
    if (palette) {
      const colours = { ...(palette.shared ?? {}), ...(palette[actor] ?? {}) };
      delete colours.sheetBackground;
      result.stats.paletteNearPercent = paletteReport(image, colours);
    }
    results.push(result);
  }

  const failed = results.filter(result => !result.ok);
  if (options.json) {
    stdout.write(`${JSON.stringify({ tolerances: TOLERANCES, passed: results.length - failed.length, failed: failed.length, results }, null, 2)}\n`);
  } else {
    for (const result of results) {
      const alpha =
        result.stats.intermediateAlphaFraction === undefined
          ? ''
          : `  ${result.stats.intermediateAlpha} soft-alpha px (${(result.stats.intermediateAlphaFraction * 100).toFixed(2)}%)`;
      if (result.ok) console.log(`PASS  ${result.name}  ${result.stats.frames} frames${alpha}`);
      else console.log(`FAIL  ${result.name}  ${result.failures[0].rule}: ${result.failures[0].message}`);
      if (result.stats.paletteNearPercent) {
        console.log(
          `      palette: ${Object.entries(result.stats.paletteNearPercent)
            .map(([key, value]) => `${key} ${value}%`)
            .join(', ')}`,
        );
      }
    }
    console.log(`${results.length - failed.length}/${results.length} sheets pass the Cycle contract.`);
  }

  if (!failed.length) return 0;
  if (options.nonFatal) {
    console.log('(--non-fatal: reporting only, not failing the build)');
    return 0;
  }
  return 1;
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  try {
    exit(main(argv.slice(2)));
  } catch (error) {
    console.error(`check-assets: ${error.message}`);
    exit(1);
  }
}

export { main, parseArguments, contentBox, monotonic };
