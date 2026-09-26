// 18: the Films each shelf holds. 19: and what one of them says for itself.
import { filmById, filmsOn, type Film, type FilmId } from './films';
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
 * Every number is in the Cinema's own stage units (`STAGES.cinema`, origin
 * top-left), taken from the Room's design note.
 */

/** The three genre bookshelves, in the order Tab visits them. */
export type CinemaShelf = 'comedy' | 'romance' | 'horror';

export const CINEMA_SHELVES: readonly CinemaShelf[] = ['comedy', 'romance', 'horror'];

/**
 * Where an Actor stands to do something in this Room.
 *
 * A shelf mark is the bay's left edge less 18 units, so the Boy's reaching hand
 * lands in the bay while its crown and plaque stay visible past him.
 *
 * 63: the shelves stand in the corner right of S01's screen and the board
 * hangs between the door and the screen, so these follow them there: a board
 * mark is under its Poster slot's centre, at the back of the walkable band so
 * no beanbag is drawn over his feet while he pins.
 *
 * 92: the 1360 x 765 stage (design 75 §4.4). The seats are the re-spaced
 * beanbags' bottom-centres and the cabinet mark keeps its old offset from the
 * cabinet's right edge. The shelf marks and the board marks' x follow the wall,
 * which stands where it stood on screen (design 75's R1, x' = 0.78x + 40,
 * y' = 0.78y) until ticket 73 re-lays it by design 80; the board marks stand at
 * design 80's y 572, in front of the projector's drawn box (bottom 547.4) and
 * inside the walkable, whose cabinet notch starts at 580 for them.
 */
export const CINEMA_MARKS = {
  /** His coral beanbag, and his home in this Room. */
  boySeat: { x: 590, y: 624 },
  /** Her teal beanbag. */
  girlSeat: { x: 250, y: 624 },
  shelves: {
    comedy: { x: 1047.76, y: 546 },
    romance: { x: 1121.08, y: 546 },
    horror: { x: 1194.4, y: 546 },
  },
  /** Right of the reel cabinet, clear of anything the cats spill. */
  cabinet: { x: 542, y: 667 },
  /** In front of each Poster slot, for the pinning this Room grows later. */
  boardSlots: [
    { x: 335.62, y: 572 },
    { x: 437.8, y: 572 },
    { x: 539.98, y: 572 },
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
 * How long each Beat of the reel sequence holds, in milliseconds.
 *
 * The first two are Beats like the rummage — B7 and B8 of the design note —
 * and stop when the apartment is asked to hold still. The last two are not:
 * the Bumper and the title card are a Film being projected, with their own
 * music, and §10.3 keeps both at their full length under reduced motion with
 * only the performance inside them simplified. That difference is the whole
 * reason `filmUntil` exists beside `beatUntil` below.
 */
const SEARCH_MS = 1800;
const LOAD_MS = 1400;
const BUMPER_MS = 4000;
const TITLE_MS = 3000;

/**
 * How long a Poster takes to come out of its frame, in milliseconds.
 *
 * The design note's 450 ms: the Poster scales about its centre while its clip
 * opens, so the characters and props emerge from behind the frame's edges. The
 * details are not readable until it is over (story 22), which is the only
 * reason the model counts it at all — the DOM layer would otherwise need no
 * permission to animate.
 */
const EXPAND_MS = 450;

/**
 * Where the Room's sequence has got to.
 *
 * One machine, two sequences, and they never run backwards. The shelf sequence
 * is `walking-to-shelf → rummaging → carrying → pinning → returning`; the reel
 * sequence is `fetching → searching → loading → bumper → title → slate`. Both
 * begin and end at `seated`, which is the Room with nothing on: the design
 * note's `idle` and `loaded` are both this step, and what tells them apart is
 * whether there is a reel on the projector (`reel`), which is also the only
 * thing the gate lever needs to know.
 *
 * Nothing outside this file may put the Room into a step; it advances by the
 * Boy arriving somewhere and by the clock, both of which arrive as arguments.
 */
export type CinemaStep =
  | 'seated'
  | 'walking-to-shelf'
  | 'rummaging'
  | 'carrying'
  | 'pinning'
  | 'returning'
  // 20: the reel sequence, from the cabinet to the slate.
  | 'fetching'
  | 'searching'
  | 'loading'
  | 'bumper'
  | 'title'
  | 'slate';

/**
 * The reel sequence in the order it runs, for the one rule about it.
 *
 * It is here to be read, not to be indexed into: `stepCinema` moves between
 * these by name, and this is what "advances in order and never backwards"
 * means when a test or a reader asks.
 */
export const REEL_STEPS: readonly CinemaStep[] = [
  'fetching',
  'searching',
  'loading',
  'bumper',
  'title',
  'slate',
];

/** Is the projector throwing a picture — the Bumper, the title card or the slate? */
function isRolling(step: CinemaStep): boolean {
  return step === 'bumper' || step === 'title' || step === 'slate';
}

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
  /**
   * The Posters on the wall, in slot order, left to right.
   *
   * 73: he pins them right to left, slot 3 first (design 72 section 3.4), and
   * the Poster on slot k is always the shelf's k-th Film, so a wall part-way up
   * is the shelf's last one or two Films: `posterSlot` says which slot each is.
   */
  readonly pinned: readonly FilmId[];
  /**
   * 73: the shelf showing three caps gone, or `null` while every shelf is full.
   *
   * Design 80 section 4: a shelf loses its three caps as his rummage in it
   * ends, and in that same tick the shelf that had lost them, if another, is
   * full again. Nothing else changes it: not the pinning, a Film, a Poster
   * opening, nor walking out and back. It is not persisted, as the wall is not.
   */
  readonly capsGone: CinemaShelf | null;
  /**
   * When the Beat in progress is over, on the same clock the ticks carry.
   *
   * `null` is a Beat with no waiting left in it, which is every Beat when the
   * apartment is not allowed to move: with motion off the visitor is given the
   * outcome and none of the performance, exactly as a walk is.
   */
  readonly until: number | null;
  /**
   * The pinned Poster the visitor's pointer or focus is on, if any.
   *
   * One at a time: a Poster is expanded by being looked at, and a visitor can
   * only look at one thing, so moving to the Poster next door moves the
   * expansion rather than opening a second.
   */
  readonly expanded: FilmId | null;
  /**
   * When that Poster has finished coming out of its frame, on the ticks' clock.
   *
   * `null` is an expansion with no opening left to do — which is a finished one
   * and, when the apartment may not move, every one of them from the moment it
   * starts: the visitor is given the details rather than made to wait out a
   * performance they asked not to see.
   */
  readonly expandedUntil: number | null;
  /**
   * The Film he has gone to the cabinet for, while he is still fetching it.
   *
   * The reel sequence's counterpart to `errand`: non-null from the moment the
   * visitor chooses a Film until the reel is threaded, and `null` the rest of
   * the time, including while that same Film is on the screen.
   */
  readonly fetching: FilmId | null;
  /**
   * The Film whose reel is on the projector, or `null` for an empty machine.
   *
   * This is the whole of the difference between the design note's `idle` and
   * `loaded`: the gate lever is enabled when there is a reel to roll, and a
   * reel stays threaded after the visitor stops it, so rolling it again costs
   * no second trip to the cabinet.
   */
  readonly reel: FilmId | null;
}

export function createCinema(): CinemaSlice {
  return {
    attended: null,
    step: 'seated',
    errand: null,
    pinned: [],
    capsGone: null,
    until: null,
    expanded: null,
    expandedUntil: null,
    // 20: an empty projector, and nobody sent for a reel.
    fetching: null,
    reel: null,
  };
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

/** 73: the board slot a Film's Poster hangs on, 1 to 3: its place on its shelf. */
export type PosterSlot = 1 | 2 | 3;

export function posterSlot(film: FilmId): PosterSlot {
  return (filmsOn(shelfOf(film)).indexOf(film) + 1) as PosterSlot;
}

/**
 * The next Poster he pins off a shelf, with the wall holding `pinned`: the
 * slot to the left of the ones already up, starting at slot 3.
 */
function nextPin(shelf: CinemaShelf, pinned: readonly FilmId[]): { film: FilmId; slot: number } | null {
  const slot = filmsOn(shelf).length - pinned.length - 1;
  const film = filmsOn(shelf)[slot];
  return film ? { film, slot } : null;
}

/** The Room with a shelf chosen: whatever he was doing, he is off to this one. */
export function withChosenShelf(slice: CinemaSlice, shelf: CinemaShelf): CinemaSlice {
  // 20: including a reel he had set off for. The shelf is the new errand, and
  // a Film on the screen stops — the step is the Room's one state machine, so
  // being on this errand is already being on no other.
  return { ...slice, step: 'walking-to-shelf', errand: shelf, fetching: null, until: null };
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
  // 20: a reel he was fetching is threaded rather than left in the cabinet, so
  // the projector they come back to is loaded and its gate lever works. A Film
  // that was rolling stops: the Bumper is a Cinema Room moment (§8.3).
  const reel = slice.fetching ?? slice.reel;
  // 73: and the shelf he was fetching from has its three caps gone, as it
  // would have once his rummage there ended.
  const capsGone = slice.errand ?? slice.capsGone;
  const settled =
    slice.attended === null &&
    slice.step === 'seated' &&
    pinned === slice.pinned &&
    reel === slice.reel &&
    capsGone === slice.capsGone;
  // 19: nobody is looking at a Poster in a Room they have walked out of, so the
  // wall they come back to is the wall, flat, however they left it.
  if (settled && slice.expanded === null) return slice;
  return {
    attended: null,
    step: 'seated',
    errand: null,
    pinned,
    capsGone,
    until: null,
    expanded: null,
    expandedUntil: null,
    fetching: null,
    reel,
  };
}

// 19: the Poster expansion.

/**
 * The Room with a Poster looked at, or with none.
 *
 * `film` is what the visitor's pointer or focus is on. Only a Poster that is
 * actually on the wall can be expanded, so a report about a Film still rolled
 * up in its bookshelf is a report about nothing and leaves the Room alone.
 */
export function withAttendedPoster(
  slice: CinemaSlice,
  film: FilmId | null,
  now: number | null,
  motionOn: boolean,
): CinemaSlice {
  if (film !== null && !slice.pinned.includes(film)) return slice;
  if (slice.expanded === film) return slice;
  return { ...slice, expanded: film, expandedUntil: film === null ? null : beatUntil(now, motionOn, EXPAND_MS) };
}

/**
 * The Room with the expansion one tick further on.
 *
 * The only thing that finishes: an expansion is over when the clock passes it,
 * or the moment it starts when the apartment is not allowed to move.
 */
export function tickPoster(slice: CinemaSlice, now: number | null, motionOn: boolean): CinemaSlice {
  if (slice.expandedUntil === null) return slice;
  if (motionOn && !(now !== null && now >= slice.expandedUntil)) return slice;
  return { ...slice, expandedUntil: null };
}

/** The Poster coming out of its frame, or already out of it. */
export function expandedPosterOf(slice: CinemaSlice): FilmId | null {
  return slice.expanded;
}

/**
 * The Film whose details may be read right now, or `null`.
 *
 * Story 22, and the whole of what the panel needs: nothing at all until a
 * Poster has finished expanding, and then that Poster's Film, with its titles,
 * year, pairing, premise, reason and link on it.
 */
export function readableFilmOf(slice: CinemaSlice): Film | null {
  if (slice.expanded === null || slice.expandedUntil !== null) return null;
  return filmById(slice.expanded);
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
  /**
   * How he covers that ground. Walking, except the one errand he hurries over:
   * a Film has been chosen and the evening is waiting on him (B6).
   */
  readonly cycle: 'walk' | 'run';
}

/** What the errand can see of the Boy: where he is, and whether he is still going. */
export interface BoyReading {
  readonly at: Point;
  readonly moving: boolean;
}

const WAITING = (slice: CinemaSlice): CinemaProgress => ({ slice, sendBoyTo: null, cycle: 'walk' });

/** A step that also sends him somewhere, on foot unless it says otherwise. */
const SENDING = (slice: CinemaSlice, sendBoyTo: Point, cycle: 'walk' | 'run' = 'walk'): CinemaProgress => ({
  slice,
  sendBoyTo,
  cycle,
});

/** Is the Beat in progress over? With motion off it never began. */
function beatOver(slice: CinemaSlice, now: number | null, motionOn: boolean): boolean {
  if (!motionOn || slice.until === null) return true;
  return now !== null && now >= slice.until;
}

/** How long a Beat holds from here: nothing at all when the apartment is still. */
function beatUntil(now: number | null, motionOn: boolean, length: number): number | null {
  return motionOn && now !== null ? now + length : null;
}

/**
 * How long a projected Beat holds from here, whatever the visitor asked for.
 *
 * The Bumper and the title card are not the apartment moving: they are a Film
 * on a screen with its own music, and §10.3 keeps all four seconds of the
 * Bumper and all three of the title card under reduced motion. Only the
 * performance inside them simplifies, and that is the stylesheet's business.
 *
 * `null` means the clock has not been read yet, and the caller holds the step
 * where it is rather than starting a Beat it cannot time — which is what keeps
 * a motion toggle mid-search from skipping the Bumper altogether.
 */
function filmUntil(now: number | null, length: number): number | null {
  return now === null ? null : now + length;
}

/** Is the projected Beat in progress over? An untimed one never is. */
function filmOver(slice: CinemaSlice, now: number | null): boolean {
  return slice.until !== null && now !== null && now >= slice.until;
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
      // were up stay up until there is something to replace them with. 19: an
      // expanded Poster goes with them — a Poster that has left the wall cannot
      // still be open on it.
      return WAITING({
        ...slice,
        step: 'rummaging',
        pinned: [],
        until: beatUntil(now, motionOn, RUMMAGE_MS),
        expanded: null,
        expandedUntil: null,
      });
    }
    case 'rummaging': {
      if (!beatOver(slice, now, motionOn)) return WAITING(slice);
      // Three tubes under his arm, and three caps gone from the shelf: 73, the
      // one moment a shelf's state changes (design 80 section 4), and the
      // shelf that had lost its caps before is full again in the same tick.
      // Slot 3 is where he takes them first (design 72 section 3.4).
      const first = slice.errand ? nextPin(slice.errand, slice.pinned) : null;
      const carrying: CinemaSlice = { ...slice, step: 'carrying', capsGone: slice.errand, until: null };
      return SENDING(carrying, CINEMA_MARKS.boardSlots[first?.slot ?? 0]);
    }
    case 'carrying': {
      const next = slice.errand ? nextPin(slice.errand, slice.pinned) : null;
      const slot = next ? CINEMA_MARKS.boardSlots[next.slot] : undefined;
      if (!slot || !arrivedAt(boy, slot)) return WAITING(slice);
      return WAITING({ ...slice, step: 'pinning', until: beatUntil(now, motionOn, PIN_MS) });
    }
    case 'pinning': {
      if (!beatOver(slice, now, motionOn)) return WAITING(slice);
      const next = slice.errand ? nextPin(slice.errand, slice.pinned) : null;
      // A Poster only exists on the wall once its pin Beat has finished, which
      // is what makes them arrive one at a time rather than as a set of three.
      // Each goes up left of the last, so the wall stays in slot order.
      const pinned = next ? [next.film, ...slice.pinned] : slice.pinned;
      const after = slice.errand ? nextPin(slice.errand, pinned) : null;
      if (after) return SENDING({ ...slice, step: 'carrying', pinned, until: null }, CINEMA_MARKS.boardSlots[after.slot]);
      return SENDING({ ...slice, step: 'returning', pinned, until: null }, CINEMA_MARKS.boySeat);
    }
    case 'returning': {
      if (!arrivedAt(boy, CINEMA_MARKS.boySeat)) return WAITING(slice);
      return WAITING({ ...slice, step: 'seated', errand: null, until: null });
    }
    // 20: the reel sequence. B6-B8: he hurries to the cabinet, finds the can,
    // threads it, and the projector takes over from there.
    case 'fetching': {
      if (!arrivedAt(boy, CINEMA_MARKS.cabinet)) return WAITING(slice);
      return WAITING({ ...slice, step: 'searching', until: beatUntil(now, motionOn, SEARCH_MS) });
    }
    case 'searching': {
      if (!beatOver(slice, now, motionOn)) return WAITING(slice);
      return WAITING({ ...slice, step: 'loading', until: beatUntil(now, motionOn, LOAD_MS) });
    }
    case 'loading': {
      if (!beatOver(slice, now, motionOn)) return WAITING(slice);
      // The lamp lights on the last frame of the Beat and the Bumper begins,
      // so the reel is on the projector from here and he is free to sit down
      // beside her while the studio logo lands (B8′).
      const until = filmUntil(now, BUMPER_MS);
      if (until === null) return WAITING(slice);
      return SENDING(
        { ...slice, step: 'bumper', reel: slice.fetching, fetching: null, until },
        CINEMA_MARKS.boySeat,
      );
    }
    case 'bumper': {
      if (!filmOver(slice, now)) return WAITING(slice);
      const until = filmUntil(now, TITLE_MS);
      if (until === null) return WAITING(slice);
      return WAITING({ ...slice, step: 'title', until });
    }
    case 'title': {
      if (!filmOver(slice, now)) return WAITING(slice);
      // The slate holds: it ends when the gate lever stops the reel, another
      // Film is chosen, or the visitor leaves the Room — never on its own.
      return WAITING({ ...slice, step: 'slate', until: null });
    }
    case 'slate':
      return WAITING(slice);
  }
}

/**
 * The Room with a Film chosen: he goes for its reel, whatever else was on.
 *
 * Only a Film whose Poster is on the wall can be chosen, because the card that
 * offers the choice only opens on a pinned Poster — the same rule the
 * expansion keeps, and for the same reason. Choosing while a Film is already
 * rolling stops it and fetches the new reel (§4.6), and the card closes behind
 * the visitor's own click: the Poster is flat again by the time he sets off.
 */
export function withChosenFilm(slice: CinemaSlice, film: FilmId): CinemaSlice {
  if (!slice.pinned.includes(film)) return slice;
  return {
    ...slice,
    step: 'fetching',
    errand: null,
    fetching: film,
    reel: null,
    until: null,
    expanded: null,
    expandedUntil: null,
  };
}

/**
 * The Room with the projector's gate lever pulled.
 *
 * One lever, two things to do with it, and which one is not a choice: a Film
 * on the screen is stopped, and a threaded reel with nothing on the screen is
 * rolled from the top of the Bumper. An empty machine does nothing at all,
 * which is what its disabled state on the page is saying.
 */
export function withGateToggled(slice: CinemaSlice, now: number | null): CinemaSlice {
  if (isRolling(slice.step)) return { ...slice, step: 'seated', until: null };
  if (slice.step !== 'seated' || slice.reel === null) return slice;
  const until = filmUntil(now, BUMPER_MS);
  if (until === null) return slice;
  return { ...slice, step: 'bumper', until };
}

/** The Film whose reel is threaded, or `null`. The gate lever's whole state. */
export function loadedReelOf(slice: CinemaSlice): FilmId | null {
  return slice.reel;
}

/** The Film on the screen right now — Bumper, title card or slate — or `null`. */
export function rollingFilmOf(slice: CinemaSlice): Film | null {
  return isRolling(slice.step) && slice.reel !== null ? filmById(slice.reel) : null;
}

/**
 * Is the Room waiting on the clock?
 *
 * The one thing the frame loop needs from this Room that it cannot work out
 * from the Cast: a projected Beat runs at its own length however the visitor
 * feels about motion (§10.3), so the loop that would otherwise have stopped
 * has to keep turning until the Bumper and the title card are through.
 */
export function cinemaAwaitsClock(slice: CinemaSlice): boolean {
  // A Beat with an end on the clock is plainly waiting for it.
  if (slice.until !== null) return true;
  // And so is the one step that cannot leave without reading the clock first.
  // `loading` ends in the Bumper, which is a Film rather than the apartment
  // moving, so `filmUntil` refuses to start it from an event that carries no
  // time — a motion preference changing — and holds the step instead of
  // skipping four seconds of it. Holding is only safe while the page keeps a
  // frame loop turning, and this is where it is told to.
  return slice.step === 'loading';
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
