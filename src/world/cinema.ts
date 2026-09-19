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
