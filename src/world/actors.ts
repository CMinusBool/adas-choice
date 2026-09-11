import type { RoomId } from './rooms';
import { clampInto, containsPoint, distance, routeLength, routeThrough, type Point, type Polygon } from './stage';

/**
 * The Cast, as things that move.
 *
 * An Actor has one Cycle per way of moving and a position the model works out,
 * so a single piece of artwork serves every path that Actor ever takes: the
 * frames say what walking looks like and this file says where the walking got
 * to. Nothing here knows about pixels, elements or the clock — time arrives as
 * a `now` on a tick and the DOM layer paints whatever comes back.
 */
export type ActorId = 'boy' | 'girl' | 'mica' | 'mira';

/** Every Actor the apartment can hold, in Character Sheet order. */
export const ACTOR_IDS: readonly ActorId[] = ['boy', 'girl', 'mica', 'mira'];

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
 * The Entryway's floor is the one designed here, because it is where this
 * ticket's walk happens: a band of floor with the hall furniture standing in
 * the middle of its back edge, so crossing the Room is a route that has to bend
 * rather than a straight line. The other three are plain bands until each
 * Room's design pass gives them their real furniture.
 */
const WALKABLE: Record<RoomId, Polygon> = {
  entryway: [
    { x: 120, y: 620 },
    { x: 640, y: 620 },
    { x: 640, y: 760 },
    { x: 960, y: 760 },
    { x: 960, y: 620 },
    { x: 1480, y: 620 },
    { x: 1480, y: 860 },
    { x: 120, y: 860 },
  ],
  games: [
    { x: 120, y: 640 },
    { x: 1480, y: 640 },
    { x: 1480, y: 860 },
    { x: 120, y: 860 },
  ],
  cinema: [
    { x: 140, y: 640 },
    { x: 1460, y: 640 },
    { x: 1460, y: 860 },
    { x: 140, y: 860 },
  ],
  activities: [
    { x: 140, y: 640 },
    { x: 1460, y: 640 },
    { x: 1460, y: 860 },
    { x: 140, y: 860 },
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
   * arrives. This ticket's demonstration walk is one of these; an Actor with an
   * empty patrol stands still until something sends it somewhere.
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

/**
 * The Cast as the visitor finds it.
 *
 * Only the Boy is placed for now: he walks between the two ends of the
 * Entryway, which is this ticket's demonstration that a route is computed and
 * a Cycle plays in place while code does the travelling. The rest of the Cast
 * arrives with the Rooms that give them somewhere to be.
 */
export function createActors(random: RandomSource): ActorsSlice {
  return {
    actors: [
      {
        id: 'boy',
        room: 'entryway',
        at: { x: 220, y: 690 },
        facing: 'right',
        cycle: 'idle',
        route: [],
        distance: 0,
        patrol: [
          { x: 1380, y: 690 },
          { x: 220, y: 690 },
        ],
      },
    ],
    lastTick: null,
    random,
  };
}
