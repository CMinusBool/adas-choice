import { copy } from '../copy';
import {
  CINEMA_SHELVES,
  attendedShelf,
  cinemaStep,
  filmById,
  pinnedPosters,
  rummagingShelf,
  type CinemaShelf,
  type CinemaStep,
  type FilmId,
  type Language,
  type World,
} from '../world';
import type { Dispatch, Painter } from './painter';
import { playSfx } from './sound';

/**
 * Paint the Cinema Room's bookshelves and the Posters he pins up.
 *
 * The Room itself is markup and stylesheet: its Props are placed in stage units
 * in `index.html` and drawn in `styles.css`, and the door is an ordinary link,
 * so none of that needs a painter. What this file does is report — a pointer
 * resting on a shelf, a shelf clicked, the clock — and then paint back whatever
 * the world model made of it. It decides nothing: which shelf he walks to, how
 * long he rummages, which three Posters go up and in what order are all
 * `src/world/cinema.ts`'s answers, which is why the whole behaviour is testable
 * without a browser.
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
  const board = document.querySelector<HTMLElement>('.cinema-board');
  const slots = document.querySelector<HTMLElement>('[data-poster-slots]');

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
    // Choosing the shelf. These are `<button>`s, so Enter and Space arrive here
    // as clicks and the keyboard needs nothing of its own. `performance.now()`
    // is the clock the frame loop hands the model on every tick, and the errand
    // times its Beats against it: the model is never allowed to ask the time.
    element.addEventListener('click', () => {
      clearTimeout(waiting);
      dispatch({ type: 'cinema-shelf-chosen', shelf, now: performance.now() });
    });
  }

  /** The Posters on the wall, in slot order, as the page currently has them. */
  const posters: HTMLElement[] = [];

  function title(element: HTMLElement, film: FilmId, language: Language) {
    const caption = element.querySelector<HTMLElement>('.poster-caption')!;
    caption.textContent = filmById(film).title[language];
    caption.lang = language;
    element.querySelector<HTMLElement>('.poster-hint')!.textContent = copy[language].posterExpandHint;
  }

  /**
   * One pinned Poster.
   *
   * A `<button>`, so it is a Tab stop and Enter reaches it; ticket 19 binds the
   * expansion to it. Its accessible name is composed from what is inside it —
   * the Film's title, then what activating it offers — rather than written into
   * an `aria-label`, so the visible caption and the announced name cannot drift
   * apart when the language changes.
   *
   * No file is named: the painted artwork is ticket 36's, and until it lands
   * the stock, the genre stripe and the ground are drawn in CSS.
   */
  function buildPoster(film: FilmId, slot: number, language: Language): HTMLElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'cinema-poster';
    element.dataset.posterSlot = String(slot + 1);
    element.dataset.film = film;
    element.dataset.shelf = filmById(film).shelf;
    element.innerHTML =
      '<span class="poster-pin" aria-hidden="true"></span><span class="poster-pin" aria-hidden="true"></span>' +
      '<span class="poster-stripe" aria-hidden="true"></span><span class="poster-ground" aria-hidden="true"></span>' +
      '<span class="poster-caption"></span><span class="poster-hint visually-hidden"></span>';
    title(element, film, language);
    return element;
  }

  /**
   * Put the wall in the state the model says it is in.
   *
   * Slots already holding the right Film are left alone, so a Poster unrolls
   * once — when its pin Beat finishes — and a language change rewrites captions
   * rather than tearing the wall down and hanging it again.
   */
  function paintPosters(pinned: readonly FilmId[], language: Language, pinning: boolean) {
    let kept = 0;
    while (kept < posters.length && kept < pinned.length && posters[kept].dataset.film === pinned[kept]) kept += 1;
    for (const gone of posters.splice(kept)) gone.remove();
    for (let slot = kept; slot < pinned.length; slot += 1) {
      const element = buildPoster(pinned[slot], slot, language);
      posters.push(element);
      slots?.append(element);
      // Silent when the wall is simply found this way — walking back into the
      // Room is not a Poster being pinned.
      if (pinning) {
        playSfx('scroll-unroll');
        playSfx('pin-push');
      }
    }
    for (let slot = 0; slot < posters.length; slot += 1) title(posters[slot], pinned[slot], language);
    board?.classList.toggle('has-posters', pinned.length > 0);
    const empty = board?.querySelector<HTMLElement>('.board-empty');
    if (empty) empty.hidden = pinned.length > 0;
    const ghost = board?.querySelector<HTMLElement>('.board-ghost');
    if (ghost) ghost.hidden = pinned.length > 0;
  }

  let paintedAttention: CinemaShelf | null | undefined;
  let paintedRummage: CinemaShelf | null | undefined;
  let paintedStep: CinemaStep | undefined;
  let paintedPinned: readonly FilmId[] | undefined;
  let paintedLanguage: Language | undefined;

  return (world: World) => {
    const attended = attendedShelf(world);
    if (paintedAttention !== attended) {
      paintedAttention = attended;
      for (const [shelf, element] of shelves) element.classList.toggle('is-attended', shelf === attended);
    }

    const rummaging = rummagingShelf(world);
    if (paintedRummage !== rummaging) {
      paintedRummage = rummaging;
      for (const [shelf, element] of shelves) element.classList.toggle('is-rummaging', shelf === rummaging);
    }

    const step = cinemaStep(world);
    // One rummage, one sound: the step only becomes `rummaging` when he reaches
    // in. Ticket 39 delivers the file; until then the registry no-ops.
    if (paintedStep !== step) {
      if (step === 'rummaging') playSfx('shelf-rummage');
      paintedStep = step;
    }

    const pinned = pinnedPosters(world);
    if (paintedPinned !== pinned || paintedLanguage !== world.language) {
      const pinning = paintedPinned !== undefined && step !== 'seated';
      paintPosters(pinned, world.language, pinning);
      paintedPinned = pinned;
      paintedLanguage = world.language;
    }
  };
};
