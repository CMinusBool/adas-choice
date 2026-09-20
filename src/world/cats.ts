// 08: the three cats roam
import type { ActorId } from './actors';
import type { RoomId } from './rooms';
import { distance, type Point } from './stage';

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
  // two Breakable marks, so a cat is already where ticket 09 wants one.
  cinema: [
    { x: 200, y: 700 },
    { x: 392, y: 850 },
    { x: 790, y: 690 },
    { x: 1180, y: 840 },
    { x: 1450, y: 700 },
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
 */
export function freeMark(
  room: RoomId,
  cat: CatId,
  places: readonly CatPlace[],
  goals: ReadonlyMap<CatId, Point | null>,
  random: () => number,
): Point | null {
  const here = places.find(place => place.id === cat);
  const taken = claims(places, cat, goals);
  const free = CAT_MARKS[room].filter(
    mark => farEnough(mark, taken) && (!here || distance(mark, here.at) >= CAT_CLEARANCE),
  );
  if (free.length === 0) return null;
  return free[Math.min(free.length - 1, Math.floor(random() * free.length))];
}
