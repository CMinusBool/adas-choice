// 08: the three cats roam
import type { ActorId } from './actors';
// 09: the hall table's mark is the Entryway's own, written down once there.
import { ENTRYWAY_MARKS } from './entryway';
import type { RoomId } from './rooms';
import { STAGE_WIDTH, WALK_SPEED, distance, type Point } from './stage';

/**
 * The three cats, as something that decides for itself.
 *
 * Míca, Mira and Luna are Actors like the Boy and the Girl — `actors.ts` walks
 * them across a floor and the DOM layer paints them — but unlike the two of
 * them they are nobody's to command: they pick where to go next, they meow when
 * they feel like it, and they stop for a fuss. Those decisions are this file,
 * and only this file. It holds no position and no route: it is handed where
 * each cat is standing and hands back where each one would like to be.
 *
 * Time arrives as a `now` in milliseconds and the dice as a `RandomSource`, so
 * the same seed and the same clock produce the same afternoon twice. Nothing
 * here knows about the DOM, the browser or a sound file.
 */

/** A cat, which is an Actor that is not one of the two people. */
export type CatId = 'mica' | 'mira' | 'luna';

/** All three, in Character Sheet order — the order they are offered to Tab. */
export const CAT_IDS: readonly CatId[] = ['mica', 'mira', 'luna'];

export function isCat(actor: ActorId): actor is CatId {
  return (CAT_IDS as readonly string[]).includes(actor);
}

/**
 * How far apart two cats have to be to read as two animals, in stage units.
 *
 * A cat's drawn box is about 176 units across (design note 10 §3.4), so a pair
 * of them less than a box apart is a pile rather than a Room with cats in it.
 * Every roam mark below is further than this from every other mark in its
 * Room, which is what makes "two cats never settle on the same mark" a property
 * of the geometry rather than a race the tick has to win.
 */
export const CAT_CLEARANCE = 170;

/**
 * Where a cat is willing to be, in each Room.
 *
 * Five marks a Room, taken from the design notes where a note names one — the
 * Activity Room's three rest marks and its door (12 §4.3), the Game Room's
 * sideboard cat bed (11 §4.3), the Cinema Room's two Breakable marks (13 §7) —
 * and placed on the Room's own floor where it does not. Every one is a feet
 * point in stage units and lies inside that Room's walkable area, and every
 * pair within a Room is more than `CAT_CLEARANCE` apart.
 *
 * Five is the smallest number that keeps three cats moving without ever
 * crowding: two of them claim at most two marks between them, and a cat's own
 * mark is a third, so there are always at least two left to choose from.
 */
export const CAT_MARKS: Record<RoomId, readonly Point[]> = {
  // The hallway: the coat corner, the runner in front of the Game Room door,
  // the hall table where the vase stands, and the monstera's end.
  entryway: [
    { x: 200, y: 690 },
    { x: 560, y: 840 },
    { x: 940, y: 680 },
    { x: 1160, y: 830 },
    { x: 1420, y: 690 },
  ],
  // The Game Room: the sideboard's cat bed is Luna's mark in the design note,
  // and the other four keep out of the low table's notch.
  games: [
    { x: 280, y: 700 },
    { x: 400, y: 840 },
    { x: 760, y: 700 },
    { x: 1180, y: 700 },
    { x: 1300, y: 840 },
  ],
  // The Cinema Room: the reel cabinet's left side and the comedy bay are the
  // two Breakable marks, so a cat is already where ticket 09 wants one. 63: the
  // comedy bay went to the corner right of the screen, so its mark went with
  // it, and the right-hand mark it would have crowded came to the middle of the
  // floor, under the screen.
  cinema: [
    { x: 200, y: 700 },
    { x: 392, y: 850 },
    { x: 1380, y: 675 },
    { x: 1180, y: 840 },
    { x: 960, y: 700 },
  ],
  // The Activity Room: the note's own three rest marks, the door a cat comes
  // in through, and the floor between the stations.
  activities: [
    { x: 150, y: 662 },
    { x: 370, y: 724 },
    { x: 700, y: 690 },
    { x: 1040, y: 820 },
    { x: 1240, y: 700 },
  ],
};

/** Where a cat is standing, and whether it is on its way somewhere. */
export interface CatPlace {
  readonly id: CatId;
  readonly at: Point;
  readonly moving: boolean;
}

/**
 * The mark each cat has claimed: where it is heading, or where it stands.
 *
 * A walking cat's own position is no use to anyone — it is halfway across the
 * floor and will not be there in a moment — so what it holds against the others
 * is the mark it is walking to.
 */
function claims(places: readonly CatPlace[], except: CatId, goals: ReadonlyMap<CatId, Point | null>): Point[] {
  return places.flatMap(place => {
    if (place.id === except) return [];
    const goal = goals.get(place.id) ?? null;
    return [goal ?? place.at];
  });
}

function farEnough(mark: Point, from: readonly Point[]): boolean {
  return from.every(other => distance(mark, other) >= CAT_CLEARANCE);
}

/**
 * A mark in this Room this cat could go to next, or `null` for none free.
 *
 * Free means far enough from everywhere the other cats are or are heading, and
 * far enough from where this cat is already standing — a cat that picked its
 * own mark would stand there twitching rather than crossing the Room. `null` is
 * a cat that stays put a while longer, which is the one honest answer when the
 * Room is busy and is why two of them can never converge on one mark.
 *
 * 68: `reserved` is somewhere else nobody may settle: the mark of a Breakable
 * due to fall this visit, kept clear for the cat who is going to knock it.
 */
export function freeMark(
  room: RoomId,
  cat: CatId,
  places: readonly CatPlace[],
  goals: ReadonlyMap<CatId, Point | null>,
  random: () => number,
  reserved: readonly Point[] = [],
): Point | null {
  const here = places.find(place => place.id === cat);
  const taken = [...claims(places, cat, goals), ...reserved];
  const free = CAT_MARKS[room].filter(
    mark => farEnough(mark, taken) && (!here || distance(mark, here.at) >= CAT_CLEARANCE),
  );
  if (free.length === 0) return null;
  return free[Math.min(free.length - 1, Math.floor(random() * free.length))];
}

/**
 * How long a cat stops for before it thinks of somewhere else, in milliseconds.
 *
 * Long enough to read as a cat sitting down rather than a thing on rails, short
 * enough that a Room the visitor stands in for a minute is never still.
 */
const REST_MS = { least: 900, most: 3400 };

/** How long between one cat's meows, in milliseconds. Three cats, so: rarely. */
const MEOW_MS = { least: 12000, most: 34000 };

/**
 * How long a fuss lasts, in milliseconds.
 *
 * The petting Beat's whole length: the cat flops, is fussed over, and gets up.
 * Named by the model and played by the DOM layer if a sheet for it has been
 * delivered — until then the cat simply stops for as long as the fuss lasts,
 * the way the arrival's Beats degrade to the Cast walking it.
 */
const PETTING_MS = 1600;

/** The Beat played over a cat being petted, by the name its sheet would carry. */
export function pettingBeat(cat: CatId): string {
  return `pet-${cat}`;
}

/** The sound this cat makes. One name each: the three never share a sample. */
export function meowOf(cat: CatId): string {
  return `${cat}-meow`;
}

/**
 * The five Breakables the apartment holds, across four Rooms (design notes
 * 10 §4.2, 11 §5.2, 12 §5.4, 13 §7).
 *
 * A cat's own name is not part of the id: the table below is the single source
 * of truth for who reaches for which, so nothing else in the codebase
 * hard-codes the pairing a second time.
 */
export type BreakableId =
  | 'entryway-vase'
  | 'cinema-film-can'
  | 'cinema-lucky-cat'
  | 'snow-globe'
  | 'activity-pencil-mug';

/** Every Breakable, in the order its owning cat and Room were decided. */
export const BREAKABLE_IDS: readonly BreakableId[] = [
  'entryway-vase',
  'cinema-film-can',
  'cinema-lucky-cat',
  'snow-globe',
  'activity-pencil-mug',
];

/**
 * Everything the apartment knows about one Breakable, in one record.
 *
 * A `Film` for china: who owns it, where it stands, where she stands to push
 * it, how long that takes and what it sounds like going over are five facts
 * about one thing rather than five tables that have to be kept in step.
 */
export interface Breakable {
  readonly id: BreakableId;
  /**
   * The cat who owns it, and the only one who ever reaches for it.
   *
   * The owner's ruling of 2026-09-20: every cat owns at least one, the tally
   * is 2/2/1 (Míca, Mira, Luna), and the roll is per-cat-per-Breakable rather
   * than "whoever is in the Room" — Luna must never reach for Míca's vase even
   * though both stand in the Entryway.
   */
  readonly owner: CatId;
  /** The Room it stands in. */
  readonly room: RoomId;
  /**
   * Where she stands to knock it down, in stage units.
   *
   * Three of these are marks a cat was already roaming to — the Cinema's two
   * (design 13 §8, Beats B9/B10) and the Game Room's sideboard cat bed (design
   * 11 §5.3) — because the design notes put a cat's roam mark exactly where
   * her Breakable stands, and they are taken from `CAT_MARKS` above rather
   * than written out again. The Entryway's `K` is the hall table's own mark in
   * `entryway.ts`, which is the only place that number is written down. Only
   * the Activity Room's `M-mug` (design 12 §4.3) is a point of its own: no cat
   * stands there except on her way to a knock.
   */
  readonly mark: Point;
  /**
   * How long she holds at the mark before it falls, in milliseconds.
   *
   * Animation is parked, so this is the whole of the Beat until its sheet is
   * drawn: the design notes' own timings (10 §4.2's S23+S24, 13 §8's B9/B10,
   * 11 §5.3's wobble-then-fall, 12's unscored equivalent) with no in-between
   * frames to paint, exactly like a petting Beat with no `[data-beat]` layer.
   */
  readonly knockMs: number;
  /** The sound it makes going over. One name each: the five never share one. */
  readonly sfx: string;
}

const BREAKABLES: Readonly<Record<BreakableId, Breakable>> = {
  'entryway-vase': {
    id: 'entryway-vase',
    owner: 'mica',
    room: 'entryway',
    mark: ENTRYWAY_MARKS.K,
    knockMs: 2300,
    sfx: 'ceramic-break',
  },
  'cinema-film-can': {
    id: 'cinema-film-can',
    owner: 'mica',
    room: 'cinema',
    mark: CAT_MARKS.cinema[1],
    knockMs: 1800,
    sfx: 'film-can-fall',
  },
  'cinema-lucky-cat': {
    id: 'cinema-lucky-cat',
    owner: 'mira',
    room: 'cinema',
    mark: CAT_MARKS.cinema[2],
    knockMs: 1400,
    sfx: 'porcelain-shatter',
  },
  'snow-globe': {
    id: 'snow-globe',
    owner: 'luna',
    room: 'games',
    mark: CAT_MARKS.games[3],
    knockMs: 1950,
    sfx: 'snow-globe-smash',
  },
  'activity-pencil-mug': {
    id: 'activity-pencil-mug',
    owner: 'mira',
    room: 'activities',
    mark: { x: 620, y: 690 },
    knockMs: 1500,
    sfx: 'mug-smash',
  },
};

/** One Breakable, by id. Every id has a record, so this never answers nothing. */
export function breakableById(breakable: BreakableId): Breakable {
  return BREAKABLES[breakable];
}

// 68: a Breakable falls on two rolls — whether, then when within 60 s.
/**
 * The first roll: how likely a Breakable still standing when the visitor walks
 * into its Room is to go over during that visit. Rolled once per Breakable per
 * entry, the moment the Room's Arrival ends.
 */
const FALL_CHANCE = 0.5;

/**
 * The second roll's range, in milliseconds: a fall the first roll allowed lands
 * uniformly somewhere in the first minute after the Arrival ends (the owner's
 * ruling of 2026-09-25). The moment is when it **falls**; the cat's walk and her
 * `knockMs` hold are spent before it, never after.
 */
export const FALL_WINDOW_MS = 60000;

/**
 * How long a cat reckons a walk takes, in milliseconds, at the walk Cycle's
 * speed and erring on the long side: a route bends round furniture, so the
 * straight line is a floor, not the walk.
 */
function walkMs(from: Point, to: Point): number {
  return (distance(from, to) / WALK_SPEED) * 1000 * 1.25 + 300;
}

/**
 * The longest ordinary wander a cat may still start before a knock: a walk
 * clean across the stage, by the same reckoning. A cat thinking of somewhere to
 * be that close to setting off for her Breakable goes to it instead, and waits
 * there, so no wander ever makes her late.
 */
const WANDER_LEAD_MS = walkMs({ x: 0, y: 0 }, { x: STAGE_WIDTH, y: 0 });

/**
 * The late-cat allowance: the most a fall can land after the moment rolled for
 * it, in milliseconds, when its cat could not make that moment — a walk clean
 * across the stage and the longest knock. So every fall of a visit lands inside
 * `FALL_WINDOW_MS + LATE_CAT_MS` of its Arrival's end, which is the window
 * `scripts/verify/breakable-fall.mjs` watches for.
 */
export const LATE_CAT_MS = WANDER_LEAD_MS + Math.max(...BREAKABLE_IDS.map(id => BREAKABLES[id].knockMs));

/** One Breakable the first roll let fall, and where in the minute the second put it. */
interface Fall {
  readonly breakable: BreakableId;
  /** Milliseconds after the Arrival ended. */
  readonly afterMs: number;
}

/** What the two rolls decided for this entry into the Room. */
interface FallPlan {
  /** The clock when the rolls were made: the first tick after the Arrival ended. */
  readonly rolledAt: number;
  /** The falls still to come, in `BREAKABLE_IDS` order. */
  readonly pending: readonly Fall[];
}

/**
 * Both rolls, for every Breakable in this Room still standing.
 *
 * A broken one is never rolled for, so it draws nothing from the dice either.
 * The order is fixed — `BREAKABLE_IDS`, the first roll then the second — so
 * one seed and one clock give the same falls every time.
 */
function rollFalls(room: RoomId, broken: ReadonlySet<BreakableId>, now: number, random: () => number): FallPlan {
  const pending: Fall[] = [];
  for (const id of BREAKABLE_IDS) {
    if (BREAKABLES[id].room !== room || broken.has(id)) continue;
    if (random() < FALL_CHANCE) pending.push({ breakable: id, afterMs: random() * FALL_WINDOW_MS });
  }
  return { rolledAt: now, pending };
}

/** The Beat played over a cat knocking her Breakable down, by its sheet's name. */
export function knockBeat(breakable: BreakableId): string {
  return `knock-${breakable}`;
}

function between(span: { least: number; most: number }, random: () => number): number {
  return span.least + random() * (span.most - span.least);
}

/**
 * When something next happens, given the clock and the longest it could be.
 *
 * A clock that restarted — a tab woken hours later, a test running a second
 * visit — would otherwise leave every cat waiting for a moment already past or
 * impossibly far off, so anything further ahead than its own longest gap is
 * measured again from now.
 */
function due(at: number | null, now: number, span: { least: number; most: number }, random: () => number): number {
  return at !== null && at > now && at <= now + span.most ? at : now + between(span, random);
}

/**
 * Has this scheduled moment come?
 *
 * A moment further in the past than its own longest gap is a clock that jumped
 * rather than a cat that is overdue — a tab left in the background for an hour
 * comes back to one meow, not to forty of them at once.
 */
function reached(at: number | null, now: number, span: { least: number; most: number }): boolean {
  return at !== null && at <= now && at >= now - span.most;
}

/** What one cat has decided. Private to this file: the DOM layer asks questions. */
interface CatMind {
  readonly id: CatId;
  /** The mark it is walking to, or `null` while it is not going anywhere. */
  readonly goal: Point | null;
  /** When it next thinks of somewhere to be, or `null` until it is told the time. */
  readonly restUntil: number | null;
  /** When it next meows, or `null` until it is told the time. */
  readonly meowAt: number | null;
  /** When the fuss it is having ends, or `null` when nobody is petting it. */
  readonly pettedUntil: number | null;
  /** The Breakable she is walking to or knocking down, or `null` the rest of the time. */
  readonly knocking: BreakableId | null;
  /** When the Breakable she is knocking falls, or `null` while she is still walking to it. */
  readonly knockUntil: number | null;
}

/** What the three of them have decided, and what the last tick made a noise about. */
export interface CatsSlice {
  readonly minds: readonly CatMind[];
  /**
   * SFX names the last tick or the last fuss crossed, to play once and forget.
   *
   * Edge-triggered, exactly as the arrival's are: the slice changes identity on
   * the tick that makes a sound and again on the one that forgets it, so the
   * DOM layer plays each meow once by watching the slice rather than counting.
   */
  readonly sfx: readonly string[];
  /**
   * 68: what the two rolls decided for the Room the visitor is in, or `null`
   * before they are made — until the first tick after its Arrival ends, and
   * again from the moment the visitor walks out, so every entry rolls afresh.
   */
  readonly falls: FallPlan | null;
}

/** Three cats who have not decided anything yet, and have not been told the time. */
export function createCats(): CatsSlice {
  return {
    minds: CAT_IDS.map(id => ({
      id,
      goal: null,
      restUntil: null,
      meowAt: null,
      pettedUntil: null,
      knocking: null,
      knockUntil: null,
    })),
    sfx: [],
    falls: null,
  };
}

/** Somewhere a cat has been told to walk to, for `actors.ts` to route. */
export interface CatSend {
  readonly cat: CatId;
  readonly goal: Point;
}

/** The three of them one tick on, and everything that tick asked for. */
export interface CatsStep {
  readonly slice: CatsSlice;
  readonly sends: readonly CatSend[];
  /** Breakables that fell this tick, for the world to mark broken and remember. */
  readonly knocked: readonly BreakableId[];
}

const same = (one: CatMind, other: CatMind) =>
  one.goal === other.goal &&
  one.restUntil === other.restUntil &&
  one.meowAt === other.meowAt &&
  one.pettedUntil === other.pettedUntil &&
  one.knocking === other.knocking &&
  one.knockUntil === other.knockUntil;

/**
 * The cats after one tick of the clock.
 *
 * A cat standing still long enough picks somewhere else in the Room to be and
 * sets off; one walking is left alone until it arrives; one being petted stays
 * for the whole fuss. Each of them meows on its own schedule, so the apartment
 * never produces three meows at once and never the same meow twice running.
 *
 * `places` is the cats in the Room the visitor is in, and nobody else: a cat in
 * a Room nobody is looking at has nothing to decide. The slice comes back by
 * identity when the tick changed nothing, so a quiet frame costs no repaint.
 *
 * 68: the first tick of a visit to the Room also rolls, twice, for each of its
 * Breakables still standing — whether it falls, then when in the next minute —
 * before any cat decides anything, so the dice they draw come after it. Its
 * owner sets off in time to hold her knock and have it fall on the moment
 * rolled; if a hand or a long way round makes her late, it falls when she has
 * held her knock, and never before the moment rolled.
 */
export function tickCats(
  slice: CatsSlice,
  room: RoomId,
  places: readonly CatPlace[],
  now: number,
  random: () => number,
  broken: ReadonlySet<BreakableId>,
): CatsStep {
  const sends: CatSend[] = [];
  const sfx: string[] = [];
  const knocked: BreakableId[] = [];
  let falls: FallPlan = slice.falls ?? rollFalls(room, broken, now, random);
  const fallsAt = (fall: Fall) => falls.rolledAt + fall.afterMs;
  // The falls still to come for Breakables still standing: this cat's own, or
  // everybody else's. Read afresh each time, because a knock this tick takes
  // its fall out of `falls`.
  const fallsStillDue = (cat: CatId, hers: boolean): readonly Fall[] =>
    falls.pending.filter(fall => (BREAKABLES[fall.breakable].owner === cat) === hers && !broken.has(fall.breakable));
  const fallFor = (cat: CatId): Fall | null =>
    fallsStillDue(cat, true).reduce<Fall | null>(
      (soonest, fall) => (soonest && soonest.afterMs <= fall.afterMs ? soonest : fall),
      null,
    );
  // Updated as each cat decides, so two of them settling on the same tick still
  // see each other's choice rather than both reaching for the same mark.
  const goals = new Map<CatId, Point | null>(slice.minds.map(mind => [mind.id, mind.goal]));
  const minds = slice.minds.map(mind => {
    const place = places.find(candidate => candidate.id === mind.id);
    // A cat in a Room the visitor is not in has nothing to decide and nothing
    // to say: it waits, exactly where the Room it was left in put it.
    if (!place) return mind;

    const meowing = reached(mind.meowAt, now, MEOW_MS);
    if (meowing) sfx.push(meowOf(mind.id));
    const meowAt = meowing ? now + between(MEOW_MS, random) : due(mind.meowAt, now, MEOW_MS, random);
    const next = (decided: Partial<CatMind>): CatMind => {
      const made = { ...mind, meowAt, ...decided };
      return same(made, mind) ? mind : made;
    };

    // A fuss holds the cat where it is; it wanders off once it is over.
    if (mind.pettedUntil !== null) {
      if (now < mind.pettedUntil) return next({});
      return next({ pettedUntil: null, restUntil: now + between(REST_MS, random) });
    }
    if (place.moving) return next({});

    // She has a Breakable in her sights: walking to its mark, or holding there
    // for the knock. A mark is claimed by `goals` exactly like an ordinary
    // wander goal, so the other two still route around her while she is on it.
    if (mind.knocking !== null) {
      const knocking = mind.knocking;
      if (mind.knockUntil === null) {
        // On the mark. Her knock is a Beat of its own length that ends as the
        // thing goes over, so an early cat waits here and starts it `knockMs`
        // before the moment rolled; a late one starts it the moment she
        // arrives, and it falls when the knock is done, never before the moment.
        goals.set(mind.id, null);
        const fall = fallsStillDue(mind.id, true).find(candidate => candidate.breakable === knocking);
        const { knockMs } = BREAKABLES[knocking];
        if (fall && now < fallsAt(fall) - knockMs) return next({});
        return next({ knockUntil: fall ? Math.max(now + knockMs, fallsAt(fall)) : now + knockMs });
      }
      if (now < mind.knockUntil) return next({});
      // It falls.
      knocked.push(knocking);
      sfx.push(BREAKABLES[knocking].sfx);
      falls = { ...falls, pending: falls.pending.filter(fall => fall.breakable !== knocking) };
      return next({ knocking: null, knockUntil: null, restUntil: now + between(REST_MS, random) });
    }

    // Her Breakable is due to fall: she sets off in time to hold her knock and
    // have it go over on the moment rolled. Only ever her own — Luna is never
    // sent to Míca's vase, because `fallFor` only answers with one that is hers.
    const fall = fallFor(mind.id);
    if (fall) {
      const breakable = BREAKABLES[fall.breakable];
      const leaveAt = fallsAt(fall) - breakable.knockMs - walkMs(place.at, breakable.mark);
      // A cat about to think of somewhere to be goes here instead if a wander
      // could still be under way when she ought to leave.
      const deciding = mind.goal !== null || reached(mind.restUntil, now, REST_MS);
      if (now >= leaveAt || (deciding && now >= leaveAt - WANDER_LEAD_MS)) {
        // Another cat still sitting on her mark, or heading for it, is waited
        // out rather than walked into: she stays where she is, and the fall
        // waits with her. (63 found the knock walking onto a cat already sat
        // on a mark that is a roam mark too; this is that rule, kept.)
        if (!farEnough(breakable.mark, claims(places, mind.id, goals))) {
          goals.set(mind.id, null);
          return next({ goal: null });
        }
        goals.set(mind.id, breakable.mark);
        sends.push({ cat: mind.id, goal: breakable.mark });
        return next({ goal: breakable.mark, knocking: fall.breakable, restUntil: null });
      }
    }

    if (mind.goal !== null) {
      // Arrived. Sit here a moment before thinking of anywhere else.
      goals.set(mind.id, null);
      return next({ goal: null, restUntil: now + between(REST_MS, random) });
    }
    if (!reached(mind.restUntil, now, REST_MS)) return next({ restUntil: due(mind.restUntil, now, REST_MS, random) });

    // Nobody else settles on the mark of a Breakable still due to fall.
    const reserved = fallsStillDue(mind.id, false).map(other => BREAKABLES[other.breakable].mark);
    const goal = freeMark(room, mind.id, places, goals, random, reserved);
    // Nowhere free is a cat that stays put and asks again shortly, which is
    // what keeps two of them off one mark without any of them queueing.
    if (!goal) return next({ restUntil: now + between(REST_MS, random) });
    goals.set(mind.id, goal);
    sends.push({ cat: mind.id, goal });
    return next({ goal, restUntil: null });
  });

  const settled = minds.every((mind, index) => mind === slice.minds[index]);
  if (settled && sfx.length === 0 && slice.sfx.length === 0 && falls === slice.falls) return { slice, sends, knocked };
  return { slice: { minds: settled ? slice.minds : minds, sfx, falls }, sends, knocked };
}

/**
 * The cats with whatever they were heading for forgotten.
 *
 * A goal is a mark in one Room, so it means nothing the moment the visitor
 * walks into another one. Everything else a cat is carrying — when it next
 * meows, the fuss it is having — comes with it, because they are the same three
 * animals throughout rather than three new ones in every Room.
 */
/**
 * The cats after one of them is clicked, tapped or activated: a fuss.
 *
 * She stops where she is, says something about it, and stays for the Beat's
 * length before going back to whatever she had in mind. With motion off there
 * is no Beat to play and no clock to end one, so the visitor gets the meow and
 * the cat is not held anywhere — which is what an apartment asked to hold still
 * should do with an animation, and still leaves the fuss worth making.
 *
 * Whatever she had in mind is a mark, and a fuss ends it: a hand on her is
 * exactly as good a reason to forget a knock as walking out of the Room is
 * (`arriveCats` below). It has to clear `knocking` as well as `goal`, because
 * the tick reads "not moving, still knocking, nothing timed yet" as arrival at
 * the mark — so a knock left standing while she is held under a hand halfway
 * across the floor would bring her Breakable down from there.
 */
export function petCats(slice: CatsSlice, cat: CatId, now: number, motionOn: boolean): CatsSlice {
  const minds = slice.minds.map(mind =>
    mind.id === cat
      ? {
          ...mind,
          goal: null,
          knocking: null,
          knockUntil: null,
          restUntil: null,
          pettedUntil: motionOn ? now + PETTING_MS : null,
        }
      : mind,
  );
  // 68: the fall she was on her way to is still coming; she sets off for it
  // again once the fuss is over, and it waits for her if that makes her late.
  return { ...slice, minds, sfx: [meowOf(cat)] };
}

/**
 * The Breakable this cat is knocking down right now, or `null`: from the start
 * of her knock to the tick it falls, and never while she is only walking to it.
 * The knock Beat's own question, as `isPetted` is the petting Beat's.
 */
export function knockOf(slice: CatsSlice, cat: CatId): BreakableId | null {
  const mind = slice.minds.find(candidate => candidate.id === cat);
  return mind && mind.knockUntil !== null ? mind.knocking : null;
}

/** Is this cat having a fuss made of it right now? The Beat's own question. */
export function isPetted(slice: CatsSlice, cat: CatId): boolean {
  return slice.minds.some(mind => mind.id === cat && mind.pettedUntil !== null);
}

export function arriveCats(slice: CatsSlice): CatsSlice {
  // A knock's mark is a place in one Room too, so a visitor who walks out
  // mid-knock leaves it forgotten exactly like an ordinary goal — she does not
  // arrive in the new Room still holding a knock over a Breakable she cannot
  // see any more.
  // 68: and so is whatever the two rolls decided for it. Walking out before a
  // fall cancels it; the next entry into any Room rolls again from scratch.
  const forgets = (mind: CatMind) => mind.goal !== null || mind.knocking !== null;
  if (!slice.minds.some(forgets) && slice.falls === null) return slice;
  return {
    ...slice,
    minds: slice.minds.map(mind => (forgets(mind) ? { ...mind, goal: null, knocking: null, knockUntil: null } : mind)),
    falls: null,
  };
}
