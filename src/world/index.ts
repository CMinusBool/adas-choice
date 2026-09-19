/**
 * The world model: the one place in the codebase where a decision lives.
 *
 * Pure TypeScript with no DOM and no browser APIs — time and preferences enter
 * as parameters, never by asking the browser. `tsconfig.world.json` covers this
 * directory with no DOM library at all, so a stray `document` fails the build.
 * The DOM layer imports only from here.
 */
export type { Language } from './language';
export { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, resolveLanguage, toggleLanguage } from './language';

export type { RoomId } from './rooms';
export { ENTRYWAY, ROOM_IDS, isCanonicalHash, parseRoute, roomHash } from './rooms';

export type { MotionSlice } from './motion';

// 05: loading
export type { AssetOutcome, LoadingSlice } from './loading';

export type { RoomsSlice, TransitionKind, World, WorldEvent, WorldInputs } from './world';
export { advance, createWorld, isCurrentRoom, isRoomPainted, motionIsOn } from './world';
// 05: loading
export { isInteractive, loadingProgress } from './world';

// 06: audio
export type { AudioSlice, AudioTier } from './audio';
export { isAudible, isMusicSourceOn, isRoomMusicAudible, soundIsOn } from './world';
// end 06

// 07: actors — the Cast, where it is, and the floor it is allowed to stand on.
export type { Point, Polygon } from './stage';
export { STAGE_HEIGHT, STAGE_WIDTH } from './stage';
export type { ActorId, ActorView, ActorsSlice, CycleId, Facing, RandomSource } from './actors';
export { ACTOR_IDS, isWalkable, seededRandom } from './actors';
export { actorView, actorsIn } from './world';

// 17: the Cinema Room — its marks, its shelves, and who is sitting down.
export type { CinemaShelf, CinemaSlice } from './cinema';
export { CINEMA_MARKS, CINEMA_SHELVES } from './cinema';
export { attendedShelf, isSeated } from './world';
