// 07: actors
import {
  DEFAULT_SEED,
  actorViewsIn,
  createActors,
  findActorView,
  seededRandom,
  sendActor,
  settleActors,
  tickActors,
  type ActorId,
  type ActorView,
  type ActorsSlice,
  type CycleId,
  type RandomSource,
} from './actors';
import { resolveLanguage, toggleLanguage, type Language } from './language';
import { createMotion, toggleMotion, withReducedMotion, type MotionSlice } from './motion';
import { parseRoute, type RoomId } from './rooms';
// 07: actors
import type { Point } from './stage';

/**
 * How the visitor is moving between Rooms right now.
 *
 * `animated` is the DOM layer's licence to wait for the transition to end;
 * `instant` is its instruction not to, because a zero-length CSS animation the
 * layer waits on is a Room that never finishes arriving.
 */
export type TransitionKind = 'settled' | 'instant' | 'animated';

/** Which Room the visitor is in, and which one they are still leaving. */
export interface RoomsSlice {
  /** The Room the visitor is in. */
  readonly current: RoomId;
  /** The Room being left, still painted until the transition ends. */
  readonly leaving: RoomId | null;
  readonly transition: TransitionKind;
}

/**
 * The whole world, as named slices.
 *
 * Every slice is plain readonly data: the DOM layer reads it and paints. New
 * behaviour arrives as a new slice beside these, an event in `WorldEvent`, and
 * a painter in the DOM layer — not as a decision moved out of here.
 */
export interface World {
  readonly language: Language;
  readonly motion: MotionSlice;
  readonly rooms: RoomsSlice;
  // 07: actors
  readonly actors: ActorsSlice;
}

/** What the DOM layer knows at start-up that the model cannot ask for itself. */
export interface WorldInputs {
  /** `location.hash`, exactly as the browser reports it. */
  readonly hash: string;
  /** Whatever storage returned for the language preference, or `null`. */
  readonly storedLanguage: string | null | undefined;
  /** Whether the visitor's system asks for reduced motion. */
  readonly reducedMotion: boolean;
  // 07: actors — where the Cast's own decisions get their dice. The DOM layer
  // seeds this from the clock; a test seeds it with a number and gets the same
  // apartment twice. Left out, the world is the same on every visit.
  readonly random?: RandomSource;
}

/**
 * Something the DOM layer has observed.
 *
 * The DOM layer reports; it never decides. Every browser event the page listens
 * for turns into one of these, and `advance` works out what it means.
 */
export type WorldEvent =
  | { readonly type: 'hash-changed'; readonly hash: string }
  | { readonly type: 'room-transition-finished' }
  | { readonly type: 'motion-toggled' }
  | { readonly type: 'reduced-motion-changed'; readonly reducedMotion: boolean }
  | { readonly type: 'language-toggled' }
  // 07: actors — `now` is how time reaches the model; it never asks for it.
  | { readonly type: 'actor-tick'; readonly now: number }
  | {
      readonly type: 'actor-sent';
      readonly actor: ActorId;
      readonly goal: Point;
      readonly cycle?: Extract<CycleId, 'walk' | 'run'>;
    };

/** Build the world the visitor arrives into. */
export function createWorld(inputs: WorldInputs): World {
  return {
    language: resolveLanguage(inputs.storedLanguage),
    motion: createMotion(inputs.reducedMotion),
    rooms: { current: parseRoute(inputs.hash), leaving: null, transition: 'settled' },
    // 07: actors
    actors: createActors(inputs.random ?? seededRandom(DEFAULT_SEED)),
  };
}

/**
 * The world after one reported event.
 *
 * Returns the world it was given, by identity, when the event changes nothing —
 * so the DOM layer can skip a repaint, and so the hash we write ourselves does
 * not bounce back as a second transition.
 */
export function advance(world: World, event: WorldEvent): World {
  switch (event.type) {
    case 'hash-changed': {
      const entering = parseRoute(event.hash);
      if (entering === world.rooms.current) return world;
      // The model decides whether this move animates, so the DOM layer never
      // waits on an animation that was never going to run.
      const transition: TransitionKind = motionIsOn(world) ? 'animated' : 'instant';
      return { ...world, rooms: { current: entering, leaving: world.rooms.current, transition } };
    }
    case 'room-transition-finished': {
      if (world.rooms.transition === 'settled') return world;
      return { ...world, rooms: { current: world.rooms.current, leaving: null, transition: 'settled' } };
    }
    case 'motion-toggled': {
      // 07: actors — a walk in progress ends at its destination rather than
      // freezing halfway across the floor.
      const motion = toggleMotion(world.motion);
      const actors = motion.paused ? settleActors(world.actors) : world.actors;
      return { ...world, motion, actors };
    }
    case 'reduced-motion-changed': {
      const motion = withReducedMotion(world.motion, event.reducedMotion);
      if (motion === world.motion) return world;
      // 07: actors
      return { ...world, motion, actors: motion.paused ? settleActors(world.actors) : world.actors };
    }
    case 'language-toggled': {
      return { ...world, language: toggleLanguage(world.language) };
    }
    // 07: actors
    case 'actor-tick': {
      const actors = tickActors(world.actors, event.now, motionIsOn(world));
      return actors === world.actors ? world : { ...world, actors };
    }
    // 07: actors
    case 'actor-sent': {
      const actors = sendActor(world.actors, event.actor, event.goal, event.cycle ?? 'walk', motionIsOn(world));
      return actors === world.actors ? world : { ...world, actors };
    }
  }
}

/** Is the apartment allowed to move? */
export function motionIsOn(world: World): boolean {
  return !world.motion.paused;
}

/** Is this the Room the visitor is in? */
export function isCurrentRoom(world: World, room: RoomId): boolean {
  return world.rooms.current === room;
}

/**
 * Should this Room be on the page at all?
 *
 * True for the Room the visitor is in, and for the one they are leaving while
 * the transition runs — after which only the current Room is left standing.
 */
export function isRoomPainted(world: World, room: RoomId): boolean {
  return world.rooms.current === room || world.rooms.leaving === room;
}

// 07: actors
/** Every Actor standing in this Room, as much as the DOM layer needs to paint. */
export function actorsIn(world: World, room: RoomId): readonly ActorView[] {
  return actorViewsIn(world.actors, room);
}

// 07: actors
/**
 * One Actor, or `null` if the apartment has not placed them yet.
 *
 * The Cast arrives Room by Room, so asking after a Cat before the Rooms they
 * roam exist is a fair question with a plain answer rather than a crash.
 */
export function actorView(world: World, actor: ActorId): ActorView | null {
  return findActorView(world.actors, actor);
}
