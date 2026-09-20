import { describe, expect, it } from 'vitest';

import {
  CAT_CLEARANCE,
  CAT_IDS,
  CAT_MARKS,
  ROOM_IDS,
  actorView,
  actorsIn,
  advance,
  catSfx,
  createWorld,
  isBeingPetted,
  isWalkable,
  pettingBeat,
  roomHash,
  seededRandom,
  type ActorView,
  type CatId,
  type RoomId,
  type World,
  type WorldInputs,
} from './index';

/**
 * The three cats, roaming.
 *
 * Everything asserted here is read off the world model's public surface: where
 * a cat is standing, whether it is moving, what the apartment asked to be
 * heard. Nothing reaches into how any of it is stored, and time and dice enter
 * the way they do in the real visit — as a `now` on a tick and a seeded source
 * handed in at creation.
 */

/** A visitor who has already had the arrival, so the hall is settled at once. */
const plainArrival: WorldInputs = { hash: '', storedLanguage: null, reducedMotion: false, arrived: true };

/** One clock for the whole file, because a real visit's clock only goes up. */
let clock = 0;

function run(world: World, ms: number, step = 16): World {
  const until = clock + ms;
  let next = world;
  while (clock < until) {
    clock += step;
    next = advance(next, { type: 'actor-tick', now: clock });
  }
  return next;
}

/** Walk the visitor into a Room the way a door link does. */
function walkInto(world: World, room: RoomId): World {
  return advance(world, { type: 'hash-changed', hash: roomHash(room) });
}

function catsIn(world: World, room: RoomId): readonly ActorView[] {
  return actorsIn(world, room).filter(actor => (CAT_IDS as readonly string[]).includes(actor.id));
}

function cat(world: World, id: CatId): ActorView {
  const view = actorView(world, id);
  if (!view) throw new Error(`${id} should be in the apartment.`);
  return view;
}

function runUntil(world: World, ready: (world: World) => boolean, ms = 60000, step = 16): World {
  const until = clock + ms;
  let next = world;
  while (clock < until && !ready(next)) {
    clock += step;
    next = advance(next, { type: 'actor-tick', now: clock });
  }
  return next;
}

/**
 * Every sound the apartment made over a stretch of clock.
 *
 * A meow is named on the tick that crosses it and forgotten on the next one, so
 * anything that listens less often than the frame loop does hears almost none
 * of them — which is exactly what the DOM layer must not do either.
 */
function listen(world: World, ms: number, step = 16): { world: World; heard: string[] } {
  const until = clock + ms;
  const heard: string[] = [];
  let next = world;
  while (clock < until) {
    clock += step;
    next = advance(next, { type: 'actor-tick', now: clock });
    heard.push(...catSfx(next));
  }
  return { world: next, heard };
}

/**
 * Where one cat comes to rest, over and over: its route through the Room.
 *
 * Each entry is a place it stopped, so two visits that produce the same list
 * are two visits it walked the same path on.
 */
function wanderings(world: World, id: CatId, stops: number): { world: World; route: string[] } {
  const route: string[] = [];
  let next = world;
  for (let stop = 0; stop < stops; stop++) {
    next = runUntil(next, candidate => cat(candidate, id).moving, 30000);
    next = runUntil(next, candidate => !cat(candidate, id).moving, 30000);
    const at = cat(next, id).at;
    route.push(`${Math.round(at.x)},${Math.round(at.y)}`);
  }
  return { world: next, route };
}

describe('the three cats following the visitor', () => {
  it('has all three of them in whichever Room the visitor walks into', () => {
    let world = createWorld(plainArrival);
    for (const room of ROOM_IDS) {
      world = walkInto(world, room);
      expect(catsIn(world, room).map(actor => actor.id)).toEqual([...CAT_IDS]);
      // And nowhere else: three cats, not three per Room.
      for (const other of ROOM_IDS) if (other !== room) expect(catsIn(world, other)).toEqual([]);
    }
  });

  it('brings them into the Room the visitor opens the page in', () => {
    const world = createWorld({ ...plainArrival, hash: '#/cinema', random: seededRandom(7) });
    expect(catsIn(world, 'cinema').map(actor => actor.id)).toEqual([...CAT_IDS]);
  });
});

describe('a cat roaming the Room it is in', () => {
  it('sets off across the floor without being sent anywhere', () => {
    let world = walkInto(createWorld({ ...plainArrival, random: seededRandom(11) }), 'games');
    const start = cat(world, 'mica').at;
    world = runUntil(world, next => cat(next, 'mica').moving, 20000);
    expect(cat(world, 'mica').moving).toBe(true);
    world = runUntil(world, next => !cat(next, 'mica').moving, 20000);
    expect(cat(world, 'mica').at).not.toEqual(start);
  });

  it('never leaves the Room’s walkable floor on the way', () => {
    let world = walkInto(createWorld({ ...plainArrival, random: seededRandom(5) }), 'activities');
    for (let beat = 0; beat < 400; beat++) {
      world = run(world, 100);
      for (const actor of catsIn(world, 'activities')) {
        expect(isWalkable('activities', actor.at)).toBe(true);
      }
    }
  });

  it('takes a different route on a repeat visit rather than looping one path', () => {
    let world = createWorld({ ...plainArrival, random: seededRandom(2026) });
    const routes: string[] = [];
    for (let visit = 0; visit < 4; visit++) {
      world = walkInto(world, 'cinema');
      const wandered = wanderings(world, 'mira', 4);
      world = walkInto(wandered.world, 'entryway');
      routes.push(wandered.route.join(' → '));
    }
    expect(new Set(routes).size).toBeGreaterThan(1);
  });

  it('visits more than a pair of marks rather than pacing between two', () => {
    const world = walkInto(createWorld({ ...plainArrival, random: seededRandom(88) }), 'games');
    const { route } = wanderings(world, 'luna', 8);
    expect(new Set(route).size).toBeGreaterThan(2);
  });

  it('holds still for a visitor who asked the apartment not to move', () => {
    const world = walkInto(createWorld({ ...plainArrival, reducedMotion: true }), 'games');
    const still = run(world, 40000);
    expect(still).toBe(world);
  });
});

describe('a cat making itself heard', () => {
  it('meows now and then, and the three never share one sample', () => {
    const world = walkInto(createWorld({ ...plainArrival, random: seededRandom(404) }), 'games');
    // Three minutes in one Room, listened to the way the frame loop listens.
    const { heard } = listen(world, 180000);
    expect([...new Set(heard)].sort()).toEqual(['luna-meow', 'mica-meow', 'mira-meow']);
    // Occasionally: three cats over three minutes, not a cat every second.
    expect(heard.length).toBeGreaterThan(8);
    expect(heard.length).toBeLessThan(60);
  });

  it('says nothing at all on a tick that crossed no meow', () => {
    const world = walkInto(createWorld({ ...plainArrival, random: seededRandom(6) }), 'cinema');
    expect(catSfx(run(world, 32))).toEqual([]);
  });
});

describe('a cat being fussed over', () => {
  /** A visitor in the Cinema Room with the cats settled in it. */
  function inTheCinema(seed = 77): World {
    return run(walkInto(createWorld({ ...plainArrival, random: seededRandom(seed) }), 'cinema'), 3000);
  }

  it('stops where it stands, meows, and plays its own petting Beat', () => {
    const world = inTheCinema();
    const before = cat(world, 'mica').at;
    const petted = advance(world, { type: 'cat-petted', cat: 'mica', now: clock });
    expect(catSfx(petted)).toEqual(['mica-meow']);
    expect(isBeingPetted(petted, 'mica')).toBe(true);
    expect(cat(petted, 'mica').moving).toBe(false);
    expect(cat(petted, 'mica').at).toEqual(before);
    expect(pettingBeat('mica')).toBe('pet-mica');
    // And the other two carry on with their afternoon.
    expect(isBeingPetted(petted, 'mira')).toBe(false);
  });

  it('holds the fuss for its whole Beat and then wanders off again', () => {
    let world = advance(inTheCinema(), { type: 'cat-petted', cat: 'luna', now: clock });
    const at = cat(world, 'luna').at;
    world = run(world, 800);
    expect(isBeingPetted(world, 'luna')).toBe(true);
    expect(cat(world, 'luna').at).toEqual(at);
    world = run(world, 2400);
    expect(isBeingPetted(world, 'luna')).toBe(false);
    world = runUntil(world, next => cat(next, 'luna').moving, 20000);
    expect(cat(world, 'luna').moving).toBe(true);
  });

  it('answers a visitor who asked the apartment to hold still with the meow alone', () => {
    const still = walkInto(createWorld({ ...plainArrival, reducedMotion: true }), 'games');
    const petted = advance(still, { type: 'cat-petted', cat: 'mira', now: clock });
    expect(catSfx(petted)).toEqual(['mira-meow']);
    // No Beat, because a Beat is motion; and nothing left ticking to end it.
    expect(isBeingPetted(petted, 'mira')).toBe(false);
  });

  it('cannot be fussed over before it is out of the backpack', () => {
    // The arrival opens on an empty hall: nobody is home to be petted yet.
    const arriving = advance(createWorld({ hash: '', storedLanguage: null, reducedMotion: false }), {
      type: 'arrival-started',
    });
    expect(catsIn(arriving, 'entryway')).toEqual([]);
    expect(advance(arriving, { type: 'cat-petted', cat: 'mica', now: clock })).toBe(arriving);
  });
});

describe('the marks a Room offers a cat', () => {
  /**
   * The geometry that makes "two cats never settle on the same mark" true.
   *
   * Five marks a Room, every pair further apart than a cat is wide, is what
   * leaves a third cat somewhere to go however the other two are standing. A
   * Room re-marked one day breaks this test before it breaks the apartment.
   */
  it('gives every Room five marks on its own floor, none within a cat of another', () => {
    for (const room of ROOM_IDS) {
      const marks = CAT_MARKS[room];
      expect(marks.length).toBe(5);
      for (const mark of marks) expect(isWalkable(room, mark)).toBe(true);
      for (const one of marks) {
        for (const other of marks) {
          if (one === other) continue;
          expect(Math.hypot(one.x - other.x, one.y - other.y)).toBeGreaterThan(CAT_CLEARANCE);
        }
      }
    }
  });
});

describe('the cats never standing on top of each other', () => {
  it('keeps them apart wherever the visitor finds them and wherever they walk', () => {
    let world = createWorld({ ...plainArrival, random: seededRandom(31) });
    for (let visit = 0; visit < 6; visit++) {
      for (const room of ROOM_IDS) {
        world = walkInto(world, room);
        for (let beat = 0; beat < 40; beat++) {
          world = run(world, 250);
          const settled = catsIn(world, room).filter(actor => !actor.moving);
          for (const one of settled) {
            for (const other of settled) {
              if (one.id === other.id) continue;
              expect(Math.hypot(one.at.x - other.at.x, one.at.y - other.at.y)).toBeGreaterThan(100);
            }
          }
        }
      }
    }
  });
});
