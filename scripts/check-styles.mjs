// Source check on `styles.css`. Runs as part of `npm test`.
//
//   node scripts/check-styles.mjs
//
// Two rules that would otherwise only be noticed by eye:
//
//   1. Braces balance. A CSS parser closes an unterminated block at end of
//      file rather than complaining, so an `@media` left open quietly swallows
//      every rule after it and the page loses styling far from the mistake.
//   2. Every rule inside a `prefers-reduced-motion` block is scoped to
//      `:root:not(.motion-on)`. Motion is opt-outable, not merely off: the
//      visitor who turns animation on deliberately must still get it, and an
//      unscoped rule silently takes that away.
//   3. A rule that moves a Door leaf under the pointer says which Door state it
//      applies to. The leaf's angle is the model's answer, painted onto its
//      Room's stage as `data-door`; a hover or focus rule for the same leaf
//      carries an extra component and sits later in the file, so it beats that
//      answer. Ticket 51: pointing at a Door mid-entrance snapped the leaf the
//      Girl was holding open from -68deg back to -20deg with the cats still
//      running through it, and the Cinema Room's door swung on hover although
//      the rule was written for the Game Room's alone.
//
// Both are string rules, so the checker is a pure function over the source and
// `scripts/check-styles.test.mjs` exercises it against fixtures rather than
// against the real file alone.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The scope every reduced-motion rule has to carry. */
export const MOTION_SCOPE = ':root:not(.motion-on)';

/**
 * The source with comments and quoted strings blanked out, same length.
 *
 * Keeping the length means every offset still maps to its original line, so a
 * problem can be reported where the reader will find it.
 */
function blankNoise(css) {
  const out = [...css];
  let at = 0;
  while (at < css.length) {
    const here = css[at];
    if (here === '/' && css[at + 1] === '*') {
      const end = css.indexOf('*/', at + 2);
      const stop = end === -1 ? css.length : end + 2;
      for (let i = at; i < stop; i++) if (out[i] !== '\n') out[i] = ' ';
      at = stop;
      continue;
    }
    if (here === '"' || here === "'") {
      let i = at + 1;
      while (i < css.length && css[i] !== here) {
        if (css[i] === '\\') i += 1;
        if (css[i] === '\n') break;
        i += 1;
      }
      const stop = Math.min(i + 1, css.length);
      for (let j = at; j < stop; j++) if (out[j] !== '\n') out[j] = ' ';
      at = stop;
      continue;
    }
    // An unquoted url(...) may hold braces too, and never holds a real one.
    if (css.startsWith('url(', at)) {
      const end = css.indexOf(')', at + 4);
      const stop = end === -1 ? css.length : end + 1;
      for (let i = at; i < stop; i++) if (out[i] !== '\n') out[i] = ' ';
      at = stop;
      continue;
    }
    at += 1;
  }
  return out.join('');
}

const lineOf = (css, index) => css.slice(0, index).split('\n').length;

/** The index of the `}` closing the `{` at `open`, or -1 if there is none. */
function matchingBrace(clean, open) {
  let depth = 0;
  for (let i = open; i < clean.length; i++) {
    if (clean[i] === '{') depth += 1;
    else if (clean[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Every selector list written directly inside `[from, to)`, with its line. */
function selectorsIn(css, clean, from, to) {
  const found = [];
  let start = from;
  let depth = 0;
  for (let i = from; i < to; i++) {
    const here = clean[i];
    if (here === '{') {
      if (depth === 0) {
        const text = clean.slice(start, i).trim();
        // A nested at-rule (`@supports`, another `@media`) is a block, not a rule.
        if (text && !text.startsWith('@')) found.push({ text, line: lineOf(css, start + clean.slice(start).search(/\S/)) });
      }
      depth += 1;
    } else if (here === '}') {
      depth -= 1;
      if (depth === 0) start = i + 1;
    }
  }
  return found;
}

/** A Door leaf, in either of the two names the apartment's markup gives one. */
const DOOR_LEAF = /\.(?:a-)?door-leaf\b/;

/** The visitor's pointer or focus on the link a leaf hangs inside. */
const POINTED_AT = /:hover\b|:focus(?:-visible|-within)?\b/;

/** A selector that says which Door state it is talking about. */
const DOOR_STATE = /\[data-door[\]=]/;

/** Does this rule move the leaf, rather than outline or light it? */
const SWINGS = /(^|[;{\s])transform\s*:/;

/** Every rule in the sheet that holds declarations, with its line. */
function rulesIn(css, clean) {
  const found = [];
  for (const match of clean.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = match[1];
    const offset = selector.search(/\S/);
    if (offset === -1) continue;
    found.push({ text: selector.trim(), body: match[2], line: lineOf(css, match.index + offset) });
  }
  return found;
}

/**
 * What is wrong with a stylesheet, and how many reduced-motion blocks it has.
 *
 * The count is returned rather than judged: the caller decides whether losing
 * one matters, and the test pins today's number so that losing one is a
 * deliberate edit rather than an accident.
 */
export function checkStylesheet(css) {
  const clean = blankNoise(css);
  const problems = [];

  let depth = 0;
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '{') depth += 1;
    else if (clean[i] === '}') {
      depth -= 1;
      if (depth < 0) {
        problems.push(`line ${lineOf(css, i)}: a closing brace with nothing open.`);
        depth = 0;
      }
    }
  }
  if (depth > 0) problems.push(`${depth} block${depth === 1 ? '' : 's'} left unclosed at the end of the file.`);

  let reducedMotionBlocks = 0;
  for (const match of clean.matchAll(/@media[^{}]*prefers-reduced-motion[^{}]*\{/g)) {
    reducedMotionBlocks += 1;
    const open = match.index + match[0].length - 1;
    const close = matchingBrace(clean, open);
    if (close === -1) continue; // Already reported by the balance rule above.
    for (const selector of selectorsIn(css, clean, open + 1, close)) {
      for (const part of selector.text.split(',')) {
        const one = part.trim();
        if (one && !one.includes(MOTION_SCOPE)) {
          problems.push(`line ${selector.line}: "${one}" is inside a prefers-reduced-motion block but is not scoped to ${MOTION_SCOPE}.`);
        }
      }
    }
  }

  for (const rule of rulesIn(css, clean)) {
    if (!SWINGS.test(rule.body)) continue;
    for (const part of rule.text.split(',')) {
      const one = part.trim();
      if (!DOOR_LEAF.test(one) || !POINTED_AT.test(one) || DOOR_STATE.test(one)) continue;
      problems.push(
        `line ${rule.line}: "${one}" swings a Door leaf under the pointer without saying which Door state it applies to, so it beats the leaf the Cast is holding open. Scope it with [data-door="closed"].`,
      );
    }
  }

  return { problems, reducedMotionBlocks };
}

const entry = fileURLToPath(new URL('', import.meta.url));
if (process.argv[1] === entry) {
  const path = fileURLToPath(new URL('../styles.css', import.meta.url));
  const { problems, reducedMotionBlocks } = checkStylesheet(readFileSync(path, 'utf8'));
  if (problems.length) {
    for (const problem of problems) console.error(`styles.css: ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(`styles.css checked: braces balance, ${reducedMotionBlocks} reduced-motion blocks all scoped.`);
  }
}
