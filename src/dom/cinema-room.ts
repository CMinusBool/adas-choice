import { copy } from '../copy';
import {
  CINEMA_SHELVES,
  attendedShelf,
  cinemaStep,
  expandedPoster,
  filmById,
  pinnedPosters,
  posterDetails,
  rummagingShelf,
  type CinemaShelf,
  type CinemaStep,
  type Film,
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

/**
 * How long a Poster stays open after the pointer has left it and the card.
 *
 * The design note's 250 ms: long enough to cross the gap between the Poster and
 * the card it opens onto, short enough that a pointer passing over the board
 * does not leave a Poster hanging open behind it. Focus needs no such grace —
 * a visitor who Tabs away has left.
 */
const POSTER_LEAVE_MS = 250;

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

  // 19: the expansion, and the card it opens onto.
  const details = document.querySelector<HTMLElement>('.poster-details');
  const detailsPart = (part: string) => details?.querySelector<HTMLElement>(part) ?? null;
  const detailsLink = detailsPart('.details-link') as HTMLAnchorElement | null;

  let leaving = 0;

  /**
   * Report which Poster the visitor is looking at.
   *
   * Hover and focus are the same report because they are the same thing
   * happening; the model decides what it means, including whether the Film is
   * even on the wall. `performance.now()` is the clock every other report in
   * this Room carries, because the model may never ask the time itself.
   */
  function look(film: FilmId | null) {
    clearTimeout(leaving);
    dispatch({ type: 'cinema-poster-attended', film, now: performance.now() });
  }

  /** Let go of the Poster, unless the pointer is only crossing to the card. */
  function lookAwaySoon() {
    clearTimeout(leaving);
    leaving = setTimeout(
      () => dispatch({ type: 'cinema-poster-attended', film: null, now: performance.now() }),
      POSTER_LEAVE_MS,
    );
  }

  /** The Poster a page element belongs to, if it belongs to one at all. */
  const posterOf = (node: EventTarget | null): HTMLElement | null =>
    node instanceof Element ? node.closest<HTMLElement>('.cinema-poster') : null;

  /** Is the visitor still looking at the Poster, or at the card it opened? */
  const stillLooking = (node: EventTarget | null): boolean =>
    node instanceof Element && (node.closest('.cinema-poster') !== null || node.closest('.poster-details') !== null);

  if (slots) {
    // Delegated, because a Poster only exists while it is pinned: `pointerover`
    // and `pointerout` bubble where `pointerenter` and `pointerleave` do not.
    slots.addEventListener('pointerover', event => {
      const poster = posterOf(event.target);
      if (poster) look(poster.dataset.film as FilmId);
    });
    slots.addEventListener('pointerout', event => {
      const poster = posterOf(event.target);
      if (poster && !poster.contains(event.relatedTarget as Node | null)) lookAwaySoon();
    });
    slots.addEventListener('focusin', event => {
      const poster = posterOf(event.target);
      if (poster) look(poster.dataset.film as FilmId);
    });
    slots.addEventListener('focusout', event => {
      if (!stillLooking((event as FocusEvent).relatedTarget)) look(null);
    });
  }

  if (details) {
    // The card is part of what the visitor is looking at: a pointer crossing
    // from the Poster onto it, or a Tab landing in it, keeps the Poster open.
    details.addEventListener('pointerover', () => clearTimeout(leaving));
    details.addEventListener('pointerout', event => {
      if (!details.contains(event.relatedTarget as Node | null)) lookAwaySoon();
    });
    details.addEventListener('focusin', () => clearTimeout(leaving));
    details.addEventListener('focusout', event => {
      if (!stillLooking((event as FocusEvent).relatedTarget)) look(null);
    });
  }

  /** Close the Poster and put focus back where the visitor left it. */
  function close() {
    const open = posters.find(poster => poster.classList.contains('is-expanded'));
    look(null);
    open?.focus();
  }

  detailsPart('.details-close')?.addEventListener('click', close);
  // Escape is the keyboard's way out of both, and the card's close button is
  // its visible twin for a pointer that has no hover to give up.
  for (const element of [slots, details]) {
    element?.addEventListener('keydown', event => {
      if ((event as KeyboardEvent).key === 'Escape') close();
    });
  }

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
      '<span class="poster-spill" aria-hidden="true"><span class="spill-figure"></span>' +
      '<span class="spill-prop-a"></span><span class="spill-prop-b"></span></span>' +
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

  /**
   * Write one Film into the card.
   *
   * Every string comes from the Film dictionary or from `copy`; nothing here
   * decides what a Poster is worth saying. The other language sits under the
   * current one, muted, so either reader can find the Film — and both spans
   * carry their own `lang`, which is what tells a screen reader to change voice
   * halfway down a bilingual card.
   */
  function paintDetails(film: Film, language: Language) {
    const other: Language = language === 'zh-Hant' ? 'en' : 'zh-Hant';
    const words = copy[language];
    const write = (part: string, text: string, lang?: Language) => {
      const element = detailsPart(part);
      if (!element) return;
      element.textContent = text;
      if (lang) element.lang = lang;
    };
    write('.details-title-main', film.title[language], language);
    write('.details-title-other', film.title[other], other);
    write('.details-year', String(film.year));
    write('.details-pairing', film.pairing === 'zh-audio-en-subs' ? words.pairingZhEn : words.pairingEnZh);
    write('.details-premise', film.premise[language], language);
    write('.details-reason', film.reason[language], language);
    if (detailsLink) detailsLink.href = film.link;
    // The card wears the shelf's stripe colour as its left rule: it came off
    // the same shelf as the Poster that opened it.
    if (details) details.dataset.shelf = film.shelf;
  }

  let paintedAttention: CinemaShelf | null | undefined;
  let paintedRummage: CinemaShelf | null | undefined;
  let paintedStep: CinemaStep | undefined;
  let paintedPinned: readonly FilmId[] | undefined;
  let paintedLanguage: Language | undefined;
  let paintedExpanded: FilmId | null | undefined;
  let paintedDetails: Film | null | undefined;

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
    }

    // 19: which Poster is open. The Posters are rebuilt above before this runs,
    // so a Poster pinned this frame can be the one expanding in it.
    const expanded = expandedPoster(world);
    if (paintedExpanded !== expanded) {
      if (expanded !== null && paintedExpanded !== undefined) playSfx('poster-expand');
      paintedExpanded = expanded;
      for (const poster of posters) poster.classList.toggle('is-expanded', poster.dataset.film === expanded);
    }

    // The details, which the model keeps back until the expansion has finished.
    const film = posterDetails(world);
    if (details && (paintedDetails !== film || paintedLanguage !== world.language)) {
      paintedDetails = film;
      details.hidden = film === null;
      if (film) paintDetails(film, world.language);
    }

    paintedLanguage = world.language;
  };
};
