/**
 * The apartment's four Rooms and the routes that reach them.
 *
 * A Room id doubles as its route's path word, so `#/cinema` is the Cinema Room
 * and nothing has to be kept in step by hand.
 */
export type RoomId = 'entryway' | 'games' | 'cinema' | 'activities';

/** Every Room, in the order the Entryway's doors offer them. */
export const ROOM_IDS: readonly RoomId[] = ['entryway', 'games', 'cinema', 'activities'];

/** The Room the visitor arrives in, and the answer to any route we cannot read. */
export const ENTRYWAY: RoomId = 'entryway';

/**
 * Read a Room off a hash.
 *
 * Takes the raw `location.hash` — with or without its leading `#` — and always
 * answers with a Room: an empty, partial or unrecognised hash is the Entryway,
 * because arriving somewhere is better than arriving nowhere.
 */
export function parseRoute(hash: string): RoomId {
  const path = hash.replace(/^#/, '').replace(/^\//, '').replace(/\/+$/, '').toLowerCase();
  return ROOM_IDS.includes(path as RoomId) ? (path as RoomId) : ENTRYWAY;
}

/** The hash that reaches a Room. The canonical form: what a door's `href` is. */
export function roomHash(room: RoomId): string {
  return `#/${room}`;
}

/** Does this hash already name its Room in canonical form? */
export function isCanonicalHash(hash: string): boolean {
  return hash === roomHash(parseRoute(hash));
}
