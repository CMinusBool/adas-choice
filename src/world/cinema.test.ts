import { describe, expect, it } from 'vitest';

import {
  CINEMA_MARKS,
  CINEMA_SHELVES,
  actorView,
  actorsIn,
  advance,
  attendedShelf,
  createWorld,
  filmById,
  filmsOn,
  isSeated,
  isWalkable,
  type ActorId,
  type ActorView,
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
