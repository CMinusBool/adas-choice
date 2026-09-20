import { CAT_IDS, CAT_MARKS, freeMark, type CatId, type CatPlace } from './cats'; // 08: the cats
import { CINEMA_MARKS } from './cinema'; // 17: the Cinema Room's marks
// 14: the Entryway's floor and marks are the design note's, written down once.
import { ENTRYWAY_MARKS, ENTRYWAY_WALKABLE } from './entryway';
import type { RoomId } from './rooms';
import {
  STAGE_WIDTH,
  clampInto,
  containsPoint,
  distance,
  routeLength,
  routeThrough,
  type Point,
  type Polygon,
} from './stage';

/**
 * The Cast, as things that move.
 *
 * An Actor has one Cycle per way of moving and a position the model works out,
 * so a single piece of artwork serves every path that Actor ever takes: the
 * frames say what walking looks like and this file says where the walking got
 * to. Nothing here knows about pixels, elements or the clock — time arrives as
 * a `now` on a tick and the DOM layer paints whatever comes back.
 */
export type ActorId = 'boy' | 'girl' | 'mica' | 'mira' | 'luna';

/** Every Actor the apartment can hold, in Character Sheet order. */
export const ACTOR_IDS: readonly ActorId[] = ['boy', 'girl', 'mica', 'mira', 'luna'];

/**
 * A reusable looping animation for an Actor.
 *
 * Movement is never drawn into a Cycle's frames; the frames play in place and
 * the model translates the Actor. That is what makes one walk Cycle enough for
 * every route in the apartment.
 */
export type CycleId = 'idle' | 'walk' | 'run';

/** Which way an Actor is turned. The stage has no depth, so there are two. */
export type Facing = 'left' | 'right';

/** How fast each Cycle carries an Actor, in stage units per second. */
const CYCLE_SPEED: Record<CycleId, number> = { idle: 0, walk: 190, run: 430 };

/**
 * The longest step a single tick may take, in milliseconds.
 *
 * A tab that was in the background, or a frame the browser sat on, hands us a
 * gap of arbitrary size. Capping it makes an Actor resume walking rather than
 * teleport across the Room, and keeps a long pause from skipping a corner.
 */
const MAX_STEP_MS = 100;

/**
 * Where an Actor may stand in each Room, as a polygon in stage units.
 *
 * The Entryway's floor is its design note's (§3.2), kept in `entryway.ts` with
 * the rest of that Room's geometry. The other three are plain bands until each
 * Room's design pass gives them their real furniture.
 */
const WALKABLE: Record<RoomId, Polygon> = {
  entryway: ENTRYWAY_WALKABLE,
  // The Game Room's floor: a band across the front, with one notch cut from its
  // bottom edge for the low table's footprint, so a cat never walks into the
  // foreground Prop that would hide it. The poufs are deliberately not cut out —
  // depth there is the y-sort, which is the cue we want.
  games: [
    { x: 140, y: 660 },
    { x: 1460, y: 660 },
    { x: 1460, y: 860 },
    { x: 1000, y: 860 },
    { x: 1000, y: 800 },
    { x: 560, y: 800 },
    { x: 560, y: 860 },
    { x: 140, y: 860 },
  ],
  // 17: the Cinema Room's real floor. A band from the door to the board with
  // one notch cut out of its front edge for the reel cabinet's footprint, so
  // the Boy walks round the furniture the Room actually has rather than
  // through it. The beanbags are not cut out on purpose: an Actor above them
  // draws behind and one below draws in front, which is the depth cue.
  cinema: [
    { x: 100, y: 660 },
    { x: 1560, y: 660 },
    { x: 1560, y: 860 },
    { x: 575, y: 860 },
    { x: 575, y: 742 },
    { x: 425, y: 742 },
    { x: 425, y: 860 },
    { x: 100, y: 860 },
  ],
  // 16: the Activity Room, from `design/12-activity-room.md` §4.2 — a band
  // below the floor line at y 620, with a bite out of its front edge for each
  // foreground Prop, so nobody stands inside the call corner's stool or the
  // boombox's crate. The rug is not cut out; it is something to walk on.
  activities: [
    { x: 100, y: 650 },
    { x: 1540, y: 650 },
    { x: 1540, y: 760 },
    { x: 1365, y: 760 },
    { x: 1365, y: 860 },
    { x: 340, y: 860 },
    { x: 340, y: 745 },
    { x: 195, y: 745 },
    { x: 195, y: 860 },
    { x: 100, y: 860 },
  ],
};

/** Can an Actor stand here? Positions on the edge of the floor count. */
export function isWalkable(room: RoomId, point: Point): boolean {
  return containsPoint(WALKABLE[room], point);
}

/**
 * A repeatable stream of numbers in [0, 1).
 *
 * The model must never reach for `Math.random`: a world that rolls its own dice
 * cannot be replayed, and a test that cannot replay it cannot say anything
 * about varied behaviour. Randomness is injected as one of these instead, and
 * the DOM layer is the only place a seed comes from something as unrepeatable
 * as the clock.
 */
export type RandomSource = () => number;

/** A `RandomSource` that always produces the same stream for the same seed. */
export function seededRandom(seed: number): RandomSource {
  let state = (Math.floor(seed) % 2147483646) + 1;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** The seed used when the DOM layer offers none, so tests need not pass one. */
export const DEFAULT_SEED = 20260911;

/** Everything the model keeps about one Actor. Private to this file. */
interface ActorState {
  readonly id: ActorId;
  readonly room: RoomId;
  /** The feet point: bottom-centre of the sprite, in stage units. */
  readonly at: Point;
  readonly facing: Facing;
  readonly cycle: CycleId;
  /** Waypoints still to walk, in order. The last one is the goal. */
  readonly route: readonly Point[];
  /** How long the route was when it was handed out, for reporting progress. */
  readonly distance: number;
  /**
   * Goals this Actor walks between in turn, taking the next one each time it
   * arrives. A Room's `Home` may hand one out; an Actor with an empty patrol
   * stands still until something sends it somewhere.
   */
  readonly patrol: readonly Point[];
}

/** Where the Cast is, and the dice the Cast's own decisions are made with. */
export interface ActorsSlice {
  readonly actors: readonly ActorState[];
  /**
   * The `now` of the last tick that moved anything, or `null` while nothing is
   * moving — so the first tick after a pause measures from itself rather than
   * from whenever the apartment last had something to do.
   */
  readonly lastTick: number | null;
  readonly random: RandomSource;
}

/**
 * What the DOM layer is told about an Actor: everything it needs to paint one,
 * and nothing about how the walk was worked out.
 */
export interface ActorView {
  readonly id: ActorId;
  readonly room: RoomId;
  readonly at: Point;
  readonly facing: Facing;
  readonly cycle: CycleId;
  readonly moving: boolean;
  /** How far along its current route the Actor is, from 0 to 1. */
  readonly progress: number;
}

function view(actor: ActorState): ActorView {
  const remaining = routeLength(actor.at, actor.route);
  return {
    id: actor.id,
    room: actor.room,
    at: actor.at,
    facing: actor.facing,
    cycle: actor.cycle,
    moving: actor.route.length > 0,
    progress: actor.distance > 0 ? Math.min(1, Math.max(0, 1 - remaining / actor.distance)) : 1,
  };
}

export function actorViews(slice: ActorsSlice): readonly ActorView[] {
  return slice.actors.map(view);
}

export function actorViewsIn(slice: ActorsSlice, room: RoomId): readonly ActorView[] {
  return slice.actors.filter(actor => actor.room === room).map(view);
}

export function findActorView(slice: ActorsSlice, id: ActorId): ActorView | null {
  const actor = slice.actors.find(candidate => candidate.id === id);
  return actor ? view(actor) : null;
}

function facingTowards(from: Point, to: Point, unchanged: Facing): Facing {
  if (Math.abs(to.x - from.x) < 1e-6) return unchanged;
  return to.x > from.x ? 'right' : 'left';
}

function standing(actor: ActorState, at: Point, facing: Facing): ActorState {
  return { ...actor, at, facing, cycle: 'idle', route: [], distance: 0 };
}

/**
 * Send an Actor to a point in its Room.
 *
 * With motion off the Actor is simply there: a visitor who asked not to be
 * animated gets the outcome of the walk and none of the walking, and the DOM
 * layer never has to decide that for itself. A goal outside the walkable area
 * is pulled to the nearest point of it rather than refused.
 */
function send(actor: ActorState, goal: Point, cycle: CycleId, motionOn: boolean): ActorState {
  const area = WALKABLE[actor.room];
  const destination = clampInto(area, goal);
  if (!motionOn) return standing(actor, destination, facingTowards(actor.at, destination, actor.facing));
  const route = routeThrough(area, actor.at, destination);
  if (route.length === 0) return standing(actor, destination, actor.facing);
  return {
    ...actor,
    facing: facingTowards(actor.at, route[0], actor.facing),
    cycle,
    route,
    distance: routeLength(actor.at, route),
  };
}

/** The patrol, rotated so the goal just reached goes to the back of the queue. */
function rotate(patrol: readonly Point[]): readonly Point[] {
  return patrol.length < 2 ? patrol : [...patrol.slice(1), patrol[0]];
}

/** One Actor, one tick: walk along the route, or set off on the next goal. */
function step(actor: ActorState, seconds: number, motionOn: boolean): ActorState {
  if (actor.route.length === 0) {
    if (actor.patrol.length === 0) return actor;
    return send({ ...actor, patrol: rotate(actor.patrol) }, actor.patrol[0], 'walk', motionOn);
  }

  let budget = CYCLE_SPEED[actor.cycle] * seconds;
  let at = actor.at;
  let facing = actor.facing;
  let route = actor.route;
  while (budget > 0 && route.length > 0) {
    const waypoint = route[0];
    const leg = distance(at, waypoint);
    facing = facingTowards(at, waypoint, facing);
    if (leg > budget) {
      at = { x: at.x + ((waypoint.x - at.x) / leg) * budget, y: at.y + ((waypoint.y - at.y) / leg) * budget };
      budget = 0;
    } else {
      at = waypoint;
      budget -= leg;
      route = route.slice(1);
    }
  }
  // Arriving ends the walk here; the patrol picks up on the next tick, so an
  // Actor can never chase its own goals round in a loop inside one frame.
  return route.length === 0
    ? { ...actor, at, facing, cycle: 'idle', route, distance: actor.distance }
    : { ...actor, at, facing, route };
}

/** True while this Actor has somewhere to be, and so needs the clock running. */
function busy(actor: ActorState): boolean {
  return actor.route.length > 0 || actor.patrol.length > 0;
}

/**
 * The Cast after one tick of the clock.
 *
 * Hands back the slice it was given, by identity, whenever the tick changed
 * nothing — a paused apartment, a frame with no elapsed time, or a Cast with
 * nowhere to be — so the DOM layer's frame loop costs no repaint.
 */
export function tickActors(slice: ActorsSlice, now: number, motionOn: boolean): ActorsSlice {
  if (!motionOn) return slice;
  if (!slice.actors.some(busy)) return slice.lastTick === null ? slice : { ...slice, lastTick: null };
  // A tick from before the last one is a clock that restarted, not time running
  // backwards: start measuring again from here rather than stalling for good.
  if (slice.lastTick === null || now < slice.lastTick) return { ...slice, lastTick: now };
  const elapsed = Math.min(now - slice.lastTick, MAX_STEP_MS);
  if (elapsed === 0) return slice;
  const actors = slice.actors.map(actor => step(actor, elapsed / 1000, motionOn));
  return { ...slice, actors, lastTick: now };
}

/** The Cast after one of them is sent somewhere. Unknown Actors are ignored. */
export function sendActor(
  slice: ActorsSlice,
  id: ActorId,
  goal: Point,
  cycle: CycleId,
  motionOn: boolean,
): ActorsSlice {
  if (!slice.actors.some(actor => actor.id === id)) return slice;
  return { ...slice, actors: slice.actors.map(actor => (actor.id === id ? send(actor, goal, cycle, motionOn) : actor)) };
}

/**
 * The Cast with every walk finished where it was going.
 *
 * What motion being turned off mid-walk means: the Actor takes its destination
 * and stops, rather than freezing in the middle of the floor or carrying on.
 */
export function settleActors(slice: ActorsSlice): ActorsSlice {
  if (!slice.actors.some(actor => actor.route.length > 0)) return slice;
  const actors = slice.actors.map(actor =>
    actor.route.length === 0 ? actor : standing(actor, actor.route[actor.route.length - 1], actor.facing),
  );
  return { ...slice, actors, lastTick: null };
}

// 08: the cats
/**
 * The Cast with one of them stopped exactly where it stands.
 *
 * Not `settleActors`, which finishes a walk at its destination: a cat that is
 * being petted stops under the hand that reached for it, which is halfway
 * across the floor and is the whole point. An Actor already standing still, or
 * one the apartment has not placed, is left alone.
 */
export function haltActor(slice: ActorsSlice, id: ActorId): ActorsSlice {
  const walking = slice.actors.find(actor => actor.id === id && actor.route.length > 0);
  if (!walking) return slice;
  const stopped = standing(walking, walking.at, walking.facing);
  return { ...slice, actors: slice.actors.map(actor => (actor.id === id ? stopped : actor)) };
}

// 14: the Entryway
/**
 * Put an Actor somewhere, at once, with no walking and no route.
 *
 * What the arrival's script does when a figure simply appears — the Girl in the
 * doorway, a cat landing off the end of the bench — and the only way an Actor
 * that is not in the apartment yet gets into it. A mark outside the Room's
 * walkable area is pulled onto it, exactly as a goal is.
 */
export function placeActor(slice: ActorsSlice, id: ActorId, room: RoomId, at: Point, facing: Facing): ActorsSlice {
  const placed = clampInto(WALKABLE[room], at);
  const existing = slice.actors.find(actor => actor.id === id);
  const next: ActorState = existing
    ? { ...standing(existing, placed, facing), room }
    : { id, room, at: placed, facing, cycle: 'idle', route: [], distance: 0, patrol: STILL };
  return {
    ...slice,
    actors: existing ? slice.actors.map(actor => (actor.id === id ? next : actor)) : [...slice.actors, next],
  };
}

// 14: the Entryway
/**
 * The Cast with everyone standing in one Room taken out of the apartment.
 *
 * The Entryway's arrival opens on an empty hall, and an empty hall is the
 * absence of the Cast rather than a flag on it: an Actor nobody has placed has
 * no position to paint and no answer to give, which is already what
 * `actorView` says about one.
 */
export function clearRoom(slice: ActorsSlice, room: RoomId): ActorsSlice {
  const actors = slice.actors.filter(actor => actor.room !== room);
  return actors.length === slice.actors.length ? slice : { ...slice, actors, lastTick: null };
}

// 17: the Cinema Room, ticket 14's Entryway
/**
 * Where an Actor belongs in a Room: its mark, its facing, and what it does
 * there once it has arrived.
 *
 * A Room the Cast has no home in leaves whoever is standing in it alone.
 */
interface Home {
  readonly at: Point;
  readonly facing: Facing;
  /** Goals to walk between on arrival. Left out, the Actor simply stands there. */
  readonly patrol?: readonly Point[];
}

/** No patrol, shared by every standing Actor so a home can be compared by identity. */
const STILL: readonly Point[] = [];

/**
 * Who each Room places, and where.
 *
 * This is the whole of "the Cast is in the Room the visitor is in": a Room
 * names the Actors it puts on its floor, and walking in puts them there. The
 * Entryway's entry is ticket 14's settled tableau, which is a home like any
 * other; the Cinema Room seats the two of them in their beanbags. A Room with
 * no entry here is one whose design pass has not given the Cast anywhere to be.
 */
const HOMES: Partial<Record<RoomId, Partial<Record<ActorId, Home>>>> = {
  // 14: the Entryway, design note §5.4 — the two of them in the coat corner and
  // the three cats on their landing marks. This is the Room at rest: what a
  // visitor who never sees the arrival is shown, and where the arrival, when it
  // plays, walks everybody back to. Nobody patrols: ticket 07's demonstration
  // walk was this entry before ticket 14 gave the hallway its real Cast.
  entryway: {
    boy: { at: ENTRYWAY_MARKS.BS, facing: 'left' },
    girl: { at: ENTRYWAY_MARKS.GS, facing: 'right' },
    mica: { at: ENTRYWAY_MARKS.EMica, facing: 'left' },
    mira: { at: ENTRYWAY_MARKS.EMira, facing: 'right' },
    luna: { at: ENTRYWAY_MARKS.ELuna, facing: 'left' },
  },
  // 17: the Cinema Room — the visitor walks in on the two of them already sat
  // down in front of the screen, each turned a little towards the other.
  cinema: {
    boy: { at: CINEMA_MARKS.boySeat, facing: 'left' },
    girl: { at: CINEMA_MARKS.girlSeat, facing: 'right' },
  },
};

function atHome(id: ActorId, room: RoomId, home: Home): ActorState {
  return {
    id,
    room,
    at: home.at,
    facing: home.facing,
    cycle: 'idle',
    route: [],
    distance: 0,
    patrol: home.patrol ?? STILL,
  };
}

/** Is this Actor already standing exactly where its Room puts it? */
function settledAt(actor: ActorState, home: ActorState): boolean {
  return (
    actor.room === home.room &&
    actor.at.x === home.at.x &&
    actor.at.y === home.at.y &&
    actor.facing === home.facing &&
    actor.route.length === 0 &&
    actor.patrol === home.patrol
  );
}

/**
 * The Cast as the visitor finds a Room on walking into it.
 *
 * Everyone that Room places is put back on their mark, whatever they were doing
 * elsewhere, and anyone it places who is not in the apartment yet arrives. The
 * slice comes back by identity when nobody moved, so a Room with no Cast of its
 * own costs no repaint.
 */
export function gatherInto(slice: ActorsSlice, room: RoomId): ActorsSlice {
  const homes = HOMES[room];
  if (!homes) return slice;
  let moved = false;
  const actors = slice.actors.map(actor => {
    const home = homes[actor.id];
    if (!home) return actor;
    const placed = atHome(actor.id, room, home);
    if (settledAt(actor, placed)) return actor;
    moved = true;
    return placed;
  });
  // Anyone this Room places who has not been anywhere yet arrives now, in
  // Character Sheet order so the Cast is always built the same way round.
  for (const id of ACTOR_IDS) {
    const home = homes[id];
    if (!home || slice.actors.some(actor => actor.id === id)) continue;
    actors.push(atHome(id, room, home));
    moved = true;
  }
  return moved ? { ...slice, actors } : slice;
}

// 08: the cats
/**
 * Where each cat in this Room is standing, for the cats to decide between them.
 *
 * Only the ones actually in the Room: a cat elsewhere is not in anybody's way,
 * and the Room the visitor is in is the only one whose floor is being painted.
 */
export function catPlaces(slice: ActorsSlice, room: RoomId): readonly CatPlace[] {
  return slice.actors.flatMap(actor =>
    actor.room === room && (CAT_IDS as readonly string[]).includes(actor.id)
      ? [{ id: actor.id as CatId, at: actor.at, moving: actor.route.length > 0 }]
      : [],
  );
}

// 08: the cats
/**
 * The three cats, in the Room the visitor just walked into.
 *
 * They follow rather than restart: a cat already in this Room is left exactly
 * where it had got to, and one that was somewhere else comes in and takes a
 * free mark. Which mark is the dice's, so the Room is found differently laid
 * out on every visit, and no two of them ever arrive on top of each other
 * because each arrival counts the ones already standing there.
 *
 * The Entryway is the one Room this changes nothing in: `gatherInto` has just
 * put all three on the landing marks their design note fixes, so all three are
 * already home and the slice comes back by identity.
 */
export function gatherCats(slice: ActorsSlice, room: RoomId): ActorsSlice {
  let next = slice;
  for (const id of CAT_IDS) {
    const standing = next.actors.find(actor => actor.id === id);
    if (standing && standing.room === room) continue;
    // Nowhere free is not a reason to leave a cat behind in a Room the visitor
    // has walked out of. It cannot happen with five marks and two cats already
    // standing, but a Room re-marked one day with fewer gets its first mark
    // rather than a missing cat.
    const mark = freeMark(room, id, catPlaces(next, room), new Map(), next.random) ?? CAT_MARKS[room][0];
    // A cat that has just come in looks into the Room rather than at the wall.
    next = placeActor(next, id, room, mark, mark.x > STAGE_WIDTH / 2 ? 'left' : 'right');
  }
  return next;
}

/**
 * The Cast as the visitor finds the apartment.
 *
 * Nobody is placed in advance: the Room the visitor arrives in puts its own
 * Cast on the floor, and every Room they walk into afterwards does the same.
 */
export function createActors(random: RandomSource, room: RoomId): ActorsSlice {
  return gatherCats(gatherInto({ actors: [], lastTick: null, random }, room), room);
}
