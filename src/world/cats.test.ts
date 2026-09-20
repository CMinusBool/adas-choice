import { describe, expect, it } from 'vitest';

import {
  BREAKABLE_IDS,
  CAT_CLEARANCE,
  CAT_IDS,
  CAT_MARKS,
  ROOM_IDS,
  actorView,
  actorsIn,
  advance,
  breakableById,
  breakableState,
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

/**
 * Walk the visitor into a Room the way a door link does.
 *
 * 44: and straight past the Room's arrival, which any click or key press ends
 * at once. The three of them run in through the Door now; where they run to is
 * still the marks this file is about, and it is about where they go next.
 */
function walkInto(world: World, room: RoomId): World {
  return advance(advance(world, { type: 'hash-changed', hash: roomHash(room) }), { type: 'visitor-input' });
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
    // Luna's snow globe lives here too (09), so the meows are picked out from
    // whatever else the three of them made happen over that stretch.
    const { heard } = listen(world, 180000);
    const meows = heard.filter(name => name.endsWith('-meow'));
    expect([...new Set(meows)].sort()).toEqual(['luna-meow', 'mica-meow', 'mira-meow']);
    // Occasionally: three cats over three minutes, not a cat every second.
    expect(meows.length).toBeGreaterThan(8);
    expect(meows.length).toBeLessThan(60);
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

describe('a cat and her own Breakable', () => {
  it('gives every Breakable to exactly one cat, and every cat at least one', () => {
    expect(breakableById('entryway-vase').owner).toBe('mica');
    expect(breakableById('cinema-film-can').owner).toBe('mica');
    expect(breakableById('cinema-lucky-cat').owner).toBe('mira');
    expect(breakableById('activity-pencil-mug').owner).toBe('mira');
    expect(breakableById('snow-globe').owner).toBe('luna');
    // Never a Breakable with nobody's name on it, and never a cat left out.
    expect(new Set(BREAKABLE_IDS.map(id => breakableById(id).owner))).toEqual(new Set(CAT_IDS));
  });

  /**
   * The knock mark is the one place a cat stands that the visitor can check
   * against the Room she is standing in, so it has to be on that Room's floor
   * — and three of the five are a roam mark the design note already named.
   */
  it('stands her on her own Room’s floor to reach for it, and never shares a sound', () => {
    for (const id of BREAKABLE_IDS) {
      const breakable = breakableById(id);
      expect(breakable.id).toBe(id);
      expect(isWalkable(breakable.room, breakable.mark)).toBe(true);
      expect(breakable.knockMs).toBeGreaterThan(0);
    }
    expect(new Set(BREAKABLE_IDS.map(id => breakableById(id).sfx)).size).toBe(BREAKABLE_IDS.length);
  });

  it('occasionally knocks her own Breakable down, with its own breaking sound', () => {
    const world = walkInto(createWorld({ ...plainArrival, random: seededRandom(1) }), 'games');
    const { world: after, heard } = listen(world, 60000, 100);
    expect(breakableState(after, 'snow-globe')).toBe('broken');
    expect(heard).toContain('snow-globe-smash');
  });

  /**
   * A fuss ends the errand, not only the walk.
   *
   * Petting a cat on her way to a Breakable used to stop her where she stood
   * and leave the knock running, so the thing went over its whole Beat later
   * with her sitting halfway across the floor. Míca and the hall table's vase
   * are the case the review found, and the hall table is not one of the
   * Entryway's roam marks — the only thing that ever takes her there is a
   * knock, which is what makes the walk below unambiguous.
   */
  it('cannot knock a Breakable down after a hand has stopped her on the way to it', () => {
    const mark = breakableById('entryway-vase').mark;
    const step = 100;
    let now = clock;
    let world = createWorld({ ...plainArrival, random: seededRandom(1) });
    const frames: { world: World; now: number }[] = [];
    while (frames.length < 1200 && breakableState(world, 'entryway-vase') === 'intact') {
      now += step;
      world = advance(world, { type: 'actor-tick', now });
      frames.push({ world, now });
    }
    clock = now;
    expect(breakableState(world, 'entryway-vase')).toBe('broken');

    // The walk that ended on the mark, and the moment half way along it.
    let onMark = frames.length - 1;
    while (onMark > 0 && !cat(frames[onMark - 1].world, 'mica').moving) onMark -= 1;
    let setOff = onMark;
    while (setOff > 0 && cat(frames[setOff - 1].world, 'mica').moving) setOff -= 1;
    expect(cat(frames[onMark].world, 'mica').at).toEqual(mark);
    const midway = frames[Math.floor((setOff + onMark) / 2)];
    expect(cat(midway.world, 'mica').moving).toBe(true);

    // A hand on her mid-errand: she stops where it found her, a Room apart
    // from the hall table.
    const petted = advance(midway.world, { type: 'cat-petted', cat: 'mica', now: midway.now });
    const stopped = cat(petted, 'mica').at;
    expect(isBeingPetted(petted, 'mica')).toBe(true);
    expect(cat(petted, 'mica').moving).toBe(false);
    expect(Math.hypot(stopped.x - mark.x, stopped.y - mark.y)).toBeGreaterThan(CAT_CLEARANCE);

    // The fuss lasts 1.6 s and the vase's Beat 2.3 s, so the break this test
    // exists for landed about 3.9 s after the hand. Ten seconds covers it.
    let after = petted;
    for (let tick = 1; tick <= 100; tick += 1) {
      after = advance(after, { type: 'actor-tick', now: midway.now + tick * step });
      // The one thing that may never happen: it goes over with her elsewhere.
      if (breakableState(after, 'entryway-vase') === 'broken') {
        expect(cat(after, 'mica').at).toEqual(mark);
      }
    }
  });

  it('stays broken for the rest of the visit once it has gone over', () => {
    const world = walkInto(createWorld({ ...plainArrival, random: seededRandom(1) }), 'games');
    const broken = run(world, 60000, 100);
    expect(breakableState(broken, 'snow-globe')).toBe('broken');
    // Another two minutes in the Room does not somehow un-break it, or break
    // it a second time and make a second sound.
    const { world: still, heard } = listen(broken, 120000, 100);
    expect(breakableState(still, 'snow-globe')).toBe('broken');
    expect(heard).not.toContain('snow-globe-smash');
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
