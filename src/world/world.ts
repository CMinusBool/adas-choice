import { resolveLanguage, toggleLanguage, type Language } from './language';
import { createMotion, toggleMotion, withReducedMotion, type MotionSlice } from './motion';
import { parseRoute, type RoomId } from './rooms';
// 06: audio
import { createAudio, isMusicSourceSwitchedOn, withFilmAudio, withInteraction, withMusicSourceToggled, withSoundToggled, type AudioSlice, type AudioTier } from './audio';
// end 06

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
  // 06: audio
  readonly audio: AudioSlice;
  // end 06
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
  // 06: audio
  | { readonly type: 'visitor-interacted' }
  | { readonly type: 'sound-toggled' }
  | { readonly type: 'music-source-toggled'; readonly room: RoomId }
  | { readonly type: 'film-audio-started' }
  | { readonly type: 'film-audio-stopped' };
// end 06

/** Build the world the visitor arrives into. */
export function createWorld(inputs: WorldInputs): World {
  return {
    language: resolveLanguage(inputs.storedLanguage),
    motion: createMotion(inputs.reducedMotion),
    rooms: { current: parseRoute(inputs.hash), leaving: null, transition: 'settled' },
    // 06: audio — nothing about sound survives the visit, so it takes no input.
    audio: createAudio(),
    // end 06
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
  }
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
