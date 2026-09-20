import { filmsOn, type FilmId } from './films'; // 18: the Films each shelf holds
import type { ActorId } from './actors';
import type { Point } from './stage';

/**
 * The Cinema Room, as places rather than pixels.
 *
 * Everything the Room's own behaviour turns on lives here: the marks the Cast
 * stands on and, from ticket 18 onward, the steps its sequences run through.
 * The DOM layer asks this file where something belongs and paints it there; it
 * never carries a coordinate of its own, which is what keeps one set of stage
 * units behind the Props, the walkable floor and the Actors alike.
 *
 * Every number is in stage units (1600 x 900, origin top-left), taken from the
 * Room's design note.
 */

/** The three genre bookshelves, in the order Tab visits them. */
export type CinemaShelf = 'comedy' | 'romance' | 'horror';

export const CINEMA_SHELVES: readonly CinemaShelf[] = ['comedy', 'romance', 'horror'];

/**
 * Where an Actor stands to do something in this Room.
 *
 * A shelf mark is the bay's left edge less 18 units, so the Boy's reaching hand
 * lands in the bay while its crown and plaque stay visible past him.
 */
export const CINEMA_MARKS = {
  /** His coral beanbag, and his home in this Room. */
  boySeat: { x: 660, y: 800 },
  /** Her teal beanbag. */
  girlSeat: { x: 320, y: 800 },
  shelves: {
    comedy: { x: 672, y: 700 },
    romance: { x: 806, y: 700 },
    horror: { x: 940, y: 700 },
  },
  /** Right of the reel cabinet, clear of anything the cats spill. */
  cabinet: { x: 612, y: 850 },
  /** In front of each Poster slot, for the pinning this Room grows later. */
  boardSlots: [
    { x: 1191, y: 700 },
    { x: 1345, y: 700 },
    { x: 1499, y: 700 },
  ],
} as const satisfies Record<string, Point | Readonly<Record<string, Point>> | readonly Point[]>;

/** The beanbag each of the two people sits in, for the Cast that has one. */
export function seatOf(actor: ActorId): Point | null {
  if (actor === 'boy') return CINEMA_MARKS.boySeat;
  if (actor === 'girl') return CINEMA_MARKS.girlSeat;
  return null;
}

/**
 * Close enough to a mark to count as standing on it, in stage units.
 *
 * A walk that ends on its goal lands there to within floating-point noise, and
 * a unit of slack is a fraction of a pixel at every shell width.
 */
const ON_THE_MARK = 1;

export function isOnMark(point: Point, mark: Point): boolean {
  return Math.abs(point.x - mark.x) <= ON_THE_MARK && Math.abs(point.y - mark.y) <= ON_THE_MARK;
}

/**
 * How long each Beat of the rummage holds, in milliseconds.
 *
 * The design note's timings. They are durations rather than frame counts
 * because the model does not know what a frame is: the DOM layer plays its
 * sheet for as long as the step lasts.
 */
const RUMMAGE_MS = 1800;
const PIN_MS = 1000;

/**
 * Where the rummage has got to.
 *
 * The steps run in this order and never backwards: choosing a shelf starts at
 * `walking-to-shelf` and the errand ends back at `seated`. Nothing outside this
 * file may put the Room into a step; it advances by the Boy arriving somewhere
 * and by the clock, both of which arrive as arguments.
 */
export type CinemaStep =
  | 'seated'
  | 'walking-to-shelf'
  | 'rummaging'
  | 'carrying'
  | 'pinning'
  | 'returning';

/** What the Cinema Room is doing, and what is on its wall. */
export interface CinemaSlice {
  /**
   * The shelf the visitor's pointer or focus is on, if any.
   *
   * Attention, not choice: it is what turns the shelf's rim light on and what
   * the Boy is walking towards while he has nothing else to do.
   */
  readonly attended: CinemaShelf | null;
  /** Where the errand in progress has got to. `seated` is no errand at all. */
  readonly step: CinemaStep;
  /** The shelf being fetched from, for as long as the errand runs. */
  readonly errand: CinemaShelf | null;
  /** The Posters on the wall, in the order he pinned them: slot 1, 2, 3. */
  readonly pinned: readonly FilmId[];
  /**
   * When the Beat in progress is over, on the same clock the ticks carry.
   *
   * `null` is a Beat with no waiting left in it, which is every Beat when the
   * apartment is not allowed to move: with motion off the visitor is given the
   * outcome and none of the performance, exactly as a walk is.
   */
  readonly until: number | null;
}

export function createCinema(): CinemaSlice {
  return { attended: null, step: 'seated', errand: null, pinned: [], until: null };
}

/** The genre whose Posters are on the wall, read off the Posters themselves. */
export function openShelfOf(slice: CinemaSlice): CinemaShelf | null {
  return slice.pinned.length > 0 ? shelfOf(slice.pinned[0]) : null;
}

/** Which shelf a Film was rolled up in. Every Film is on exactly one. */
function shelfOf(film: FilmId): CinemaShelf {
  for (const shelf of CINEMA_SHELVES) if (filmsOn(shelf).includes(film)) return shelf;
  return 'comedy';
}

/** The Room with a shelf chosen: whatever he was doing, he is off to this one. */
export function withChosenShelf(slice: CinemaSlice, shelf: CinemaShelf): CinemaSlice {
  return { ...slice, step: 'walking-to-shelf', errand: shelf, until: null };
}

/**
 * The Room as walking out of it leaves it.
 *
 * Nobody's attention is on a shelf any more, and the errand he was running is
 * taken to its outcome rather than abandoned partway: whichever shelf he had
 * set off for, its three Posters are on the wall when the visitor comes back.
 * That is the design note's rule for leaving mid-sequence, and it is also what
 * stops the Room being re-entered in a step whose Boy has been sent home by his
 * Room's own placement.
 */
export function settleCinema(slice: CinemaSlice): CinemaSlice {
  const pinned = slice.errand ? filmsOn(slice.errand) : slice.pinned;
  if (slice.attended === null && slice.step === 'seated' && pinned === slice.pinned) return slice;
  return { attended: null, step: 'seated', errand: null, pinned, until: null };
}

/**
 * What the Room's errand does next, if anything.
 *
 * `sendBoyTo` is where the step change wants the Boy, for the caller to hand to
 * the Cast; `null` leaves him where he is. The slice comes back by identity
 * when the errand is waiting on him or on the clock, which is what stops a
 * frame the errand has nothing to do with costing a repaint.
 */
export interface CinemaProgress {
  readonly slice: CinemaSlice;
  readonly sendBoyTo: Point | null;
}

/** What the errand can see of the Boy: where he is, and whether he is still going. */
export interface BoyReading {
  readonly at: Point;
  readonly moving: boolean;
}

const WAITING = (slice: CinemaSlice): CinemaProgress => ({ slice, sendBoyTo: null });

/** Is the Beat in progress over? With motion off it never began. */
function beatOver(slice: CinemaSlice, now: number | null, motionOn: boolean): boolean {
  if (!motionOn || slice.until === null) return true;
  return now !== null && now >= slice.until;
}

/** How long a Beat holds from here: nothing at all when the apartment is still. */
function beatUntil(now: number | null, motionOn: boolean, length: number): number | null {
  return motionOn && now !== null ? now + length : null;
}

/** Has he arrived, and stopped, where the errand sent him? */
function arrivedAt(boy: BoyReading, mark: Point): boolean {
  return !boy.moving && isOnMark(boy.at, mark);
}

/**
 * The errand one step on.
 *
 * Every step waits on something the model can see — the Boy standing on a mark,
 * or the clock passing a Beat's end — so the sequence runs at the speed of the
 * apartment rather than on a timer of its own, and with motion off it runs
 * through to its outcome in one call after another with nothing to wait for.
 */
export function stepCinema(
  slice: CinemaSlice,
  boy: BoyReading,
  now: number | null,
  motionOn: boolean,
): CinemaProgress {
  switch (slice.step) {
    case 'seated':
      return WAITING(slice);
    case 'walking-to-shelf': {
      const shelf = slice.errand;
      if (!shelf || !arrivedAt(boy, CINEMA_MARKS.shelves[shelf])) return WAITING(slice);
      // The wall clears as he reaches in, not when he set off: the Posters that
      // were up stay up until there is something to replace them with.
      return WAITING({ ...slice, step: 'rummaging', pinned: [], until: beatUntil(now, motionOn, RUMMAGE_MS) });
    }
    case 'rummaging': {
      if (!beatOver(slice, now, motionOn)) return WAITING(slice);
      // Three tubes under his arm; the first slot is where he takes them.
      return { slice: { ...slice, step: 'carrying', until: null }, sendBoyTo: CINEMA_MARKS.boardSlots[0] };
    }
    case 'carrying': {
      const slot = CINEMA_MARKS.boardSlots[slice.pinned.length];
      if (!slot || !arrivedAt(boy, slot)) return WAITING(slice);
      return WAITING({ ...slice, step: 'pinning', until: beatUntil(now, motionOn, PIN_MS) });
    }
    case 'pinning': {
      if (!beatOver(slice, now, motionOn)) return WAITING(slice);
      const shelf = slice.errand;
      const next = shelf ? filmsOn(shelf)[slice.pinned.length] : undefined;
      // A Poster only exists on the wall once its pin Beat has finished, which
      // is what makes them arrive one at a time rather than as a set of three.
      const pinned = next ? [...slice.pinned, next] : slice.pinned;
      const slot = CINEMA_MARKS.boardSlots[pinned.length];
      if (slot) return { slice: { ...slice, step: 'carrying', pinned, until: null }, sendBoyTo: slot };
      return { slice: { ...slice, step: 'returning', pinned, until: null }, sendBoyTo: CINEMA_MARKS.boySeat };
    }
    case 'returning': {
      if (!arrivedAt(boy, CINEMA_MARKS.boySeat)) return WAITING(slice);
      return WAITING({ ...slice, step: 'seated', errand: null, until: null });
    }
  }
}

/** The Room with a different shelf attended, or the same slice when it is not. */
export function withAttendedShelf(slice: CinemaSlice, shelf: CinemaShelf | null): CinemaSlice {
  return slice.attended === shelf ? slice : { ...slice, attended: shelf };
}

/**
 * Where the Boy belongs while this shelf has the visitor's attention.
 *
 * No shelf is his beanbag: wandering back to it is the same decision as walking
 * over, which is why one function answers both.
 */
export function boyMark(shelf: CinemaShelf | null): Point {
  return shelf ? CINEMA_MARKS.shelves[shelf] : CINEMA_MARKS.boySeat;
}
