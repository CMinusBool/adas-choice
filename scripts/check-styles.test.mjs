// Tests for the stylesheet source check.
//
//   node --test scripts/check-styles.test.mjs      (also runs as part of `npm test`)
//
// Two rules no compiler in this repository can see.
//
// A CSS parser closes an unterminated block at end of file rather than
// complaining, so an `@media` left open silently swallows every rule after it.
// Three breakages in the apartment's build came from a shared trailing brace,
// and two of them surfaced only when a later merge tripped over them.
//
// And the rule that every `prefers-reduced-motion` block is scoped to
// `:root:not(.motion-on)` is a convention nothing else enforces. An unscoped
// one takes away the visitor's explicit "play it anyway", which is the whole
// point of keeping motion opt-outable rather than merely off.
//
// Ticket 51 adds a third. A Door leaf takes its angle from the model, through
// `data-door` on its Room's stage, and a hover rule for the same leaf that does
// not say which Door state it applies to wins on specificity and order — so
// pointing at a Door during an entrance snapped the leaf the Girl was holding
// open back to its hover angle while the cats were still running through it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { checkStylesheet } from './check-styles.mjs';

const problemsIn = css => checkStylesheet(css).problems;

test('a balanced stylesheet has nothing to report', () => {
  assert.deepEqual(problemsIn('.a { color: red; }\n@media (min-width: 40em) { .b { color: blue; } }\n'), []);
});

test('an @media block left unclosed is reported', () => {
  const css = '@media (min-width: 40em) {\n  .a { color: red; }\n\n.b { color: blue; }\n';
  const problems = problemsIn(css);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /unclosed/i);
});

test('a closing brace with nothing open is reported, with its line', () => {
  const problems = problemsIn('.a { color: red; }\n}\n.b { color: blue; }\n');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /line 2\b/);
});

test('braces inside comments, quotes and url() are not counted', () => {
  const css = [
    '/* a comment with { and { and } in it */',
    '.a { content: "a string with { in it"; }',
    ".b { background: url('pic{1}.png'); }",
    '.c::after { content: \'}\'; }',
  ].join('\n');
  assert.deepEqual(problemsIn(css), []);
});

test('a reduced-motion rule that is not scoped to the visitor’s choice is reported, naming the selector', () => {
  const css = '@media (prefers-reduced-motion: reduce) {\n  .bumper { animation: none; }\n}\n';
  const problems = problemsIn(css);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /\.bumper/);
  assert.match(problems[0], /:root:not\(\.motion-on\)/);
});

test('every part of a scoped selector list is accepted', () => {
  const css = [
    '@media (prefers-reduced-motion: reduce) {',
    '  :root:not(.motion-on) .a, :root:not(.motion-on) .b::after { animation: none; }',
    '}',
    '@media (prefers-reduced-motion: reduce) { :root:not(.motion-on) .c { transition: none; } }',
  ].join('\n');
  assert.deepEqual(problemsIn(css), []);
});

test('one unscoped part of an otherwise scoped selector list is still reported', () => {
  const css = '@media (prefers-reduced-motion: reduce) {\n  :root:not(.motion-on) .a, .b { animation: none; }\n}\n';
  assert.equal(problemsIn(css).length, 1);
});

test('the stylesheet reports how many reduced-motion blocks it found, so a lost one shows up', () => {
  const css = '@media (prefers-reduced-motion: reduce) { :root:not(.motion-on) .a { transition: none; } }\n';
  assert.equal(checkStylesheet(css).reducedMotionBlocks, 1);
});

test('a Door leaf swung under the pointer without a Door state is reported', () => {
  const problems = problemsIn('.stage a:hover .door-leaf { transform: perspective(600px) rotateY(-20deg); }\n');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /\.door-leaf/);
  assert.match(problems[0], /data-door/);
});

test('the same rule scoped to a shut Door is accepted', () => {
  const css = '.stage[data-door="closed"] .prop-door:hover .door-leaf { transform: rotateY(-20deg); }\n';
  assert.deepEqual(problemsIn(css), []);
});

test('a Door leaf rule that does not move the leaf is left alone', () => {
  assert.deepEqual(problemsIn('.cinema-door:focus-visible .door-leaf { outline: 3px solid pink; }\n'), []);
});

test('the Activity Room’s own leaf is held to the same rule', () => {
  assert.equal(problemsIn('.stage a:hover .a-door-leaf { transform: rotateY(-20deg); }\n').length, 1);
});

test("the apartment's own styles.css passes all three rules", () => {
  const css = readFileSync(fileURLToPath(new URL('../styles.css', import.meta.url)), 'utf8');
  const report = checkStylesheet(css);
  assert.deepEqual(report.problems, []);
  // Five as of ticket 37; a block gained or lost is a deliberate change, not a slip.
  assert.equal(report.reducedMotionBlocks, 4);
});
