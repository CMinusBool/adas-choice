import { describe, expect, it } from 'vitest';

import { isWalkable } from './index';

describe('the Cinema Room floor', () => {
  it('opens the whole band between the screen and the board', () => {
    expect(isWalkable('cinema', { x: 120, y: 700 })).toBe(true);
    expect(isWalkable('cinema', { x: 1540, y: 850 })).toBe(true);
    expect(isWalkable('cinema', { x: 800, y: 660 })).toBe(true);
  });

  it('keeps the Cast out of the reel cabinet', () => {
    // The notch the cabinet stands in: an Actor may pass behind it but never
    // through it, so the Prop and the floor agree about where the furniture is.
    expect(isWalkable('cinema', { x: 500, y: 800 })).toBe(false);
    expect(isWalkable('cinema', { x: 500, y: 700 })).toBe(true);
    expect(isWalkable('cinema', { x: 612, y: 850 })).toBe(true);
  });
});
