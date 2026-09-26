import { copy, type CopyKey } from '../copy';
import { ROOM_IDS, anySoundShips, isAudible, isMusicSourceOn, isRoomMusicAudible, soundIsOn, type AudioSlice, type Language, type RoomId, type World } from '../world';
import { byId, type Dispatch, type Painter } from './painter';

/**
 * The apartment's playback: the only place an `HTMLAudioElement` is allowed.
 *
 * It decides nothing. Whether a sound may be heard is the world model's answer
 * — `isAudible`, `isRoomMusicAudible` — and this file only carries that answer
 * out to the browser. The header control, the Music Source Props and the
 * first-interaction listener all report back as events and wait to be painted.
 */

/** A sound file's URL, relative to the built page, as it is served from `dist/`. */
type SoundUrl = string;

/**
 * Every sound the apartment can play, by tier and name.
 *
 * Empty, and deliberately so: this ticket ships the plumbing, and each sound
 * arrives with the thing that makes it — the cats (08), the Breakables (09),
 * the Rooms' music (14-17), the Bumper and the Films (20). Everything below
 * no-ops cleanly while a tier is empty, so a later ticket adds a line here and
 * a call, and nothing else.
 *
 * A file added here belongs in `public/assets/` and keeps its relative URL
 * (`assets/meow.mp3`): the bundler never sees these strings, so it cannot
 * rewrite them, and the post-build check cannot see them either.
 */
export const SOUNDS: {
  /** Short sounds tied to something happening, by name: a meow, a breakage. */
  readonly sfx: Readonly<Record<string, SoundUrl>>;
  /** One Room Music track per Room, for the Rooms that have one. */
  readonly music: Readonly<Partial<Record<RoomId, SoundUrl>>>;
  /** The Bumper and each Film's audio, by name. */
  readonly film: Readonly<Record<string, SoundUrl>>;
} = { sfx: {}, music: {}, film: {} };

/** The world as last painted, so the helpers below can ask it before playing. */
let world: World | null = null;

/** One element per registered URL, made on first use. */
const elements = new Map<SoundUrl, HTMLAudioElement>();

function elementFor(url: SoundUrl | undefined): HTMLAudioElement | null {
  if (!url) return null;
  let element = elements.get(url);
  if (!element) {
    element = new Audio(url);
    elements.set(url, element);
  }
  return element;
}

function start(element: HTMLAudioElement, loop: boolean) {
  element.loop = loop;
  // Autoplay can still refuse — the model's interaction gate makes that
  // unlikely, and a refusal is a quiet apartment, not an error in the console.
  void element.play().catch(() => {});
}

/**
 * Play an SFX by name, if the visitor is allowed to hear it.
 *
 * A meow, a Breakable hitting the floor: one-shot, restarted each time so a
 * second cat is not swallowed by the first.
 */
export function playSfx(name: string): void {
  if (!world || !isAudible(world, 'sfx')) return;
  const element = elementFor(SOUNDS.sfx[name]);
  if (!element) return;
  element.currentTime = 0;
  start(element, false);
}

/**
 * Start or stop one Room's Room Music.
 *
 * Starting is a request, not an instruction: the model has the last word, so a
 * Room the visitor has left, or a muted apartment, stays quiet. Stopping always
 * obeys, and never rewinds — the track resumes where the veil fell.
 */
export function setRoomMusic(room: RoomId, playing: boolean): void {
  const element = elementFor(SOUNDS.music[room]);
  if (!element) return;
  if (playing && world && isRoomMusicAudible(world, room)) start(element, true);
  else element.pause();
}

/** The Film-tier track the projector has running, so the veil can lift off it. */
let filmTrack: HTMLAudioElement | null = null;

/**
 * Start the named Film-tier track — the Bumper, then the Film — or stop it.
 *
 * `null` stops whatever is playing. Ticket 20 owns the order of the sequence;
 * this only plays what it is handed, and only while the model says a Film is
 * running and the apartment is not muted.
 */
export function setFilmAudio(name: string | null): void {
  const next = name === null ? null : elementFor(SOUNDS.film[name]);
  if (filmTrack && filmTrack !== next) filmTrack.pause();
  filmTrack = next;
  if (!filmTrack || !world || !isAudible(world, 'film')) return;
  filmTrack.currentTime = 0;
  start(filmTrack, false);
}

/**
 * Paint the sound control, the Music Sources, and what is actually playing.
 *
 * The header control mirrors the motion control: an imperative, per-language
 * label and `aria-pressed`. A Music Source is bound by `data-music-source`
 * rather than by id, so any Prop a later ticket marks up — the Cinema Room's
 * projector included — becomes one without touching this file.
 */
export const mountSound = (dispatch: Dispatch): Painter => {
  const toggle = byId<HTMLButtonElement>('sound-toggle');
  toggle.addEventListener('click', () => dispatch({ type: 'sound-toggled' }));
  // 101: offered only once there is something to hear. `hidden` also takes it
  // out of the Tab order, in either language.
  toggle.hidden = !anySoundShips(SOUNDS);

  // Browsers refuse playback until the visitor has acted, and so does the
  // model. One listener, the first of either kind, and then never again.
  const observeFirstInteraction = () => {
    removeEventListener('pointerdown', observeFirstInteraction);
    removeEventListener('keydown', observeFirstInteraction);
    dispatch({ type: 'visitor-interacted' });
  };
  addEventListener('pointerdown', observeFirstInteraction, { passive: true });
  addEventListener('keydown', observeFirstInteraction);

  byId('apartment').addEventListener('click', event => {
    const source = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-music-source]') : null;
    if (source) dispatch({ type: 'music-source-toggled', room: source.dataset.musicSource as RoomId });
  });

  let painted: { audio: AudioSlice; room: RoomId; language: Language } | null = null;
  return (next: World) => {
    world = next;
    const { audio, language } = next;
    const room = next.rooms.current;
    if (painted && painted.audio === audio && painted.room === room && painted.language === language) return;
    painted = { audio, room, language };
    const words = copy[language];

    const on = soundIsOn(next);
    const label = on ? words.mute : words.unmute;
    byId('sound-label').textContent = label;
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('aria-pressed', String(!on));

    for (const element of document.querySelectorAll<HTMLElement>('[data-music-source]')) {
      const source = element.dataset.musicSource as RoomId;
      const playing = isMusicSourceOn(next, source);
      element.setAttribute('aria-pressed', String(playing));
      // 17: a Music Source that is a real Prop rather than a placeholder can
      // say what it is — the Cinema Room's projector offers to run its motor,
      // not to "play the Room's music" — by naming its own two copy keys.
      const start = (element.dataset.labelStart ?? 'musicSourceStart') as CopyKey;
      const stop = (element.dataset.labelStop ?? 'musicSourceStop') as CopyKey;
      element.querySelector<HTMLElement>('[data-music-source-label]')!.textContent = words[playing ? stop : start];
      element.hidden = false;
    }

    // Mute is a veil rather than a reset, so this pauses and resumes; it never
    // switches a Music Source off on the visitor's behalf.
    for (const id of ROOM_IDS) setRoomMusic(id, isRoomMusicAudible(next, id));
    if (filmTrack) {
      if (isAudible(next, 'film')) start(filmTrack, false);
      else filmTrack.pause();
    }
  };
};
