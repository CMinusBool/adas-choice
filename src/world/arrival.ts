// 14: the Entryway
// 44: and every other Room's own, shorter, entrance.
import { ACTOR_IDS, cycleWithin, type ActorId, type CycleId, type Facing } from './actors';
import { ENTRYWAY_MARKS, ENTRYWAY_PROPS_AT_REST, type EntrywayProps } from './entryway';
import type { RoomId } from './rooms';
import { distance, type Point } from './stage';

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
 *
 * 44: there are two scripts in this file now, and one clock behind both. The
 * Entryway's is the long one above — the front door of the page, seen once. The
 * other three Rooms share the short one at the foot of the file, played on
 * every entry, because a Room is a place you walk into rather than one you find
 * already settled. They are the same machine: a list of cues in time order, a
 * Prop timeline folded out of the clock rather than stored, and two ways to
 * end — the script running out, or being cut short.
 */

/** How far the arrival has got. */
export type ArrivalState =
  /** Not started. The hall is the script's first frame: empty, the door shut. */
  | 'pending'
  /** Running. The hall started empty and is filling up. */
  | 'playing'
  /** Over, however it ended. The settled tableau, and it will not play again. */
  | 'done';

/** How long the whole script runs, in seconds (§5.2). */
export const ARRIVAL_SECONDS = 11.9;

/**
 * How long after the apartment opens on a Room the page reports
 * `arrival-started`, in milliseconds.
 *
 * The Entryway's is design note §5.1's beat of the empty hall before anything
 * moves in it; every other Room's is the moment before its Door swings. The wait
 * itself is the page's to keep, because the model holds no timer — this is only
 * its length, written once for `src/dom/entryway.ts`, `src/dom/arrival.ts` and
 * `scripts/verify/breakable-fall.mjs`, which has to know when the clock started.
 */
export const DOORSTEP_MS: Readonly<Record<RoomId, number>> = { entryway: 600, games: 400, cinema: 400, activities: 400 };

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
 *
 * 44: a `send` may also say which Cycle carries the Actor and which way it
 * turns once it gets there. Both are left out by the Entryway's script, whose
 * walks are all walks and whose settled stances are `place` cues of their own.
 */
export type ArrivalCue =
  | {
      readonly at: number;
      readonly kind: 'place';
      readonly actor: ActorId;
      readonly mark: Point;
      readonly facing: Facing;
    }
  | {
      readonly at: number;
      readonly kind: 'send';
      readonly actor: ActorId;
      readonly mark: Point;
      readonly cycle?: CycleId;
      readonly facing?: Facing;
    }
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
 *
 * 86: three `place` cues stand an Actor where its Beat's last frame leaves
 * its feet — `B2`, `B3` with `G1b`, and `B4` — each fired while that Beat is
 * still drawing them, so the sprite that takes over stands exactly where the
 * figure did. A Beat moves its figure inside the frame (S15 alone ends 26
 * units from where it starts), and the closing rule is that no hand-off moves
 * the feet more than 6 units. No cue was re-timed: every walk on the smaller
 * stage still ends before that Actor's next cue.
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
  { at: 4.6, kind: 'place', actor: 'boy', mark: M.B2, facing: 'right' },
  { at: 4.9, kind: 'sfx', name: 'coat' },
  { at: 6.1, kind: 'place', actor: 'boy', mark: M.B3, facing: 'right' },
  { at: 6.1, kind: 'place', actor: 'girl', mark: M.G1b, facing: 'right' },
  { at: 6.3, kind: 'send', actor: 'girl', mark: M.G2 },
  { at: 7.2, kind: 'sfx', name: 'coat' },
  { at: 7.4, kind: 'sfx', name: 'zip' },
  { at: 8, kind: 'place', actor: 'boy', mark: M.B4, facing: 'right' },
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

/**
 * How much smaller each cat's Beats are drawn than their sheets were made for
 * (82, design 75 §0.5): the sheets were cut at the old cat heights, 96 / 96 /
 * 105 units, and the cats now stand 61 / 61 / 66 against the Boy's 300.
 */
const CAT_BEAT_SCALE = { mica: 0.635, mira: 0.635, luna: 0.629 } as const;

/** A box scaled about its bottom-centre, so whatever stands on its floor stays put. */
const shrunk = (from: Box, factor: number): Box => {
  const width = from.width * factor;
  const height = from.height * factor;
  return { x: from.x + (from.width - width) / 2, y: from.y + from.height - height, width, height };
};

// 86: the Entryway on its 1184 x 666 stage (design 75 §4.2). A Beat keeps the
// size it was drawn at (1.5 px a unit); only its box moves. The Boy's four and
// the duet are one chain, each placed so its first frame's feet stand where the
// last one's left them (the marks in `entryway.ts`), and the chain is hung from
// S18's seventh frame, the parka's collar on hook 1. S19 puts her first and
// last frames' feet 4.6 units either side of `G2`, her hands towards the
// backpack on the bench seat.
const BEATS: readonly BeatCue[] = [
  { id: 'S15', at: 3.65, seconds: 1, box: box(226.4, 119.5, 450.4, 499.5), frames: 8, columns: 4, fps: 8, hides: ['boy'] },
  { id: 'S16', at: 4.8, seconds: 1.35, box: box(235.7, 140.8, 527.7, 476.8), frames: 8, columns: 4, fps: 6, hides: ['boy', 'girl'] },
  { id: 'S17', at: 6.3, seconds: 0.75, box: box(236, 62.8, 446, 462.8), frames: 6, columns: 4, fps: 8, hides: ['boy'] },
  { id: 'S18', at: 7.05, seconds: 1, box: box(199, 60.8, 439, 460.8), frames: 8, columns: 4, fps: 8, hides: ['boy'] },
  // She goes down onto one knee and pulls the zip in frames 1-4, and frame 4 is
  // held for as long as the cats take; frames 5-8 stand her back up after Mira.
  { id: 'S19', at: 7.1, seconds: 3.25, box: box(202.5, 147, 392.5, 491), frames: 4, columns: 4, fps: 8, hides: ['girl'] },
  { id: 'S19', at: 10.35, seconds: 0.5, box: box(202.5, 147, 392.5, 491), frames: 4, columns: 4, fps: 8, hides: ['girl'], from: 4 },
  // The cats are not Actors while their Beat is playing, so a Beat hides nobody.
  // 82: the cats at real size (design 75 §0.5) — each sheet is drawn at the old
  // cat height, so its box shrinks by the cat's own factor about its
  // bottom-centre: Míca and Mira × 0.635 (96 → 61), Luna × 0.629 (105 → 66).
  // 86: the boxes they were cut for, moved to design 75 §4.2's bottom-centres
  // (225,524), (286.5,574) and (366,633); ticket 100 matches them to the cats.
  // S23, Míca at the vase, has no cue yet; when it is wired it shrinks × 0.635.
  { id: 'S20', at: 8.1, seconds: 1.25, box: shrunk(box(120, 224, 330, 524), CAT_BEAT_SCALE.mica), frames: 10, columns: 4, fps: 8, hides: [] },
  { id: 'S21', at: 9.35, seconds: 1, box: shrunk(box(171.5, 214, 401.5, 574), CAT_BEAT_SCALE.mira), frames: 8, columns: 4, fps: 8, hides: [] },
  { id: 'S22', at: 10.35, seconds: 1.5, box: shrunk(box(136, 197, 596, 633), CAT_BEAT_SCALE.luna), frames: 12, columns: 4, fps: 8, hides: [] },
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

/**
 * The clock an arrival keeps, whichever script it is playing.
 *
 * Both scripts in this file carry exactly this much: how far they have got,
 * the `now` they started at, and the sounds the last tick crossed.
 */
interface Playhead {
  readonly state: ArrivalState;
  readonly startedAt: number | null;
  readonly seconds: number;
  readonly sfx: readonly string[];
}

/** The same slice with last tick's sounds forgotten, so none is played twice. */
function quiet<T extends Playhead>(arrival: T): T {
  return arrival.sfx.length === 0 ? arrival : { ...arrival, sfx: [] };
}

/**
 * What one tick of the clock did to a script.
 *
 * `idle` is a tick that changed nothing — a script that is not running, or a
 * frame with no elapsed time — and the caller hands its slice straight back, by
 * identity, so the page costs no repaint. `moved` carries the window
 * `(from, to]` the cues that fired lie in, which is how each one fires exactly
 * once. `ended` is the script running out, and every script answers that the
 * same way: it is over, and whatever it had left to do happens at once.
 */
type PlayheadStep<T> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'moved'; readonly head: T; readonly from: number; readonly to: number }
  | { readonly kind: 'ended' };

const IDLE = { kind: 'idle' } as const;
const ENDED = { kind: 'ended' } as const;

/** One tick of a script's clock, whichever script it belongs to. */
function stepPlayhead<T extends Playhead>(head: T, now: number, length: number): PlayheadStep<T> {
  if (head.state !== 'playing') return IDLE;
  // The very first tick, or a clock that restarted, measures from itself. The
  // window is empty, because no time has passed to cross a cue in.
  if (head.startedAt === null || now < head.startedAt) {
    const based = { ...quiet(head), startedAt: now - Math.max(0, head.seconds) * 1000 };
    return { kind: 'moved', head: based, from: head.seconds, to: head.seconds };
  }
  const seconds = (now - head.startedAt) / 1000;
  if (seconds <= head.seconds) {
    const hushed = quiet(head);
    return hushed === head ? IDLE : { kind: 'moved', head: hushed, from: seconds, to: seconds };
  }
  if (seconds >= length) return ENDED;
  // Last tick's sounds are forgotten here, so a tick that crosses no cue is a
  // silent one rather than a second playing of whatever the last tick crossed.
  return { kind: 'moved', head: { ...quiet(head), seconds }, from: head.seconds, to: seconds };
}

/** The sounds among a tick's cues, to be played once and then forgotten. */
function sfxOf(cues: readonly ArrivalCue[]): readonly string[] {
  return cues.flatMap(cue => (cue.kind === 'sfx' ? [cue.name] : []));
}

/** The arrival one tick on, and everything that happened during that tick. */
export function tickArrival(
  arrival: ArrivalSlice,
  now: number,
): { readonly arrival: ArrivalSlice; readonly cues: readonly ArrivalCue[] } {
  const step = stepPlayhead(arrival, now, ARRIVAL_SECONDS);
  if (step.kind === 'idle') return { arrival, cues: [] };
  if (step.kind === 'ended') return finishArrival(arrival);
  const cues = crossed(step.from, step.to);
  const sfx = sfxOf(cues);
  return { arrival: sfx.length === 0 ? step.head : { ...step.head, sfx }, cues };
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
  // 59: a `pending` arrival has emptied the hall already, so all of it is
  // caught up — the cues at t 0 included, which a window opening at 0 skips.
  const cues = arrival.state === 'pending' ? CUES : crossed(arrival.seconds, ARRIVAL_SECONDS);
  return { arrival: { state: 'done', startedAt: arrival.startedAt, seconds: ARRIVAL_SECONDS, sfx: [] }, cues };
}

/**
 * How far into the script the page should be painting.
 *
 * 59: a `pending` arrival paints its first second, not its last. The page
 * waits behind the loading screen and then a beat more before it knocks, and
 * the hall it shows through all of that is the one the door opens onto.
 */
function playhead(arrival: ArrivalSlice): number {
  if (arrival.state === 'pending') return 0;
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
 * at its last second, which is what the `done` hall shows, and the `pending`
 * hall is the same script read at its first.
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

// ---------------------------------------------------------------------------
// 44: a Room's arrival — the short entrance the other three Doors play.
// ---------------------------------------------------------------------------

/**
 * How long a Room's entrance runs, in seconds.
 *
 * The owner's ruling of 2026-09-20: about three seconds, not the Entryway's
 * eleven. This is a doorway between Rooms, seen every time, rather than the
 * front door of the page, seen once.
 */
export const ROOM_ARRIVAL_SECONDS = 3;

/**
 * A Door leaf's state.
 *
 * The same four the Entryway's front door has, because a door leaf is a door
 * leaf: shut, swinging open, held open, swinging shut. The leaf is a separate
 * transparent asset from its Room's backdrop precisely so that it can take
 * them — a leaf painted into a backdrop at a fixed angle is not one anybody
 * opens.
 */
export type DoorState = 'closed' | 'opening' | 'open' | 'closing';

/**
 * Where an Actor stands once a Room's entrance is over.
 *
 * Taken down as the entrance begins, off the Actors `gatherInto` and
 * `gatherCats` have just placed — so the entrance walks the Cast back to the
 * marks `HOMES` and `CAT_MARKS` chose rather than carrying a second table of
 * its own. Which is also why a cat lands somewhere different on every visit:
 * the dice that picked its mark were rolled before this file saw it.
 */
export interface ArrivalMark {
  readonly at: Point;
  readonly facing: Facing;
}

/** Where each Actor belongs once the Room has settled, by Actor. */
export type ArrivalMarks = Readonly<Partial<Record<ActorId, ArrivalMark>>>;

/** A Room's entrance, as far as it has got. */
export interface RoomArrivalSlice {
  /** The Room this entrance belongs to; its Door is the one that is open. */
  readonly room: RoomId;
  readonly state: ArrivalState;
  /** The `now` the entrance started at, or `null` until the first tick. */
  readonly startedAt: number | null;
  /** Seconds played; `-1` while playing but not yet ticked. */
  readonly seconds: number;
  readonly sfx: readonly string[];
  readonly marks: ArrivalMarks;
}

/**
 * The Door each Room puts the Cast down at, and which way it turns them.
 *
 * `design/11-game-room.md` §4.3 and `design/12-activity-room.md` §4.3 both name
 * (150, 662); the Cinema Room's note gives its Door no mark of its own, and its
 * P4 frame spans x 40-170 with the floor starting at x 100, so the same point
 * is the same place. Every Door is in a left-hand wall, so everyone turns right
 * as they come through it. The Entryway's entry is its own threshold and is
 * never used: that Room's arrival is the long script above, and it comes in
 * from outside rather than from another Room. 89: the Game Room's is design 75
 * §4.1's (130, 583), in front of its narrowed doorway on the 1408 x 792 stage.
 */
const DOOR_MARKS: Record<RoomId, ArrivalMark> = {
  entryway: { at: ENTRYWAY_MARKS.T, facing: 'right' },
  games: { at: { x: 130, y: 583 }, facing: 'right' },
  cinema: { at: { x: 150, y: 662 }, facing: 'right' },
  // 96: design 75 §4.1, in front of the one door on the 1328 x 747 stage.
  activities: { at: { x: 166, y: 549 }, facing: 'right' },
};

/**
 * One moment of the entrance, written against whoever the Room holds.
 *
 * A cue names an Actor rather than a point, because where that Actor is going
 * is the mark taken down when the Door opened. `enter` stands one in the
 * doorway; `cross` sends it to its mark; `sfx` is a sound. A cue naming an
 * Actor this Room has not placed simply does not fire.
 */
type RoomCue =
  | { readonly at: number; readonly kind: 'enter'; readonly actor: ActorId }
  | { readonly at: number; readonly kind: 'cross'; readonly actor: ActorId; readonly cycle?: CycleId }
  | { readonly at: number; readonly kind: 'sfx'; readonly name: string };

/**
 * The entrance, beat by beat (`design/11-game-room.md` §4.3).
 *
 * The Girl's hand is on the leaf; she stops in the doorway and holds it, the
 * three cats bolt through the gap ahead of her, the Boy walks in past her, she
 * lets it fall shut behind him and follows. One script for all three Rooms:
 * what differs between them is where the marks are, and the marks are not in
 * here.
 */
const ROOM_CUES: readonly RoomCue[] = [
  { at: 0, kind: 'sfx', name: 'door-open' },
  { at: 0.3, kind: 'enter', actor: 'girl' },
  // The cats run, always: it is what they do through an opening door, and it
  // is what §4.3 says they do. Everyone else is asked, in `resolve` below.
  { at: 0.4, kind: 'enter', actor: 'mica' },
  { at: 0.4, kind: 'cross', actor: 'mica', cycle: 'run' },
  { at: 0.55, kind: 'enter', actor: 'mira' },
  { at: 0.55, kind: 'cross', actor: 'mira', cycle: 'run' },
  { at: 0.7, kind: 'enter', actor: 'luna' },
  { at: 0.7, kind: 'cross', actor: 'luna', cycle: 'run' },
  { at: 1, kind: 'enter', actor: 'boy' },
  { at: 1, kind: 'cross', actor: 'boy' },
  { at: 1.7, kind: 'sfx', name: 'door-close' },
  { at: 2, kind: 'cross', actor: 'girl' },
];

/** When the Door takes each of its states, in time order. */
const ROOM_DOOR_TIMELINE: ReadonlyArray<readonly [number, DoorState]> = [
  [0, 'opening'],
  [0.3, 'open'],
  [1.7, 'closing'],
  [2, 'closed'],
];

/**
 * One symbolic cue, resolved against the marks this entrance took down.
 *
 * The Cycle a `cross` is carried on is worked out here rather than written into
 * the script, because it is a consequence of the geometry: an Actor whose mark
 * a walk reaches inside the script walks to it, and one whose mark is further
 * off than the script is long hurries. That is what keeps the entrance three
 * seconds in a Room whose marks are half a stage from its Door as well as in
 * one whose marks are beside it.
 */
function resolve(arrival: RoomArrivalSlice, cue: RoomCue): ArrivalCue | null {
  if (cue.kind === 'sfx') return cue;
  const mark = arrival.marks[cue.actor];
  if (!mark) return null;
  const door = DOOR_MARKS[arrival.room];
  if (cue.kind === 'enter') {
    return { at: cue.at, kind: 'place', actor: cue.actor, mark: door.at, facing: door.facing };
  }
  return {
    at: cue.at,
    kind: 'send',
    actor: cue.actor,
    mark: mark.at,
    facing: mark.facing,
    cycle: cue.cycle ?? cycleWithin(distance(door.at, mark.at), ROOM_ARRIVAL_SECONDS - cue.at),
  };
}

/** The entrance's cues in `(from, to]`, resolved against its marks. */
function roomCues(arrival: RoomArrivalSlice, from: number, to: number): readonly ArrivalCue[] {
  return ROOM_CUES.filter(cue => cue.at > from && cue.at <= to).flatMap(cue => {
    const resolved = resolve(arrival, cue);
    return resolved ? [resolved] : [];
  });
}

/**
 * The entrance as the visitor finds the Room: waiting to play, or already over.
 *
 * `over` is what motion being off means here, and it is the whole of it: the
 * Door is shut, everyone is on their mark, the Room is found at rest. There is
 * no second code path for a still apartment because there is nothing for one to
 * do.
 *
 * 51: an entrance that is going to play carries its marks from the moment it is
 * made, not from the moment it starts. The two are the same instant for a Door
 * walked through, but not for a page that opens on a Room: there the page holds
 * the entrance behind its loading screen, and a Room whose Cast is still
 * standing in it is a Room the visitor finds settled and then watches blink
 * out. The marks come down here so that the Room can be emptied here.
 */
export function createRoomArrival(room: RoomId, over: boolean, marks: ArrivalMarks = {}): RoomArrivalSlice {
  return {
    room,
    state: over ? 'done' : 'pending',
    startedAt: null,
    seconds: over ? ROOM_ARRIVAL_SECONDS : 0,
    sfx: [],
    marks: over ? {} : marks,
  };
}

/**
 * The entrance, started.
 *
 * Nothing but the clock: everyone's mark came down when the entrance was made,
 * because that is when the Room was emptied. The clock is not set here either —
 * the first tick does that, because that is the first time the model is told
 * what time it is.
 */
export function startRoomArrival(arrival: RoomArrivalSlice): RoomArrivalSlice {
  if (arrival.state !== 'pending') return arrival;
  return { ...arrival, state: 'playing', startedAt: null, seconds: -1, sfx: [] };
}

/**
 * The entrance, over because its script ran out.
 *
 * Whatever it had left to say is said — the Door falls shut — but nobody is put
 * anywhere. An Actor still crossing the floor keeps walking and arrives under
 * its own steam, which is what "both walk to their home marks and settle" asks
 * for. Being cut short is the other ending, and it is `settleRoomArrival`.
 *
 * 51: and it ends **silent**, as `finishArrival` and `settleRoomArrival` both
 * do. The window this catches up on is time the visitor did not watch — a
 * background tab comes back to one tick covering the whole entrance — so its
 * sounds are not owed to them. They cannot be left on the slice either: an
 * ending is not `playing`, so no later tick ever drains them, and the painter
 * plays whatever it finds here on every single paint.
 */
function endRoomArrival(
  arrival: RoomArrivalSlice,
): { readonly arrival: RoomArrivalSlice; readonly cues: readonly ArrivalCue[] } {
  const cues = roomCues(arrival, arrival.seconds, ROOM_ARRIVAL_SECONDS);
  return { arrival: { ...arrival, state: 'done', seconds: ROOM_ARRIVAL_SECONDS, sfx: [] }, cues };
}

/** The entrance one tick on, and everything that happened during that tick. */
export function tickRoomArrival(
  arrival: RoomArrivalSlice,
  now: number,
): { readonly arrival: RoomArrivalSlice; readonly cues: readonly ArrivalCue[] } {
  const step = stepPlayhead(arrival, now, ROOM_ARRIVAL_SECONDS);
  if (step.kind === 'idle') return { arrival, cues: [] };
  if (step.kind === 'ended') return endRoomArrival(arrival);
  const cues = roomCues(step.head, step.from, step.to);
  const sfx = sfxOf(cues);
  return { arrival: sfx.length === 0 ? step.head : { ...step.head, sfx }, cues };
}

/**
 * The entrance, cut short, and everyone put on their mark at once.
 *
 * What a request for stillness, a Room walked out of, or a Room nobody can see
 * means: the outcome of the whole entrance and none of the entering. Nobody is
 * left mid-stride and nothing is half-open, because the Door's state is folded
 * out of a clock that has now run to the end.
 *
 * 51: an entrance still waiting to play is settled the same way, because since
 * this ticket a waiting entrance has already emptied its Room — so leaving it
 * with no cues would leave a Room with no Cast in it. Its marks were taken down
 * when it was made, which is exactly what is needed to put everybody back.
 */
export function settleRoomArrival(
  arrival: RoomArrivalSlice,
): { readonly arrival: RoomArrivalSlice; readonly cues: readonly ArrivalCue[] } {
  if (arrival.state === 'done') return { arrival, cues: [] };
  const cues: readonly ArrivalCue[] = ACTOR_IDS.flatMap(id => {
    const mark = arrival.marks[id];
    if (!mark) return [];
    const settled: ArrivalCue = {
      at: ROOM_ARRIVAL_SECONDS,
      kind: 'place',
      actor: id,
      mark: mark.at,
      facing: mark.facing,
    };
    return [settled];
  });
  return { arrival: { ...arrival, state: 'done', seconds: ROOM_ARRIVAL_SECONDS, sfx: [] }, cues };
}

/**
 * Which state this entrance's Door is in.
 *
 * Folded out of the clock every time rather than stored, exactly as the
 * Entryway's Props are — so a Door can never disagree with the script, and a
 * Room that is not playing one has a shut Door by reading the script at its
 * last second rather than by carrying a flag of its own.
 */
export function roomDoorAt(arrival: RoomArrivalSlice): DoorState {
  const seconds = arrival.state === 'playing' ? Math.max(0, arrival.seconds) : ROOM_ARRIVAL_SECONDS;
  return stateAt(ROOM_DOOR_TIMELINE, seconds, 'closed');
}
