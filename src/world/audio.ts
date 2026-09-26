import type { RoomId } from './rooms';

/**
 * The three tiers of sound, and who is allowed to hear them.
 *
 * Nothing here plays anything: the model decides audibility and the DOM layer's
 * adapter carries the answer out to an `HTMLAudioElement`. Every rule about
 * when a sound may be heard lives here, so there is one place to read them.
 */
export type AudioTier = 'sfx' | 'music' | 'film';

/** What the apartment sounds like right now. */
export interface AudioSlice {
  /**
   * The visitor has touched or typed something.
   *
   * Browsers refuse playback until a gesture has happened, and the apartment
   * wants nothing playing at the visitor unprompted, so the model keeps the
   * same gate rather than fighting it: before this, every tier is silent.
   */
  readonly interacted: boolean;
  /**
   * The header control has silenced everything.
   *
   * A veil over the tiers rather than a reset: what was playing stays switched
   * on underneath, so lifting it brings back exactly what was there.
   */
  readonly muted: boolean;
  /**
   * The Rooms whose Music Source the visitor has switched on.
   *
   * A Music Source is a Prop in the Room, not a control in the interface, and
   * it stays switched on while the visitor is elsewhere or while everything is
   * muted — a Room the visitor comes back to picks its music up again.
   */
  readonly musicSourcesOn: readonly RoomId[];
  /**
   * A Film is running on the projector, Bumper included.
   *
   * Derived, never reported. `withFilmSound` recomputes this from the Cinema
   * Room's own state on every tick, so there is no event that sets it: one
   * dispatched from the DOM layer would be overwritten by the next tick, and
   * the two would disagree about §9's rule that the Room Music falls silent
   * while a picture is up.
   */
  readonly filmPlaying: boolean;
}

/**
 * 101: Does the apartment ship anything to hear?
 *
 * The header's sound control is offered only when it does. With every tier
 * empty it would change nothing anyone can hear, so it stays hidden — and so
 * out of the Tab order — until a ticket adds the first sound to any tier.
 */
export function anySoundShips(sounds: { readonly [tier in AudioTier]: Readonly<Record<string, string | undefined>> }): boolean {
  return Object.values(sounds).some(tier => Object.values(tier).some(Boolean));
}

/** The apartment as the visitor finds it: silent, and waiting to be touched. */
export function createAudio(): AudioSlice {
  return { interacted: false, muted: false, musicSourcesOn: [], filmPlaying: false };
}

/** Audio after the visitor's first interaction. Only the first one matters. */
export function withInteraction(audio: AudioSlice): AudioSlice {
  return audio.interacted ? audio : { ...audio, interacted: true };
}

/** Audio after the visitor uses the header control. */
export function withSoundToggled(audio: AudioSlice): AudioSlice {
  return { ...audio, muted: !audio.muted };
}

/** Audio after the visitor clicks one Room's Music Source. */
export function withMusicSourceToggled(audio: AudioSlice, room: RoomId): AudioSlice {
  const on = isMusicSourceSwitchedOn(audio, room);
  const musicSourcesOn = on ? audio.musicSourcesOn.filter(other => other !== room) : [...audio.musicSourcesOn, room];
  return { ...audio, musicSourcesOn };
}

/** Has this Room's Music Source been switched on? Mute does not change this. */
export function isMusicSourceSwitchedOn(audio: AudioSlice, room: RoomId): boolean {
  return audio.musicSourcesOn.includes(room);
}

/** Audio after a Film starts or stops. */
export function withFilmAudio(audio: AudioSlice, playing: boolean): AudioSlice {
  return audio.filmPlaying === playing ? audio : { ...audio, filmPlaying: playing };
}
