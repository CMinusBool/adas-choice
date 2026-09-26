import { describe, expect, it } from 'vitest';

import {
  ROOM_IDS,
  STAGES,
  actorView,
  actorsIn,
  advance,
  createWorld,
  isWalkable,
  roomHash,
  seededRandom,
  type ActorId,
  type ActorView,
  type Point,
  type RoomId,
  type World,
  type WorldInputs,
} from './index';
// 43: `gatherInto` is the world's own, one level below `index.ts`, and the only
// place the identity promise every Room change leans on can be read.
import { createActors, gatherInto, placeActor } from './actors';

/**
 * A visitor arriving with no reduced-motion request and no hash, in a tab that
 * has had the Entryway's arrival — 59: so the Cast is at home in the hall to be
 * walked about, rather than waiting outside the front door to come in.
 */
const plainArrival: WorldInputs = { hash: '', storedLanguage: null, reducedMotion: false, arrived: true };

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
      goal: { x: 1000, y: 560 },
    });
    expect(boy(sent).moving).toBe(true);

    const arrived = runUntil(sent, world => !boy(world).moving);
    expect(boy(arrived).at).toEqual({ x: 1000, y: 560 });
    expect(boy(arrived).progress).toBe(1);
  });

  it('walks around what stands between it and the goal instead of through it', () => {
    // The doorway is a tongue of floor 30 units deep reaching back to the mat,
    // with the wall and the bench beside it (ticket 14's §3.2, on 86's 1184 x
    // 666 stage). A straight line from the mat to the far end of the hall would
    // cross that wall, so the walk has to come down out of the doorway first
    // and turn there.
    const inTheDoorway = advance(createWorld(plainArrival), { type: 'motion-toggled' });
    const onTheMat = advance(inTheDoorway, { type: 'actor-sent', actor: 'boy', goal: { x: 117, y: 426 } });
    const moving = advance(onTheMat, { type: 'motion-toggled' });
    expect(boy(moving).at).toEqual({ x: 117, y: 426 });

    const sent = advance(moving, { type: 'actor-sent', actor: 'boy', goal: { x: 1000, y: 540 } });
    let furthestInTheDoorway = 0;
    const arrived = runUntil(sent, world => {
      const at = boy(world).at;
      if (at.y < 449) furthestInTheDoorway = Math.max(furthestInTheDoorway, at.x);
      return !boy(world).moving;
    });
    expect(boy(arrived).at).toEqual({ x: 1000, y: 540 });
    // He is out of the doorway before its edge at x 197, not through the wall.
    expect(furthestInTheDoorway).toBeLessThan(207);
  });

  it('reports progress climbing from nothing to the whole route', () => {
    const sent = advance(createWorld(plainArrival), {
      type: 'actor-sent',
      actor: 'boy',
      goal: { x: 1000, y: 570 },
    });
    expect(boy(sent).progress).toBe(0);
    const halfway = runUntil(sent, world => boy(world).progress > 0.5);
    expect(boy(halfway).progress).toBeLessThan(1);
    expect(boy(runUntil(halfway, world => !boy(world).moving)).progress).toBe(1);
  });

  it('turns to face the way it is walking', () => {
    const world = createWorld(plainArrival);
    const rightwards = advance(world, { type: 'actor-sent', actor: 'boy', goal: { x: 1000, y: 570 } });
    expect(boy(run(rightwards, 200)).facing).toBe('right');
    const leftwards = advance(rightwards, { type: 'actor-sent', actor: 'boy', goal: { x: 120, y: 600 } });
    expect(boy(run(leftwards, 200)).facing).toBe('left');
  });

  it('plays a Cycle while it walks and stands still when it arrives', () => {
    const sent = advance(createWorld(plainArrival), {
      type: 'actor-sent',
      actor: 'boy',
      goal: { x: 1000, y: 570 },
      cycle: 'run',
    });
    expect(boy(sent).cycle).toBe('run');
    expect(boy(runUntil(sent, world => !boy(world).moving)).cycle).toBe('idle');
  });
});

// 107: every sheet the Cast ships is one standing frame, so a Cycle has no
// stride of its own to play. The gait is the model's: the figure rises off its
// feet and rocks about them once a step, in time with the ground it covers.
describe('an Actor’s gait', () => {
  /** Every frame of one walk, from sending to standing, as the page would paint it. */
  function frames(goal: Point, cycle: 'walk' | 'run' = 'walk', world = createWorld(plainArrival)): ActorView[] {
    let next = advance(world, { type: 'actor-sent', actor: 'boy', goal, cycle });
    const seen = [boy(next)];
    while (boy(next).moving) {
      next = run(next, 16);
      seen.push(boy(next));
    }
    return seen;
  }

  /** The footfalls in a walk: the frames where the lift comes back down to the floor. */
  function footfalls(walk: readonly ActorView[]): number {
    let count = 0;
    for (let at = 1; at < walk.length - 1; at += 1) {
      const [before, here, after] = [walk[at - 1].gait.lift, walk[at].gait.lift, walk[at + 1].gait.lift];
      if (here <= before && here < after) count += 1;
    }
    // The last frame is a footfall too: the one he stops on.
    return count + 1;
  }

  it('stands flat while it stands still', () => {
    expect(boy(createWorld(plainArrival)).gait).toEqual({ lift: 0, lean: 0 });
  });

  it('rises off its feet and comes back down to them on every step of a walk', () => {
    const walk = frames({ x: 1000, y: 560 });
    const lifts = walk.filter(view => view.moving).map(view => view.gait.lift);
    expect(Math.max(...lifts)).toBeGreaterThan(0);
    // Down to the floor between steps, not a hover that only wobbles.
    expect(footfalls(walk)).toBeGreaterThan(2);
  });

  it('rocks one way on one step and the other way on the next', () => {
    const leans = frames({ x: 1000, y: 560 }).map(view => view.gait.lean);
    expect(Math.max(...leans)).toBeGreaterThan(1);
    expect(Math.min(...leans)).toBeLessThan(-1);
  });

  it('takes a walker’s steps, and fewer longer ones at a run', () => {
    // From the hall's middle to its right end: a long, straight walk.
    const start = boy(createWorld(plainArrival)).at;
    const goal = { x: 1000, y: 560 };
    const span = Math.hypot(goal.x - start.x, goal.y - start.y);
    const walked = footfalls(frames(goal));
    expect(span / walked).toBeGreaterThan(70);
    expect(span / walked).toBeLessThan(130);
    expect(footfalls(frames(goal, 'run'))).toBeLessThan(walked);
  });

  it('lands flat on the frame it stops, however far it went', () => {
    for (const goal of [{ x: 1000, y: 560 }, { x: 640, y: 600 }, { x: 610, y: 590 }, { x: 300, y: 610 }]) {
      const walk = frames(goal);
      expect(walk[walk.length - 1].gait).toEqual({ lift: 0, lean: 0 });
    }
  });

  it('never lifts the Boy’s 300 units by more than the 6 a hand-off may move his feet', () => {
    const lifts = [...frames({ x: 1000, y: 560 }), ...frames({ x: 1000, y: 560 }, 'run')].map(view => view.gait.lift);
    expect(Math.max(...lifts) * 300).toBeLessThanOrEqual(6);
  });

  it('keeps both feet down when the apartment may not move', () => {
    const still = createWorld({ ...plainArrival, reducedMotion: true });
    const sent = advance(still, { type: 'actor-sent', actor: 'boy', goal: { x: 1000, y: 560 } });
    expect(boy(sent).gait).toEqual({ lift: 0, lean: 0 });
  });
});

describe('staying on the floor', () => {
  /** A point somewhere in a Room's walkable area, by rejection sampling. */
  function somewhereWalkable(room: RoomId, random: () => number): Point {
    for (let attempt = 0; attempt < 500; attempt++) {
      const point = { x: random() * STAGES[room].width, y: random() * STAGES[room].height };
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
   * Room's own stage, so a Room whose floor ran off the stage would put an
   * Actor outside the Room it is standing in. Three of the four floors are
   * placeholders until each Room's design pass replaces them, which is exactly
   * when this is worth having.
   */
  it('never lets a Room be walkable outside its stage', () => {
    for (const room of ROOM_IDS) {
      const { width, height } = STAGES[room];
      let inside = 0;
      for (let x = -200; x <= width + 200; x += 20) {
        for (let y = -200; y <= height + 200; y += 20) {
          const offStage = x < 0 || x > width || y < 0 || y > height;
          if (offStage) expect(isWalkable(room, { x, y })).toBe(false);
          else if (isWalkable(room, { x, y })) inside++;
        }
      }
      // And a Room with no floor at all would strand anyone sent to it.
      expect(inside).toBeGreaterThan(0);
    }
  });
});

describe('the Game Room floor', () => {
  // Design 75 §4.3 (ticket 89): on the 1408 x 792 stage, a band from y 581 to
  // y 757 between the door's jamb at x 123 and the lamp at x 1285, with a bump
  // up onto Luna's shrunk cat bed and one notch cut out of its bottom edge for
  // the true-size low table's footprint, so a cat never walks into the
  // foreground Prop that would hide it.
  it('is a band across the front of the Room, inside the wall and the lamp', () => {
    expect(isWalkable('games', { x: 700, y: 620 })).toBe(true);
    expect(isWalkable('games', { x: 130, y: 620 })).toBe(true);
    expect(isWalkable('games', { x: 1275, y: 620 })).toBe(true);
    // The sideboard, the door and the lamp stand against the wall above y 581.
    expect(isWalkable('games', { x: 700, y: 570 })).toBe(false);
    expect(isWalkable('games', { x: 115, y: 620 })).toBe(false);
    expect(isWalkable('games', { x: 1295, y: 620 })).toBe(false);
  });

  it('reaches up onto the cat bed, and nowhere else along the wall', () => {
    expect(isWalkable('games', { x: 1018, y: 520 })).toBe(true);
    expect(isWalkable('games', { x: 940, y: 540 })).toBe(false);
    expect(isWalkable('games', { x: 1100, y: 540 })).toBe(false);
  });

  it('keeps the low table’s footprint out of the floor', () => {
    // Inside the notch: the table stands here and draws in front of everyone.
    expect(isWalkable('games', { x: 686, y: 745 })).toBe(false);
    // Just above it, and to either side of it, is floor.
    expect(isWalkable('games', { x: 686, y: 720 })).toBe(true);
    expect(isWalkable('games', { x: 400, y: 745 })).toBe(true);
    expect(isWalkable('games', { x: 1000, y: 745 })).toBe(true);
  });

  it('leaves the poufs walkable, so a cat can pass in front of and behind them', () => {
    // The Cinema's rule: depth is the y-sort, not a hole in the floor.
    expect(isWalkable('games', { x: 546, y: 650 })).toBe(true);
    expect(isWalkable('games', { x: 774, y: 700 })).toBe(true);
  });

  it('holds every mark the design note places in this Room', () => {
    // Luna on the shrunk bed, the two seated marks, and the door mark (§4.3, §4.1).
    expect(isWalkable('games', { x: 1018, y: 505 })).toBe(true);
    expect(isWalkable('games', { x: 546, y: 686 })).toBe(true);
    expect(isWalkable('games', { x: 774, y: 682 })).toBe(true);
    expect(isWalkable('games', { x: 130, y: 583 })).toBe(true);
  });

  it('bends a walk along the front of the Room around the table', () => {
    const polygon: Point[] = [
      { x: 123, y: 581 },
      { x: 960, y: 581 },
      { x: 960, y: 500 },
      { x: 1076, y: 500 },
      { x: 1076, y: 581 },
      { x: 1285, y: 581 },
      { x: 1285, y: 757 },
      { x: 795, y: 757 },
      { x: 795, y: 731 },
      { x: 578, y: 731 },
      { x: 578, y: 757 },
      { x: 123, y: 757 },
    ];
    // A concave floor is what makes route bending worth having: the straight
    // line between these two crosses the notch, so the walk has to go round.
    for (const corner of polygon) expect(isWalkable('games', corner)).toBe(true);
    expect(isWalkable('games', { x: 686, y: 750 })).toBe(false);
  });
});

describe('an Actor when the apartment is not allowed to move', () => {
  const askedForStillness: WorldInputs = { ...plainArrival, reducedMotion: true };

  it('takes its destination at once rather than walking to it', () => {
    const world = createWorld(askedForStillness);
    const sent = advance(world, { type: 'actor-sent', actor: 'boy', goal: { x: 1000, y: 570 } });
    expect(sent).not.toBe(world);
    expect(boy(sent).at).toEqual({ x: 1000, y: 570 });
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
      goal: { x: 1000, y: 570 },
    });
    const walking = run(sent, 500);
    expect(boy(walking).moving).toBe(true);
    const stopped = advance(walking, { type: 'motion-toggled' });
    expect(boy(stopped).at).toEqual({ x: 1000, y: 570 });
    expect(boy(stopped).moving).toBe(false);
  });

  it('finishes the walk when the visitor’s system asks for stillness mid-step', () => {
    const sent = advance(createWorld(plainArrival), {
      type: 'actor-sent',
      actor: 'boy',
      goal: { x: 1000, y: 570 },
    });
    const stopped = advance(run(sent, 500), { type: 'reduced-motion-changed', reducedMotion: true });
    expect(boy(stopped).at).toEqual({ x: 1000, y: 570 });
    expect(boy(stopped).moving).toBe(false);
  });

  it('walks again once a reduced-motion visitor turns motion on deliberately', () => {
    const playing = advance(createWorld(askedForStillness), { type: 'motion-toggled' });
    const sent = advance(playing, { type: 'actor-sent', actor: 'boy', goal: { x: 1000, y: 570 } });
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
      goal: { x: 1000, y: 570 },
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

// 43: the Cast is wherever the visitor is
/**
 * Who the visitor finds in the Game Room and the Activity Room.
 *
 * Ruled by the owner on 2026-09-20 and written into all four design notes: the
 * Boy, the Girl and the three cats are in whichever Room is open. Both Rooms
 * shipped with only the cats in them, because "is the couple in the Room the
 * visitor is in?" had never been answered. The marks below are the design
 * notes' own — `design/11-game-room.md` §4.3.1 and `design/12-activity-room.md`
 * §4.3 — so this is a check of the two Rooms and not of the placing code.
 */
describe('the Cast in whichever Room the visitor is in', () => {
  /**
   * Walk in the way a door link does: through the hash the router reads.
   *
   * 44: and then the way an impatient visitor does, with an input that ends
   * the Room's arrival at once. Where the arrival leaves everyone is the marks
   * below, which is exactly what this describe block is about.
   */
  function walkInto(world: World, room: RoomId): World {
    return advance(advance(world, { type: 'hash-changed', hash: roomHash(room) }), { type: 'visitor-input' });
  }

  function who(world: World, id: ActorId): ActorView {
    const view = actorView(world, id);
    if (!view) throw new Error(`${id} should be standing in the apartment.`);
    return view;
  }

  it('seats the Boy and the Girl on their poufs in the Game Room', () => {
    // 34: the seated stills S09 and S10 have landed, so the interim standing
    // marks of §4.3.1 are gone and the homes are the seated marks — design 75
    // §4.3's since ticket 89, on the 1408 x 792 stage.
    const world = walkInto(createWorld(plainArrival), 'games');
    expect(who(world, 'girl').at).toEqual({ x: 546, y: 686 });
    expect(who(world, 'girl').facing).toBe('right');
    expect(who(world, 'boy').at).toEqual({ x: 774, y: 682 });
    expect(who(world, 'boy').facing).toBe('left');
    // Nobody is mid-walk, and nobody was pulled onto the floor from off it: a
    // clamped mark would come back as some other point.
    for (const id of ['boy', 'girl'] as const) {
      expect(who(world, id).moving).toBe(false);
      expect(who(world, id).seated).toBe(true);
      expect(isWalkable('games', who(world, id).at)).toBe(true);
    }
  });

  it('seats nobody who is still walking to the pouf, or standing anywhere else', () => {
    // Seated is what the DOM swaps a standing sprite for a seated still on, so
    // it must hold only once the walk is over and only on the seated mark.
    const arriving = advance(createWorld(plainArrival), { type: 'hash-changed', hash: roomHash('games') });
    const midway = run(arriving, 1200);
    expect(who(midway, 'girl').seated).toBe(false);
    expect(who(midway, 'boy').seated).toBe(false);
    const settled = runUntil(midway, world => !who(world, 'girl').moving && !who(world, 'boy').moving);
    expect(who(settled, 'girl').seated).toBe(true);
    expect(who(settled, 'boy').seated).toBe(true);
    // Sent off the pouf, she stands again; the cats never sit on a mark.
    const paused = advance(walkInto(createWorld(plainArrival), 'games'), { type: 'motion-toggled' });
    const up = advance(paused, { type: 'actor-sent', actor: 'girl', goal: { x: 300, y: 700 } });
    expect(who(up, 'girl').seated).toBe(false);
    for (const cat of ['mica', 'mira', 'luna'] as const) expect(who(up, cat).seated).toBe(false);
    // The Entryway and the Activity Room have no seated marks.
    expect(who(createWorld(plainArrival), 'girl').seated).toBe(false);
    expect(who(walkInto(createWorld(plainArrival), 'activities'), 'girl').seated).toBe(false);
  });

  it('puts the whole Cast in the Game Room, the two of them clear of each other', () => {
    const world = walkInto(createWorld(plainArrival), 'games');
    expect([...actorsIn(world, 'games')].map(actor => actor.id).sort()).toEqual([
      'boy',
      'girl',
      'luna',
      'mica',
      'mira',
    ]);
    expect(actorsIn(world, 'entryway')).toEqual([]);
    // A figure is about 105 units across (§4.3.1), so two marks further apart
    // than that are two sprites that do not touch.
    expect(Math.abs(who(world, 'boy').at.x - who(world, 'girl').at.x)).toBeGreaterThan(105);
  });

  it('stands the Boy and the Girl on the rug in the Activity Room, clear of the hunt station’s chalkboard', () => {
    // 96: he is 2 units below her, so he sorts in front, and the two of them
    // stand in the gap between the draw and hunt boards on the 1328 x 747 stage.
    const world = walkInto(createWorld(plainArrival), 'activities');
    expect(who(world, 'boy').at).toEqual({ x: 602, y: 618 });
    expect(who(world, 'boy').facing).toBe('left');
    expect(who(world, 'girl').at).toEqual({ x: 500, y: 616 });
    expect(who(world, 'girl').facing).toBe('right');
    for (const id of ['boy', 'girl'] as const) {
      expect(who(world, id).moving).toBe(false);
      expect(isWalkable('activities', who(world, id).at)).toBe(true);
    }
    expect(who(world, 'boy').at.y - who(world, 'girl').at.y).toBe(2);
    // The hunt board is (633,465)-(903,513), design 75 §4.5: 105-153 units above
    // their feet. At that height each drawn figure reaches this far either side
    // of its feet, measured on its standing sheet (public/assets/actors/
    // *-walk-right.png at data-height 300 and 273): the Boy 28 units, the Girl
    // 39 on her facing side. Neither may reach the board at rest.
    const reach = { boy: 28, girl: 39 } as const;
    for (const id of ['boy', 'girl'] as const) {
      const { x } = who(world, id).at;
      expect(x + reach[id] < 633 || x - reach[id] > 903, `${id} at x ${x}`).toBe(true);
    }
    // And they face each other without their heads meeting: his face reaches
    // 35 units towards her, hers 51 towards him.
    expect(who(world, 'boy').at.x - 35 - (who(world, 'girl').at.x + 51)).toBeGreaterThan(10);
  });

  it('puts the whole Cast in the Activity Room', () => {
    const world = walkInto(createWorld(plainArrival), 'activities');
    expect([...actorsIn(world, 'activities')].map(actor => actor.id).sort()).toEqual([
      'boy',
      'girl',
      'luna',
      'mica',
      'mira',
    ]);
  });

  it('puts them back on their marks when the visitor leaves and comes back', () => {
    // A Room is found the way its design note describes it, not the way the
    // last visit left it — so wherever he wandered off to is forgotten at the
    // door. Motion off makes the wander instant; it changes nothing else.
    const paused = advance(walkInto(createWorld(plainArrival), 'games'), { type: 'motion-toggled' });
    const wandered = advance(paused, { type: 'actor-sent', actor: 'boy', goal: { x: 300, y: 700 } });
    expect(who(wandered, 'boy').at).toEqual({ x: 300, y: 700 });

    const back = walkInto(walkInto(wandered, 'activities'), 'games');
    expect(who(back, 'boy').at).toEqual({ x: 774, y: 682 });
    expect(who(back, 'girl').at).toEqual({ x: 546, y: 686 });
  });

  it('hands the Cast back by identity when the Room being entered moved nobody', () => {
    // What a Room change costs when there is nothing to do: the DOM layer
    // compares slices by identity and repaints nothing when they match, so a
    // Room that has just placed its Cast must not place it a second time.
    for (const room of ROOM_IDS) {
      const settled = createActors(seededRandom(7), room);
      expect(gatherInto(settled, room)).toBe(settled);
    }
  });

  it('hands back a new Cast when somebody was standing off their mark', () => {
    const settled = createActors(seededRandom(7), 'activities');
    const wandered = placeActor(settled, 'girl', 'activities', { x: 1100, y: 650 }, 'left');
    const gathered = gatherInto(wandered, 'activities');
    expect(gathered).not.toBe(wandered);
    expect(gathered.actors.find(actor => actor.id === 'girl')?.at).toEqual({ x: 500, y: 616 });
  });
});
