import type { CinemaShelf } from './cinema';
import type { Language } from './language';

/**
 * The nine Films the Cinema Room recommends.
 *
 * Facts, not decoration: every id, title and year here is the research note's
 * (`research/films.md`, verified 2026-09-10) and is copied verbatim. A Film is
 * a real film, so nothing about it is invented — only the Poster standing in
 * for it is original artwork.
 *
 * Film copy lives here rather than in `src/copy.ts` because it is per-Film data
 * keyed by id rather than a string the page chrome says, which is also the
 * design note's arrangement (§11: "Film titles, premises and reasons come from
 * `research/films.md`'s `films` block and are not repeated here"). It is still
 * bilingual, and the `Record<Language, string>` below is what makes that a
 * typecheck failure rather than a habit.
 */

/** Every Film, by the kebab-case of its English title. No year suffix; the nine are unique. */
export type FilmId =
  | 'knives-out'
  | 'kung-fu-hustle'
  | 'eat-drink-man-woman'
  | 'crazy-rich-asians'
  | 'about-time'
  | 'in-the-mood-for-love'
  | 'mr-vampire'
  | 'get-out'
  | 'detention';

export interface Film {
  readonly id: FilmId;
  /** The bookshelf it is rolled up in, which is also its genre. */
  readonly shelf: CinemaShelf;
  /** The Taiwan release title, and the official English title. */
  readonly title: Readonly<Record<Language, string>>;
  /** The original release year, in digits in both languages. */
  readonly year: number;
}

/**
 * Each shelf's three, in the order the Boy pins them.
 *
 * The order is the research note's tone spread, lightest Film first, so the
 * lightest of the three ends up in slot 1, nearest the shelves he took it from.
 */
const SHELVES: Readonly<Record<CinemaShelf, readonly FilmId[]>> = {
  comedy: ['knives-out', 'kung-fu-hustle', 'eat-drink-man-woman'],
  romance: ['crazy-rich-asians', 'about-time', 'in-the-mood-for-love'],
  horror: ['mr-vampire', 'get-out', 'detention'],
};

const BY_ID: Readonly<Record<FilmId, Film>> = {
  'knives-out': { id: 'knives-out', shelf: 'comedy', title: { 'zh-Hant': '鋒迴路轉', en: 'Knives Out' }, year: 2019 },
  'kung-fu-hustle': { id: 'kung-fu-hustle', shelf: 'comedy', title: { 'zh-Hant': '功夫', en: 'Kung Fu Hustle' }, year: 2004 },
  'eat-drink-man-woman': {
    id: 'eat-drink-man-woman',
    shelf: 'comedy',
    title: { 'zh-Hant': '飲食男女', en: 'Eat Drink Man Woman' },
    year: 1994,
  },
  'crazy-rich-asians': {
    id: 'crazy-rich-asians',
    shelf: 'romance',
    title: { 'zh-Hant': '瘋狂亞洲富豪', en: 'Crazy Rich Asians' },
    year: 2018,
  },
  'about-time': { id: 'about-time', shelf: 'romance', title: { 'zh-Hant': '真愛每一天', en: 'About Time' }, year: 2013 },
  'in-the-mood-for-love': {
    id: 'in-the-mood-for-love',
    shelf: 'romance',
    title: { 'zh-Hant': '花樣年華', en: 'In the Mood for Love' },
    year: 2000,
  },
  'mr-vampire': { id: 'mr-vampire', shelf: 'horror', title: { 'zh-Hant': '殭屍先生', en: 'Mr. Vampire' }, year: 1985 },
  'get-out': { id: 'get-out', shelf: 'horror', title: { 'zh-Hant': '逃出絕命鎮', en: 'Get Out' }, year: 2017 },
  detention: { id: 'detention', shelf: 'horror', title: { 'zh-Hant': '返校', en: 'Detention' }, year: 2019 },
};

/** The three Films rolled up in one bookshelf, in the order he pins them. */
export function filmsOn(shelf: CinemaShelf): readonly FilmId[] {
  return SHELVES[shelf];
}

/** One Film by id. Every `FilmId` has a row, so this never comes back empty. */
export function filmById(id: FilmId): Film {
  return BY_ID[id];
}
