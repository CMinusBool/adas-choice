import { describe, expect, it } from 'vitest';

import {
  ARRIVAL_SECONDS,
  ENTRYWAY_MARKS,
  actorView,
  actorsIn,
  advance,
  arrivalView,
  createWorld,
  entrywayProps,
  type ActorId,
  type World,
  type WorldInputs,
} from './index';

/** A visitor who opens the page on the Entryway with nothing stored. */
const plainArrival: WorldInputs = { hash: '', storedLanguage: null, reducedMotion: false };

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

/** The world once the arrival has been started and has played for `seconds`. */
function arriving(seconds: number, inputs: WorldInputs = plainArrival): World {
  return run(advance(createWorld(inputs), { type: 'arrival-started' }), seconds);
}

/** Who is standing in the Entryway right now, in the order they arrived. */
const whoIsHome = (world: World) => actorsIn(world, 'entryway').map(actor => actor.id);

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
    expect(arrivalView(world).state).toBe('done');
    for (const [actor, mark] of TABLEAU) standsAt(world, actor, mark);
    const entryway = advance(world, { type: 'hash-changed', hash: '#/entryway' });
    for (const [actor, mark] of TABLEAU) standsAt(entryway, actor, mark);
  });
});

describe('the arrival', () => {
  it('opens on an empty hall', () => {
    const world = advance(createWorld(plainArrival), { type: 'arrival-started' });
    expect(arrivalView(world).state).toBe('playing');
    expect(whoIsHome(world)).toEqual([]);
    expect(entrywayProps(world).frontDoor).toBe('closed');
    expect(entrywayProps(world).backpack).toBe('carried');
  });

  it('is the same world when an Actor still in the backpack is sent somewhere', () => {
    const world = advance(createWorld(plainArrival), { type: 'arrival-started' });
    expect(actorView(world, 'luna')).toBe(null);
    expect(advance(world, { type: 'actor-sent', actor: 'luna', goal: ENTRYWAY_MARKS.K })).toBe(world);
  });

  it('brings the Girl in first and the Boy after her, through the open door', () => {
    const opened = arriving(1.2);
    expect(entrywayProps(opened).frontDoor).not.toBe('closed');
    expect(whoIsHome(opened)).toEqual([]);

    const sheIsIn = arriving(2.0);
    expect(whoIsHome(sheIsIn)).toEqual(['girl']);
    expect(actorView(sheIsIn, 'girl')!.moving).toBe(true);

    const bothIn = arriving(2.4);
    expect(whoIsHome(bothIn)).toEqual(['girl', 'boy']);
    // He comes in behind her, from the same mat, and is on his way across.
    expect(actorView(bothIn, 'boy')!.facing).toBe('right');
    expect(actorView(bothIn, 'boy')!.moving).toBe(true);
    expect(actorView(bothIn, 'boy')!.progress).toBeLessThan(0.2);
  });

  it('shuts the front door behind them', () => {
    expect(entrywayProps(arriving(4.5)).frontDoor).toBe('closed');
  });

  it('sets the backpack down, then takes both coats off and hangs them', () => {
    expect(entrywayProps(arriving(5)).backpack).toBe('closed');
    expect(entrywayProps(arriving(5)).girlCoat).toBe('worn');
    expect(entrywayProps(arriving(7)).girlCoat).toBe('hung');
    expect(entrywayProps(arriving(7.9)).backpack).toBe('open');
    expect(entrywayProps(arriving(8.2)).boyParka).toBe('hung');
  });

  it('lets all three cats out, one at a time, each to its own mark', () => {
    expect(whoIsHome(arriving(9))).toEqual(['girl', 'boy']);

    const mica = arriving(9.5);
    expect(actorView(mica, 'mica')!.at).toEqual(ENTRYWAY_MARKS.EMica);
    expect(actorView(mica, 'mica')!.facing).toBe('left');
    expect(actorView(mica, 'mira')).toBe(null);

    const mira = arriving(10.5);
    expect(actorView(mira, 'mira')!.at).toEqual(ENTRYWAY_MARKS.EMira);
    expect(actorView(mira, 'luna')).toBe(null);

    const luna = arriving(11.9);
    expect(actorView(luna, 'luna')!.at).toEqual(ENTRYWAY_MARKS.ELuna);
    expect(actorView(luna, 'luna')!.facing).toBe('left');
  });

  it('ends on the settled tableau, and stays there', () => {
    const settled = arriving(ARRIVAL_SECONDS + 1);
    expect(arrivalView(settled).state).toBe('done');
    for (const [actor, mark] of TABLEAU) standsAt(settled, actor, mark);
    expect(actorView(settled, 'boy')!.facing).toBe('left');
    expect(entrywayProps(settled)).toEqual({
      frontDoor: 'closed',
      backpack: 'open',
      girlCoat: 'hung',
      boyParka: 'hung',
    });
  });

  it('does not play again once it is done', () => {
    const settled = arriving(ARRIVAL_SECONDS + 1);
    expect(advance(settled, { type: 'arrival-started' })).toBe(settled);
  });
});
