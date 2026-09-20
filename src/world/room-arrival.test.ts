import { describe, expect, it } from 'vitest';

import {
  actorView,
  actorsIn,
  advance,
  createWorld,
  roomArrivalState,
  roomDoorState,
  type ActorId,
  type RoomId,
  type World,
  type WorldInputs,
} from './index';

/**
 * A Room's arrival: the short entrance every Door plays.
 *
 * The Entryway's own arrival is a different and longer thing, and its promises
 * are `arrival.test.ts`'s. This file is about the other three Rooms, so every
 * visitor here opens the page in a tab that has already been shown the
 * Entryway's — the front door is not what is under test.
 */
const visitor: WorldInputs = { hash: '', storedLanguage: null, reducedMotion: false, arrived: true };

/** One clock for the whole file, because a real visit's clock only goes up. */
let clock = 0;

/** Run the clock forward in even steps, as the DOM layer's frame loop does. */
function run(world: World, seconds: number): World {
  const until = clock + seconds * 1000;
  let next = world;
  while (clock < until) {
    clock += 16;
    next = advance(next, { type: 'actor-tick', now: clock });
  }
  return next;
}

/** The world a moment after the visitor walked through a Door. */
function walkInto(room: RoomId, inputs: WorldInputs = visitor): World {
  return advance(createWorld(inputs), { type: 'hash-changed', hash: `#/${room}` });
}

/** The world `seconds` into a Room's arrival. */
function play(room: RoomId, seconds: number, inputs: WorldInputs = visitor): World {
  return run(walkInto(room, inputs), seconds);
}

/** Who is standing in a Room right now, in the order they came in. */
const whoIsIn = (world: World, room: RoomId) => actorsIn(world, room).map(actor => actor.id);

function who(world: World, id: ActorId) {
  const view = actorView(world, id);
  expect(view, `${id} should be standing in the apartment`).not.toBe(null);
  return view!;
}

describe('a Room arrival', () => {
  it('starts the moment the visitor walks through the Door', () => {
    const games = walkInto('games');
    expect(roomArrivalState(games)).toBe('playing');
    // The Room opens empty: nobody is in it until they come through the door.
    expect(actorsIn(games, 'games')).toEqual([]);
    expect(roomDoorState(games, 'games')).toBe('opening');
  });

  it('opens the Door on the Girl, who stops in it and holds it', () => {
    const held = play('games', 0.35);
    expect(roomDoorState(held, 'games')).toBe('open');
    expect(whoIsIn(held, 'games')).toEqual(['girl']);
    expect(who(held, 'girl').moving).toBe(false);
  });

  it('sends the three cats through the gap ahead of her, at a run', () => {
    const cats = play('games', 0.75);
    expect(whoIsIn(cats, 'games')).toEqual(['girl', 'mica', 'mira', 'luna']);
    for (const cat of ['mica', 'mira', 'luna'] as const) {
      expect(who(cats, cat).cycle, `${cat} bolts through`).toBe('run');
    }
    // She is still holding the Door for them.
    expect(who(cats, 'girl').moving).toBe(false);
  });

  it('brings the Boy in past her, and lets her follow once it is shut', () => {
    const boyIn = play('games', 1.1);
    expect(whoIsIn(boyIn, 'games')).toEqual(['girl', 'mica', 'mira', 'luna', 'boy']);
    expect(who(boyIn, 'boy').moving).toBe(true);
    expect(who(boyIn, 'girl').moving).toBe(false);

    const shut = play('games', 2.2);
    expect(roomDoorState(shut, 'games')).toBe('closed');
    expect(who(shut, 'girl').moving).toBe(true);
  });
});
