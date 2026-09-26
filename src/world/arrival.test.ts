import { describe, expect, it } from 'vitest';

import {
  ARRIVAL_SECONDS,
  CAT_MARKS,
  ENTRYWAY_MARKS,
  STAGES,
  actorView,
  actorsIn,
  advance,
  arrivalView,
  createWorld,
  entrywayProps,
  isWalkable,
  vaseState,
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

/** A visitor who opens the page on the Entryway in a tab that has had the arrival. */
const cameHomeAlready: WorldInputs = { ...plainArrival, arrived: true };

/** The loading screen gone: nothing was declared, so nothing is waited for. */
const opened = (world: World) => advance(world, { type: 'assets-declared', urls: [] });

describe('the settled tableau', () => {
  it('is where the whole Cast stands in a tab that has had the arrival', () => {
    const world = createWorld(cameHomeAlready);
    for (const [actor, mark] of TABLEAU) standsAt(world, actor, mark);
    expect(actorsIn(world, 'entryway')).toHaveLength(5);
  });

  it('faces the Boy left and the Girl right, as the tableau describes them', () => {
    const world = createWorld(cameHomeAlready);
    expect(actorView(world, 'boy')!.facing).toBe('left');
    expect(actorView(world, 'girl')!.facing).toBe('right');
  });

  it('is what a visitor who opens the page in another Room comes home to', () => {
    const world = createWorld({ ...plainArrival, hash: '#/cinema' });
    expect(arrivalView(world).state).toBe('done');
    // 17: the Room the visitor opens in is the one that places its Cast, so the
    // hall stands empty until they walk into it — and then it is this tableau,
    // which is what the arrival they never saw would have left behind.
    expect(actorsIn(world, 'entryway')).toEqual([]);
    const entryway = advance(world, { type: 'hash-changed', hash: '#/entryway' });
    expect(actorsIn(entryway, 'entryway')).toHaveLength(5);
    for (const [actor, mark] of TABLEAU) standsAt(entryway, actor, mark);
  });
});

// 59: the hall the page opens on is the arrival's first frame, not its last.
// It used to be the settled tableau, so the visitor saw all five of them home,
// coats hung and the backpack on the bench, for the 600 ms the page waits
// before knocking — and then watched everyone blink out as the door opened.
describe('the hall before the arrival has started', () => {
  /** The hall at t 0 of the script (§5.2): nobody in, nothing brought in. */
  const OPENING_PROPS = { frontDoor: 'closed', backpack: 'carried', girlCoat: 'worn', boyParka: 'worn' };

  it('is the arrival’s opening state behind the loading screen', () => {
    const world = createWorld(plainArrival);
    expect(arrivalView(world).state).toBe('pending');
    expect(whoIsHome(world)).toEqual([]);
    expect(entrywayProps(world)).toEqual(OPENING_PROPS);
  });

  it('is still the opening state once the loading screen has lifted', () => {
    const world = opened(createWorld(plainArrival));
    expect(arrivalView(world).state).toBe('pending');
    expect(whoIsHome(world)).toEqual([]);
    expect(entrywayProps(world)).toEqual(OPENING_PROPS);
    expect(arrivalView(world).beats).toEqual([]);
  });

  it('is the same hall the arrival’s first tick paints', () => {
    const waiting = opened(createWorld(plainArrival));
    const firstTick = advance(advance(waiting, { type: 'arrival-started' }), { type: 'actor-tick', now: clock });
    expect(whoIsHome(firstTick)).toEqual(whoIsHome(waiting));
    expect(entrywayProps(firstTick)).toEqual(entrywayProps(waiting));
  });

  it('puts the whole Cast on the tableau when motion is paused before it starts', () => {
    const paused = advance(opened(createWorld(plainArrival)), { type: 'motion-toggled' });
    expect(arrivalView(paused).state).toBe('done');
    for (const [actor, mark] of TABLEAU) standsAt(paused, actor, mark);
    expect(entrywayProps(paused)).toEqual({ frontDoor: 'closed', backpack: 'open', girlCoat: 'hung', boyParka: 'hung' });
  });

  it('puts the whole Cast on the tableau when the visitor’s system asks for stillness before it starts', () => {
    const stilled = advance(createWorld(plainArrival), { type: 'reduced-motion-changed', reducedMotion: true });
    expect(arrivalView(stilled).state).toBe('done');
    for (const [actor, mark] of TABLEAU) standsAt(stilled, actor, mark);
  });

  it('lands a full Cast in the Room whose Door is taken before it starts', () => {
    const left = advance(opened(createWorld(plainArrival)), { type: 'hash-changed', hash: '#/games' });
    expect(arrivalView(left).state).toBe('done');
    const arrived = advance(left, { type: 'visitor-input' });
    expect(actorsIn(arrived, 'games')).toHaveLength(5);
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

describe('the arrival when the apartment is not allowed to move', () => {
  const askedForStillness: WorldInputs = { ...plainArrival, reducedMotion: true };

  it('is over before it starts for a visitor who asked for stillness', () => {
    const world = createWorld(askedForStillness);
    expect(arrivalView(world).state).toBe('done');
    for (const [actor, mark] of TABLEAU) standsAt(world, actor, mark);
  });

  it('does not play when such a visitor turns motion on afterwards', () => {
    const playing = advance(createWorld(askedForStillness), { type: 'motion-toggled' });
    expect(advance(playing, { type: 'arrival-started' })).toBe(playing);
    for (const [actor, mark] of TABLEAU) standsAt(playing, actor, mark);
  });

  it('completes at once when motion is paused half way through', () => {
    const paused = advance(arriving(5), { type: 'motion-toggled' });
    expect(arrivalView(paused).state).toBe('done');
    for (const [actor, mark] of TABLEAU) standsAt(paused, actor, mark);
    expect(entrywayProps(paused).boyParka).toBe('hung');
  });

  it('completes at once when the visitor’s system starts asking for stillness', () => {
    const stilled = advance(arriving(3), { type: 'reduced-motion-changed', reducedMotion: true });
    expect(arrivalView(stilled).state).toBe('done');
    for (const [actor, mark] of TABLEAU) standsAt(stilled, actor, mark);
  });
});

describe('the arrival and the rest of the apartment', () => {
  it('settles the moment the visitor walks out of the Entryway', () => {
    const left = advance(arriving(4), { type: 'hash-changed', hash: '#/games' });
    expect(arrivalView(left).state).toBe('done');
    // 51: it settles **in the Entryway**, before anybody is gathered into the
    // Room being walked into. It used to settle afterwards, which put all five
    // of them back in the hall they had just left — this test asserted that,
    // and a Door taken during the arrival left the new Room with no Cast.
    expect(actorsIn(left, 'entryway')).toEqual([]);
    // The Game Room's own entrance has emptied it, so the Cast is read once
    // that entrance is over rather than at the moment of the Door.
    const arrived = advance(left, { type: 'visitor-input' });
    expect(actorsIn(arrived, 'games')).toHaveLength(5);
    const back = advance(arrived, { type: 'hash-changed', hash: '#/entryway' });
    for (const [actor, mark] of TABLEAU) standsAt(back, actor, mark);
  });

  it('lands a full Cast in the Room whose Door is taken while it is playing', () => {
    // A fresh tab, the eleven seconds of coming home half played, and the
    // visitor clicks the Game Room's door at five. Nothing locks the Doors
    // during the arrival, and the Cast goes with them: the Room they walk into
    // holds all five once its own entrance has run, not an empty floor.
    const walkedOut = advance(arriving(5), { type: 'hash-changed', hash: '#/games' });
    const inTheGameRoom = run(walkedOut, ARRIVAL_SECONDS);
    expect(actorsIn(inTheGameRoom, 'games')).toHaveLength(5);
    // The two of them have reached their marks and stay on them; the three cats
    // are free to be somewhere else in the Room by now.
    for (const id of ['boy', 'girl'] as const) {
      expect(actorView(inTheGameRoom, id)!.moving, `${id} has arrived`).toBe(false);
    }
    expect(actorsIn(inTheGameRoom, 'entryway')).toEqual([]);
  });

  it('never plays for a tab that has already been shown it', () => {
    const world = createWorld({ ...plainArrival, arrived: true });
    expect(arrivalView(world).state).toBe('done');
    expect(advance(world, { type: 'arrival-started' })).toBe(world);
  });

  it('runs its Beats and its sounds while it plays, and neither once it is over', () => {
    const duet = arrivalView(arriving(5));
    expect(duet.beats.map(beat => beat.id)).toContain('S16');
    expect(duet.costumes.girl).toBe('coat');
    expect(duet.costumes.boy).toBe('parka');

    const settled = arrivalView(arriving(ARRIVAL_SECONDS + 1));
    expect(settled.beats).toEqual([]);
    expect(settled.costumes).toEqual({});
    expect(settled.sfx).toEqual([]);
  });

  /*
   * 82: the cats at real size against the Boy (design 75 §0.5). Each cat-only
   * Beat is the box its sheet was cut for shrunk about its bottom-centre, so its
   * feet line and its middle stay where they were and only the figure gets
   * smaller. 86 moved those bottom-centres onto the 1184 x 666 stage, to
   * design 75 §4.2's (225,524), (286.5,574) and (366,633).
   */
  it.each([
    ['S20', 8.5, { x: 158.325, y: 333.5, width: 133.35, height: 190.5 }],
    ['S21', 9.8, { x: 213.475, y: 345.4, width: 146.05, height: 228.6 }],
    ['S22', 11, { x: 221.33, y: 358.756, width: 289.34, height: 274.244 }],
  ] as const)('draws the cats’ Beat %s at real size, shrunk about its bottom-centre', (id, seconds, expected) => {
    const beat = arrivalView(arriving(seconds)).beats.find(playing => playing.id === id);
    expect(beat, `${id} should be playing at ${seconds} s`).toBeDefined();
    for (const side of ['x', 'y', 'width', 'height'] as const) expect(beat!.box[side]).toBeCloseTo(expected[side], 6);
  });

  /*
   * 100: S19 is one 8-frame sheet played in two halves. She goes down onto one
   * knee in frames 1–4 and holds frame 4 while the cats come out; frames 5–8
   * stand her back up. Declaring only 4 frames drew both rows of the sheet
   * stacked at half height: two squashed Girls.
   */
  it('plays S19 as one 8-frame sheet: frames 1–4 held on 4, then 5–8', () => {
    const frameAt = (seconds: number) => {
      const beat = arrivalView(arriving(seconds)).beats.find(playing => playing.id === 'S19');
      expect(beat, `S19 should be playing at ${seconds} s`).toBeDefined();
      expect(beat!.frames).toBe(8);
      expect(beat!.columns).toBe(4);
      return beat!.frame;
    };
    expect([7.15, 7.3, 7.45, 7.6, 8, 10.3].map(frameAt)).toEqual([0, 1, 2, 3, 3, 3]);
    expect([10.4, 10.5, 10.65, 10.8].map(frameAt)).toEqual([4, 5, 6, 7]);
  });

  it('plays each sound once, in the order the script has them', () => {
    let world = advance(createWorld(plainArrival), { type: 'arrival-started' });
    const heard: string[] = [];
    let now = 500000;
    while (arrivalView(world).state === 'playing') {
      now += 16;
      world = advance(world, { type: 'actor-tick', now });
      heard.push(...arrivalView(world).sfx);
    }
    expect(heard).toEqual([
      'keys',
      'door-open',
      'door-close',
      'backpack-down',
      'coat',
      'coat',
      'zip',
      'mica-meow',
      'mira-meow',
      'luna-meow',
    ]);
  });
});

/*
 * 86: the Entryway on the 1184 x 666 stage its edited backdrop is scaled whole
 * to (design 75 §2.1, §4.2). Where each Beat leaves its figure's feet is
 * measured off the sheets by `scripts/check-entryway-handoffs.test.mjs`; these
 * are the rules the model keeps by itself.
 */
describe('the Entryway on its stage', () => {
  it('is 1184 x 666 units, the size the backdrop takes when its doors come to the one door', () => {
    expect(STAGES.entryway).toEqual({ width: 1184, height: 666 });
  });

  it('stands every mark the script and the cats use on the hall’s floor', () => {
    for (const [name, mark] of Object.entries(ENTRYWAY_MARKS)) {
      expect(isWalkable('entryway', mark), `${name} (${mark.x}, ${mark.y})`).toBe(true);
    }
    for (const mark of CAT_MARKS.entryway) expect(isWalkable('entryway', mark), `cat mark (${mark.x}, ${mark.y})`).toBe(true);
  });

  it('keeps everybody off the painted monstera: the floor stops at x 1060', () => {
    expect(isWalkable('entryway', { x: 1059, y: 540 })).toBe(true);
    expect(isWalkable('entryway', { x: 1062, y: 540 })).toBe(false);
    expect(isWalkable('entryway', { x: 1120, y: 620 })).toBe(false);
  });

  it('keeps feet off the wall: nobody stands above the floor line but in the front doorway', () => {
    expect(isWalkable('entryway', { x: 117, y: 426 })).toBe(true);
    expect(isWalkable('entryway', { x: 400, y: 440 })).toBe(false);
  });

  it('has each of them standing still, their walk over, the moment a Beat takes them', () => {
    let world = advance(createWorld(plainArrival), { type: 'arrival-started' });
    const started = new Set<string>();
    for (let seconds = 0; seconds < ARRIVAL_SECONDS; seconds += 0.016) {
      world = run(world, 0.016);
      for (const beat of arrivalView(world).beats) {
        const key = `${beat.id}@${beat.frame}`;
        if (started.has(beat.id)) continue;
        started.add(beat.id);
        for (const actor of beat.hides) {
          expect(actorView(world, actor)!.moving, `${actor} as ${key} starts`).toBe(false);
        }
      }
    }
    expect([...started].sort()).toEqual(['S15', 'S16', 'S17', 'S18', 'S19', 'S20', 'S21', 'S22']);
  });
});

describe('the Entryway’s Breakable', () => {
  it('starts on the hall table and stays there until something knocks it off', () => {
    const world = createWorld(plainArrival);
    expect(vaseState(world)).toBe('intact');
    expect(advance(world, { type: 'actor-tick', now: 1 })).toBe(world);
  });

  it('is broken for the rest of the visit once a cat has been at it', () => {
    const broken = advance(createWorld(plainArrival), { type: 'breakable-broken', breakable: 'entryway-vase' });
    expect(vaseState(broken)).toBe('broken');
    // Breaking it twice is one broken vase, and a Room change does not mend it.
    expect(advance(broken, { type: 'breakable-broken', breakable: 'entryway-vase' })).toBe(broken);
    expect(vaseState(advance(broken, { type: 'hash-changed', hash: '#/cinema' }))).toBe('broken');
  });

  it('is whole again in a new tab', () => {
    expect(vaseState(createWorld({ ...plainArrival, arrived: true }))).toBe('intact');
  });
});
