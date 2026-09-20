import { describe, expect, it } from 'vitest';

import { advance, chosenActivity, createWorld, isWalkable, openActivity, type WorldInputs } from './index';

/** A visitor arriving with nothing stored, no reduced-motion request, no hash. */
const plainArrival: WorldInputs = { hash: '', storedLanguage: null, reducedMotion: false };

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
