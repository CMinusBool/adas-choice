import { copy } from '../copy';
import {
  CINEMA_SHELVES,
  attendedShelf,
  cinemaStep,
  expandedPoster,
  filmById,
  loadedReel,
  pinnedPosters,
  posterDetails,
  rollingFilm,
  rummagingShelf,
  type CinemaShelf,
  type CinemaStep,
  type Film,
  type FilmId,
  type Language,
  type World,
} from '../world';
import type { Dispatch, Painter } from './painter';
import { playSfx, setFilmAudio } from './sound';

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
 * 20: the projector's second affordance is bound here. The motor switch stays
 * `src/dom/sound.ts`'s — it is a `data-music-source` Prop like any other — but
 * the gate lever is this Room's, and so is what it rolls: the sequence from the
 * cabinet to the slate is `src/world/cinema.ts`'s to decide, and this file only
 * reports the two clicks that start it and paints whichever step came back.
 *
 * The sounds are called by the section 9 names and nothing is registered for
 * them yet: ticket 39 makes the files, and until it does the registry no-ops
 * and the Room plays the Bumper in silence.
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

  /**
   * Hand focus between an expanded Poster and the card it opened.
   *
   * The card is outside the stage in the markup — it has to be, because on a
   * narrow shell it flows below the stage rather than lying over it — so Tab
   * from a Poster would otherwise land on the Poster next door, which moves
   * the expansion and takes the card away with it. The design note asks for
   * "Tab from the expanded Poster into the card" (§4.6), and this is it: one
   * step forwards into the card's first action, one step back out to the
   * Poster, and ordinary Tab order inside the card and everywhere else.
   */
  function handOff(event: KeyboardEvent, to: HTMLElement | null) {
    if (event.key !== 'Tab' || !to) return;
    event.preventDefault();
    to.focus();
  }

  slots?.addEventListener('keydown', event => {
    const key = event as KeyboardEvent;
    if (key.shiftKey || details?.hidden !== false) return;
    if (!posterOf(key.target)?.classList.contains('is-expanded')) return;
    handOff(key, detailsPart('.details-choose'));
  });
  details?.addEventListener('keydown', event => {
    const key = event as KeyboardEvent;
    // Only off the front of the card: Tab within it, and off its end, are the
    // browser's own business.
    if (!key.shiftKey || key.target !== detailsPart('.details-choose')) return;
    handOff(key, posters.find(poster => poster.classList.contains('is-expanded')) ?? null);
  });

  // 20: the card's primary action, and the projector's gate lever.
  //
  // Both carry `performance.now()`, the clock every other report in this Room
  // carries, because the model may never ask the time itself — and the reel
  // sequence has four Beats and two projected ones to time against it.
  const film = document.querySelector<HTMLElement>('.cinema-film');
  const filmPart = (part: string) => film?.querySelector<HTMLElement>(part) ?? null;
  const bumper = filmPart('.bumper');
  const card = filmPart('.film-card');
  const slateLink = filmPart('.film-slate-link') as HTMLAnchorElement | null;
  const dim = document.querySelector<HTMLElement>('.cinema-dim');
  const beam = document.querySelector<HTMLElement>('.cinema-beam');
  const gate = document.querySelector<HTMLButtonElement>('[data-projector-gate]');

  detailsPart('.details-choose')?.addEventListener('click', () => {
    // The card is only ever showing one Film, and it is the one being chosen.
    if (!paintedDetails) return;
    dispatch({ type: 'cinema-film-chosen', film: paintedDetails.id, now: performance.now() });
    // The button the visitor just pressed closes with the card, so focus has
    // to be put somewhere on purpose rather than dropped on the document. The
    // gate lever is where it belongs: it is the control this choice hands them.
    gate?.focus();
  });

  // The lever is a real `<button>` throughout rather than a disabled one, so it
  // keeps its Tab stop and can say why it is doing nothing; `aria-disabled` is
  // the state, and the model is what refuses the click.
  gate?.addEventListener('click', () => dispatch({ type: 'projector-gate-toggled', now: performance.now() }));
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

  /**
   * What each step of the reel sequence sounds like as it is entered.
   *
   * Section 9's names. Nothing is registered for them yet — ticket 39 makes
   * the files — so each of these is a call into a registry that no-ops, and
   * the Room runs the whole sequence silently until it lands.
   */
  const REEL_SFX: Partial<Record<CinemaStep, readonly string[]>> = {
    searching: ['cabinet-open', 'reel-rattle'],
    loading: ['reel-load'],
  };

  /**
   * Write the Film's title card, in both languages and with its year.
   *
   * The same two titles the Poster and the card carried, out of the same
   * table: a Film says its name in one place in this codebase.
   */
  function paintCard(rolling: Film, language: Language) {
    const other: Language = language === 'zh-Hant' ? 'en' : 'zh-Hant';
    const main = filmPart('.film-title-main');
    const beneath = filmPart('.film-title-other');
    if (main) {
      main.textContent = rolling.title[language];
      main.lang = language;
    }
    if (beneath) {
      beneath.textContent = rolling.title[other];
      beneath.lang = other;
    }
    const year = filmPart('.film-year');
    if (year) year.textContent = String(rolling.year);
    if (slateLink) slateLink.href = rolling.link;
  }

  /** The studio's own wordmark: the current language large, the other beneath. */
  function paintWordmark(language: Language) {
    const other: Language = language === 'zh-Hant' ? 'en' : 'zh-Hant';
    const beneath = filmPart('.bumper-name-other');
    if (!beneath) return;
    beneath.textContent = copy[other].studioName;
    beneath.lang = other;
  }

  let paintedAttention: CinemaShelf | null | undefined;
  let paintedRummage: CinemaShelf | null | undefined;
  let paintedStep: CinemaStep | undefined;
  let paintedPinned: readonly FilmId[] | undefined;
  let paintedLanguage: Language | undefined;
  let paintedExpanded: FilmId | null | undefined;
  let paintedDetails: Film | null | undefined;
  let paintedReel: FilmId | null | undefined;
  let paintedRolling: Film | null | undefined;
  let paintedFilmStep: CinemaStep | undefined;

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
      // 20: and the same for the reel sequence's own two Beats.
      for (const name of REEL_SFX[step] ?? []) playSfx(name);
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
    const details_ = posterDetails(world);
    if (details && (paintedDetails !== details_ || paintedLanguage !== world.language)) {
      paintedDetails = details_;
      details.hidden = details_ === null;
      if (details_) paintDetails(details_, world.language);
    }

    // 20: the gate lever. Empty, it says so; loaded, it offers to roll; and
    // while the picture is up it offers to stop — three states off one fact.
    const reel = loadedReel(world);
    const rolling = rollingFilm(world);
    if (gate && (paintedReel !== reel || paintedRolling !== rolling || paintedLanguage !== world.language)) {
      const words = copy[world.language];
      const label = reel === null ? words.projectorGateEmpty : rolling ? words.projectorGateStop : words.projectorGateStart;
      gate.setAttribute('aria-disabled', String(reel === null));
      gate.setAttribute('aria-pressed', String(rolling !== null));
      gate.setAttribute('aria-label', label);
      paintedReel = reel;
    }

    // What the projector is throwing. The Bumper is shown by being un-hidden,
    // so it restarts whenever the reel is rolled again — which is exactly what
    // the model asks for: pulling the lever plays the ident from the top.
    const showingBumper = rolling !== null && step === 'bumper';
    if (film && (paintedRolling !== rolling || paintedFilmStep !== step || paintedLanguage !== world.language)) {
      film.hidden = rolling === null;
      if (dim) dim.hidden = rolling === null;
      if (beam) beam.hidden = rolling === null;
      if (bumper) bumper.hidden = !showingBumper;
      if (card) card.hidden = rolling === null || showingBumper;
      // §10.4: the card gains the link only once it has become the slate.
      if (slateLink) slateLink.hidden = step !== 'slate';
      if (rolling) {
        paintWordmark(world.language);
        paintCard(rolling, world.language);
      }
      // The Bumper's own music, and then the genre's title cue, which holds
      // over the slate. Both are Film-tier names section 9 gives; ticket 39
      // delivers the files and until then the registry no-ops.
      if (paintedRolling !== rolling || paintedFilmStep !== step) {
        if (rolling === null) setFilmAudio(null);
        else if (step === 'bumper') setFilmAudio('bumper');
        else if (step === 'title') setFilmAudio(`title-${rolling.shelf}`);
      }
      paintedRolling = rolling;
      paintedFilmStep = step;
    }

    paintedLanguage = world.language;
  };
};
