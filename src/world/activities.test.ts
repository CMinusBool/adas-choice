import { describe, expect, it } from 'vitest';

import { isWalkable } from './index';

/**
 * The Activity Room's floor, from `design/12-activity-room.md` §4.2.
 *
 * A band from y 650 to y 860 with two bites out of its front edge, so an Actor
 * can never stand inside the call corner's stool or the boombox's crate. The
 * marks below are the design note's own (§4.3), which is what makes this a
 * check of the Room and not of the polygon code.
 */
describe('the Activity Room floor', () => {
  it('holds every Actor mark the design note places in the Room', () => {
    // H-Boy, H-Girl, T-hunt, M-mug, R-stool, R-rug, R-desk, D-door.
    for (const mark of [
      { x: 868, y: 744 },
      { x: 762, y: 742 },
      { x: 930, y: 752 },
      { x: 620, y: 690 },
      { x: 370, y: 724 },
      { x: 1040, y: 820 },
      { x: 1240, y: 700 },
      { x: 150, y: 662 },
    ]) {
      expect(isWalkable('activities', mark)).toBe(true);
    }
  });

  it('keeps an Actor out of the call corner, and lets one pass in front of the door', () => {
    expect(isWalkable('activities', { x: 250, y: 800 })).toBe(false);
    expect(isWalkable('activities', { x: 150, y: 800 })).toBe(true);
    expect(isWalkable('activities', { x: 250, y: 700 })).toBe(true);
  });

  it('keeps an Actor out of the boombox crate, and lets one stand behind it', () => {
    expect(isWalkable('activities', { x: 1450, y: 800 })).toBe(false);
    expect(isWalkable('activities', { x: 1450, y: 700 })).toBe(true);
  });

  it('stops at the floor line above and the front of the stage below', () => {
    expect(isWalkable('activities', { x: 800, y: 600 })).toBe(false);
    expect(isWalkable('activities', { x: 800, y: 880 })).toBe(false);
  });
});
