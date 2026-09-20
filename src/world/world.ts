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
// 18: and the errand that fetches Posters off one of them.
import {
  CINEMA_MARKS,
  boyMark,
  createCinema,
  isOnMark,
  openShelfOf,
  seatOf,
  settleCinema,
  stepCinema,
  withAttendedShelf,
  withChosenShelf,
  type CinemaShelf,
  type CinemaSlice,
  type CinemaStep,
} from './cinema';
// 18: films
import type { FilmId } from './films';
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
  // 17: cinema
  readonly cinema: CinemaSlice;
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
    }
  // 17: cinema — which bookshelf the visitor's pointer or focus is on, or
  // `null` for none. What it means for the Boy is the model's decision.
  | { readonly type: 'cinema-shelf-attended'; readonly shelf: CinemaShelf | null }
  // 18: cinema — a bookshelf clicked or activated. `now` is the clock the
  // errand's Beats are timed against; it is the same reading the ticks carry,
  // because the model is never allowed to ask what time it is.
  | { readonly type: 'cinema-shelf-chosen'; readonly shelf: CinemaShelf; readonly now: number };

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
    // 17: cinema
    cinema: createCinema(),
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
        // 17: a shelf cannot hold the attention of a visitor who has walked
        // out. 18: the errand he was on finishes rather than being abandoned,
        // so the wall they come back to shows the Posters he went to fetch.
        cinema: settleCinema(world.cinema),
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
      // 18: and an errand in progress ends with its Posters on the wall rather
      // than with the Boy standing at a shelf holding three tubes for ever.
      return runErrand({ ...world, motion, actors }, null);
    }
    case 'reduced-motion-changed': {
      const motion = withReducedMotion(world.motion, event.reducedMotion);
      if (motion === world.motion) return world;
      // 07: actors. 18: and the errand settles with them.
      const actors = motion.paused ? settleActors(world.actors) : world.actors;
      return runErrand({ ...world, motion, actors }, null);
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
      // 18: the same tick is the Cinema Room's clock: the errand's Beats end
      // on it, and so does each leg of the walk it is waiting on.
      return runErrand(actors === world.actors ? world : { ...world, actors }, event.now);
    }
    // 07: actors
    case 'actor-sent': {
      const actors = sendActor(world.actors, event.actor, event.goal, event.cycle ?? 'walk', motionIsOn(world));
      return actors === world.actors ? world : { ...world, actors };
    }
    // 17: cinema — a shelf catching the visitor's eye is what sends the Boy
    // over to it, and losing it is what sends him back to his beanbag. A
    // report from anywhere but the Cinema Room means nothing here.
    case 'cinema-shelf-attended': {
      if (world.rooms.current !== 'cinema') return world;
      const cinema = withAttendedShelf(world.cinema, event.shelf);
      if (cinema === world.cinema) return world;
      // 18: attention still lights the shelf up while he is on an errand, but
      // it stops moving him: a pointer wandering across the Room mid-rummage
      // would otherwise strand him halfway through it.
      if (world.cinema.step !== 'seated') return { ...world, cinema };
      const actors = sendActor(world.actors, 'boy', boyMark(event.shelf), 'walk', motionIsOn(world));
      return { ...world, cinema, actors };
    }
    // 18: cinema — a bookshelf chosen. Whatever he was doing, he goes to this
    // shelf, rummages in it, and pins its three Posters to the board.
    case 'cinema-shelf-chosen': {
      if (world.rooms.current !== 'cinema') return world;
      const cinema = withChosenShelf(world.cinema, event.shelf);
      const actors = sendActor(world.actors, 'boy', CINEMA_MARKS.shelves[event.shelf], 'walk', motionIsOn(world));
      return runErrand({ ...world, cinema, actors }, event.now);
    }
  }
}

// 18: cinema
/**
 * How far the Cinema Room's errand can get right now.
 *
 * Each turn of the loop asks the Room what the Boy's position and the clock
 * mean for it, and carries out the one move it asks for. With motion on that is
 * at most one step a frame, because every step that follows is waiting on a
 * walk or a Beat that has only just started. With motion off nothing waits: the
 * loop runs the whole errand out in this one call, which is how the Posters
 * still reach the wall for a visitor who asked the apartment to hold still.
 */
function runErrand(world: World, now: number | null): World {
  if (world.rooms.current !== 'cinema' || world.cinema.step === 'seated') return world;
  const motionOn = motionIsOn(world);
  let next = world;
  // The errand is nine steps long, so a loop that has not settled by twice that
  // is one that never will; the bound is a guard, not a schedule.
  for (let turn = 0; turn < 24; turn += 1) {
    const boy = findActorView(next.actors, 'boy');
    if (!boy) return next;
    const progress = stepCinema(next.cinema, { at: boy.at, moving: boy.moving }, now, motionOn);
    if (progress.slice === next.cinema && progress.sendBoyTo === null) return next;
    const actors = progress.sendBoyTo
      ? sendActor(next.actors, 'boy', progress.sendBoyTo, 'walk', motionOn)
      : next.actors;
    next = { ...next, cinema: progress.slice, actors };
  }
  return next;
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

/**
 * Has the visitor turned motion on themselves?
 *
 * The one case in which a reduced-motion request from their system is set
 * aside. `motionIsOn` alone cannot separate a system that never asked from a
 * visitor who overruled it, and the stylesheet needs exactly that difference.
 */
export function motionIsOnByChoice(world: World): boolean {
  return world.motion.chosenByVisitor && !world.motion.paused;
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
/** The bookshelf the visitor's attention is on, for the Room to light up. */
export function attendedShelf(world: World): CinemaShelf | null {
  return world.cinema.attended;
}

// 18: cinema
/** Where the Room's errand has got to, for the Beat the DOM layer is playing. */
export function cinemaStep(world: World): CinemaStep {
  return world.cinema.step;
}

/**
 * The Posters on the wall, in the order he pinned them.
 *
 * One entry per filled slot, so the list grows from none to three as the pin
 * Beats finish and the board paints exactly what is up.
 */
export function pinnedPosters(world: World): readonly FilmId[] {
  return world.cinema.pinned;
}

/** The genre whose Posters are on the wall, or `null` while it is bare. */
export function openShelf(world: World): CinemaShelf | null {
  return openShelfOf(world.cinema);
}

/**
 * The bookshelf he has his arm in right now, or `null`.
 *
 * What makes the rummage visible on the shelf itself — the tubes rattling in
 * their cubbies — which matters because the Beat is otherwise 1.8 seconds of a
 * Boy standing still.
 */
export function rummagingShelf(world: World): CinemaShelf | null {
  return world.cinema.step === 'rummaging' ? world.cinema.errand : null;
}

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
