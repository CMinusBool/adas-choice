import { resolveLanguage, toggleLanguage, type Language } from './language';
// 05: loading
import { createLoading, declareAssets, everythingSettled, progressOf, settleAsset, type AssetOutcome, type LoadingSlice } from './loading';
import { createMotion, toggleMotion, withReducedMotion, type MotionSlice } from './motion';
import { parseRoute, type RoomId } from './rooms';

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
  // 05: loading
  readonly loading: LoadingSlice;
}

/** What the DOM layer knows at start-up that the model cannot ask for itself. */
export interface WorldInputs {
  /** `location.hash`, exactly as the browser reports it. */
  readonly hash: string;
  /** Whatever storage returned for the language preference, or `null`. */
  readonly storedLanguage: string | null | undefined;
  /** Whether the visitor's system asks for reduced motion. */
  readonly reducedMotion: boolean;
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
  // 05: loading — what there is to preload, and each asset as it arrives.
  | { readonly type: 'assets-declared'; readonly urls: readonly string[] }
  | { readonly type: 'asset-settled'; readonly url: string; readonly outcome: AssetOutcome };

/** Build the world the visitor arrives into. */
export function createWorld(inputs: WorldInputs): World {
  return {
    language: resolveLanguage(inputs.storedLanguage),
    motion: createMotion(inputs.reducedMotion),
    rooms: { current: parseRoute(inputs.hash), leaving: null, transition: 'settled' },
    // 05: loading
    loading: createLoading(),
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
      return { ...world, motion: toggleMotion(world.motion) };
    }
    case 'reduced-motion-changed': {
      const motion = withReducedMotion(world.motion, event.reducedMotion);
      return motion === world.motion ? world : { ...world, motion };
    }
    case 'language-toggled': {
      return { ...world, language: toggleLanguage(world.language) };
    }
    // 05: loading — both report rather than decide, and both can be a report the
    // model has nothing to do with: an asset declared twice, or settling twice.
    case 'assets-declared': {
      const loading = declareAssets(world.loading, event.urls);
      return loading === world.loading ? world : { ...world, loading };
    }
    case 'asset-settled': {
      const loading = settleAsset(world.loading, event.url, event.outcome);
      return loading === world.loading ? world : { ...world, loading };
    }
  }
}

// 05: loading
/**
 * Is the apartment ready for the visitor?
 *
 * False until every declared asset has settled, which is what holds the loading
 * screen up and keeps the apartment behind it out of reach.
 */
export function isInteractive(world: World): boolean {
  return everythingSettled(world.loading);
}

/** How far the preload has got, from 0 to 1, for the indicator to paint. */
export function loadingProgress(world: World): number {
  return progressOf(world.loading);
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
