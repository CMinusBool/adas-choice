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
export { advance, createWorld, isCurrentRoom, isRoomPainted, motionIsOn, motionIsOnByChoice } from './world';
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
// 16: the Activity Room — its three stations, and tonight's pick.
export type { ActivitiesSlice, ActivityId } from './activities';
export { ACTIVITY_IDS } from './activities';
export { chosenActivity, openActivity } from './world';
// 14: the Entryway — the Room's geometry, its Props and its arrival.
export type { EntrywayPropId, EntrywayProps, VaseState } from './entryway';
export { ENTRYWAY_MARKS, ENTRYWAY_WALKABLE } from './entryway';
export type { ArrivalSlice, ArrivalState, ArrivalView, BeatId, Box, Costume, PlayingBeat } from './arrival';
export { ARRIVAL_SECONDS } from './arrival';
export type { BreakableId } from './world';
export { arrivalView, breakableState, entrywayProps, vaseState } from './world';

// 08: the three cats — who they are, and where a Room lets them stand.
export type { CatId, CatsSlice } from './cats';
export { CAT_CLEARANCE, CAT_IDS, CAT_MARKS, isCat, meowOf, pettingBeat } from './cats';
export { catSfx, isBeingPetted } from './world';

// 09: the apartment's five Breakables — who owns each one, where she knocks
// it down, how long that takes and what it sounds like going over, all on one
// record apiece.
export type { Breakable } from './cats';
export { BREAKABLE_IDS, breakableById, knockBeat } from './cats';

// 18: the nine Films, and the rummage that pins three of them to the wall.
// 19: `FilmPairing` is what the panel's meta line turns into a copy key.
export type { Film, FilmId, FilmPairing } from './films';
export { filmById, filmsOn } from './films';
export type { CinemaStep } from './cinema';
export { cinemaStep, openShelf, pinnedPosters, rummagingShelf } from './world';

// 19: the Poster expansion, and the Film whose details it opens onto.
export { expandedPoster, posterDetails } from './world';

// 20: the reel he fetches for a chosen Film, and the projector that rolls it.
// `REEL_STEPS` is the order the sequence runs in and the one rule about it:
// forwards, one step at a time, and never back the way it came.
export { REEL_STEPS } from './cinema';
export { cinemaNeedsClock, loadedReel, rollingFilm } from './world';

// 40: the one question the page's frame loop asks the model, in place of the
// three slices the Actors painter used to read for itself.
export { apartmentNeedsClock } from './world';
