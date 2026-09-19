// 14: the Entryway
import type { ActorId, Facing } from './actors';
import { ENTRYWAY_MARKS, ENTRYWAY_PROPS_AT_REST, type EntrywayProps } from './entryway';
import type { Point } from './stage';

/**
 * The moment that opens the page: the two of them coming home with three cats
 * in a backpack.
 *
 * Design note `design/10-entryway.md` §5 is the script, and this file is that
 * script written down as data. It holds one clock — seconds since the arrival
 * began — and answers two kinds of question about it. What the page should
 * *look* like at a given second (which Beat is playing, which state each Prop is
 * in, what each of them is wearing) is worked out from that second every time it
 * is asked, so nothing can drift out of step with the clock. What *happens* at a
 * given second — somebody setting off walking, a cat landing, a sound — is a cue,
 * and a cue fires once, as the clock crosses it.
 *
 * Nothing here moves an Actor itself: it says who should be sent where, and
 * `world.ts` hands that to `actors.ts`, which already knows how to walk the
 * floor. Time arrives as a `now` on a tick, as everywhere in the model.
 */

/** How far the arrival has got. */
export type ArrivalState =
  /** Not started. The hall is as the visitor found it: the settled tableau. */
  | 'pending'
  /** Running. The hall started empty and is filling up. */
  | 'playing'
  /** Over, however it ended. The settled tableau, and it will not play again. */
  | 'done';

/** How long the whole script runs, in seconds (§5.2). */
export const ARRIVAL_SECONDS = 11.9;

/** A shot in the design note's shot list (§6.4), by its id there. */
export type BeatId = 'S15' | 'S16' | 'S17' | 'S18' | 'S19' | 'S20' | 'S21' | 'S22';

/** What the two of them wear over the bible wardrobe while the coats are on. */
export type Costume = 'parka' | 'coat';

/** A rectangle on the stage, in stage units. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A Beat the DOM layer should be playing right now.
 *
 * A **box Beat** is anchored on a fixed stage rectangle rather than on a feet
 * point, because the figure travels inside the frame; a **duet Beat** carries
 * two Cast members on one sheet and so stands in for both their Actor sprites.
 * Both are in this list, because the only difference between them is how many
 * Actors the sheet is drawing.
 */
export interface PlayingBeat {
  /** The sheet, by its shot id in §6.4. */
  readonly id: BeatId;
  /** Where the frame's top-left sits on the stage. */
  readonly box: Box;
  /** Which frame of the sheet is showing, counting from zero. */
  readonly frame: number;
  /** How many frames the whole sheet holds. */
  readonly frames: number;
  readonly columns: number;
  /** Actors this sheet is drawing, whose own sprites must give way to it. */
  readonly hides: readonly ActorId[];
}

/** What the DOM layer needs in order to paint the arrival on any one frame. */
export interface ArrivalView {
  readonly state: ArrivalState;
  /** Seconds played, from 0 to `ARRIVAL_SECONDS`. */
  readonly seconds: number;
  readonly beats: readonly PlayingBeat[];
  /** What each of the two of them has on over the bible wardrobe. */
  readonly costumes: Readonly<Partial<Record<ActorId, Costume>>>;
  /** SFX names the last tick crossed, to play once and then forget. */
  readonly sfx: readonly string[];
}

/** Where the arrival has got to. Everything else is worked out from this. */
export interface ArrivalSlice {
  readonly state: ArrivalState;
  /** The `now` the arrival started at, or `null` until the first tick. */
  readonly startedAt: number | null;
  /** Seconds played; `-1` while playing but not yet ticked. Every cue at or
   *  before this has fired. */
  readonly seconds: number;
  readonly sfx: readonly string[];
}

/**
 * Something that happens at one moment of the script and is then over.
 *
 * `place` puts an Actor down where it was not before — the Girl stepping into
 * the doorway, a cat landing off the end of the bench. `send` gives one a mark
 * to walk to, at ticket 07's 190 units per second, which is where every
 * duration in §5.2 comes from. `sfx` is a sound to play once.
 */
export type ArrivalCue =
  | {
      readonly at: number;
      readonly kind: 'place';
      readonly actor: ActorId;
      readonly mark: Point;
      readonly facing: Facing;
    }
  | { readonly at: number; readonly kind: 'send'; readonly actor: ActorId; readonly mark: Point }
  | { readonly at: number; readonly kind: 'sfx'; readonly name: string };

const M = ENTRYWAY_MARKS;

/**
 * The script's cues, in time order (§5.2).
 *
 * Every walk is a `send` to a mark and nothing more: the distances between the
 * design note's marks are exactly what the model's walk speed turns into the
 * durations printed beside them, so the timing is a consequence of the geometry
 * rather than a second copy of it. The last two cues are the settled stances —
 * he turns to face her.
 */
const CUES: readonly ArrivalCue[] = [
  { at: 0, kind: 'sfx', name: 'keys' },
  { at: 0.8, kind: 'sfx', name: 'door-open' },
  { at: 1.4, kind: 'place', actor: 'girl', mark: M.T, facing: 'right' },
  { at: 1.4, kind: 'send', actor: 'girl', mark: M.G1 },
  { at: 2.2, kind: 'place', actor: 'boy', mark: M.T, facing: 'right' },
  { at: 2.2, kind: 'send', actor: 'boy', mark: M.B1 },
  { at: 4, kind: 'sfx', name: 'door-close' },
  { at: 4.4, kind: 'sfx', name: 'backpack-down' },
  { at: 4.9, kind: 'sfx', name: 'coat' },
  { at: 6.3, kind: 'send', actor: 'girl', mark: M.G2 },
  { at: 7.2, kind: 'sfx', name: 'coat' },
  { at: 7.4, kind: 'sfx', name: 'zip' },
  { at: 8.35, kind: 'send', actor: 'boy', mark: M.BS },
  { at: 8.5, kind: 'sfx', name: 'mica-meow' },
  { at: 9.35, kind: 'place', actor: 'mica', mark: M.EMica, facing: 'left' },
  { at: 9.7, kind: 'sfx', name: 'mira-meow' },
  { at: 10.35, kind: 'place', actor: 'mira', mark: M.EMira, facing: 'right' },
  { at: 10.85, kind: 'send', actor: 'girl', mark: M.GS },
  { at: 11.2, kind: 'sfx', name: 'luna-meow' },
  { at: 11.85, kind: 'place', actor: 'luna', mark: M.ELuna, facing: 'left' },
  { at: ARRIVAL_SECONDS, kind: 'place', actor: 'girl', mark: M.GS, facing: 'right' },
  { at: ARRIVAL_SECONDS, kind: 'place', actor: 'boy', mark: M.BS, facing: 'left' },
];

/**
 * When each Prop takes each of its states (§5.2), in time order.
 *
 * One list per Prop, so the last entry the clock has passed is that Prop's
 * state and nothing has to be kept in step by hand.
 */
const PROP_TIMELINE = {
  frontDoor: [
    [0.8, 'opening'],
    [1.4, 'open'],
    [3.4, 'closing'],
    [4, 'closed'],
  ],
  backpack: [
    [4.65, 'closed'],
    [7.8, 'open'],
  ],
  girlCoat: [[6.9, 'hung']],
  boyParka: [[8.05, 'hung']],
} as const satisfies { [K in keyof EntrywayProps]: ReadonlyArray<readonly [number, EntrywayProps[K]]> };

/** When each Beat runs, where it sits, and how its sheet is laid out (§6.4). */
interface BeatCue {
  readonly id: BeatId;
  readonly at: number;
  /** How long it is on screen; a held last frame lengthens this. */
  readonly seconds: number;
  readonly box: Box;
  readonly frames: number;
  readonly columns: number;
  readonly fps: number;
  readonly hides: readonly ActorId[];
  /** Where in the sheet this run starts, for a sheet played in two halves. */
  readonly from?: number;
}

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({
  x: x0,
  y: y0,
  width: x1 - x0,
  height: y1 - y0,
});

const BEATS: readonly BeatCue[] = [
  { id: 'S15', at: 3.65, seconds: 1, box: box(296, 320, 520, 700), frames: 8, columns: 4, fps: 8, hides: ['boy'] },
  { id: 'S16', at: 4.8, seconds: 1.35, box: box(320, 364, 612, 700), frames: 8, columns: 4, fps: 6, hides: ['boy', 'girl'] },
  { id: 'S17', at: 6.3, seconds: 0.75, box: box(330, 300, 540, 700), frames: 6, columns: 4, fps: 8, hides: ['boy'] },
  { id: 'S18', at: 7.05, seconds: 1, box: box(330, 300, 570, 700), frames: 8, columns: 4, fps: 8, hides: ['boy'] },
  // She goes down onto one knee and pulls the zip in frames 1-4, and frame 4 is
  // held for as long as the cats take; frames 5-8 stand her back up after Mira.
  { id: 'S19', at: 7.1, seconds: 3.25, box: box(280, 400, 470, 744), frames: 4, columns: 4, fps: 8, hides: ['girl'] },
  { id: 'S19', at: 10.35, seconds: 0.5, box: box(280, 400, 470, 744), frames: 4, columns: 4, fps: 8, hides: ['girl'], from: 4 },
  // The cats are not Actors while their Beat is playing, so a Beat hides nobody.
  { id: 'S20', at: 8.1, seconds: 1.25, box: box(240, 430, 450, 730), frames: 10, columns: 4, fps: 8, hides: [] },
  { id: 'S21', at: 9.35, seconds: 1, box: box(330, 430, 560, 790), frames: 8, columns: 4, fps: 8, hides: [] },
  { id: 'S22', at: 10.35, seconds: 1.5, box: box(330, 424, 790, 860), frames: 12, columns: 4, fps: 8, hides: [] },
];

/** Until when each of the two of them is still in their coat (§5.2). */
const COSTUMES: ReadonlyArray<{ readonly actor: ActorId; readonly costume: Costume; readonly until: number }> = [
  // She is in the teal bomber from the moment the duet Beat hands her coat over.
  { actor: 'girl', costume: 'coat', until: 6.15 },
  // He keeps the parka on until he has hung it, and is in the coral hoodie after.
  { actor: 'boy', costume: 'parka', until: 8.05 },
];

/** The arrival as the visitor finds it: already over, or waiting to be started. */
export function createArrival(over: boolean): ArrivalSlice {
  return { state: over ? 'done' : 'pending', startedAt: null, seconds: over ? ARRIVAL_SECONDS : 0, sfx: [] };
}

/**
 * The arrival, started.
 *
 * Refused once it is over: turning motion back on, or walking into the Entryway
 * again, must not replay a moment the visitor has already had. The clock is not
 * set here — the first tick does that, because that is the first time the model
 * is told what time it is.
 */
export function startArrival(arrival: ArrivalSlice): ArrivalSlice {
  if (arrival.state !== 'pending') return arrival;
  return { state: 'playing', startedAt: null, seconds: -1, sfx: [] };
}

/** The cues in `(from, to]`, which is how each one fires exactly once. */
function crossed(from: number, to: number): readonly ArrivalCue[] {
  return CUES.filter(cue => cue.at > from && cue.at <= to);
}

/** The same slice with last tick's sounds forgotten, so none is played twice. */
function quiet(arrival: ArrivalSlice): ArrivalSlice {
  return arrival.sfx.length === 0 ? arrival : { ...arrival, sfx: [] };
}

/** The arrival one tick on, and everything that happened during that tick. */
export function tickArrival(
  arrival: ArrivalSlice,
  now: number,
): { readonly arrival: ArrivalSlice; readonly cues: readonly ArrivalCue[] } {
  if (arrival.state !== 'playing') return { arrival, cues: [] };
  // The very first tick, or a clock that restarted, measures from itself.
  if (arrival.startedAt === null || now < arrival.startedAt) {
    return { arrival: { ...quiet(arrival), startedAt: now - Math.max(0, arrival.seconds) * 1000 }, cues: [] };
  }
  const seconds = (now - arrival.startedAt) / 1000;
  if (seconds <= arrival.seconds) return { arrival: quiet(arrival), cues: [] };
  if (seconds >= ARRIVAL_SECONDS) return finishArrival(arrival);
  const cues = crossed(arrival.seconds, seconds);
  const sfx = cues.flatMap(cue => (cue.kind === 'sfx' ? [cue.name] : []));
  return { arrival: { ...arrival, seconds, sfx }, cues };
}

/**
 * The arrival, over now, and every cue it had not reached yet.
 *
 * What pausing motion, or walking out of the Room, means: the outcome of the
 * whole script at once, so the visitor never comes back to find it half done.
 * The caller applies the cues with motion off, exactly as a walk settles.
 */
export function finishArrival(
  arrival: ArrivalSlice,
): { readonly arrival: ArrivalSlice; readonly cues: readonly ArrivalCue[] } {
  if (arrival.state === 'done') return { arrival, cues: [] };
  // A `pending` arrival never emptied the hall, so there is nothing to catch up.
  const cues = arrival.state === 'pending' ? [] : crossed(arrival.seconds, ARRIVAL_SECONDS);
  return { arrival: { state: 'done', startedAt: arrival.startedAt, seconds: ARRIVAL_SECONDS, sfx: [] }, cues };
}

/** How far into the script the page should be painting. */
function playhead(arrival: ArrivalSlice): number {
  return arrival.state === 'playing' ? Math.max(0, arrival.seconds) : ARRIVAL_SECONDS;
}

/** The last state of a Prop the clock has reached, or the one it started in. */
function stateAt<T>(cues: ReadonlyArray<readonly [number, T]>, seconds: number, atRest: T): T {
  let state = atRest;
  for (const [at, next] of cues) if (at <= seconds) state = next;
  return state;
}

/**
 * Which state each Prop is in.
 *
 * Folded out of the script every time rather than stored, so a Prop can never
 * disagree with the clock — and so the settled tableau is simply the script read
 * at its last second, which is what both the `pending` and the `done` hall show.
 */
export function propsAt(arrival: ArrivalSlice): EntrywayProps {
  const seconds = playhead(arrival);
  return {
    frontDoor: stateAt(PROP_TIMELINE.frontDoor, seconds, ENTRYWAY_PROPS_AT_REST.frontDoor),
    backpack: stateAt(PROP_TIMELINE.backpack, seconds, ENTRYWAY_PROPS_AT_REST.backpack),
    girlCoat: stateAt(PROP_TIMELINE.girlCoat, seconds, ENTRYWAY_PROPS_AT_REST.girlCoat),
    boyParka: stateAt(PROP_TIMELINE.boyParka, seconds, ENTRYWAY_PROPS_AT_REST.boyParka),
  };
}

/** What the DOM layer should paint of the arrival right now. */
export function viewArrival(arrival: ArrivalSlice): ArrivalView {
  const seconds = playhead(arrival);
  const playing = arrival.state === 'playing';
  const beats: PlayingBeat[] = !playing
    ? []
    : BEATS.filter(beat => seconds >= beat.at && seconds < beat.at + beat.seconds).map(beat => ({
        id: beat.id,
        box: beat.box,
        // A sheet that runs out before its Beat does holds its last frame: she
        // stays down on one knee for as long as the three of them take.
        frame: (beat.from ?? 0) + Math.min(beat.frames - 1, Math.floor((seconds - beat.at) * beat.fps)),
        frames: beat.frames,
        columns: beat.columns,
        hides: beat.hides,
      }));
  const costumes: Partial<Record<ActorId, Costume>> = {};
  if (playing) for (const worn of COSTUMES) if (seconds < worn.until) costumes[worn.actor] = worn.costume;
  return { state: arrival.state, seconds, beats, costumes, sfx: arrival.sfx };
}
