import { describe, expect, it } from 'vitest';

import {
  actorsIn,
  advance,
  createWorld,
  roomArrivalState,
  roomDoorState,
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

/** The world a moment after the visitor walked through a Door. */
function walkInto(room: string, inputs: WorldInputs = visitor): World {
  return advance(createWorld(inputs), { type: 'hash-changed', hash: `#/${room}` });
}

describe('a Room arrival', () => {
  it('starts the moment the visitor walks through the Door', () => {
    const games = walkInto('games');
    expect(roomArrivalState(games)).toBe('playing');
    // The Room opens empty: nobody is in it until they come through the door.
    expect(actorsIn(games, 'games')).toEqual([]);
    expect(roomDoorState(games, 'games')).toBe('opening');
  });
});
