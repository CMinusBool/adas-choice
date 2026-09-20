import { describe, expect, it } from 'vitest';

import {
  CINEMA_MARKS,
  CINEMA_SHELVES,
  actorView,
  actorsIn,
  advance,
  attendedShelf,
  cinemaStep,
  createWorld,
  expandedPoster,
  filmById,
  filmsOn,
  isSeated,
  isWalkable,
  openShelf,
  pinnedPosters,
  posterDetails,
  rummagingShelf,
  type ActorId,
  type ActorView,
  type CinemaShelf,
  type FilmId,
  type World,
  type WorldInputs,
} from './index';

/** A visitor arriving with nothing stored, no reduced-motion request, no hash. */
const plainArrival: WorldInputs = { hash: '', storedLanguage: null, reducedMotion: false };

function who(world: World, id: ActorId): ActorView {
  const actor = actorView(world, id);
  if (!actor) throw new Error(`${id} should be standing somewhere.`);
  return actor;
}

/** The world after the visitor walks through the Cinema Room's door. */
function inTheCinema(world: World = createWorld(plainArrival)): World {
  return advance(world, { type: 'hash-changed', hash: '#/cinema' });
}

/** One clock for the whole file, because a real visit's clock only goes up. */
let clock = 0;

/** Run the frame loop until something is true of the world, or give up. */
function runUntil(world: World, ready: (world: World) => boolean, ms = 20000, step = 16): World {
  const until = clock + ms;
  let next = world;
  while (clock < until && !ready(next)) {
    clock += step;
    next = advance(next, { type: 'actor-tick', now: clock });
  }
  return next;
}

/** The world once the Boy has finished whatever he was sent to do. */
function settled(world: World): World {
  return runUntil(world, next => !who(next, 'boy').moving);
}

describe('the Films each bookshelf holds', () => {
  // The three per shelf and the order he pins them in are the research note's
  // tone spread, lightest Film first, as the design note's table repeats them.
  it('holds three Films per shelf, lightest first', () => {
    expect(filmsOn('comedy')).toEqual(['knives-out', 'kung-fu-hustle', 'eat-drink-man-woman']);
    expect(filmsOn('romance')).toEqual(['crazy-rich-asians', 'about-time', 'in-the-mood-for-love']);
    expect(filmsOn('horror')).toEqual(['mr-vampire', 'get-out', 'detention']);
  });

  it('gives every Film a title in both languages and its own shelf', () => {
    for (const shelf of CINEMA_SHELVES) {
      for (const id of filmsOn(shelf)) {
        const film = filmById(id);
        expect(film.shelf).toBe(shelf);
        expect(film.title['zh-Hant']).not.toBe('');
        expect(film.title.en).not.toBe('');
        expect(film.title['zh-Hant']).not.toBe(film.title.en);
      }
    }
  });

  it('names Knives Out in both languages and dates it', () => {
    const film = filmById('knives-out');
    expect(film.title).toEqual({ 'zh-Hant': '鋒迴路轉', en: 'Knives Out' });
    expect(film.year).toBe(2019);
  });

  // 19: what the details panel reads out once a Poster has finished expanding.
  // Every string is the research note's, verbatim, in both languages.
  it('gives every Film a premise and a reason to watch in both languages', () => {
    for (const shelf of CINEMA_SHELVES) {
      for (const id of filmsOn(shelf)) {
        const film = filmById(id);
        for (const language of ['zh-Hant', 'en'] as const) {
          expect(film.premise[language].length).toBeGreaterThan(10);
          expect(film.reason[language].length).toBeGreaterThan(10);
        }
        expect(film.premise['zh-Hant']).not.toBe(film.premise.en);
        expect(film.reason['zh-Hant']).not.toBe(film.reason.en);
      }
    }
  });

  it('records which way round each Film is watched, five one way and four the other', () => {
    const pairings = CINEMA_SHELVES.flatMap(shelf => filmsOn(shelf).map(id => filmById(id).pairing));
    expect(pairings.filter(pairing => pairing === 'zh-audio-en-subs')).toHaveLength(5);
    expect(pairings.filter(pairing => pairing === 'en-audio-zh-subs')).toHaveLength(4);
    expect(filmById('knives-out').pairing).toBe('en-audio-zh-subs');
    expect(filmById('mr-vampire').pairing).toBe('zh-audio-en-subs');
  });

  it('links every Film to the one official page that verified its pairing', () => {
    const links = new Set<string>();
    for (const shelf of CINEMA_SHELVES) {
      for (const id of filmsOn(shelf)) {
        const link = filmById(id).link;
        expect(link.startsWith('https://tv.apple.com/')).toBe(true);
        links.add(link);
      }
    }
    // One page each: a link shared by two Films would send a visitor to the
    // wrong film, which no amount of copy could rescue.
    expect(links.size).toBe(9);
  });
});

describe('the Cinema Room floor', () => {
  it('opens the whole band between the screen and the board', () => {
    expect(isWalkable('cinema', { x: 120, y: 700 })).toBe(true);
    expect(isWalkable('cinema', { x: 1540, y: 850 })).toBe(true);
    expect(isWalkable('cinema', { x: 800, y: 660 })).toBe(true);
  });

  it('keeps the Cast out of the reel cabinet', () => {
    // The notch the cabinet stands in: an Actor may pass behind it but never
    // through it, so the Prop and the floor agree about where the furniture is.
    expect(isWalkable('cinema', { x: 500, y: 800 })).toBe(false);
    expect(isWalkable('cinema', { x: 500, y: 700 })).toBe(true);
    expect(isWalkable('cinema', { x: 612, y: 850 })).toBe(true);
  });
});

describe('walking into the Cinema Room', () => {
  it('finds the Boy and the Girl already sitting in their beanbags', () => {
    const world = inTheCinema();
    expect(who(world, 'boy').at).toEqual(CINEMA_MARKS.boySeat);
    expect(who(world, 'girl').at).toEqual(CINEMA_MARKS.girlSeat);
    expect(isSeated(world, 'boy')).toBe(true);
    expect(isSeated(world, 'girl')).toBe(true);
  });

  it('turns the two of them a little towards each other', () => {
    const world = inTheCinema();
    expect(who(world, 'boy').facing).toBe('left');
    expect(who(world, 'girl').facing).toBe('right');
  });

  it('seats them for a visitor who arrives at the Cinema Room directly', () => {
    const world = createWorld({ ...plainArrival, hash: '#/cinema' });
    expect(
      actorsIn(world, 'cinema')
        .map(actor => actor.id)
        .sort(),
    ).toEqual(['boy', 'girl']);
    expect(isSeated(world, 'boy')).toBe(true);
  });

  it('has nobody still walking in on arrival', () => {
    for (const actor of actorsIn(inTheCinema(), 'cinema')) expect(actor.moving).toBe(false);
  });

  it('gives the Boy back to the Entryway when the visitor leaves', () => {
    const left = advance(inTheCinema(), { type: 'hash-changed', hash: '#/entryway' });
    expect(who(left, 'boy').room).toBe('entryway');
    expect(isSeated(left, 'boy')).toBe(false);
  });
});

describe('a bookshelf holding the visitor’s attention', () => {
  /** The Cinema Room with one shelf under the pointer, or none. */
  function attending(shelf: 'comedy' | 'romance' | 'horror' | null, world = inTheCinema()): World {
    return advance(world, { type: 'cinema-shelf-attended', shelf });
  }

  it('walks the Boy over to the shelf', () => {
    const attended = attending('horror');
    expect(attendedShelf(attended)).toBe('horror');
    expect(who(attended, 'boy').moving).toBe(true);
    expect(who(attended, 'boy').cycle).toBe('walk');

    const arrived = settled(attended);
    expect(who(arrived, 'boy').at).toEqual(CINEMA_MARKS.shelves.horror);
    expect(isSeated(arrived, 'boy')).toBe(false);
  });

  it('leaves the Girl where she is', () => {
    const arrived = settled(attending('comedy'));
    expect(isSeated(arrived, 'girl')).toBe(true);
  });

  it('sends him back to his beanbag when attention leaves', () => {
    const away = attending(null, settled(attending('comedy')));
    expect(attendedShelf(away)).toBe(null);
    expect(isSeated(settled(away), 'boy')).toBe(true);
  });

  it('walks him straight on to the next shelf rather than home first', () => {
    const moved = attending('horror', settled(attending('comedy')));
    const arrived = settled(moved);
    expect(who(arrived, 'boy').at).toEqual(CINEMA_MARKS.shelves.horror);
  });

  it('puts him there at once when the apartment is not allowed to move', () => {
    const still = inTheCinema(createWorld({ ...plainArrival, reducedMotion: true }));
    const attended = attending('romance', still);
    expect(who(attended, 'boy').moving).toBe(false);
    expect(who(attended, 'boy').at).toEqual(CINEMA_MARKS.shelves.romance);
  });

  it('ignores a shelf reported from another Room', () => {
    const elsewhere = createWorld(plainArrival);
    expect(attending('comedy', elsewhere)).toBe(elsewhere);
  });

  it('is the same world when the same shelf is reported twice', () => {
    const attended = attending('comedy');
    expect(attending('comedy', attended)).toBe(attended);
  });

  it('lets go of the shelf when the visitor leaves the Room', () => {
    const left = advance(attending('comedy'), { type: 'hash-changed', hash: '#/entryway' });
    expect(attendedShelf(left)).toBe(null);
    expect(attendedShelf(inTheCinema(left))).toBe(null);
  });
});

describe('choosing a bookshelf', () => {
  /** The Cinema Room with a shelf clicked, at whatever time the run is up to. */
  function choose(shelf: CinemaShelf, world = inTheCinema()): World {
    return advance(world, { type: 'cinema-shelf-chosen', shelf, now: clock });
  }

  it('sends him to the shelf before anything comes out of it', () => {
    const chosen = choose('comedy');
    expect(cinemaStep(chosen)).toBe('walking-to-shelf');
    expect(who(chosen, 'boy').moving).toBe(true);
    expect(pinnedPosters(chosen)).toEqual([]);
    expect(openShelf(chosen)).toBe(null);
  });

  it('starts rummaging only once he is standing at the bay', () => {
    const arrived = runUntil(choose('horror'), world => cinemaStep(world) !== 'walking-to-shelf');
    expect(cinemaStep(arrived)).toBe('rummaging');
    expect(who(arrived, 'boy').at).toEqual(CINEMA_MARKS.shelves.horror);
    // Story 21: the rummage is a Beat the visitor watches, so nothing is on the
    // wall while it runs.
    expect(pinnedPosters(arrived)).toEqual([]);
  });

  it('ignores a shelf chosen from another Room', () => {
    const elsewhere = createWorld(plainArrival);
    expect(choose('comedy', elsewhere)).toBe(elsewhere);
  });

  it('pins the shelf’s three Posters, one at a time, in pin order', () => {
    // Every step the Room passes through, in the order it passed through them,
    // with the wall photographed at each one.
    const seen: { step: string; pinned: readonly string[] }[] = [];
    let world = choose('comedy');
    for (let frame = 0; frame < 1400 && !(cinemaStep(world) === 'seated' && frame > 0); frame += 1) {
      const step = cinemaStep(world);
      const pinned = pinnedPosters(world);
      const last = seen[seen.length - 1];
      if (!last || last.step !== step || last.pinned.length !== pinned.length) seen.push({ step, pinned });
      clock += 16;
      world = advance(world, { type: 'actor-tick', now: clock });
    }

    expect(seen.map(moment => moment.step)).toEqual([
      'walking-to-shelf',
      'rummaging',
      'carrying',
      'pinning',
      'carrying',
      'pinning',
      'carrying',
      'pinning',
      'returning',
    ]);
    // One Poster at a time, never two appearing together.
    expect(seen.map(moment => moment.pinned.length)).toEqual([0, 0, 0, 0, 1, 1, 2, 2, 3]);
    expect(pinnedPosters(world)).toEqual(filmsOn('comedy'));
    expect(openShelf(world)).toBe('comedy');
  });

  it('leaves him back in his beanbag with the wall full', () => {
    const done = runUntil(choose('romance'), world => cinemaStep(world) === 'seated', 40000);
    expect(cinemaStep(done)).toBe('seated');
    expect(isSeated(done, 'boy')).toBe(true);
    expect(pinnedPosters(done)).toEqual(filmsOn('romance'));
  });

  it('names the shelf being rummaged, and only while the Beat runs', () => {
    const chosen = choose('romance');
    expect(rummagingShelf(chosen)).toBe(null);

    const rummaging = runUntil(chosen, world => cinemaStep(world) === 'rummaging');
    expect(rummagingShelf(rummaging)).toBe('romance');

    const carrying = runUntil(rummaging, world => cinemaStep(world) !== 'rummaging', 40000);
    expect(rummagingShelf(carrying)).toBe(null);
  });

  it('puts the Posters straight on the wall when the apartment may not move', () => {
    // No tick is dispatched at all: with motion off there is nothing for the
    // clock to do, and the visitor is owed the outcome without the performance.
    const still = inTheCinema(createWorld({ ...plainArrival, reducedMotion: true }));
    const done = choose('horror', still);
    expect(cinemaStep(done)).toBe('seated');
    expect(pinnedPosters(done)).toEqual(filmsOn('horror'));
    expect(isSeated(done, 'boy')).toBe(true);
  });

  it('finishes the errand rather than stranding him when motion is turned off', () => {
    const rummaging = runUntil(choose('comedy'), world => cinemaStep(world) === 'rummaging');
    expect(cinemaStep(rummaging)).toBe('rummaging');

    const paused = advance(rummaging, { type: 'motion-toggled' });
    expect(cinemaStep(paused)).toBe('seated');
    expect(pinnedPosters(paused)).toEqual(filmsOn('comedy'));
    expect(isSeated(paused, 'boy')).toBe(true);
    expect(who(paused, 'boy').moving).toBe(false);
  });

  it('lights another shelf on hover mid-errand without moving him', () => {
    const rummaging = runUntil(choose('comedy'), world => cinemaStep(world) === 'rummaging');
    const hovered = advance(rummaging, { type: 'cinema-shelf-attended', shelf: 'horror' });
    expect(attendedShelf(hovered)).toBe('horror');
    expect(who(hovered, 'boy').at).toEqual(CINEMA_MARKS.shelves.comedy);
    expect(who(hovered, 'boy').moving).toBe(false);
    expect(cinemaStep(hovered)).toBe('rummaging');
  });

  it('abandons a half-pinned wall for the shelf chosen instead', () => {
    const half = runUntil(choose('comedy'), world => pinnedPosters(world).length === 2, 40000);
    expect(pinnedPosters(half)).toEqual(filmsOn('comedy').slice(0, 2));

    const switched = choose('horror', half);
    expect(cinemaStep(switched)).toBe('walking-to-shelf');
    // The wall is not cleared until he reaches in, so the two are still up.
    expect(pinnedPosters(switched)).toEqual(filmsOn('comedy').slice(0, 2));

    const done = runUntil(switched, world => cinemaStep(world) === 'seated', 40000);
    expect(pinnedPosters(done)).toEqual(filmsOn('horror'));
    expect(isSeated(done, 'boy')).toBe(true);
  });

  it('finishes the errand and keeps the wall when the visitor walks out', () => {
    const half = runUntil(choose('romance'), world => cinemaStep(world) === 'carrying', 40000);
    const left = advance(half, { type: 'hash-changed', hash: '#/entryway' });
    expect(cinemaStep(left)).toBe('seated');
    expect(pinnedPosters(left)).toEqual(filmsOn('romance'));
    expect(who(left, 'boy').room).toBe('entryway');

    const back = inTheCinema(left);
    expect(isSeated(back, 'boy')).toBe(true);
    expect(openShelf(back)).toBe('romance');
  });

  it('replaces the wall when a different shelf is chosen', () => {
    const comedy = runUntil(choose('comedy'), world => cinemaStep(world) === 'seated', 40000);
    expect(openShelf(comedy)).toBe('comedy');

    const horror = runUntil(choose('horror', comedy), world => cinemaStep(world) === 'seated', 40000);
    expect(pinnedPosters(horror)).toEqual(filmsOn('horror'));
    expect(openShelf(horror)).toBe('horror');
  });
});

// 19: the Poster expansion. Hovering or focusing a pinned Poster opens it out
// of its frame, and once it has finished opening its Film can be read.
describe('expanding a pinned Poster', () => {
  /** The Cinema Room with one shelf's three Posters already on the wall. */
  function wallUp(shelf: CinemaShelf = 'comedy', world = inTheCinema()): World {
    const chosen = advance(world, { type: 'cinema-shelf-chosen', shelf, now: clock });
    return runUntil(chosen, next => cinemaStep(next) === 'seated', 40000);
  }

  /** A pointer resting on a Poster, a Tab landing on one, or both leaving. */
  function attend(world: World, film: FilmId | null): World {
    return advance(world, { type: 'cinema-poster-attended', film, now: clock });
  }

  it('expands the Poster the visitor’s pointer or focus is on', () => {
    const wall = wallUp();
    expect(expandedPoster(wall)).toBe(null);

    const hovered = attend(wall, 'knives-out');
    expect(expandedPoster(hovered)).toBe('knives-out');
  });

  it('collapses it again when the pointer and focus both leave', () => {
    const away = attend(attend(wallUp(), 'knives-out'), null);
    expect(expandedPoster(away)).toBe(null);
  });

  it('moves the expansion to the Poster next door rather than opening two', () => {
    const second = attend(attend(wallUp(), 'knives-out'), 'kung-fu-hustle');
    expect(expandedPoster(second)).toBe('kung-fu-hustle');
  });

  it('is the same world when the same Poster is reported twice', () => {
    const hovered = attend(wallUp(), 'knives-out');
    expect(attend(hovered, 'knives-out')).toBe(hovered);
  });

  it('ignores a Film that is not on the wall', () => {
    // The horror shelf's Posters are rolled up in their bookshelf, so there is
    // nothing there to hover: a report about one means nothing.
    const wall = wallUp();
    expect(attend(wall, 'mr-vampire')).toBe(wall);
    expect(expandedPoster(wall)).toBe(null);
  });

  it('ignores a Poster reported from another Room', () => {
    const elsewhere = createWorld(plainArrival);
    expect(attend(elsewhere, 'knives-out')).toBe(elsewhere);
  });

  // Story 22: no text before the expansion has finished.
  it('keeps the details back until the Poster has finished expanding', () => {
    const hovered = attend(wallUp(), 'knives-out');
    expect(expandedPoster(hovered)).toBe('knives-out');
    expect(posterDetails(hovered)).toBe(null);

    const open = runUntil(hovered, world => posterDetails(world) !== null, 4000);
    expect(posterDetails(open)?.id).toBe('knives-out');
  });

  it('reads out the Film’s name, year, premise and reason in both languages', () => {
    const open = runUntil(attend(wallUp('romance'), 'about-time'), world => posterDetails(world) !== null, 4000);
    const film = posterDetails(open);
    expect(film).not.toBe(null);
    expect(film?.title).toEqual({ 'zh-Hant': '真愛每一天', en: 'About Time' });
    expect(film?.year).toBe(2013);
    expect(film?.premise['zh-Hant']).toContain('提姆');
    expect(film?.premise.en).toContain('time');
    expect(film?.reason['zh-Hant']).toContain('父親');
    expect(film?.reason.en).toContain('fathers');
    expect(film?.pairing).toBe('en-audio-zh-subs');
  });

  it('takes the details away again with the Poster', () => {
    const open = runUntil(attend(wallUp(), 'knives-out'), world => posterDetails(world) !== null, 4000);
    expect(posterDetails(attend(open, null))).toBe(null);
  });

  it('starts the expansion over when the pointer moves to the Poster next door', () => {
    const open = runUntil(attend(wallUp(), 'knives-out'), world => posterDetails(world) !== null, 4000);
    const moved = attend(open, 'kung-fu-hustle');
    // The second Poster has its own opening to do: its details are not simply
    // inherited from the one the visitor has just left.
    expect(posterDetails(moved)).toBe(null);
    expect(posterDetails(runUntil(moved, world => posterDetails(world) !== null, 4000))?.id).toBe('kung-fu-hustle');
  });

  it('reads the details straight out when the apartment may not move', () => {
    // No tick at all: a visitor who asked for stillness is owed the details
    // rather than 450 ms of a Poster unfolding at them.
    const still = inTheCinema(createWorld({ ...plainArrival, reducedMotion: true }));
    const open = attend(wallUp('horror', still), 'get-out');
    expect(expandedPoster(open)).toBe('get-out');
    expect(posterDetails(open)?.id).toBe('get-out');
  });

  it('finishes an expansion in progress when motion is turned off', () => {
    const hovered = attend(wallUp(), 'knives-out');
    expect(posterDetails(hovered)).toBe(null);

    const paused = advance(hovered, { type: 'motion-toggled' });
    expect(expandedPoster(paused)).toBe('knives-out');
    expect(posterDetails(paused)?.id).toBe('knives-out');
  });

  it('closes the Poster when he clears the wall to pin another shelf’s', () => {
    const open = runUntil(attend(wallUp(), 'knives-out'), world => posterDetails(world) !== null, 4000);
    const rummaging = runUntil(
      advance(open, { type: 'cinema-shelf-chosen', shelf: 'horror', now: clock }),
      world => cinemaStep(world) === 'rummaging',
      40000,
    );
    expect(pinnedPosters(rummaging)).toEqual([]);
    expect(expandedPoster(rummaging)).toBe(null);
    expect(posterDetails(rummaging)).toBe(null);
  });

  it('closes the Poster when the visitor walks out of the Room', () => {
    const open = runUntil(attend(wallUp(), 'knives-out'), world => posterDetails(world) !== null, 4000);
    const left = advance(open, { type: 'hash-changed', hash: '#/entryway' });
    expect(expandedPoster(left)).toBe(null);

    // The wall is still up when they come back; nothing on it is open.
    const back = inTheCinema(left);
    expect(pinnedPosters(back)).toEqual(filmsOn('comedy'));
    expect(expandedPoster(back)).toBe(null);
    expect(posterDetails(back)).toBe(null);
  });
});

// 20: the reel, the projector and the Bumper. Choosing a Film sends him to the
// cabinet to find its reel, he loads it, and the projector plays the studio's
// Bumper into the Film's title card and then its slate.
describe('choosing a Film, and the reel he fetches for it', () => {
  /** The Cinema Room with one shelf's three Posters already on the wall. */
  function wallUp(shelf: CinemaShelf = 'comedy', world = inTheCinema()): World {
    const chosen = advance(world, { type: 'cinema-shelf-chosen', shelf, now: clock });
    return runUntil(chosen, next => cinemaStep(next) === 'seated', 40000);
  }

  /** The visitor pressing the details card's primary action. */
  function choose(world: World, film: FilmId): World {
    return advance(world, { type: 'cinema-film-chosen', film, now: clock });
  }

  it('sends him to the cabinet to look for that Film’s reel', () => {
    const chosen = choose(wallUp(), 'knives-out');
    expect(cinemaStep(chosen)).toBe('fetching');

    const searching = runUntil(chosen, next => cinemaStep(next) === 'searching', 40000);
    expect(who(searching, 'boy').at).toEqual(CINEMA_MARKS.cabinet);
  });
});
