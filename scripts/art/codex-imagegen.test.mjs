// The parts of the art toolchain that can be proved without spending a generation: slot
// substitution, event parsing, the key-colour choice and the contact sheet's downscale. The
// generation call itself is proved by running it; see the effort's run logs.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fillSlots, readEvents, parseArguments, resolveCodex } from './codex-imagegen.mjs';
import { chooseKey, parseHex, paletteColours, drawGuide, parseArguments as guideArguments } from './make-guide.mjs';
import { downscale } from './make-contact-sheet.mjs';
import { blank } from '../png.mjs';

test('fillSlots substitutes every named slot', () => {
  const filled = fillSlots('anchor {{REF_1}}, guide {{REF_2}}, copy to {{OUTPUT_PATH}}', {
    REF_1: 'a.png', REF_2: 'b.png', OUTPUT_PATH: 'c.png',
  });
  assert.equal(filled, 'anchor a.png, guide b.png, copy to c.png');
});

test('fillSlots refuses a prompt that still has holes in it', () => {
  // A template slot that reaches the image model as literal braces is a wasted generation.
  assert.throws(() => fillSlots('facing {{FACING}} at {{OUTPUT_PATH}}', { OUTPUT_PATH: 'c.png' }), /FACING/);
});

test('parseArguments requires a prompt and an output directory, and a plain run id', () => {
  assert.throws(() => parseArguments(['--out-dir', 'x']), /--prompt/);
  assert.throws(() => parseArguments(['--prompt', 'p', '--out-dir', 'x', '--run-id', '../escape']), /run-id/);
  const options = parseArguments(['--prompt', 'p', '--out-dir', 'x', '--ref', 'a', '--ref', 'b']);
  assert.deepEqual(options.refs, ['a', 'b']);
  assert.equal(options.runId, 'attempt-1');
});

test('readEvents finds the thread, the usage block and the source path under CODEX_HOME', () => {
  const source = 'C:\\Users\\someone\\.codex\\generated_images\\01a0-thread\\exec-abc.png';
  const stream = [
    JSON.stringify({ type: 'thread.started', thread_id: '01a0-thread' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: `${source}\nelsewhere.png\nI see 8 figures.` } }),
    'not json at all',
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 91080, output_tokens: 1921 } }),
  ].join('\n');
  const events = readEvents(stream);
  assert.equal(events.threadId, '01a0-thread');
  assert.equal(events.usage.input_tokens, 91080);
  assert.equal(events.sourcePath, source);
});

test('readEvents survives a turn that generated nothing', () => {
  const events = readEvents(JSON.stringify({ type: 'thread.started', thread_id: 't' }));
  assert.equal(events.sourcePath, null);
  assert.equal(events.usage, null);
});

test('resolveCodex never returns a bare .cmd for Node to choke on', () => {
  const resolved = resolveCodex('/somewhere/codex');
  assert.equal(resolved.command, '/somewhere/codex');
  assert.deepEqual(resolved.prefix, []);
});

test('the key colour stays green for a palette with no green in it', () => {
  const palette = { boy: { hoodie: '#D76451', trousers: '#3C3B40' }, shared: { outline: '#3B2B27' } };
  assert.equal(chooseKey(paletteColours(palette, 'boy')).hex, '#00FF00');
});

test('the key colour moves off green for an Actor who wears it', () => {
  const palette = { frog: { coat: '#20F020' }, shared: {} };
  const chosen = chooseKey(paletteColours(palette, 'frog'));
  assert.notEqual(chosen.hex, '#00FF00');
});

test('parseHex rejects anything that is not a six-digit colour', () => {
  assert.deepEqual(parseHex('#00FF00'), [0, 255, 0]);
  assert.throws(() => parseHex('green'), /hex/);
});

test('the guide divides evenly or refuses to be drawn', () => {
  assert.throws(() => guideArguments(['--out', 'g.png', '--cols', '5']), /divide evenly/);
});

test('the guide paints the key colour and one ground line per cell', () => {
  const image = drawGuide({ width: 256, height: 128, cols: 4, rows: 2, ground: 8, key: [0, 255, 0], dots: false });
  const at = (x, y) => [...image.data.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 4)];
  assert.deepEqual(at(8, 8), [0, 255, 0, 255], 'the inside of a cell is key colour');
  assert.deepEqual(at(0, 0), [0x33, 0x33, 0x33, 255], 'the cell border is ink');
  assert.deepEqual(at(32, 56), [0x33, 0x33, 0x33, 255], 'the ground line sits 8 px above the cell bottom');
});

test('downscale keeps the aspect and un-premultiplies back to the original colour', () => {
  const image = blank(8, 4);
  image.data.fill(0);
  for (let index = 0; index < 8 * 4; index++) {
    image.data[index * 4] = 200; image.data[index * 4 + 1] = 100;
    image.data[index * 4 + 2] = 50; image.data[index * 4 + 3] = 255;
  }
  const small = downscale(image, 4);
  assert.equal(small.width, 4);
  assert.equal(small.height, 2);
  assert.deepEqual([...small.data.subarray(0, 4)], [200, 100, 50, 255]);
});

test('downscale leaves an image that is already small enough alone', () => {
  const image = blank(4, 4);
  assert.equal(downscale(image, 16), image);
});
