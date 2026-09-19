import { describe, expect, it } from 'vitest';

import {
  ENTRYWAY_MARKS,
  actorView,
  actorsIn,
  advance,
  createWorld,
  type ActorId,
  type World,
  type WorldInputs,
} from './index';

/** A visitor who opens the page on the Entryway with nothing stored. */
const plainArrival: WorldInputs = { hash: '', storedLanguage: null, reducedMotion: false };

/** Where everyone stands once the arrival is over — design note §5.4. */
const TABLEAU: ReadonlyArray<readonly [ActorId, { x: number; y: number }]> = [
  ['boy', ENTRYWAY_MARKS.BS],
  ['girl', ENTRYWAY_MARKS.GS],
  ['mica', ENTRYWAY_MARKS.EMica],
  ['mira', ENTRYWAY_MARKS.EMira],
  ['luna', ENTRYWAY_MARKS.ELuna],
];

function standsAt(world: World, actor: ActorId, point: { x: number; y: number }) {
  const view = actorView(world, actor);
  expect(view, `${actor} should be standing in the Entryway`).not.toBe(null);
  expect(view!.at).toEqual(point);
  expect(view!.moving).toBe(false);
  expect(view!.room).toBe('entryway');
}

describe('the settled tableau', () => {
  it('is where the whole Cast stands before the arrival has played', () => {
    const world = createWorld(plainArrival);
    for (const [actor, mark] of TABLEAU) standsAt(world, actor, mark);
    expect(actorsIn(world, 'entryway')).toHaveLength(5);
  });

  it('faces the Boy left and the Girl right, as the tableau describes them', () => {
    const world = createWorld(plainArrival);
    expect(actorView(world, 'boy')!.facing).toBe('left');
    expect(actorView(world, 'girl')!.facing).toBe('right');
  });

  it('is what a visitor who opens the page in another Room comes home to', () => {
    const world = createWorld({ ...plainArrival, hash: '#/cinema' });
    for (const [actor, mark] of TABLEAU) standsAt(world, actor, mark);
    const entryway = advance(world, { type: 'hash-changed', hash: '#/entryway' });
    for (const [actor, mark] of TABLEAU) standsAt(entryway, actor, mark);
  });
});
