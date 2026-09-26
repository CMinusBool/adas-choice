import { describe, expect, it } from 'vitest';

import {
  CAT_MARKS,
  STAGES,
  advance,
  breakableById,
  chosenActivity,
  createWorld,
  isWalkable,
  openActivity,
  type WorldInputs,
} from './index';

/** A visitor arriving with nothing stored, no reduced-motion request, no hash. */
const plainArrival: WorldInputs = { hash: '', storedLanguage: null, reducedMotion: false };

/**
 * The Activity Room's floor on its 1328 x 747 stage, design 75 §4.5 (ticket 96).
 *
 * A band from the floor line at y 540 to y 714 with two bites out of its front
 * edge, so an Actor can never stand inside the call corner's stool or the
 * boombox's crate at their true-size footprints. The marks are the design
 * note's, on the new stage, which is what makes this a check of the Room and
 * not of the polygon code.
 */
describe('the Activity Room floor', () => {
  it('is the 1328 x 747 stage', () => {
    expect(STAGES.activities).toEqual({ width: 1328, height: 747 });
  });

  it('holds every Actor mark the Room places', () => {
    // H-Boy, H-Girl, T-hunt, M-mug, the five cat rest marks (the first is the door).
    for (const mark of [
      { x: 602, y: 618 },
      { x: 500, y: 616 },
      { x: 772, y: 624 },
      { x: 477, y: 640 },
      ...CAT_MARKS.activities,
    ]) {
      expect(isWalkable('activities', mark)).toBe(true);
    }
    expect(CAT_MARKS.activities).toEqual([
      { x: 166, y: 549 },
      { x: 330, y: 620 },
      { x: 700, y: 580 },
      { x: 863, y: 681 },
      { x: 1029, y: 581 },
    ]);
  });

  it('stands Mira for her mug under the frame her Beat leaps from', () => {
    // Design 75 R4: the Beat's box puts its paw frame on the mug on the table, which puts
    // frame 1's feet at x 477; she waits on the floor in front of the table below it, and in
    // front of the Girl (y 616), who would otherwise hide her.
    expect(breakableById('activity-pencil-mug').mark).toEqual({ x: 477, y: 640 });
  });

  it('keeps an Actor out of the call corner, and lets one pass in front of the door', () => {
    expect(isWalkable('activities', { x: 200, y: 700 })).toBe(false);
    expect(isWalkable('activities', { x: 120, y: 700 })).toBe(true);
    expect(isWalkable('activities', { x: 200, y: 620 })).toBe(true);
  });

  it('keeps an Actor out of the boombox crate, and lets one stand behind it', () => {
    expect(isWalkable('activities', { x: 1200, y: 680 })).toBe(false);
    expect(isWalkable('activities', { x: 1200, y: 600 })).toBe(true);
  });

  it('stops at the floor line above and the front of the stage below', () => {
    expect(isWalkable('activities', { x: 700, y: 530 })).toBe(false);
    expect(isWalkable('activities', { x: 700, y: 730 })).toBe(false);
  });
});

/**
 * The activity card, from §5.2: one card reused by all three stations, so the
 * model holds which station's card is open rather than the page holding three.
 */
describe('the activity card', () => {
  it('is closed when the visitor arrives', () => {
    expect(openActivity(createWorld(plainArrival))).toBe(null);
  });

  it('opens on the station the visitor asked for', () => {
    const world = advance(createWorld(plainArrival), { type: 'activity-card-opened', activity: 'hunt' });
    expect(openActivity(world)).toBe('hunt');
  });

  it('swaps to another station without closing in between', () => {
    const hunt = advance(createWorld(plainArrival), { type: 'activity-card-opened', activity: 'hunt' });
    expect(openActivity(advance(hunt, { type: 'activity-card-opened', activity: 'map' }))).toBe('map');
  });

  it('closes', () => {
    const hunt = advance(createWorld(plainArrival), { type: 'activity-card-opened', activity: 'hunt' });
    expect(openActivity(advance(hunt, { type: 'activity-card-closed' }))).toBe(null);
  });

  it('costs no repaint when it is told what it already knows', () => {
    const arrived = createWorld(plainArrival);
    expect(advance(arrived, { type: 'activity-card-closed' })).toBe(arrived);
    const hunt = advance(arrived, { type: 'activity-card-opened', activity: 'hunt' });
    expect(advance(hunt, { type: 'activity-card-opened', activity: 'hunt' })).toBe(hunt);
  });
});

/**
 * Picking one for tonight, from §5.1's "Choosing" and §5.3: exactly one
 * station can be chosen, the card leaves with the decision, and the choice
 * lasts the visit rather than the session.
 */
describe('choosing an activity for tonight', () => {
  const arrive = () => createWorld(plainArrival);
  const choose = (world = arrive(), activity: 'draw' | 'hunt' | 'map' = 'draw') =>
    advance(world, { type: 'activity-chosen', activity });

  it('starts the visit with nothing picked', () => {
    expect(chosenActivity(arrive())).toBe(null);
  });

  it('takes the pick, and the card leaves with the decision', () => {
    const open = advance(arrive(), { type: 'activity-card-opened', activity: 'draw' });
    const chosen = choose(open, 'draw');
    expect(chosenActivity(chosen)).toBe('draw');
    expect(openActivity(chosen)).toBe(null);
  });

  it('holds exactly one pick, so a change of mind moves it', () => {
    const changed = choose(choose(arrive(), 'draw'), 'map');
    expect(chosenActivity(changed)).toBe('map');
  });

  it('keeps the pick while the visitor goes and looks at another Room', () => {
    const away = advance(choose(arrive(), 'hunt'), { type: 'hash-changed', hash: '#/cinema' });
    const back = advance(away, { type: 'hash-changed', hash: '#/activities' });
    expect(chosenActivity(back)).toBe('hunt');
  });

  it('forgets the pick on a reload, because only Breakables and the language last that long', () => {
    choose(arrive(), 'hunt');
    expect(chosenActivity(createWorld(plainArrival))).toBe(null);
  });

  it('costs no repaint when the visitor picks what is already picked', () => {
    const chosen = choose(arrive(), 'map');
    expect(advance(chosen, { type: 'activity-chosen', activity: 'map' })).toBe(chosen);
  });
});

/**
 * Putting the pick back, which is ticket 43's third acceptance criterion —
 * "closing it brings them back".
 *
 * Choosing an activity replaces the Boy and the Girl with a painted tableau
 * (`.has-tableau` in `src/dom/activity-room.ts`), and until this existed there
 * was no way back: `withActivityChosen` only ever set, so the two of them were
 * gone for the rest of the visit the moment anything was picked. Changing the
 * pick to another station was the only exit, and that keeps a tableau up.
 */
describe('putting tonight\'s pick back', () => {
  const arrive = () => createWorld(plainArrival);
  const choose = (world = arrive(), activity: 'draw' | 'hunt' | 'map' = 'draw') =>
    advance(world, { type: 'activity-chosen', activity });
  const unchoose = (world: ReturnType<typeof arrive>) => advance(world, { type: 'activity-unchosen' });

  it('gives the Room back when the visitor changes their mind entirely', () => {
    expect(chosenActivity(unchoose(choose(arrive(), 'hunt')))).toBe(null);
  });

  it('leaves the card alone: putting the pick back is not opening anything', () => {
    expect(openActivity(unchoose(choose(arrive(), 'draw')))).toBe(null);
  });

  it('can be picked again afterwards, so this is a toggle and not a one-way door', () => {
    expect(chosenActivity(choose(unchoose(choose(arrive(), 'map')), 'map'))).toBe('map');
  });

  it('costs no repaint when nothing was picked in the first place', () => {
    const nothing = arrive();
    expect(advance(nothing, { type: 'activity-unchosen' })).toBe(nothing);
  });
});
