// 07: actors
import {
  DEFAULT_SEED,
  actorViewsIn,
  createActors,
  findActorView,
  gatherInto, // 17: cinema
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
// 05: loading
import { createLoading, declareAssets, everythingSettled, progressOf, settleAsset, type AssetOutcome, type LoadingSlice } from './loading';
import { createMotion, toggleMotion, withReducedMotion, type MotionSlice } from './motion';
import { parseRoute, type RoomId } from './rooms';
// 17: cinema — the Cinema Room's own marks and shelves.
import { isOnMark, seatOf } from './cinema';
// 06: audio
import { createAudio, isMusicSourceSwitchedOn, withFilmAudio, withInteraction, withMusicSourceToggled, withSoundToggled, type AudioSlice, type AudioTier } from './audio';
// end 06
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
  // 05: loading
  readonly loading: LoadingSlice;
  // 06: audio
  readonly audio: AudioSlice;
  // end 06
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
  // 05: loading — what there is to preload, and each asset as it arrives.
  | { readonly type: 'assets-declared'; readonly urls: readonly string[] }
  | { readonly type: 'asset-settled'; readonly url: string; readonly outcome: AssetOutcome }
  // 06: audio
  | { readonly type: 'visitor-interacted' }
  | { readonly type: 'sound-toggled' }
  | { readonly type: 'music-source-toggled'; readonly room: RoomId }
  | { readonly type: 'film-audio-started' }
  | { readonly type: 'film-audio-stopped' }
  // end 06
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
  const arriving = parseRoute(inputs.hash);
  return {
    language: resolveLanguage(inputs.storedLanguage),
    motion: createMotion(inputs.reducedMotion),
    rooms: { current: arriving, leaving: null, transition: 'settled' },
    // 05: loading
    loading: createLoading(),
    // 06: audio — nothing about sound survives the visit, so it takes no input.
    audio: createAudio(),
    // end 06
    // 07: actors
    // 17: the Room the visitor arrives in places its own Cast, so walking
    // straight in at `#/cinema` still finds the two of them sat down.
    actors: createActors(inputs.random ?? seededRandom(DEFAULT_SEED), arriving),
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
      return {
        ...world,
        rooms: { current: entering, leaving: world.rooms.current, transition },
        // 17: the Room being walked into puts its own Cast back on their
        // marks, so every Room is found the way its design note describes it.
        actors: gatherInto(world.actors, entering),
      };
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
    // 06: audio
    case 'visitor-interacted': {
      const audio = withInteraction(world.audio);
      return audio === world.audio ? world : { ...world, audio };
    }
    case 'sound-toggled': {
      return { ...world, audio: withSoundToggled(world.audio) };
    }
    case 'music-source-toggled': {
      return { ...world, audio: withMusicSourceToggled(world.audio, event.room) };
    }
    case 'film-audio-started':
    case 'film-audio-stopped': {
      const audio = withFilmAudio(world.audio, event.type === 'film-audio-started');
      return audio === world.audio ? world : { ...world, audio };
    }
    // end 06
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

// 06: audio
/**
 * May the visitor hear this tier right now?
 *
 * The one question the DOM layer's playback adapter asks before it plays
 * anything. Nothing at all is audible before the visitor's first interaction.
 */
export function isAudible(world: World, tier: AudioTier): boolean {
  if (!world.audio.interacted || world.audio.muted) return false;
  switch (tier) {
    case 'sfx':
      return true;
    case 'music':
      // The tier is the Room the visitor is in: a Room they have left is
      // silent, however its own Music Source was left standing.
      return isMusicSourceSwitchedOn(world.audio, world.rooms.current);
    case 'film':
      return world.audio.filmPlaying;
  }
}

/** Is the apartment allowed to make a sound at all? The header control's state. */
export function soundIsOn(world: World): boolean {
  return !world.audio.muted;
}

/**
 * Has this Room's Music Source been switched on?
 *
 * What the Music Source Prop paints as its own state, so it stays switched on
 * while the visitor is in another Room or has silenced everything.
 */
export function isMusicSourceOn(world: World, room: RoomId): boolean {
  return isMusicSourceSwitchedOn(world.audio, room);
}

/**
 * May this Room's music be heard right now?
 *
 * The per-Room form of the music tier, for the adapter holding one track per
 * Room: only the Room the visitor is in is ever allowed to play.
 */
export function isRoomMusicAudible(world: World, room: RoomId): boolean {
  return isCurrentRoom(world, room) && isAudible(world, 'music');
}
// end 06

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

// 17: cinema
/**
 * Is this Actor sitting in its beanbag in front of the screen?
 *
 * True of the Boy and the Girl while they are in the Cinema Room, standing
 * on their own seat and going nowhere — which is how the visitor finds them,
 * and what he goes back to when a shelf stops holding their attention.
 */
export function isSeated(world: World, actor: ActorId): boolean {
  const seat = seatOf(actor);
  if (!seat) return false;
  const view = findActorView(world.actors, actor);
  return !!view && view.room === 'cinema' && !view.moving && isOnMark(view.at, seat);
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
