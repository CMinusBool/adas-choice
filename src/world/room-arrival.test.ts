import { describe, expect, it } from 'vitest';

import {
  ROOM_ARRIVAL_SECONDS,
  actorView,
  actorsIn,
  advance,
  apartmentNeedsClock,
  createWorld,
  roomArrivalSfx,
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
    // The door mark in front of the narrowed doorway (design 75 §4.1, ticket 89).
    expect(who(held, 'girl').at).toEqual({ x: 130, y: 583 });
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

/**
 * Where each Room's design note puts the two of them once they are in.
 *
 * Taken from the notes rather than from `HOMES`, so that these are a check of
 * the table as well as of the arrival that walks the Cast to it. The Game
 * Room's pair are the seated marks since S09 and S10 landed (ticket 34), and
 * design 75 §4.3's on the 1408 x 792 stage since ticket 89.
 */
const MARKS: Readonly<Record<'games' | 'cinema' | 'activities', Readonly<Record<'boy' | 'girl', readonly [number, number, 'left' | 'right']>>>> = {
  games: { boy: [774, 682, 'left'], girl: [546, 686, 'right'] },
  cinema: { boy: [590, 624, 'left'], girl: [250, 624, 'right'] },
  activities: { boy: [602, 618, 'left'], girl: [500, 616, 'right'] },
};

const ROOMS = ['games', 'cinema', 'activities'] as const;

function standsOnItsMark(world: World, room: keyof typeof MARKS, id: 'boy' | 'girl') {
  const [x, y, facing] = MARKS[room][id];
  const view = who(world, id);
  expect(view.room, `${id} is in the ${room}`).toBe(room);
  expect(view.at, `${id} is on the note's mark`).toEqual({ x, y });
  expect(view.facing, `${id} takes the mark's stance`).toBe(facing);
  expect(view.moving, `${id} is not mid-stride`).toBe(false);
}

describe.each(ROOMS)('the arrival of the %s Room', room => {
  it('runs to rest in about three seconds, everybody on their own mark', () => {
    // Three seconds is the script: the Door has shut and the entrance is over.
    // The frame the clock starts on is the frame the model is first told the
    // time, so the script runs out one tick after three seconds of them.
    const scripted = play(room, ROOM_ARRIVAL_SECONDS + 0.05);
    expect(roomArrivalState(scripted)).toBe('done');
    expect(roomDoorState(scripted, room)).toBe('closed');
    // The last stride lands inside another half second in every Room — 2.99 s
    // in the Game Room on its 1408 x 792 stage (ticket 89; 3.28 on 1600 x 900),
    // 2.80 in the Activity Room (96), 2.90 in the Cinema Room on its
    // 1360 x 765 stage (92),
    // measured against ticket 07's walk and run speeds. The two of them stay
    // put once they are there; the cats are free to go somewhere else.
    const quiet = run(scripted, 0.55);
    expect(actorsIn(quiet, room)).toHaveLength(5);
    standsOnItsMark(quiet, room, 'boy');
    standsOnItsMark(quiet, room, 'girl');
  });

  it('ends at once on a click, a tap or a key press', () => {
    const half = play(room, 1.2);
    expect(roomArrivalState(half)).toBe('playing');

    const cut = advance(half, { type: 'visitor-input' });
    expect(roomArrivalState(cut)).toBe('done');
    // Nothing half-open, nobody mid-route, everyone on a home mark.
    expect(roomDoorState(cut, room)).toBe('closed');
    expect(actorsIn(cut, room)).toHaveLength(5);
    for (const view of actorsIn(cut, room)) expect(view.moving, `${view.id} has stopped`).toBe(false);
    standsOnItsMark(cut, room, 'boy');
    standsOnItsMark(cut, room, 'girl');
  });

  it('does not play at all for a visitor who asked for stillness', () => {
    const still = walkInto(room, { ...visitor, reducedMotion: true });
    expect(roomArrivalState(still)).toBe('done');
    expect(roomDoorState(still, room)).toBe('closed');
    expect(actorsIn(still, room)).toHaveLength(5);
    standsOnItsMark(still, room, 'boy');
    standsOnItsMark(still, room, 'girl');
  });

  it('completes at once when motion is paused half way through', () => {
    const paused = advance(play(room, 1.5), { type: 'motion-toggled' });
    expect(roomArrivalState(paused)).toBe('done');
    expect(roomDoorState(paused, room)).toBe('closed');
    standsOnItsMark(paused, room, 'boy');
    standsOnItsMark(paused, room, 'girl');
  });

  it('plays again on the next entry to the same Room', () => {
    const first = play(room, 3.5);
    const away = advance(first, { type: 'hash-changed', hash: '#/entryway' });
    const again = advance(away, { type: 'hash-changed', hash: `#/${room}` });
    expect(roomArrivalState(again)).toBe('playing');
    expect(actorsIn(again, room)).toEqual([]);
  });

  it('waits behind the loading screen when the page opens on this Room', () => {
    // Opening the page on a Room is not walking through its Door: the page
    // says when the loading screen has gone, and that is when it plays.
    // 51: and the Room waits **empty**. The page cannot lift its loading
    // screen and dispatch the same frame, so a Room that holds its Cast while
    // the entrance is `pending` is a Room the visitor sees settled — all five
    // of them standing on their marks — and then sees emptied when it starts.
    // A Room is not found already settled, not even for 400 ms.
    const opened = createWorld({ ...visitor, hash: `#/${room}` });
    expect(roomArrivalState(opened)).toBe('pending');
    expect(actorsIn(opened, room)).toEqual([]);

    const shown = advance(opened, { type: 'arrival-started' });
    expect(roomArrivalState(shown)).toBe('playing');
    expect(actorsIn(shown, room)).toEqual([]);
  });

  it('is not ended by input before it has begun', () => {
    // The window's `pointerdown` and `keydown` are live from the moment the
    // page mounts, and the loading screen is a fixed overlay over an apartment
    // that is only `inert` underneath it — so a tap on the screen itself, or a
    // Tab press, is reported like any other input. It must not end an entrance
    // that has not started: the page would then lift the loading screen onto a
    // Room whose Door never opened and whose Cast never walked in.
    const opened = createWorld({ ...visitor, hash: `#/${room}` });
    const tapped = advance(opened, { type: 'visitor-input' });
    expect(tapped).toBe(opened);
    expect(roomArrivalState(tapped)).toBe('pending');
    // And the entrance the page was waiting to ask for still plays.
    expect(roomArrivalState(advance(tapped, { type: 'arrival-started' }))).toBe('playing');
  });

  it('settles a waiting entrance for a Room nobody can see', () => {
    // The other two ways a waiting entrance can be called off are not input:
    // a stage below the fold, and motion turned off. Both end it, and both put
    // everybody on their mark — a waiting entrance has already emptied its
    // Room, so ending it with no cues would leave a Room with no Cast.
    const opened = createWorld({ ...visitor, hash: `#/${room}` });
    const unseen = advance(opened, { type: 'room-unwatched', room });
    expect(roomArrivalState(unseen)).toBe('done');
    expect(actorsIn(unseen, room)).toHaveLength(5);
    standsOnItsMark(unseen, room, 'boy');
    standsOnItsMark(unseen, room, 'girl');

    const still = advance(opened, { type: 'motion-toggled' });
    expect(roomArrivalState(still)).toBe('done');
    expect(actorsIn(still, room)).toHaveLength(5);
    standsOnItsMark(still, room, 'boy');
    standsOnItsMark(still, room, 'girl');
  });

  it('walks the Cast to their own marks after opening on this Room', () => {
    // The marks are the Room's own — `HOMES` and `CAT_MARKS` — and they are
    // taken down as the entrance is made rather than as it starts, because by
    // the time it starts the Room it would read them off is empty.
    const opened = createWorld({ ...visitor, hash: `#/${room}` });
    const playing = advance(opened, { type: 'arrival-started' });
    const settled = advance(playing, { type: 'visitor-input' });
    expect(actorsIn(settled, room)).toHaveLength(5);
    standsOnItsMark(settled, room, 'boy');
    standsOnItsMark(settled, room, 'girl');
  });

  it('is over before it is watched in a Room whose stage is not on the screen', () => {
    // The Game Room's stage sits below its deck at desktop widths — measured at
    // y 1076 in an 800 px viewport — so a visitor who walks in is looking at the
    // wall while the Cast would be coming through a Door a thousand pixels down
    // the page. An entrance nobody can see is not worth playing: they get the
    // settled Room, which is what every other interruption gives them.
    const unseen = advance(walkInto(room), { type: 'room-unwatched', room });
    expect(roomArrivalState(unseen)).toBe('done');
    expect(roomDoorState(unseen, room)).toBe('closed');
    expect(actorsIn(unseen, room)).toHaveLength(5);
    standsOnItsMark(unseen, room, 'boy');
    standsOnItsMark(unseen, room, 'girl');
  });

  it('keeps the frame clock turning while it plays, and lets it stop after', () => {
    const opening = walkInto(room);
    // Nobody is in the Room yet, and the clock still has to run: an empty Room
    // is where the entrance starts.
    expect(actorsIn(opening, room)).toEqual([]);
    expect(apartmentNeedsClock(opening)).toBe(true);
    expect(apartmentNeedsClock(advance(opening, { type: 'visitor-input' }))).toBe(true);
  });
});

describe('a Room entrance the visitor was not watching', () => {
  it('forgets the sounds it caught up on, so none of them can repeat', () => {
    // The tab goes to the background a moment after the Door opens and comes
    // back after the entrance would have finished, so the very next tick runs
    // the whole of what is left in one go. The sounds that window crossed are
    // not played — the Entryway's own ending is silent for exactly the same
    // reason — and, above all, they are not left standing on the slice. The
    // painter plays whatever it finds there on every paint, so a `door-close`
    // left behind is one that fires sixty times a second while the Cast is
    // crossing the floor, and again on every cat and every hover after that.
    const away = 900000;
    const opened = advance(walkInto('games'), { type: 'actor-tick', now: away });
    const back = advance(opened, { type: 'actor-tick', now: away + ROOM_ARRIVAL_SECONDS * 1000 + 100 });
    expect(roomArrivalState(back)).toBe('done');
    expect(roomArrivalSfx(back)).toEqual([]);
    // And it stays silent: nothing drains the slice once the clock has stopped.
    expect(roomArrivalSfx(advance(back, { type: 'actor-tick', now: away + 4000 }))).toEqual([]);
  });
});

describe('a Room the visitor has walked out of', () => {
  it('cannot end the entrance of the Room they walked into', () => {
    const games = walkInto('games');
    const cinema = advance(games, { type: 'hash-changed', hash: '#/cinema' });
    expect(roomArrivalState(cinema)).toBe('playing');
    // The Game Room's stage leaving the screen is what walking out of it looks
    // like to the page, and it arrives after the Cinema Room's entrance has
    // begun. A report names its Room so it cannot settle somebody else's.
    expect(advance(cinema, { type: 'room-unwatched', room: 'games' })).toBe(cinema);
  });
});

describe('the Entryway and a Room arrival', () => {
  it('plays none of it: coming home is not walking in for the first time', () => {
    const home = advance(play('games', 3.5), { type: 'hash-changed', hash: '#/entryway' });
    expect(roomArrivalState(home)).toBe('done');
    expect(roomDoorState(home, 'entryway')).toBe('closed');
    // The Room is found settled, which is the Entryway's own tableau.
    expect(actorsIn(home, 'entryway')).toHaveLength(5);
    for (const view of actorsIn(home, 'entryway')) expect(view.moving, `${view.id} is home`).toBe(false);
  });

  it('leaves its own arrival to run: the front door is a different thing', () => {
    // A tab that has not been shown it yet, opening on the hallway.
    const first = createWorld({ hash: '', storedLanguage: null, reducedMotion: false });
    const playing = advance(first, { type: 'arrival-started' });
    expect(actorsIn(playing, 'entryway')).toEqual([]);
    // 44's interrupt is a Room's, not the Entryway's: eleven seconds of coming
    // home is not cut short by the first thing the visitor touches.
    expect(advance(playing, { type: 'visitor-input' })).toBe(playing);
  });
});
