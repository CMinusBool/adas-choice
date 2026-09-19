import { attendedShelf, CINEMA_SHELVES, type CinemaShelf, type World } from '../world';
import type { Dispatch, Painter } from './painter';

/**
 * Paint the Cinema Room's bookshelves.
 *
 * The Room itself is markup and stylesheet: its Props are placed in stage units
 * in `index.html` and drawn in `styles.css`, and the door is an ordinary link,
 * so none of that needs a painter. The one thing that moves is the Boy, and
 * this file does not move him — it reports which shelf has the visitor's
 * pointer or keyboard focus and lets the world model decide that the Boy walks
 * over, which is also why the whole behaviour is testable without a browser.
 *
 * The projector's two affordances need nothing here either: the motor switch is
 * a `data-music-source` Prop that `src/dom/sound.ts` already binds, and its film
 * gate stays disabled until ticket 20 gives it a reel to roll.
 */

/**
 * How long a pointer has to rest on a shelf before he sets off, and how long it
 * has to be away before he wanders back.
 *
 * The first keeps a pointer crossing all three shelves from turning into three
 * walks; the second keeps a pointer passing between two of them from sending
 * him home in between. Both are the design note's.
 */
const SETTLE_MS = 120;
const LEAVE_MS = 700;

const isShelf = (value: string | undefined): value is CinemaShelf =>
  (CINEMA_SHELVES as readonly string[]).includes(value ?? '');

export const mountCinemaRoom = (dispatch: Dispatch): Painter => {
  const shelves = new Map<CinemaShelf, HTMLElement>();
  for (const element of document.querySelectorAll<HTMLElement>('[data-shelf]')) {
    const shelf = element.dataset.shelf;
    if (isShelf(shelf)) shelves.set(shelf, element);
  }

  let waiting = 0;
  /**
   * Report a shelf after its delay, so a pointer sweeping across the Room is
   * one report rather than one per shelf it passed over.
   */
  function attend(shelf: CinemaShelf | null) {
    clearTimeout(waiting);
    waiting = setTimeout(() => dispatch({ type: 'cinema-shelf-attended', shelf }), shelf ? SETTLE_MS : LEAVE_MS);
  }

  for (const [shelf, element] of shelves) {
    element.addEventListener('pointerenter', () => attend(shelf));
    element.addEventListener('pointerleave', () => attend(null));
    // Focus is hover: a visitor who Tabs to a shelf gets the same walk, with no
    // delay, because arriving on a shelf by keyboard is already deliberate.
    element.addEventListener('focus', () => {
      clearTimeout(waiting);
      dispatch({ type: 'cinema-shelf-attended', shelf });
    });
    element.addEventListener('blur', () => attend(null));
  }

  let painted: CinemaShelf | null | undefined;
  return (world: World) => {
    const attended = attendedShelf(world);
    if (painted === attended) return;
    painted = attended;
    for (const [shelf, element] of shelves) element.classList.toggle('is-attended', shelf === attended);
  };
};
