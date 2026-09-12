#!/usr/bin/env node
// Cut a contract-compliant Cycle sheet out of a raw generation.
//
// The measured batch settled the split: the generator holds identity and cell discipline, and
// cannot hit a frame size, seat feet on a bottom edge, hold one ground line across two rows or
// renormalise alpha. All of that is arithmetic, and this is where it lives. Nothing here invents
// a pixel: if a strip cannot be made to pass `check-assets.mjs`, the generation is wrong and its
// art ticket is reopened — the validator is never relaxed to admit a generation.
//
// Promoted from `.scratch/COOP-001-apartment/art/cycles/experiments/boy-walk-01/measure-strip.mjs`,
// the 150-line script that measured both runs and cut both candidate sheets.
//
// Usage:
//
//   node scripts/art/build-cycle.mjs <strip.png | frames-dir> --out <sheet.png> [--actor boy]
//     [--frames 8] [--columns 4] [--key '#00FF00' | --key alpha] [--frame 192x320]
//     [--fps 10] [--mirror] [--palette art/characters/v1/palette.json]
//     [--metrics <path>] [--provenance <illustrator manifest.json>] [--shot <id>]
//     [--apply] [--no-manifest]
//
// The Actor fixes the frame box (192x320 for the Boy and the Girl, 256x192 for the cats) and is
// read off the output filename — `<actor>-<cycle>-<facing>.png` — unless `--actor` names it.
//
// What it does, in order: mask the background (the image's own alpha where it carries real
// transparency, otherwise a chroma key at RGB distance 140); take a bounding box per cell;
// count blobs per row as a sanity check on how many figures the model actually drew; compute
// **one shared scale** from the tallest frame, because scaling per frame is what makes a figure
// grow and shrink as it walks; seat every figure on its frame's bottom edge and centre it; area-
// average the downsample on premultiplied alpha; leave RGB at zero under every transparent pixel;
// lay the frames out left to right then top to bottom in a 4-column grid; write the sheet and a
// `metrics.json`; and run the Cycle contract over the result. A sheet that fails exits non-zero.
//
// `--mirror` produces the other facing, and only for the Actors the contract allows to be
// mirrored: the Boy and the Girl. Míca's nose dot must not change sides, so she and Mira ship both
// facings from their own generations and `--mirror` on a cat is an error, not a shortcut.
//
// `metrics.json` lands beside the sheet unless `--metrics` moves it. When the sheet is being
// written into `public/assets/actors/`, point `--metrics` at the effort's generation directory:
// nothing untracked belongs in the asset directory.
//
// When the sheet lands in `public/assets/actors/`, the provenance entry is appended to that
// directory's `manifest.json` (schema version 2, the `cycles` array). Anywhere else the entry is
// printed rather than written, so a scratch build never edits a tracked file. `--no-manifest`
// suppresses it either way. The `index.html` attribute changes a delivery needs (`data-frames`,
// `data-columns`, `data-fps`) are always printed, and `--apply` makes them.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { blank, decodePng, encodePng } from '../png.mjs';
import {
  ACTOR_SHAPES,
  actorFromFile,
  checkSheet,
  decodeSheet,
  frameBoxForActor,
  paletteReport,
} from '../check-assets.mjs';
import { parseHex } from './make-guide.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** RGB distance below which a pixel counts as the chroma ground. Measured on both real runs. */
export const KEY_DISTANCE = 140;

/** Headroom left inside the frame box, in pixels, so no frame touches an edge and bleeds. */
export const MARGIN = { top: 2, side: 4 };

/** More transparency than this, and the image carries a real alpha channel worth trusting. */
export const ALPHA_FRACTION = 0.05;

/** The contract's playback rates. `idle` is the walk sheet held on frame 1, so it has no entry. */
export const FPS = { walk: 10, run: 14 };

/** Mirroring is a fallback the contract allows for the people and forbids for the cats. */
export const MIRRORABLE = new Set(['boy', 'girl']);

export const BUILDER_VERSION = '1';

const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');

export function parseArguments(argv) {
  const options = {
    input: null, out: null, actor: null, cycle: null, facing: null,
    frames: 8, columns: 4, frame: null, key: null, mask: 'auto', fps: null,
    mirror: false, palette: null, metrics: null, provenance: 'auto', shot: null,
    apply: false, manifest: true,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${argument} needs a value.`);
      return value;
    };
    if (argument === '--out' || argument === '-o') options.out = next();
    else if (argument === '--actor') options.actor = next();
    else if (argument === '--cycle') options.cycle = next();
    else if (argument === '--facing') options.facing = next();
    else if (argument === '--frames') options.frames = Number(next());
    else if (argument === '--columns' || argument === '--cols') options.columns = Number(next());
    else if (argument === '--fps') options.fps = Number(next());
    else if (argument === '--key') {
      const value = next();
      if (value === 'alpha') options.mask = 'alpha';
      else { options.mask = 'key'; options.key = value; }
    } else if (argument === '--frame') {
      const match = /^(\d+)x(\d+)$/.exec(next());
      if (!match) throw new Error('--frame takes <width>x<height>, for example 192x320.');
      options.frame = { width: Number(match[1]), height: Number(match[2]) };
    } else if (argument === '--palette') options.palette = next();
    else if (argument === '--metrics') options.metrics = next();
    else if (argument === '--provenance') options.provenance = next();
    else if (argument === '--shot') options.shot = next();
    else if (argument === '--mirror') options.mirror = true;
    else if (argument === '--apply') options.apply = true;
    else if (argument === '--no-manifest') options.manifest = false;
    else if (argument.startsWith('-')) throw new Error(`Unknown argument ${argument}.`);
    else if (options.input) throw new Error('Takes one strip or one directory of frames.');
    else options.input = argument;
  }
  if (!options.input) throw new Error('A raw strip or a directory of frames is required.');
  if (!options.out) throw new Error('--out <sheet.png> is required.');
  if (!(options.frames >= 1) || !(options.columns >= 1)) {
    throw new Error('--frames and --columns must be positive.');
  }

  const named = nameParts(basename(options.out));
  options.actor ??= named.actor;
  options.cycle ??= named.cycle;
  options.facing ??= named.facing;
  if (!options.actor) {
    throw new Error(
      `Cannot tell which Actor this is: name the sheet <actor>-<cycle>-<facing>.png for one of ` +
        `${Object.keys(ACTOR_SHAPES).join(', ')}, or pass --actor.`,
    );
  }
  if (options.mirror && !MIRRORABLE.has(options.actor)) {
    throw new Error(
      `--mirror is not allowed for ${options.actor}: the contract mirrors the Boy and the Girl only. ` +
        `Míca's nose dot must not change sides, so she and Mira ship both facings from their own ` +
        `generations.`,
    );
  }
  options.frame ??= frameBoxForActor(options.actor);
  if (!options.frame) throw new Error(`No frame box for ${options.actor}; pass --frame <W>x<H>.`);
  options.fps ??= FPS[options.cycle ?? ''] ?? null;
  return options;
}

/** `<actor>-<cycle>-<facing>.png`, the contract's filename, read back into its three parts. */
export function nameParts(file) {
  const match = /^([a-z]+)-([a-z]+)-(left|right)\.png$/i.exec(basename(file));
  if (!match) return { actor: actorFromFile(file), cycle: null, facing: null };
  return { actor: actorFromFile(file), cycle: match[2].toLowerCase(), facing: match[3].toLowerCase() };
}

/**
 * Background mask for one decoded image: 1 where the drawing is, 0 where the ground is.
 *
 * `auto` trusts the image's own alpha when more than 5% of it is transparent —
 * a generation that came back on a chroma ground is fully opaque, so the test separates the two
 * cases cleanly without asking the caller which it has.
 */
export function buildMask(image, { mode = 'auto', key = '#00FF00', distance = KEY_DISTANCE } = {}) {
  const pixels = image.width * image.height;
  let transparent = 0;
  for (let index = 0; index < pixels; index++) if (image.data[index * 4 + 3] < 128) transparent++;
  const useAlpha = mode === 'alpha' || (mode === 'auto' && transparent > pixels * ALPHA_FRACTION);
  const [kr, kg, kb] = parseHex(key);
  const mask = new Uint8Array(pixels);
  let background = 0;
  for (let index = 0; index < pixels; index++) {
    const at = index * 4;
    const isBackground = useAlpha
      ? image.data[at + 3] < 128
      : Math.hypot(image.data[at] - kr, image.data[at + 1] - kg, image.data[at + 2] - kb) < distance;
    mask[index] = isBackground ? 0 : 1;
    if (isBackground) background++;
  }
  return { mask, source: useAlpha ? 'alpha' : `chroma key ${key} within ${distance}`, background };
}

/** The grid's cells, in the contract's order: left to right, then top to bottom. */
export function cellRegions(width, height, columns, rows) {
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const regions = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      regions.push({
        x0: Math.floor(column * cellWidth), y0: Math.floor(row * cellHeight),
        x1: Math.floor((column + 1) * cellWidth), y1: Math.floor((row + 1) * cellHeight),
      });
    }
  }
  return regions;
}

/** The tight box of drawing inside one region of one masked image, or null when it is empty. */
export function measureCell(image, mask, region) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = region.y0; y < region.y1; y++) {
    for (let x = region.x0; x < region.x1; x++) {
      if (!mask[y * image.width + x]) continue;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return { empty: true, pixels: 0, bbox: null, width: 0, height: 0 };
  return {
    empty: false, pixels: count, bbox: [minX, minY, maxX, maxY],
    width: maxX - minX + 1, height: maxY - minY + 1,
    feetFromRegionBottom: region.y1 - 1 - maxY,
    centreOffset: Math.round((minX + maxX) / 2 - (region.x0 + region.x1 - 1) / 2),
    touchesRegionEdge:
      minX <= region.x0 || maxX >= region.x1 - 1 || minY <= region.y0 || maxY >= region.y1 - 1,
  };
}

/**
 * How many separate figures sit in one band of the strip, independent of the grid.
 *
 * A sanity check on the generator rather than on the sheet: four blobs in a four-cell row means
 * the model drew four figures where four were asked for. Reported, never fatal — the mechanical
 * gate is `check-assets.mjs` on the finished sheet.
 */
export function blobsInBand(image, mask, y0, y1, gap = 8) {
  const occupied = new Uint8Array(image.width);
  for (let x = 0; x < image.width; x++) {
    for (let y = y0; y < y1; y++) {
      if (mask[y * image.width + x]) { occupied[x] = 1; break; }
    }
  }
  let blobs = 0;
  let inside = false;
  let run = 0;
  for (let x = 0; x < image.width; x++) {
    if (occupied[x]) { if (!inside) { blobs++; inside = true; } run = 0; }
    else if (inside && ++run >= gap) inside = false;
  }
  return blobs;
}

/**
 * Draw one measured cell into a frame of the contract's box.
 *
 * Area-averaging downsample on premultiplied alpha: every destination pixel averages the source
 * pixels it covers, colour over the covered ones only and alpha over all of them, which is what
 * keeps a soft rim from dragging the chroma ground's colour into the figure. RGB is left at zero
 * wherever alpha lands at zero, because a transparent pixel that still carries colour is residue
 * the validator fails on.
 */
export function renderFrame(image, mask, cell, { frame, scale, mirror = false }) {
  const out = blank(frame.width, frame.height);
  if (cell.empty) return out;
  const [bx0, by0] = cell.bbox;
  const sourceWidth = cell.width;
  const sourceHeight = cell.height;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const offsetX = Math.round((frame.width - width) / 2);
  const offsetY = frame.height - height;
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const sx0 = bx0 + (dx / width) * sourceWidth;
      const sx1 = bx0 + ((dx + 1) / width) * sourceWidth;
      const sy0 = by0 + (dy / height) * sourceHeight;
      const sy1 = by0 + ((dy + 1) / height) * sourceHeight;
      let red = 0;
      let green = 0;
      let blue = 0;
      let covered = 0;
      let samples = 0;
      for (let sy = Math.floor(sy0); sy < Math.min(Math.ceil(sy1), image.height); sy++) {
        for (let sx = Math.floor(sx0); sx < Math.min(Math.ceil(sx1), image.width); sx++) {
          samples++;
          if (!mask[sy * image.width + sx]) continue;
          const at = (sy * image.width + sx) * 4;
          red += image.data[at];
          green += image.data[at + 1];
          blue += image.data[at + 2];
          covered++;
        }
      }
      if (!covered || !samples) continue;
      const alpha = Math.round((255 * covered) / samples);
      if (alpha === 0) continue; // Colour under a transparent pixel is residue; leave it at zero.
      const column = mirror ? width - 1 - dx : dx;
      const at = ((offsetY + dy) * frame.width + offsetX + column) * 4;
      out.data[at] = Math.round(red / covered);
      out.data[at + 1] = Math.round(green / covered);
      out.data[at + 2] = Math.round(blue / covered);
      out.data[at + 3] = alpha;
    }
  }
  return out;
}

/** Lay the rendered frames out left to right, then top to bottom. */
export function assemble(frames, { frame, columns }) {
  const rows = Math.ceil(frames.length / columns);
  const sheet = blank(frame.width * columns, frame.height * rows);
  frames.forEach((image, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    for (let y = 0; y < frame.height; y++) {
      image.data.copy(
        sheet.data,
        ((row * frame.height + y) * sheet.width + column * frame.width) * 4,
        y * frame.width * 4,
        (y + 1) * frame.width * 4,
      );
    }
  });
  return sheet;
}

/** Load the cells to cut: one strip divided by its grid, or a directory of one frame per file. */
function loadCells(input, { columns, rows, frames, mask: mode, key }) {
  const resolved = resolve(input);
  if (statSync(resolved).isDirectory()) {
    const files = readdirSync(resolved).filter(name => name.toLowerCase().endsWith('.png')).sort();
    if (!files.length) throw new Error(`${input} holds no PNG frames.`);
    return files.slice(0, frames).map((file, index) => {
      const image = decodePng(readFileSync(join(resolved, file)));
      const { mask, source } = buildMask(image, { mode, key: key ?? '#00FF00' });
      const region = { x0: 0, y0: 0, x1: image.width, y1: image.height };
      return { index, from: file, image, mask, region, maskSource: source, cell: measureCell(image, mask, region) };
    });
  }
  const image = decodePng(readFileSync(resolved));
  const { mask, source } = buildMask(image, { mode, key: key ?? '#00FF00' });
  return cellRegions(image.width, image.height, columns, rows).map((region, index) => ({
    index, from: basename(resolved), image, mask, region, maskSource: source,
    cell: measureCell(image, mask, region),
  }));
}

/** The illustrator's manifest for this strip, found by walking up from it. Never fabricated. */
export function findProvenance(input, shot) {
  let directory = dirname(resolve(input));
  for (let step = 0; step < 4; step++) {
    const candidate = join(directory, 'manifest.json');
    if (existsSync(candidate)) {
      try {
        const manifest = JSON.parse(readFileSync(candidate, 'utf8'));
        if (typeof manifest.schema === 'string' && manifest.schema.startsWith('illustrator/')) {
          const shots = manifest.shots ?? [];
          const entry = shot ? shots.find(one => one.id === shot) : shots[0];
          return { path: candidate, manifest, shot: entry ?? null };
        }
      } catch { /* a manifest that will not parse is no provenance; fall through. */ }
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

/** Ticket 06's `cycles` entry: where the pixels came from, and what turned them into a sheet. */
export function provenanceEntry({ out, options, sheet, source, provenance }) {
  const shot = provenance?.shot ?? null;
  return {
    file: basename(out),
    actor: options.actor,
    cycle: options.cycle ?? null,
    facing: options.facing ?? null,
    frames: options.frames,
    columns: options.columns,
    frameWidth: options.frame.width,
    frameHeight: options.frame.height,
    sheet: `${sheet.width}x${sheet.height}`,
    mirroredFrom: options.mirror ? 'the other facing of this Cycle, scaleX(-1) baked in' : null,
    source,
    generator: provenance
      ? { ...provenance.manifest.generator, manifest: relativeToRoot(provenance.path) }
      : 'unknown: no illustrator manifest was found beside this strip',
    prompt: shot?.prompt?.resolved
      ? join(dirname(relativeToRoot(provenance.path)), shot.prompt.resolved).replace(/\\/g, '/')
      : null,
    references: provenance?.manifest.references ?? null,
    builtBy: `scripts/art/build-cycle.mjs@${BUILDER_VERSION}`,
    validatedAt: new Date().toISOString().slice(0, 10),
    motionPhase: shot?.motionPhase ?? 'not verified',
  };
}

function relativeToRoot(path) {
  const absolute = resolve(path).replace(/\\/g, '/');
  const base = root.replace(/\\/g, '/');
  return absolute.startsWith(base) ? absolute.slice(base.length) : absolute;
}

/** Append the entry to `public/assets/actors/manifest.json`, replacing any entry for this file. */
export function appendToManifest(manifestPath, entry) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.cycles = (manifest.cycles ?? []).filter(one => one.file !== entry.file);
  manifest.cycles.push(entry);
  manifest.cycles.sort((a, b) => a.file.localeCompare(b.file));
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest.cycles.length;
}

/**
 * The `.cycle` layer that declares this sheet, and the attributes a delivery has to change.
 *
 * A sheet nobody declares is not an error here: a run Cycle needs a new layer, and writing one
 * blind into the markup is the ticket's job, not this script's.
 */
export function attributeChanges(html, { file, frames, columns, fps }) {
  const wanted = { 'data-frames': String(frames), 'data-columns': String(columns) };
  if (fps) wanted['data-fps'] = String(fps);
  for (const [, tag] of html.matchAll(/<div\b([^>]*\bclass="cycle"[^>]*)>/g)) {
    const attribute = name => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
    const sheet = attribute('data-sheet');
    if (!sheet || basename(sheet) !== file) continue;
    const changes = Object.entries(wanted)
      .filter(([name, value]) => attribute(name) !== value)
      .map(([name, value]) => ({ name, from: attribute(name), to: value }));
    return { declared: true, tag, changes };
  }
  return { declared: false, tag: null, changes: Object.entries(wanted).map(([name, value]) => ({ name, from: null, to: value })) };
}

export function applyAttributes(html, { tag, changes }) {
  let replacement = tag;
  for (const change of changes) {
    replacement = replacement.replace(
      new RegExp(`\\b${change.name}="[^"]*"`),
      `${change.name}="${change.to}"`,
    );
  }
  return html.replace(tag, replacement);
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const rows = Math.ceil(options.frames / options.columns);
  const cells = loadCells(options.input, {
    columns: options.columns, rows, frames: options.frames, mask: options.mask, key: options.key,
  }).slice(0, options.frames);

  if (cells.length < options.frames) {
    throw new Error(`${options.input} yields ${cells.length} cells; ${options.frames} frames were asked for.`);
  }
  const filled = cells.filter(one => !one.cell.empty);
  if (!filled.length) throw new Error('Nothing survived the mask: is the key colour right?');

  // One shared scale, from the tallest frame. Scaling per frame is what makes a figure grow and
  // shrink as it walks, and the contract forbids padding or cropping afterwards to hide it.
  const tallest = Math.max(...filled.map(one => one.cell.height));
  const widest = Math.max(...filled.map(one => one.cell.width));
  const scale = Math.min(
    (options.frame.height - MARGIN.top) / tallest,
    (options.frame.width - MARGIN.side) / widest,
  );

  const rendered = cells.map(one =>
    renderFrame(one.image, one.mask, one.cell, { frame: options.frame, scale, mirror: options.mirror }),
  );
  const sheet = assemble(rendered, { frame: options.frame, columns: options.columns });
  const bytes = encodePng(sheet);
  const out = resolve(options.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);

  const { image, colourType, depth } = decodeSheet(bytes);
  const result = checkSheet({
    name: basename(out), image, colourType, depth,
    frames: options.frames, columns: options.columns, frame: options.frame,
  });

  const strip = cells[0];
  const blobs = [];
  if (strip.region.x1 - strip.region.x0 < strip.image.width) {
    for (let row = 0; row < rows; row++) {
      const y0 = Math.floor((row * strip.image.height) / rows);
      const y1 = Math.floor(((row + 1) * strip.image.height) / rows);
      blobs.push(blobsInBand(strip.image, strip.mask, y0, y1));
    }
  }

  const palette = options.palette
    ? paletteReport(image, (() => {
        const loaded = JSON.parse(readFileSync(resolve(options.palette), 'utf8'));
        const colours = { ...(loaded.shared ?? {}), ...(loaded[options.actor] ?? {}) };
        delete colours.sheetBackground;
        return colours;
      })())
    : null;

  const metrics = {
    builtBy: `scripts/art/build-cycle.mjs@${BUILDER_VERSION}`,
    builtAt: new Date().toISOString(),
    input: relativeToRoot(options.input),
    out: relativeToRoot(out),
    actor: options.actor, cycle: options.cycle, facing: options.facing, mirrored: options.mirror,
    grid: `${options.columns}x${rows}`, frames: options.frames,
    frame: `${options.frame.width}x${options.frame.height}`,
    sheet: `${sheet.width}x${sheet.height}`,
    maskSource: strip.maskSource,
    sharedScale: Math.round(scale * 10000) / 10000,
    tallestSource: tallest, widestSource: widest,
    blobsPerRow: blobs,
    cellsFilled: filled.length,
    sourceCells: cells.map(one => ({ index: one.index + 1, from: one.from, ...one.cell })),
    validator: { ok: result.ok, failures: result.failures, stats: result.stats },
    paletteNearPercent: palette,
    motionPhase: 'not verified',
  };
  const metricsPath = resolve(options.metrics ?? join(dirname(out), 'metrics.json'));
  mkdirSync(dirname(metricsPath), { recursive: true });
  writeFileSync(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);

  console.log(`${relativeToRoot(out)}: ${sheet.width}x${sheet.height}, ${options.frames} frames in ${options.columns} columns, mask ${strip.maskSource}`);
  console.log(`  shared scale ${metrics.sharedScale} from a tallest source frame of ${tallest} px`);
  if (blobs.length && blobs.some(count => count !== options.columns)) {
    console.log(`  note: blobs per row ${blobs.join(', ')} — the generator did not draw ${options.columns} separate figures in every row`);
  }
  console.log(`  metrics: ${relativeToRoot(metricsPath)}`);
  if (palette) {
    console.log(`  palette: ${Object.entries(palette).map(([key, value]) => `${key} ${value}%`).join(', ')}`);
  }

  if (!result.ok) {
    for (const failure of result.failures) console.log(`FAIL  ${basename(out)}  ${failure.rule}: ${failure.message}`);
    console.log('The Cycle contract is not relaxed to admit a generation: this strip has to be regenerated.');
    return 1;
  }
  console.log(`PASS  ${basename(out)}  the Cycle contract, mechanically. Motion phase not verified.`);

  const actorsDirectory = join(root, 'public', 'assets', 'actors').replace(/\\/g, '/');
  const inActors = dirname(out).replace(/\\/g, '/') === actorsDirectory;
  if (options.manifest) {
    const provenance = options.provenance === 'auto'
      ? findProvenance(options.input, options.shot)
      : options.provenance
        ? findProvenance(options.provenance, options.shot)
        : null;
    const inputPath = resolve(options.input);
    const source = statSync(inputPath).isDirectory()
      ? { path: relativeToRoot(inputPath), sha256: null, note: 'a directory of single frames; hash each frame there' }
      : { path: relativeToRoot(inputPath), sha256: sha256(inputPath) };
    const entry = provenanceEntry({ out, options, sheet, source, provenance });
    const manifestPath = join(actorsDirectory, 'manifest.json');
    if (inActors && existsSync(manifestPath)) {
      const count = appendToManifest(manifestPath, entry);
      console.log(`  manifest: ${relativeToRoot(manifestPath)} now carries ${count} cycle entr${count === 1 ? 'y' : 'ies'}`);
    } else {
      console.log(`  manifest entry (not written: this sheet is not in public/assets/actors/):`);
      console.log(JSON.stringify(entry, null, 2).split('\n').map(line => `    ${line}`).join('\n'));
    }
  }

  const indexPath = join(root, 'index.html');
  if (existsSync(indexPath)) {
    const html = readFileSync(indexPath, 'utf8');
    const change = attributeChanges(html, {
      file: basename(out), frames: options.frames, columns: options.columns, fps: options.fps,
    });
    if (!change.declared) {
      console.log(`  index.html declares no .cycle layer for ${basename(out)}; one is needed with ${change.changes.map(one => `${one.name}="${one.to}"`).join(' ')}`);
    } else if (!change.changes.length) {
      console.log('  index.html already declares this sheet correctly');
    } else if (options.apply) {
      writeFileSync(indexPath, applyAttributes(html, change));
      console.log(`  index.html updated: ${change.changes.map(one => `${one.name} ${one.from} -> ${one.to}`).join(', ')}`);
    } else {
      console.log(`  index.html needs: ${change.changes.map(one => `${one.name} ${one.from} -> ${one.to}`).join(', ')} (pass --apply)`);
    }
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(`build-cycle: ${error.message}\n`);
    process.exit(2);
  }
}
