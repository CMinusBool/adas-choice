import { describe, expect, it } from 'vitest';

import {
  ROOM_IDS,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  actorView,
  actorsIn,
  advance,
  createWorld,
  isWalkable,
  seededRandom,
  type ActorView,
  type Point,
  type RoomId,
  type World,
  type WorldInputs,
} from './index';

/** A visitor arriving with nothing stored, no reduced-motion request, no hash. */
const plainArrival: WorldInputs = { hash: '', storedLanguage: null, reducedMotion: false };

/** The demonstration Actor, who the apartment always places. */
function boy(world: World): ActorView {
  const actor = actorView(world, 'boy');
  if (!actor) throw new Error('The Boy should be standing in the Entryway.');
  return actor;
}

/** One clock for the whole file, because a real visit's clock only goes up. */
let clock = 0;

/** Run the clock forward in even steps, as the DOM layer's frame loop does. */
function run(world: World, ms: number, step = 16): World {
  const until = clock + ms;
  let next = world;
  while (clock < until) {
    clock += step;
    next = advance(next, { type: 'actor-tick', now: clock });
  }
  return next;
}

/**
 * Run the clock until something is true of the world, or give up.
 *
 * Stopping on arrival matters: the demonstration Actor sets off again on the
 * next goal the moment he reaches one, so "run for long enough" would sail
 * straight past the thing under test.
 */
function runUntil(world: World, ready: (world: World) => boolean, ms = 60000, step = 16): World {
  const until = clock + ms;
  let next = world;
  while (clock < until && !ready(next)) {
    clock += step;
    next = advance(next, { type: 'actor-tick', now: clock });
  }
  return next;
}

describe('an Actor crossing a Room', () => {
  it('walks from where it stands to the point it is sent to', () => {
    const sent = advance(createWorld(plainArrival), {
      type: 'actor-sent',
      actor: 'boy',
      goal: { x: 1380, y: 680 },
    });
    expect(boy(sent).moving).toBe(true);

    const arrived = runUntil(sent, world => !boy(world).moving);
    expect(boy(arrived).at).toEqual({ x: 1380, y: 680 });
    expect(boy(arrived).progress).toBe(1);
  });

  it('walks around what stands between it and the goal instead of through it', () => {
    // The doorway is a tongue of floor 36 units deep reaching back to the mat,
    // with the wall and the bench beside it (ticket 14's §3.2). A straight line
    // from the mat to the far end of the hall would cross that wall, so the
    // walk has to come down out of the doorway first and turn there.
    const inTheDoorway = advance(createWorld(plainArrival), { type: 'motion-toggled' });
    const onTheMat = advance(inTheDoorway, { type: 'actor-sent', actor: 'boy', goal: { x: 170, y: 612 } });
    const moving = advance(onTheMat, { type: 'motion-toggled' });
    expect(boy(moving).at).toEqual({ x: 170, y: 612 });

    const sent = advance(moving, { type: 'actor-sent', actor: 'boy', goal: { x: 1380, y: 660 } });
    let furthestInTheDoorway = 0;
    const arrived = runUntil(sent, world => {
      const at = boy(world).at;
      if (at.y < 640) furthestInTheDoorway = Math.max(furthestInTheDoorway, at.x);
      return !boy(world).moving;
    });
    expect(boy(arrived).at).toEqual({ x: 1380, y: 660 });
    // He is out of the doorway before its jamb at x 300, not through the wall.
    expect(furthestInTheDoorway).toBeLessThan(310);
  });

  it('reports progress climbing from nothing to the whole route', () => {
    const sent = advance(createWorld(plainArrival), {
      type: 'actor-sent',
      actor: 'boy',
      goal: { x: 1380, y: 690 },
    });
    expect(boy(sent).progress).toBe(0);
    const halfway = runUntil(sent, world => boy(world).progress > 0.5);
    expect(boy(halfway).progress).toBeLessThan(1);
    expect(boy(runUntil(halfway, world => !boy(world).moving)).progress).toBe(1);
  });

  it('turns to face the way it is walking', () => {
    const world = createWorld(plainArrival);
    const rightwards = advance(world, { type: 'actor-sent', actor: 'boy', goal: { x: 1380, y: 690 } });
    expect(boy(run(rightwards, 200)).facing).toBe('right');
    const leftwards = advance(rightwards, { type: 'actor-sent', actor: 'boy', goal: { x: 160, y: 840 } });
    expect(boy(run(leftwards, 200)).facing).toBe('left');
  });

  it('plays a Cycle while it walks and stands still when it arrives', () => {
    const sent = advance(createWorld(plainArrival), {
      type: 'actor-sent',
      actor: 'boy',
      goal: { x: 1380, y: 690 },
      cycle: 'run',
    });
    expect(boy(sent).cycle).toBe('run');
    expect(boy(runUntil(sent, world => !boy(world).moving)).cycle).toBe('idle');
  });
});

describe('staying on the floor', () => {
  /** A point somewhere in a Room's walkable area, by rejection sampling. */
  function somewhereWalkable(room: RoomId, random: () => number): Point {
    for (let attempt = 0; attempt < 500; attempt++) {
      const point = { x: random() * STAGE_WIDTH, y: random() * STAGE_HEIGHT };
      if (isWalkable(room, point)) return point;
    }
    throw new Error(`Could not find a walkable point in the ${room}.`);
  }

  it('never leaves the walkable area, whichever two points in it are picked', () => {
    const random = seededRandom(4242);
    let world = createWorld({ ...plainArrival, random: seededRandom(1) });
    let longest = 0;

    for (let pair = 0; pair < 60; pair++) {
      // Put him down somewhere with motion off, which is an instant move, then
      // turn motion back on and make him walk to the next point.
      const start = somewhereWalkable('entryway', random);
      world = advance(world, { type: 'motion-toggled' });
      world = advance(world, { type: 'actor-sent', actor: 'boy', goal: start });
      world = advance(world, { type: 'motion-toggled' });
      world = advance(world, { type: 'actor-sent', actor: 'boy', goal: somewhereWalkable('entryway', random) });

      let steps = 0;
      world = runUntil(world, next => {
        steps++;
        expect(isWalkable('entryway', boy(next).at)).toBe(true);
        return !boy(next).moving;
      });
      expect(boy(world).moving).toBe(false);
      longest = Math.max(longest, steps);
    }

    // A pair that needed no walking at all would prove nothing about routes.
    expect(longest).toBeGreaterThan(10);
  });

  it('stands the whole Cast on the Entryway floor and nowhere else', () => {
    // Ticket 14 replaced ticket 07's demonstration patrol with the Entryway's
    // settled tableau: everybody is home, on the floor, and at rest. Where each
    // of them stands is that Room's business, and `arrival.test.ts` covers it.
    const world = createWorld(plainArrival);
    expect(actorsIn(world, 'entryway').map(actor => actor.id)).toEqual(['boy', 'girl', 'mica', 'mira', 'luna']);
    for (const actor of actorsIn(world, 'entryway')) {
      expect(isWalkable('entryway', actor.at)).toBe(true);
      expect(actor.moving).toBe(false);
    }
    expect(actorsIn(world, 'cinema')).toEqual([]);
  });

  it('pulls a goal outside the walkable area back onto it', () => {
    const offTheFloor = { x: 800, y: 120 };
    expect(isWalkable('entryway', offTheFloor)).toBe(false);
    const sent = advance(createWorld(plainArrival), { type: 'actor-sent', actor: 'boy', goal: offTheFloor });
    const arrived = runUntil(sent, world => !boy(world).moving);
    expect(isWalkable('entryway', boy(arrived).at)).toBe(true);
    expect(boy(arrived).at).not.toEqual(offTheFloor);
  });
});

describe('the floor every Room stands on', () => {
  /**
   * Every Room's walkable area has to lie inside its own stage.
   *
   * The DOM layer paints an Actor by taking its position as a fraction of the
   * 1600 x 900 stage, so a Room whose floor ran off the stage would put an
   * Actor outside the Room it is standing in. Three of the four floors are
   * placeholders until each Room's design pass replaces them, which is exactly
   * when this is worth having.
   */
  it('never lets a Room be walkable outside its stage', () => {
    for (const room of ROOM_IDS) {
      let inside = 0;
      for (let x = -200; x <= STAGE_WIDTH + 200; x += 20) {
        for (let y = -200; y <= STAGE_HEIGHT + 200; y += 20) {
          const offStage = x < 0 || x > STAGE_WIDTH || y < 0 || y > STAGE_HEIGHT;
          if (offStage) expect(isWalkable(room, { x, y })).toBe(false);
          else if (isWalkable(room, { x, y })) inside++;
        }
      }
      // And a Room with no floor at all would strand anyone sent to it.
      expect(inside).toBeGreaterThan(0);
    }
  });
});

describe('an Actor when the apartment is not allowed to move', () => {
  const askedForStillness: WorldInputs = { ...plainArrival, reducedMotion: true };

  it('takes its destination at once rather than walking to it', () => {
    const world = createWorld(askedForStillness);
    const sent = advance(world, { type: 'actor-sent', actor: 'boy', goal: { x: 1380, y: 690 } });
    expect(sent).not.toBe(world);
    expect(boy(sent).at).toEqual({ x: 1380, y: 690 });
    expect(boy(sent).moving).toBe(false);
    expect(boy(sent).cycle).toBe('idle');
  });

  it('stands still while the clock runs', () => {
    const world = createWorld(askedForStillness);
    expect(run(world, 5000)).toBe(world);
  });

  it('finishes the walk it was on when motion is turned off mid-step', () => {
    const sent = advance(createWorld(plainArrival), {
      type: 'actor-sent',
      actor: 'boy',
      goal: { x: 1380, y: 690 },
    });
    const walking = run(sent, 500);
    expect(boy(walking).moving).toBe(true);
    const stopped = advance(walking, { type: 'motion-toggled' });
    expect(boy(stopped).at).toEqual({ x: 1380, y: 690 });
    expect(boy(stopped).moving).toBe(false);
  });

  it('finishes the walk when the visitor’s system asks for stillness mid-step', () => {
    const sent = advance(createWorld(plainArrival), {
      type: 'actor-sent',
      actor: 'boy',
      goal: { x: 1380, y: 690 },
    });
    const stopped = advance(run(sent, 500), { type: 'reduced-motion-changed', reducedMotion: true });
    expect(boy(stopped).at).toEqual({ x: 1380, y: 690 });
    expect(boy(stopped).moving).toBe(false);
  });

  it('walks again once a reduced-motion visitor turns motion on deliberately', () => {
    const playing = advance(createWorld(askedForStillness), { type: 'motion-toggled' });
    const sent = advance(playing, { type: 'actor-sent', actor: 'boy', goal: { x: 1380, y: 690 } });
    expect(boy(sent).moving).toBe(true);
    expect(boy(run(sent, 200)).cycle).toBe('walk');
  });
});

describe('the world the DOM layer is handed back', () => {
  it('is the same world when a tick moved nothing', () => {
    const paused = advance(createWorld(plainArrival), { type: 'motion-toggled' });
    expect(advance(paused, { type: 'actor-tick', now: clock + 1000 })).toBe(paused);
  });

  it('is the same world when no time has passed since the last tick', () => {
    const sent = advance(createWorld(plainArrival), {
      type: 'actor-sent',
      actor: 'boy',
      goal: { x: 1380, y: 690 },
    });
    const walking = run(sent, 500);
    expect(advance(walking, { type: 'actor-tick', now: clock })).toBe(walking);
  });

  // Sending an Actor the apartment has not placed changes nothing. The Cast is
  // all home from world creation now, so the case where one of them is missing
  // is the Entryway's empty hall: `arrival.test.ts` covers it.
});

describe('the dice the Cast is given', () => {
  it('produces the same stream twice from the same seed', () => {
    const first = seededRandom(99);
    const second = seededRandom(99);
    const stream = Array.from({ length: 12 }, () => first());
    expect(stream).toEqual(Array.from({ length: 12 }, () => second()));
    expect(new Set(stream).size).toBe(12);
    for (const value of stream) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('produces different streams from different seeds', () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });
});
