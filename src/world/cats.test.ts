import { describe, expect, it } from 'vitest';

import {
  CAT_IDS,
  ROOM_IDS,
  actorView,
  actorsIn,
  advance,
  createWorld,
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

function cat(world: World, id: CatId): ActorView {
  const view = actorView(world, id);
  if (!view) throw new Error(`${id} should be in the apartment.`);
  return view;
}

function catsIn(world: World, room: RoomId): readonly ActorView[] {
  return actorsIn(world, room).filter(actor => (CAT_IDS as readonly string[]).includes(actor.id));
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
