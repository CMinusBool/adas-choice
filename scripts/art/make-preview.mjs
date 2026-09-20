#!/usr/bin/env node
// Build a self-contained motion preview from one or more Cycle sheets.
//
//   node scripts/art/make-preview.mjs                                   # every sheet index.html declares
//   node scripts/art/make-preview.mjs --sheet <sheet.png> [--sheet ...] # named sheets
//   node scripts/art/make-preview.mjs --sheet a.png=run\ 1 --sheet b.png=run\ 2 --out compare.html
//   node scripts/art/make-preview.mjs --sheet <sheet.png> --review-images <dir>
//
// Promoted from `.scratch/COOP-001-apartment/art/cycles/experiments/boy-walk-01/make-preview.mjs`,
// which compared the two measured Boy walks side by side; parameterised here so any candidate
// sheet can be played back against the contract before the owner is asked to look at it.
//
// `check-assets.mjs` is the mechanical half of acceptance and this is the human half: the motion
// phase — whether the leading leg alternates between the two rows — is not readable from the
// stills, is not readable from the generator's own report of what it drew, and is what the owner
// and ticket 09's check settle by watching the sheet move.
//
// The page is self-contained on purpose. Each sheet is inlined as a base64 data URI so the file
// opens straight off disk over `file://` and inside the desktop app's preview pane, which loads a
// local page as a `data:` URL and so cannot resolve an image sitting beside it. Re-run this
// whenever a sheet is rebuilt.
//
// With no `--sheet`, it previews exactly what `check-assets.mjs` checks with no arguments: every
// `.cycle` layer `index.html` declares, at that layer's `data-frames`, `data-columns` and
// `data-fps`. Otherwise each sheet's grid comes from `--frames`/`--columns`/`--fps` when given,
// from the layer that declares it when one does, and from the Cycle contract's default of 8 frames
// in 4 columns when neither does.
//
// `--review-images <dir>` writes the **motion-phase reviewer's** inputs beside the page: one PNG
// per frame, the whole cycle as a single zoomed strip, and the two side-by-sides the checklist's
// first question turns on — the contact frames (1 and 5) and the second pair (4 and 8). A vision
// agent cannot answer "does the leading leg alternate" from a 192x320 frame on a transparent
// ground, so every tile here is upscaled with nearest-neighbour (no invented edge), composited on
// a flat neutral with the frame's own baseline drawn, and stamped with its frame number. See
// `~/.claude/docs/illustrator/motion-checklist.md`; the agent is `motion-reviewer`.
import { existsSync, readFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { blank, decodePng, encodePng } from '../png.mjs';
import { actorFromFile, frameBoxForActor, readDeclarations } from '../check-assets.mjs';
import { FPS, cellRegions, nameParts } from './build-cycle.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const DEFAULT_SOURCE = fileURLToPath(new URL('./preview.src.html', import.meta.url));

export function parseArguments(argv) {
  const options = {
    sheets: [], out: null, source: DEFAULT_SOURCE, title: null,
    frames: null, columns: null, fps: null, frame: null, actor: null,
    reviewImages: null, zoom: 2,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${argument} needs a value.`);
      return value;
    };
    if (argument === '--sheet') {
      // `<path>=<label>`, because a label with spaces in it is worth more than a second flag.
      const value = next();
      const split = value.indexOf('=');
      options.sheets.push(
        split > 1 ? { path: value.slice(0, split), label: value.slice(split + 1) } : { path: value, label: null },
      );
    } else if (argument === '--out' || argument === '-o') options.out = next();
    else if (argument === '--src') options.source = next();
    else if (argument === '--title') options.title = next();
    else if (argument === '--frames') options.frames = Number(next());
    else if (argument === '--columns' || argument === '--cols') options.columns = Number(next());
    else if (argument === '--fps') options.fps = Number(next());
    else if (argument === '--actor') options.actor = next();
    else if (argument === '--review-images') options.reviewImages = next();
    else if (argument === '--zoom') options.zoom = Number(next());
    else if (argument === '--frame') {
      const match = /^(\d+)x(\d+)$/.exec(next());
      if (!match) throw new Error('--frame takes <width>x<height>, for example 192x320.');
      options.frame = { width: Number(match[1]), height: Number(match[2]) };
    } else if (argument.startsWith('-')) throw new Error(`Unknown argument ${argument}.`);
    else options.sheets.push({ path: argument, label: null });
  }
  if (!(options.zoom >= 1) || !Number.isInteger(options.zoom)) {
    throw new Error('--zoom takes a whole number of pixels per source pixel, 1 or more.');
  }
  return options;
}

/**
 * What `index.html` says about each sheet it declares, keyed by the file it actually names.
 *
 * By absolute path rather than by file name on purpose: a candidate sheet is built under the
 * effort's `art/` directory with the delivered sheet's name, and inheriting the placeholder
 * layer's `data-frames="1"` would play the candidate back as a single held frame — which is the
 * one thing this page exists to not do.
 */
export function declarationsByPath(html, base = root) {
  const map = new Map();
  for (const declaration of readDeclarations(html)) {
    map.set(resolve(join(base, 'public', declaration.sheet.replace(/^\.\//, ''))), declaration);
  }
  return map;
}

/** One run's geometry: the options win, then the page's declaration, then the contract. */
export function runFor({ path, label }, { declaration, options }) {
  const file = basename(path);
  const parts = nameParts(file);
  const actor = options.actor ?? parts.actor;
  const frame = options.frame ?? frameBoxForActor(actor);
  if (!frame) {
    throw new Error(
      `${path} has no Actor in its name (expected <actor>-<cycle>-<facing>.png); pass --actor or --frame.`,
    );
  }
  const frames = options.frames ?? declaration?.frames ?? 8;
  const columns = options.columns ?? declaration?.columns ?? 4;
  const cycle = declaration?.cycle ?? parts.cycle;
  const fps = options.fps ?? (declaration?.fps ? Number(declaration.fps) : null) ?? FPS[cycle ?? ''] ?? 10;
  const note = [
    cycle ? `${cycle} at ${fps} fps` : `${fps} fps`,
    `${frames} frames in ${columns} columns`,
    frames === 1 ? 'a placeholder, not a Cycle' : 'motion phase not verified',
  ].join(', ');
  return { title: label ?? file, note, sheet: path, frameWidth: frame.width, frameHeight: frame.height, columns, frames, fps };
}

/** Rewrite the template's CONFIG block and inline every sheet as a data URI. */
export function render(template, config, read) {
  const start = template.indexOf('// BUILD:CONFIG');
  const end = template.indexOf('// BUILD:END');
  if (start < 0 || end < 0 || end < start) {
    throw new Error('The template has no BUILD:CONFIG … BUILD:END block to replace.');
  }
  let bytes = 0;
  const runs = config.runs.map(run => {
    const png = read(run.sheet);
    bytes += png.length;
    return { ...run, sheet: `data:image/png;base64,${png.toString('base64')}` };
  });
  const block = `// BUILD:CONFIG — written by make-preview.mjs; every sheet is inlined as a data URI.\n  const CONFIG = ${JSON.stringify({ ...config, runs }, null, 2).split('\n').join('\n  ')};\n  `;
  return { html: template.slice(0, start) + block + template.slice(end), bytes };
}

// ---------------------------------------------------------------------------------------------
// Review images: what the motion-phase reviewer looks at.
// ---------------------------------------------------------------------------------------------

/** Flat neutral rather than the page's checker: a checker reads as texture on a charcoal leg. */
export const REVIEW = {
  background: [0xe4, 0xe4, 0xe4],
  ink: [0x1b, 0x1b, 0x1b],
  baseline: [0x9c, 0x9c, 0x9c],
  gutter: 16,
  label: 3, // pixels per cell of the 3x5 digit font
};

/** A 3x5 bitmap digit each, so a frame carries its own number instead of a dot count to tally. */
const DIGITS = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '001', '010', '010'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
};

/** Cut a sheet into its frames, in the contract's order: left to right, then top to bottom. */
export function cutFrames(image, { frameWidth, frameHeight, frames, columns }) {
  const rows = Math.ceil(frames / columns);
  if (image.width < frameWidth * columns || image.height < frameHeight * rows) {
    throw new Error(
      `${image.width}x${image.height} is too small for ${frames} frames of ${frameWidth}x${frameHeight} `
        + `in ${columns} columns; pass --frame or --actor.`,
    );
  }
  return cellRegions(frameWidth * columns, frameHeight * rows, columns, rows)
    .slice(0, frames)
    .map((region, index) => {
      const out = blank(frameWidth, frameHeight);
      for (let y = 0; y < frameHeight; y++) {
        image.data.copy(
          out.data,
          y * frameWidth * 4,
          ((region.y0 + y) * image.width + region.x0) * 4,
          ((region.y0 + y) * image.width + region.x0 + frameWidth) * 4,
        );
      }
      return { number: index + 1, image: out };
    });
}

/** Nearest-neighbour, on purpose: an interpolated edge would invent the occlusion being judged. */
export function upscale(image, factor) {
  if (factor === 1) return image;
  const out = blank(image.width * factor, image.height * factor);
  for (let y = 0; y < out.height; y++) {
    const sy = Math.floor(y / factor);
    for (let x = 0; x < out.width; x++) {
      const from = (sy * image.width + Math.floor(x / factor)) * 4;
      image.data.copy(out.data, (y * out.width + x) * 4, from, from + 4);
    }
  }
  return out;
}

/** One canvas of tiles in a row, each on the neutral, on a shared baseline, numbered. */
export function composeTiles(tiles, { zoom = 2, gutter = REVIEW.gutter, columns = tiles.length } = {}) {
  const scaled = tiles.map(tile => ({ number: tile.number, image: upscale(tile.image, zoom) }));
  const width = Math.max(...scaled.map(one => one.image.width));
  const height = Math.max(...scaled.map(one => one.image.height));
  const rows = Math.ceil(scaled.length / columns);
  const canvas = blank(
    gutter + columns * (width + gutter),
    gutter + rows * (height + gutter),
  );
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    const at = (y * canvas.width + x) * 4;
    canvas.data[at] = r; canvas.data[at + 1] = g; canvas.data[at + 2] = b; canvas.data[at + 3] = 255;
  };
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) put(x, y, REVIEW.background);

  scaled.forEach((tile, order) => {
    const left = gutter + (order % columns) * (width + gutter) + Math.round((width - tile.image.width) / 2);
    const top = gutter + Math.floor(order / columns) * (height + gutter) + (height - tile.image.height);
    // The frame's own bottom edge is the contract's ground line; drawing it makes a foot that
    // should be planted and one that should be lifted tell each other apart.
    for (let x = left; x < left + tile.image.width; x++) put(x, top + tile.image.height, REVIEW.baseline);
    for (let y = 0; y < tile.image.height; y++) {
      for (let x = 0; x < tile.image.width; x++) {
        const from = (y * tile.image.width + x) * 4;
        const alpha = tile.image.data[from + 3] / 255;
        if (alpha === 0) continue;
        const at = ((top + y) * canvas.width + left + x) * 4;
        for (let channel = 0; channel < 3; channel++) {
          canvas.data[at + channel] = Math.round(
            tile.image.data[from + channel] * alpha + canvas.data[at + channel] * (1 - alpha),
          );
        }
      }
    }
    const scale = REVIEW.label;
    String(tile.number).split('').forEach((digit, place) => {
      const rowsOf = DIGITS[digit];
      if (!rowsOf) return;
      for (let y = 0; y < rowsOf.length; y++) {
        for (let x = 0; x < rowsOf[y].length; x++) {
          if (rowsOf[y][x] !== '1') continue;
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              put(left + 4 + place * 4 * scale + x * scale + dx, top + 4 + y * scale + dy, REVIEW.ink);
            }
          }
        }
      }
    });
  });
  return canvas;
}

/**
 * The frame pairs the checklist's first question turns on.
 *
 * Half a cycle apart is where the leading leg must have swapped: frames 1 and 5 of an eight-frame
 * Cycle are the two contact frames, and 4 and 8 are the frame before each of them. A cycle that
 * shuffles shows the same leg leading in both members of both pairs, which is the defect the owner
 * found in the two measured runs.
 */
export function comparePairs(frames) {
  const half = Math.floor(frames / 2);
  if (half < 1) return [];
  return [[1, 1 + half], [half, frames]].filter(([a, b]) => a !== b && b <= frames);
}

/** Write the reviewer's inputs for one run into `dir`; returns every path written. */
export function writeReviewImages(run, dir, { zoom = 2, read = readFileSync, write = writeFileSync } = {}) {
  const sheet = decodePng(read(run.sheet));
  const tiles = cutFrames(sheet, {
    frameWidth: run.frameWidth, frameHeight: run.frameHeight, frames: run.frames, columns: run.columns,
  });
  mkdirSync(dir, { recursive: true });
  const written = [];
  const emit = (name, image) => {
    const path = join(dir, name);
    write(path, encodePng(image));
    written.push(path);
  };
  const pad = number => String(number).padStart(2, '0');
  for (const tile of tiles) emit(`frame-${pad(tile.number)}.png`, composeTiles([tile], { zoom }));
  emit(`frame-strip-${zoom}x.png`, composeTiles(tiles, { zoom }));
  for (const [a, b] of comparePairs(tiles.length)) {
    emit(`compare-${a}-${b}.png`, composeTiles([tiles[a - 1], tiles[b - 1]], { zoom }));
  }
  return written;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const indexPath = join(root, 'index.html');
  const declarations = existsSync(indexPath) ? declarationsByPath(readFileSync(indexPath, 'utf8')) : new Map();

  let sheets = options.sheets;
  if (!sheets.length) {
    if (!declarations.size) throw new Error('index.html declares no `.cycle` layer; pass --sheet <sheet.png>.');
    sheets = [...declarations.entries()].map(([path, declaration]) => ({
      path, label: basename(declaration.sheet),
    }));
  }

  const runs = sheets.map(sheet => {
    const resolved = resolve(sheet.path);
    if (!existsSync(resolved)) throw new Error(`No such sheet: ${sheet.path}`);
    return runFor({ path: resolved, label: sheet.label }, {
      declaration: declarations.get(resolved), options,
    });
  });

  const title = options.title
    ?? (runs.length === 1 ? `${basename(runs[0].sheet)} — motion preview` : 'Cycle motion preview');
  const template = readFileSync(resolve(options.source), 'utf8');
  const { html, bytes } = render(template, { title, runs }, path => readFileSync(path));

  // Beside the first sheet by default, which is where a candidate lives and where the review card
  // can point at it; never into `public/`, which ships.
  const out = resolve(options.out ?? join(dirname(runs[0].sheet), 'preview.html'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  const kb = value => `${Math.round(value / 1024)} kB`;
  console.log(`${out}: ${runs.length} sheet(s), ${kb(bytes)} of PNG, ${kb(statSync(out).size)} on disk`);
  for (const run of runs) console.log(`  ${run.title} — ${run.note}`);

  if (options.reviewImages) {
    const base = resolve(options.reviewImages);
    for (const run of runs) {
      // One directory per sheet when several are previewed together, so a comparison run does not
      // overwrite `frame-01.png` four times.
      const dir = runs.length === 1 ? base : join(base, basename(run.sheet, '.png'));
      const written = writeReviewImages(run, dir, { zoom: options.zoom });
      console.log(
        `  review images: ${dir} — ${written.length} files at ${options.zoom}x `
        + `(${run.frames} frames, the strip, and ${comparePairs(run.frames).map(([a, b]) => `${a} vs ${b}`).join(' and ')})`,
      );
    }
    console.log('  motion phase is answered from these by the owner, never by a grader and never by the generator.');
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(`make-preview: ${error.message}\n`);
    process.exit(2);
  }
}
