import { describe, expect, it } from 'vitest';

import {
  CINEMA_MARKS,
  actorView,
  actorsIn,
  advance,
  createWorld,
  isSeated,
  isWalkable,
  type ActorId,
  type ActorView,
  type World,
  type WorldInputs,
} from './index';

/** A visitor arriving with nothing stored, no reduced-motion request, no hash. */
const plainArrival: WorldInputs = { hash: '', storedLanguage: null, reducedMotion: false };

function who(world: World, id: ActorId): ActorView {
  const actor = actorView(world, id);
  if (!actor) throw new Error(`${id} should be standing somewhere.`);
  return actor;
}

/** The world after the visitor walks through the Cinema Room's door. */
function inTheCinema(world: World = createWorld(plainArrival)): World {
  return advance(world, { type: 'hash-changed', hash: '#/cinema' });
}

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

describe('walking into the Cinema Room', () => {
  it('finds the Boy and the Girl already sitting in their beanbags', () => {
    const world = inTheCinema();
    expect(who(world, 'boy').at).toEqual(CINEMA_MARKS.boySeat);
    expect(who(world, 'girl').at).toEqual(CINEMA_MARKS.girlSeat);
    expect(isSeated(world, 'boy')).toBe(true);
    expect(isSeated(world, 'girl')).toBe(true);
  });

  it('turns the two of them a little towards each other', () => {
    const world = inTheCinema();
    expect(who(world, 'boy').facing).toBe('left');
    expect(who(world, 'girl').facing).toBe('right');
  });

  it('seats them for a visitor who arrives at the Cinema Room directly', () => {
    const world = createWorld({ ...plainArrival, hash: '#/cinema' });
    expect(
      actorsIn(world, 'cinema')
        .map(actor => actor.id)
        .sort(),
    ).toEqual(['boy', 'girl']);
    expect(isSeated(world, 'boy')).toBe(true);
  });

  it('has nobody still walking in on arrival', () => {
    for (const actor of actorsIn(inTheCinema(), 'cinema')) expect(actor.moving).toBe(false);
  });

  it('gives the Boy back to the Entryway when the visitor leaves', () => {
    const left = advance(inTheCinema(), { type: 'hash-changed', hash: '#/entryway' });
    expect(who(left, 'boy').room).toBe('entryway');
    expect(isSeated(left, 'boy')).toBe(false);
  });
});
